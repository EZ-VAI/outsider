/*
 * Complete fixed-revision replay of pagarsky/agent-trace.
 *
 * The raw traces contain model prompts, reasoning, tool inputs, and tool
 * outputs. They stay private and are never executed or projected. The only
 * executable replay below is an in-repository extractor that parses JSON and
 * Parquet as data.
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

export const AGENTTRACE_FULL_CORPUS_SCHEMA =
  "outsider/agenttrace-full-corpus/v1";
export const AGENTTRACE_FULL_CORPUS_RECEIPT_SCHEMA =
  "outsider/agenttrace-full-corpus-receipt/v1";
export const AGENTTRACE_DATASET_ID = "pagarsky/agent-trace";
export const AGENTTRACE_REVISION =
  "4b05b2f00eea267a5bb4d841c228059d1bf9ac0c";
export const AGENTTRACE_PRODUCER_COMMIT =
  "8ce41dd7f7d2a8709b17287168bc788f291ac674";
export const AGENTTRACE_PRODUCER_TREE =
  "1b434983a16cbbcca38cc1ed6585d67c9c3539ee";
export const AGENTTRACE_FULL_CORPUS_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/agenttrace-full-corpus-report/v1";
const RECEIPT_DOMAIN = "outsider/agenttrace-full-corpus-receipt/v1";
const MANIFEST_DOMAIN = "outsider/agenttrace-full-corpus-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/agenttrace-full-corpus-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const HF_RECORD_SHA =
  "sha256:191d0c380266327123922312c902577ec30eecc4293ba18f81dff302a8219d80";
const HF_TREE_SHA =
  "sha256:0d67fa81225ee7056515cab8fdf740dca904bc0240f59f4e8b5d67d6a7c52904";
const MBPP_TREE_SHA =
  "sha256:e2f76ce5cc6d487cd3c44dfc61d0288cb235151504663430a955a16075042d8e";
const MBPP_README_SHA =
  "sha256:6377d5c76ba46b9e650daa6d5eb592e671c9b15586e39f23f50ed9bf2ac54cf6";
const NL2BASH_TREE_SHA =
  "sha256:863eddb6c95c2f9839b811848aeb9621fdec6cc4a55a06054bd1f8ff34af5a17";
const NL2BASH_README_SHA =
  "sha256:1c0777207f0cf89f52738e6ccbd79cb83e25bcca15d38fe516e298fa4cbded07";
const INTERCODE_LICENSE_SHA =
  "sha256:837bf0fc3fe75298e6bcca9dbb66028b449bc456e16621d7a0f65292fa037274";
const PRODUCER_README_SHA =
  "sha256:84dcfea0593bb25fb65a4a6c0f80dc5bf9e7f9f43caa6775f403f47196f85ab5";
const PRODUCER_LICENSE_SHA =
  "sha256:c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";
const PARQUET_PATH = "data/agenttrace.parquet";
const PARQUET_BYTES = 10_638_584;
const PARQUET_SHA =
  "sha256:11c04875f9b6e91b117b5739d748e6bd4f8fa621e95faf430fa40d5d4d223c97";
const MBPP_REVISION = "4bb6404fdc6cacfda99d4ac4205087b89d32030c";
const NL2BASH_REVISION = "019dd0389e872d8b075efbbd94a14d089e5c9f26";
const INTERCODE_COMMIT = "c3e46d827cfc9d4c704ec078f7abf9f41e3191d8";
const INTERCODE_TREE = "2e85c05a8f23ffea6028314caa7a986ab2c26c0b";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;

const RAW_FILES = Object.freeze({
  "datasets/mbpp_0_6B_20260328T133144Z.jsonl": 8_232_930,
  "datasets/mbpp_1_7B_20260403T211347Z.jsonl": 21_484_038,
  "datasets/nl2bash_0_6B_20260328T133144Z.jsonl": 2_194_460,
  "datasets/nl2bash_1_7B_20260403T211347Z.jsonl": 4_984_809,
});

const METADATA_FILES = Object.freeze([
  "metadata/dataset-record-after.json",
  "metadata/dataset-record-before.json",
  "metadata/full-tree-after.json",
  "metadata/full-tree-before.json",
  "producer/commit.json",
  "producer/github-license",
  "producer/github-readme.md",
  "producer/repo.json",
  "producer/tree-after.json",
  "producer/tree-before.json",
  "upstream/intercode/commit.json",
  "upstream/intercode/license.md",
  "upstream/intercode/repo.json",
  "upstream/intercode/tree.json",
  "upstream/mbpp/README.md",
  "upstream/mbpp/record-after.json",
  "upstream/mbpp/record-before.json",
  "upstream/mbpp/tree-after.json",
  "upstream/mbpp/tree-before.json",
  "upstream/nl2bash/README.md",
  "upstream/nl2bash/record-after.json",
  "upstream/nl2bash/record-before.json",
  "upstream/nl2bash/tree-after.json",
  "upstream/nl2bash/tree-before.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTTRACE_FULL_CORPUS_${code}`
    : `AGENTTRACE_FULL_CORPUS_${code}:${detail}`);
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

function datasetRecord(bytes) {
  if (sha256(bytes) !== HF_RECORD_SHA) fail("RECORD_PIN_MISMATCH");
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: AGENTTRACE_DATASET_ID, author: "pagarsky", sha: AGENTTRACE_REVISION,
    lastModified: "2026-04-30T09:09:48.000Z", private: false,
    gated: false, disabled: false, usedStorage: 32_122_622,
    license: "apache-2.0",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function hfTree(bytes) {
  if (sha256(bytes) !== HF_TREE_SHA) fail("TREE_PIN_MISMATCH");
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
  const bytesTotal = files.reduce((sum, entry) => sum + entry.size, 0);
  const raw = files.filter((entry) => Object.hasOwn(RAW_FILES, entry.path));
  const testdata = files.filter((entry) => entry.path.startsWith("testdata/"));
  if (entries.length !== 98 || files.length !== 72 || directories.length !== 26
    || bytesTotal !== 48_810_139 || raw.length !== 4
    || raw.reduce((sum, entry) => sum + entry.size, 0) !== 36_896_237
    || testdata.length !== 38
    || testdata.reduce((sum, entry) => sum + entry.size, 0) !== 500_335) {
    fail("TREE_PROFILE_INVALID");
  }
  for (const [rawPath, size] of Object.entries(RAW_FILES)) {
    if (files.find((entry) => entry.path === rawPath)?.size !== size) {
      fail("RAW_TREE_PROFILE_INVALID", rawPath);
    }
  }
  const parquet = files.find((entry) => entry.path === PARQUET_PATH);
  if (parquet?.size !== PARQUET_BYTES || parquet?.lfsOid !== PARQUET_SHA.slice(7)
    || parquet?.lfsSize !== PARQUET_BYTES) fail("PARQUET_TREE_PROFILE_INVALID");
  return { entries, files, directories, raw, testdata, bytesTotal };
}

function producerTree(bytes) {
  const value = parseJson(bytes, "PRODUCER_TREE_JSON_INVALID");
  if (value.sha !== AGENTTRACE_PRODUCER_TREE || value.truncated !== false
    || !Array.isArray(value.tree)) fail("PRODUCER_TREE_INVALID");
  const blobs = value.tree.filter((entry) => entry.type === "blob");
  const trees = value.tree.filter((entry) => entry.type === "tree");
  if (value.tree.length !== 97 || blobs.length !== 71 || trees.length !== 26
    || blobs.reduce((sum, entry) => sum + entry.size, 0) !== 48_807_221) {
    fail("PRODUCER_TREE_PROFILE_INVALID");
  }
  return { entries: value.tree, blobs, trees };
}

function upstreamRecord(bytes, expected) {
  const value = parseJson(bytes, "UPSTREAM_RECORD_JSON_INVALID");
  const license = value.cardData?.license ?? null;
  const projection = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, license };
  if (!same(projection, expected)) fail("UPSTREAM_RECORD_PROFILE_INVALID", expected.id);
  return projection;
}

function fixedJson(root, relative, code) {
  return parseJson(readRegular(root, relative, MAX_METADATA_BYTES), code);
}

function readMetadata(root) {
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
  const tree = hfTree(treeBefore);

  const producerTreeBefore = readRegular(root, "producer/tree-before.json",
    MAX_METADATA_BYTES);
  const producerTreeAfter = readRegular(root, "producer/tree-after.json",
    MAX_METADATA_BYTES);
  if (!producerTreeBefore.equals(producerTreeAfter)) fail("PRODUCER_TREE_CHANGED");
  const producer = producerTree(producerTreeBefore);
  const producerCommit = fixedJson(root, "producer/commit.json",
    "PRODUCER_COMMIT_INVALID");
  const producerRepo = fixedJson(root, "producer/repo.json", "PRODUCER_REPO_INVALID");
  if (producerCommit.sha !== AGENTTRACE_PRODUCER_COMMIT
    || producerCommit.commit?.tree?.sha !== AGENTTRACE_PRODUCER_TREE
    || producerRepo.full_name !== "pagarsky/agent-trace"
    || producerRepo.private !== false || producerRepo.license?.spdx_id !== "Apache-2.0") {
    fail("PRODUCER_PROFILE_INVALID");
  }
  const producerReadme = readRegular(root, "producer/github-readme.md",
    MAX_METADATA_BYTES, 4_503);
  const producerLicense = readRegular(root, "producer/github-license",
    MAX_METADATA_BYTES, 11_357);
  if (sha256(producerReadme) !== PRODUCER_README_SHA
    || sha256(producerLicense) !== PRODUCER_LICENSE_SHA) {
    fail("PRODUCER_DOCUMENT_PIN_MISMATCH");
  }

  const mbppBefore = readRegular(root, "upstream/mbpp/record-before.json",
    MAX_METADATA_BYTES);
  const mbppAfter = readRegular(root, "upstream/mbpp/record-after.json",
    MAX_METADATA_BYTES);
  const mbppTreeBefore = readRegular(root, "upstream/mbpp/tree-before.json",
    MAX_METADATA_BYTES);
  const mbppTreeAfter = readRegular(root, "upstream/mbpp/tree-after.json",
    MAX_METADATA_BYTES);
  const nlBefore = readRegular(root, "upstream/nl2bash/record-before.json",
    MAX_METADATA_BYTES);
  const nlAfter = readRegular(root, "upstream/nl2bash/record-after.json",
    MAX_METADATA_BYTES);
  const nlTreeBefore = readRegular(root, "upstream/nl2bash/tree-before.json",
    MAX_METADATA_BYTES);
  const nlTreeAfter = readRegular(root, "upstream/nl2bash/tree-after.json",
    MAX_METADATA_BYTES);
  if (!mbppBefore.equals(mbppAfter) || !mbppTreeBefore.equals(mbppTreeAfter)
    || !nlBefore.equals(nlAfter) || !nlTreeBefore.equals(nlTreeAfter)) {
    fail("UPSTREAM_STATE_CHANGED");
  }
  const mbpp = upstreamRecord(mbppBefore, {
    id: "google-research-datasets/mbpp", sha: MBPP_REVISION,
    private: false, gated: false, disabled: false, license: ["cc-by-4.0"],
  });
  const nl2bash = upstreamRecord(nlBefore, {
    id: "epinnock/intercode-nl2bash-curated", sha: NL2BASH_REVISION,
    private: false, gated: false, disabled: false, license: null,
  });
  if (sha256(mbppTreeBefore) !== MBPP_TREE_SHA
    || sha256(nlTreeBefore) !== NL2BASH_TREE_SHA) fail("UPSTREAM_TREE_PIN_MISMATCH");
  const mbppReadme = readRegular(root, "upstream/mbpp/README.md",
    MAX_METADATA_BYTES, 9_058);
  const nlReadme = readRegular(root, "upstream/nl2bash/README.md",
    MAX_METADATA_BYTES, 554);
  if (sha256(mbppReadme) !== MBPP_README_SHA
    || sha256(nlReadme) !== NL2BASH_README_SHA) fail("UPSTREAM_CARD_PIN_MISMATCH");

  const intercodeRepo = fixedJson(root, "upstream/intercode/repo.json",
    "INTERCODE_REPO_INVALID");
  const intercodeCommit = fixedJson(root, "upstream/intercode/commit.json",
    "INTERCODE_COMMIT_INVALID");
  const intercodeTree = readRegular(root, "upstream/intercode/tree.json",
    MAX_METADATA_BYTES);
  const intercodeLicense = readRegular(root, "upstream/intercode/license.md",
    MAX_METADATA_BYTES, 1_093);
  const intercodeTreeValue = parseJson(intercodeTree, "INTERCODE_TREE_INVALID");
  const intercodeBlobs = intercodeTreeValue.tree?.filter(
    (entry) => entry.type === "blob") ?? [];
  const intercodeTrees = intercodeTreeValue.tree?.filter(
    (entry) => entry.type === "tree") ?? [];
  const intercodeLicenseEntry = intercodeBlobs.find(
    (entry) => entry.path === "LICENSE.md");
  if (intercodeRepo.full_name !== "princeton-nlp/intercode"
    || intercodeRepo.private !== false || intercodeRepo.license?.spdx_id !== "MIT"
    || intercodeCommit.sha !== INTERCODE_COMMIT
    || intercodeCommit.commit?.tree?.sha !== INTERCODE_TREE
    || intercodeTreeValue.sha !== INTERCODE_TREE
    || intercodeTreeValue.truncated !== false
    || intercodeTreeValue.tree?.length !== 644
    || intercodeBlobs.length !== 393 || intercodeTrees.length !== 251
    || intercodeLicenseEntry?.sha !== "f4286f6d3de52a3debffc22e4aaebb8da8d53e46"
    || intercodeLicenseEntry?.size !== 1_093
    || sha256(intercodeLicense) !== INTERCODE_LICENSE_SHA) {
    fail("INTERCODE_PROFILE_INVALID");
  }
  return { record, tree, producer, producerReadme, producerLicense,
    upstream: { mbpp, nl2bash } };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/agenttrace-full-corpus-source-manifest/v1",
    datasetId: AGENTTRACE_DATASET_ID, revision: AGENTTRACE_REVISION,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const metadata = readMetadata(root);
  const expected = [
    ...METADATA_FILES,
    ...metadata.tree.files.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  for (const relative of METADATA_FILES) {
    const bytes = readRegular(root, relative, MAX_METADATA_BYTES);
    entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const actualFiles = new Map();
  for (const item of metadata.tree.files) {
    const bytes = readRegular(root, `files/${item.path}`,
      Math.max(MAX_SOURCE_BYTES, item.size), item.size);
    const actualSha = sha256(bytes);
    if (item.lfsOid !== null) {
      if (actualSha !== `sha256:${item.lfsOid}`) fail("LFS_PIN_MISMATCH", item.path);
    } else if (gitBlobOid(bytes) !== item.oid) {
      fail("GIT_BLOB_PIN_MISMATCH", item.path);
    }
    actualFiles.set(item.path, bytes);
    entries.push({ path: `files/${item.path}`, bytes: bytes.length,
      sha256: actualSha, gitOid: item.oid,
      lfsSha256: item.lfsOid === null ? null : `sha256:${item.lfsOid}` });
  }

  const hfPaths = new Set(metadata.tree.files.map((entry) => entry.path));
  const producerPaths = new Set(metadata.producer.blobs.map((entry) => entry.path));
  const hfOnly = sorted([...hfPaths].filter((item) => !producerPaths.has(item)));
  const producerOnly = sorted([...producerPaths].filter((item) => !hfPaths.has(item)));
  let exactShared = 0;
  for (const item of metadata.producer.blobs) {
    if (!hfPaths.has(item.path) || item.path === "README.md") continue;
    if (gitBlobOid(actualFiles.get(item.path)) !== item.sha) {
      fail("PRODUCER_HF_BYTE_CROSSWALK_INVALID", item.path);
    }
    exactShared += 1;
  }
  if (!same(hfOnly, [".gitattributes"]) || producerOnly.length !== 0
    || exactShared !== 70
    || gitBlobOid(metadata.producerReadme)
      !== metadata.producer.blobs.find((entry) => entry.path === "README.md")?.sha
    || actualFiles.get("README.md").equals(metadata.producerReadme)) {
    fail("PRODUCER_HF_TREE_CROSSWALK_INVALID");
  }
  return { root, ...metadata, entries, exactShared, hfOnly, producerOnly };
}

export function createAgentTraceFullCorpusSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, random, re, sys
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1]) / 'files'
raw_paths = [
  'datasets/mbpp_0_6B_20260328T133144Z.jsonl',
  'datasets/mbpp_1_7B_20260403T211347Z.jsonl',
  'datasets/nl2bash_0_6B_20260328T133144Z.jsonl',
  'datasets/nl2bash_1_7B_20260403T211347Z.jsonl',
]
expected_lines = [500, 500, 200, 200]

def die(code):
    raise RuntimeError('AGENTTRACE_FULL_CORPUS_PYTHON_' + code)

rows = []
origins = {}
line_counts = {}
for relative, expected in zip(raw_paths, expected_lines):
    current = []
    with (root / relative).open('r', encoding='utf-8') as handle:
        for number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except Exception:
                die('RAW_JSONL_INVALID')
            if not isinstance(value, dict) or value.get('trace_id') in origins:
                die('RAW_ROW_INVALID')
            origins[value['trace_id']] = (relative, number)
            current.append(value)
            rows.append(value)
    if len(current) != expected:
        die('RAW_LINE_COUNT_INVALID')
    line_counts[relative] = len(current)

parquet = pq.ParquetFile(root / 'data' / 'agenttrace.parquet')
columns = [
  'trace_id', 'timestamp_utc', 'prompt', 'model', 'dataset_name', 'task_id',
  'run_id', 'total_duration_ms', 'tool_span_count', 'llm_step_count',
  'spans_json', 'llm_steps_json', 'metadata_json', 'raw_file',
]
if (parquet.metadata.num_rows != 1400 or parquet.metadata.num_row_groups != 1
        or parquet.metadata.num_columns != 14
        or parquet.schema_arrow.names != columns):
    die('PARQUET_PROFILE_INVALID')
normalized = parquet.read().to_pylist()
if len(normalized) != len(rows):
    die('ROW_COUNT_MISMATCH')

def semantic_json(value, code):
    if not isinstance(value, str):
        die(code)
    try:
        return json.loads(value)
    except Exception:
        die(code)

shape = hashlib.sha256()
for index, (raw, norm) in enumerate(zip(rows, normalized)):
    if raw.get('trace_id') != norm.get('trace_id'):
        die('ROW_ORDER_OR_ID_MISMATCH')
    relative, line_number = origins[raw['trace_id']]
    checks = {
      'timestamp_utc': raw.get('timestamp_utc'), 'prompt': raw.get('prompt'),
      'model': raw.get('model'),
      'dataset_name': raw.get('metadata', {}).get('dataset_name'),
      'task_id': raw.get('metadata', {}).get('task_id'),
      'run_id': raw.get('metadata', {}).get('run_id'),
      'total_duration_ms': raw.get('total_duration_ms'),
      'tool_span_count': len(raw.get('spans', [])),
      'llm_step_count': len(raw.get('llm_steps', [])),
      'raw_file': relative,
    }
    if any(norm.get(key) != value for key, value in checks.items()):
        die('SCALAR_CROSSWALK_MISMATCH')
    if semantic_json(norm.get('spans_json'), 'SPANS_JSON_INVALID') != raw.get('spans'):
        die('SPANS_CROSSWALK_MISMATCH')
    if semantic_json(norm.get('llm_steps_json'), 'STEPS_JSON_INVALID') != raw.get('llm_steps'):
        die('STEPS_CROSSWALK_MISMATCH')
    if semantic_json(norm.get('metadata_json'), 'METADATA_JSON_INVALID') != raw.get('metadata'):
        die('METADATA_CROSSWALK_MISMATCH')
    item = {'rawFile': relative, 'rawLine': line_number,
            'traceIdHash': hashlib.sha256(raw['trace_id'].encode()).hexdigest(),
            'toolSpans': len(raw.get('spans', [])),
            'llmSteps': len(raw.get('llm_steps', []))}
    encoded = json.dumps(item, sort_keys=True, separators=(',', ':')).encode()
    shape.update(len(encoded).to_bytes(8, 'big'))
    shape.update(encoded)

root_keys = {'trace_id','timestamp_utc','prompt','model','spans','llm_steps',
             'total_duration_ms','metadata'}
span_keys = {'span_id','type','tool_name','tool_input','tool_output','start_ns',
             'end_ns','duration_ms','telemetry','exit_code','parent_span_id'}
telemetry_keys = {'user_time_s','system_time_s','max_rss_bytes','read_bytes','write_bytes'}
step_keys = {'step_id','step_number','model_output','reasoning_content','tool_calls',
             'duration_ms','input_tokens','output_tokens'}
terminal_keys = {'correct','correctness','passed','pass','reward','score','success',
                 'terminal_outcome','task_outcome','test_result','tests_passed'}

def nested_keys(value):
    result = set()
    if isinstance(value, dict):
        for key, child in value.items():
            result.add(str(key).lower())
            result.update(nested_keys(child))
    elif isinstance(value, list):
        for child in value:
            result.update(nested_keys(child))
    return result

groups = {}
all_nested_keys = set()
redaction_re = re.compile(r'<redacted(?:\s[^>]*)?>', re.I)
secret_res = [
  re.compile(r'AKIA[0-9A-Z]{16}'),
  re.compile(r'(?:ghp|github_pat)_[A-Za-z0-9_]{20,}'),
  re.compile(r'sk-[A-Za-z0-9]{20,}'),
  re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]
email_re = re.compile(r'(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])')

def summarize(selected):
    spans = [span for row in selected for span in row['spans']]
    steps = [step for row in selected for step in row['llm_steps']]
    if any(set(row) != root_keys for row in selected):
        die('ROOT_SCHEMA_INVALID')
    if any(set(span) != span_keys or set(span.get('telemetry', {})) != telemetry_keys
           or span.get('type') != 'TOOL' for span in spans):
        die('SPAN_SCHEMA_INVALID')
    if any(set(step) != step_keys for step in steps):
        die('STEP_SCHEMA_INVALID')
    error_rows = [row for row in selected
                  if any(span.get('exit_code') != 0 for span in row['spans'])]
    later_tool = later_zero = 0
    for row in error_rows:
        first = next(index for index, span in enumerate(row['spans'])
                     if span.get('exit_code') != 0)
        following = [span for span in row['spans'][first + 1:]
                     if span.get('tool_name') != 'final_answer']
        later_tool += bool(following)
        later_zero += any(span.get('exit_code') == 0 for span in following)
    redaction_rows = redaction_occurrences = secrets = emails = 0
    for row in selected:
        text = json.dumps(row, sort_keys=True, separators=(',', ':'))
        markers = len(redaction_re.findall(text))
        redaction_rows += markers > 0
        redaction_occurrences += markers
        secrets += sum(len(pattern.findall(text)) for pattern in secret_res)
        emails += len(email_re.findall(text))
    telemetry = sorted(telemetry_keys)
    return {
      'rows': len(selected), 'uniqueTraceIds': len({row['trace_id'] for row in selected}),
      'uniqueTaskIds': len({row['metadata']['task_id'] for row in selected}),
      'toolSpans': len(spans), 'llmSteps': len(steps),
      'rowsWithToolSpans': sum(bool(row['spans']) for row in selected),
      'rowsWithNoToolSpans': sum(not row['spans'] for row in selected),
      'rowsWithNoLlmSteps': sum(not row['llm_steps'] for row in selected),
      'toolNames': dict(sorted(collections.Counter(span['tool_name'] for span in spans).items())),
      'exitCodes': dict(sorted((str(key), count) for key, count in
                        collections.Counter(span['exit_code'] for span in spans).items())),
      'nonzeroExitSpans': sum(span['exit_code'] != 0 for span in spans),
      'tracesWithNonzeroExit': len(error_rows),
      'errorTracesWithLaterNonFinalToolSpan': later_tool,
      'errorTracesWithLaterZeroExitNonFinalToolSpan': later_zero,
      'telemetryFieldPresence': {key: sum(key in span['telemetry'] for span in spans)
                                 for key in telemetry},
      'telemetryPositive': {key: sum((span['telemetry'].get(key) or 0) > 0
                                     for span in spans) for key in telemetry},
      'inputTokens': sum((step.get('input_tokens') or 0) for step in steps),
      'outputTokens': sum((step.get('output_tokens') or 0) for step in steps),
      'publisherRedactionMarkerRows': redaction_rows,
      'publisherRedactionMarkerOccurrences': redaction_occurrences,
      'highConfidenceSecretPatternCandidates': secrets,
      'emailPatternCandidates': emails,
    }

for row in rows:
    all_nested_keys.update(nested_keys(row))
    key = row['metadata']['dataset_name'] + '|' + row['model']
    groups.setdefault(key, []).append(row)
group_summaries = {key: summarize(value) for key, value in sorted(groups.items())}
expected_group_rows = {
  'mbpp|Qwen/Qwen3-0.6B': 500, 'mbpp|Qwen/Qwen3-1.7B': 500,
  'nl2bash|Qwen/Qwen3-0.6B': 200, 'nl2bash|Qwen/Qwen3-1.7B': 200,
}
if {key: value['rows'] for key, value in group_summaries.items()} != expected_group_rows:
    die('GROUP_PROFILE_INVALID')

task_set_equal = {}
for dataset in ['mbpp', 'nl2bash']:
    sets = [{row['metadata']['task_id'] for row in rows
             if row['metadata']['dataset_name'] == dataset and row['model'] == model}
            for model in ['Qwen/Qwen3-0.6B', 'Qwen/Qwen3-1.7B']]
    task_set_equal[dataset] = sets[0] == sets[1]
if task_set_equal != {'mbpp': True, 'nl2bash': True}:
    die('TASK_SET_CROSS_MODEL_INVALID')

fixture_versions = collections.Counter(
  row['metadata']['fixture_version'] for row in rows
  if row['metadata']['dataset_name'] == 'nl2bash')
fixture_segments = {}
for relative in raw_paths[2:]:
    selected = [row for row in rows if origins[row['trace_id']][0] == relative]
    segments = []
    for index, row in enumerate(selected):
        version = row['metadata']['fixture_version']
        if not segments or segments[-1]['fixtureVersion'] != version:
            segments.append({'firstRowZeroBased': index, 'lastRowZeroBased': index,
                             'fixtureVersion': version})
        else:
            segments[-1]['lastRowZeroBased'] = index
    fixture_segments[relative] = segments

# Reconstruct the publisher's seeded fixture algorithm without importing or
# executing any downloaded source file.
dirs = [
 'system/folder1','system/folder1/subfolder1','system/folder1/subfolder2',
 'system/folder2','system/folder2/subfolder1','system/folder3',
 'testbed/dir1','testbed/dir2','testbed/dir3','testbed/dir3/subdir1',
 'testbed/dir3/subdir1/subsubdir1','testbed/dir3/subdir1/subsubdir1/tmp',
 'workspace/project1','workspace/project2','workspace/logs','workspace/data']
extensions = ['.txt','.log','.py','.sh','.php','.c','.out','.csv']
filler = ['the','quick','brown','fox','jumps','over','lazy','dog','alpha','beta',
          'gamma','delta','config','setup','init']
keywords = ['Hello','foo','error','warning']
rng = random.Random(42)
generated = {}
for directory in dirs:
    for index in range(rng.randint(1, 4)):
        extension = rng.choice(extensions)
        lines = []
        for unused in range(rng.randint(3, 15)):
            words = rng.choices(filler, k=rng.randint(3, 7))
            if rng.random() < 0.08:
                words.insert(0, rng.choice(keywords))
            lines.append(' '.join(words))
        generated[directory + '/file' + str(index) + extension] = ('\n'.join(lines) + '\n').encode()
actual_fixture = {path.relative_to(root / 'testdata').as_posix(): path.read_bytes()
                  for path in (root / 'testdata').rglob('*') if path.is_file()}
if set(actual_fixture) != set(generated) | {'noise.txt'}:
    die('FIXTURE_FILE_SET_INVALID')
if any(actual_fixture[name] != value for name, value in generated.items()):
    die('FIXTURE_DETERMINISM_INVALID')
fixture_digest = hashlib.sha256()
for name in sorted(actual_fixture):
    fixture_digest.update(name.encode())
    fixture_digest.update(b'\0')
    fixture_digest.update(actual_fixture[name])
current_fixture_version = fixture_digest.hexdigest()

overall = summarize(rows)
if all_nested_keys & terminal_keys:
    die('UNEXPECTED_TERMINAL_LABEL_KEY')
if (overall['toolSpans'] != 3609 or overall['llmSteps'] != 4039
        or overall['nonzeroExitSpans'] != 1312
        or overall['tracesWithNonzeroExit'] != 400
        or overall['publisherRedactionMarkerRows'] != 36
        or overall['publisherRedactionMarkerOccurrences'] != 775):
    die('AGGREGATE_PROFILE_INVALID')

print(json.dumps({
  'rawJsonlRows': len(rows), 'rawFileLineCounts': line_counts,
  'normalizedParquetRows': 1400, 'parquetRowGroups': 1, 'parquetColumns': 14,
  'rawAndNormalizedOrderExact': True,
  'allRawRowsCrosswalkExactlyToNormalizedRows': True,
  'rawNormalizedShapeRoot': 'sha256:' + shape.hexdigest(),
  'sourceNativeGroups': group_summaries, 'crossModelTaskSetsEqual': task_set_equal,
  'overall': overall,
  'publisherTerminalCorrectnessLabelPresent': False,
  'publisherTerminalCorrectnessLabelRows': 0,
  'toolExitCodeIsTerminalCorrectnessLabel': False,
  'publisherFixtureVersionCounts': dict(sorted(fixture_versions.items())),
  'publisherFixtureVersionSegments': fixture_segments,
  'distinctPublisherFixtureVersions': len(fixture_versions),
  'currentFixtureVersion': current_fixture_version,
  'currentFixtureVersionRepresentedByTraceMetadata': current_fixture_version in fixture_versions,
  'deterministicFixtureGeneratorReimplementedNotExecuted': True,
  'deterministicFixtureGeneratedDirectories': len(dirs),
  'deterministicFixtureGeneratedFiles': len(generated),
  'deterministicFixtureGeneratedBytes': sum(map(len, generated.values())),
  'shippedFixtureFilesIncludingNoise': len(actual_fixture),
  'shippedFixtureBytesIncludingNoise': sum(map(len, actual_fixture.values())),
  'downloadedCommandsOrToolsExecuted': False,
  'rawPromptReasoningToolInputOutputProjected': False,
  'privacyPatternScanIsNotAnonymityProof': True,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_AGENTTRACE_PYTHON ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildAgentTraceFullCorpusArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: AGENTTRACE_FULL_CORPUS_SCHEMA,
    disposition: AGENTTRACE_FULL_CORPUS_DISPOSITION,
    source: {
      datasetId: AGENTTRACE_DATASET_ID, revision: AGENTTRACE_REVISION,
      lastModified: collected.record.lastModified, public: true, gated: false,
      cardLicenseClaim: "Apache-2.0", usedStorageBytes: 32_122_622,
      fixedRevisionTreeEntries: 98, fixedRevisionFiles: 72,
      fixedRevisionDirectories: 26, fixedRevisionFileBytes: 48_810_139,
      rawJsonlFiles: 4, rawJsonlBytes: 36_896_237,
      normalizedParquetFiles: 1, normalizedParquetBytes: PARQUET_BYTES,
      testdataFiles: 38, testdataBytes: 500_335,
      completeFixedRevisionAcquired: true, randomTruncationApplied: false,
      materialRecordAndTreeStateStable: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    producer: {
      repository: "pagarsky/agent-trace", commit: AGENTTRACE_PRODUCER_COMMIT,
      tree: AGENTTRACE_PRODUCER_TREE, githubTreeEntries: 97,
      githubBlobFiles: 71, huggingFaceOnlyPaths: collected.hfOnly,
      githubOnlyPaths: collected.producerOnly,
      byteExactSharedFiles: collected.exactShared,
      huggingFaceCardReadmeDiffersFromGithubReadme: true,
      completeCollectionCodeAndFixtureClosureAcquired: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    selection: {
      selectedRows: 1_400, completePublishedFixedRevision: true,
      completePublishedTaskModelGrid: true,
      expectedMbppTestTasksPerModel: 500,
      expectedNl2bashTrainTasksPerModel: 200,
      sourceNativeTaskGroupsPreserved: true, randomRowSampling: false,
      broaderPublicAgentTraceUniverseExhausted: false,
    },
    denominators: {
      PUBLISHER_TRACE_ROW: 1_400,
      RECORDED_TOOL_EXECUTION_SPAN: replay.overall.toolSpans,
      RECORDED_NONZERO_EXIT_TOOL_SPAN: replay.overall.nonzeroExitSpans,
      TRACE_WITH_RECORDED_NONZERO_EXIT: replay.overall.tracesWithNonzeroExit,
      PUBLISHER_REDACTION_MARKER_ROW: replay.overall.publisherRedactionMarkerRows,
      INDEPENDENTLY_EVALUATED_TERMINAL_OUTCOME: 0,
      crossPopulationTotal: null, additionProhibited: true,
    },
    execution: {
      publisherCollectorSoftwareTraceRows: 1_400,
      rowsWithRecordedToolExecution: replay.overall.rowsWithToolSpans,
      recordedToolExecutionSpans: replay.overall.toolSpans,
      physicalRobotExecutionRows: 0, simulatedRobotExecutionRows: 0,
      toolInputsOrCommandsReexecutedByOutsider: false,
      publisherCollectorAndInstrumentationCodeAcquired: true,
      currentDeterministicFixtureReconstructedExactly: true,
      historicalFixtureVersionsDeclared: replay.distinctPublisherFixtureVersions,
      singleShippedFixtureRecreatesEveryHistoricalExecutionEnvironment: false,
    },
    outcome: {
      publisherTerminalCorrectnessLabelPresent: false,
      publisherTerminalCorrectnessLabelRows: 0,
      toolExitCodeIsExecutionStatusNotTaskCorrectness: true,
      independentlyEvaluatedOutcomeRows: 0, benchmarkCorrectnessRows: 0,
      completeAttemptCensusRows: 0, completePublishedTaskModelGridRows: 1_400,
      realWorldEffectRows: 0,
    },
    recovery: {
      tracesWithNonzeroToolExit: replay.overall.tracesWithNonzeroExit,
      errorTracesWithLaterNonFinalToolSpan:
        replay.overall.errorTracesWithLaterNonFinalToolSpan,
      errorTracesWithLaterZeroExitNonFinalToolSpan:
        replay.overall.errorTracesWithLaterZeroExitNonFinalToolSpan,
      publisherNativeRecoveryOutcomeLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0, longitudinalRecoveryRows: 0,
      laterZeroExitPromotedToRecovery: false,
    },
    rights: {
      traceCompilationLicenseClaim: "Apache-2.0",
      mbppUpstreamDatasetLicenseClaim: "CC-BY-4.0",
      curatedNl2bashDatasetLicenseDeclared: false,
      intercodeFrameworkLicenseClaim: "MIT",
      frameworkLicenseResolvesCuratedDatasetRights: false,
      upstreamTermsIndependentlyAdjudicated: false,
      modelGeneratedContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0, redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      publisherHostPathNormalizationNarrativePresent: true,
      publisherEarlyOutputMaskingNarrativePresent: true,
      publisherRedactionMarkerRows: replay.overall.publisherRedactionMarkerRows,
      publisherRedactionMarkerOccurrences:
        replay.overall.publisherRedactionMarkerOccurrences,
      noPiiOrSecretGuaranteed: false, anonymizationCertified: false,
      highConfidenceSecretPatternCandidates:
        replay.overall.highConfidenceSecretPatternCandidates,
      emailPatternCandidates: replay.overall.emailPatternCandidates,
      privacyPatternScanIsNotAnonymityProof: true,
      rawSourcePrivate: true, rawProjectionRows: 0,
    },
    boundary: {
      independentlyEvaluatedOutcomeRows: 0, benchmarkCorrectnessRows: 0,
      completeAttemptCensusRows: 0, longitudinalRecoveryRows: 0,
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

export function createAgentTraceFullCorpusReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: AGENTTRACE_FULL_CORPUS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: AGENTTRACE_FULL_CORPUS_DISPOSITION,
    publisherTraceRows: 1_400, recordedToolExecutionSpans: 3_609,
    publisherTerminalCorrectnessLabelRows: 0,
    independentlyEvaluatedOutcomeRows: 0, longitudinalRecoveryRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAgentTraceFullCorpusArtifactDirectory(directory, options = {}) {
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
    const built = buildAgentTraceFullCorpusArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createAgentTraceFullCorpusReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAgentTraceFullCorpusArtifact(value) {
  return serialize(value);
}
