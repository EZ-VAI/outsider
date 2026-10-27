/*
 * Complete fixed-revision replay for AlexWortega/agent-launch-pad-trajectories.
 *
 * The repository contains two conflicting corpus versions: all.parquet is the
 * exact concatenation of the two per-benchmark files (1,380 cells), while the
 * configured train Parquet contains 1,406 cells.  Common keys include 575
 * changed rows.  Neither version is silently preferred and their populations
 * are never added.  Instructions and conversations remain private source bytes.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  constants, existsSync, lstatSync, openSync, closeSync, fstatSync,
  readFileSync, readSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const AGENT_LAUNCH_PAD_DATASET_ID =
  "AlexWortega/agent-launch-pad-trajectories";
export const AGENT_LAUNCH_PAD_REVISION =
  "23abf32576c54734c2b0ca5df0c5843a338eefac";
export const AGENT_LAUNCH_PAD_CARD_LICENSE = "apache-2.0";
export const AGENT_LAUNCH_PAD_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";
export const AGENT_LAUNCH_PAD_REPORT_SCHEMA =
  "outsider/agent-launch-pad-full-repo/v1";
export const AGENT_LAUNCH_PAD_RECEIPT_SCHEMA =
  "outsider/agent-launch-pad-full-repo-receipt/v1";

const SOURCE_SCHEMA = "outsider/agent-launch-pad-full-repo-source/v1";
const MANIFEST_DOMAIN = "outsider/agent-launch-pad-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/agent-launch-pad-source-root/v1";
const TREE_ROOT_DOMAIN = "outsider/agent-launch-pad-tree-root/v1";
const REPORT_DOMAIN = "outsider/agent-launch-pad-report/v1";
const RECEIPT_DOMAIN = "outsider/agent-launch-pad-receipt/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 90 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const RECORD_SHA256 =
  "sha256:f5e6d401d5127973e27c0a33b4b0e708a62d49b34be184c7f58a506df3430ba6";
const TREE_SHA256 =
  "sha256:53d2fa80f01089ee716194fb68beda7ee06c91937702697ccbea7d499c0c7511";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:3a1b09f08a8092fdc6466c0f99a70b07fd1dafe98612e9349646f5108824a7e6";
const EXPECTED_SOURCE_ROOT =
  "sha256:9723c7f4826403ffc21b3e6c18f74bc3dcfb5901c0ec2b11b7b6529d0825a761";

const FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfs: null, xetHash: null,
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb" }),
  Object.freeze({ path: "README.md", bytes: 3_850,
    oid: "7e70034f3d9610bb08aef33229dc965c6ea2051e", lfs: null, xetHash: null,
    sha256: "sha256:9963a373be831a548307335869510897e4c0852cddd58f12a9f87326033aa0bf" }),
  Object.freeze({ path: "all.parquet", bytes: 30_245_882,
    oid: "2411ea01bdb7511436007d83fd0140d0c8d54fb0",
    lfs: Object.freeze({ oid: "b2b0e903e1e9d43528963bb29f215bdf5b1542d918aa0d6fb2c7a8a49c3ab9f9",
      size: 30_245_882, pointerSize: 133 }),
    xetHash: "21f4904ce34ca076f9086842bc8705d5d52ecbc3432595720101984483d7e5fc",
    sha256: "sha256:b2b0e903e1e9d43528963bb29f215bdf5b1542d918aa0d6fb2c7a8a49c3ab9f9" }),
  Object.freeze({ path: "data/train-00000-of-00001.parquet", bytes: 83_280_578,
    oid: "b43430b2c3c5f5d6333be42d0f3374283d1f7dea",
    lfs: Object.freeze({ oid: "663e9382f9ea98349c27f3664fccbd34c0ebca22c1979f0c662a7019d305a80a",
      size: 83_280_578, pointerSize: 133 }),
    xetHash: "873dc9b338e3c3d7ce973f4a58ed0acc7e344f6655823c982808e2581f2d7d2e",
    sha256: "sha256:663e9382f9ea98349c27f3664fccbd34c0ebca22c1979f0c662a7019d305a80a" }),
  Object.freeze({ path: "scienceagentbench.parquet", bytes: 3_684_170,
    oid: "e47a15f8904d2d334e954d8212ece2eed645409c",
    lfs: Object.freeze({ oid: "5de24c1a14d1ce5e6a0995f58742d962cc0c3438cf9dc404d4423db1f482ec95",
      size: 3_684_170, pointerSize: 132 }),
    xetHash: "24c2fcee08ed0ca66f1b506674f238908e05a4f03c9db25e8bd682115af86a39",
    sha256: "sha256:5de24c1a14d1ce5e6a0995f58742d962cc0c3438cf9dc404d4423db1f482ec95" }),
  Object.freeze({ path: "terminal-bench-2.parquet", bytes: 25_739_977,
    oid: "b411669a1d20bdebf5fe1cc7df1734627dfa83d2",
    lfs: Object.freeze({ oid: "272d05ec6efca51a9b5127260099e860d09e0dcfd2a96cc9aa777a25d9a7094c",
      size: 25_739_977, pointerSize: 133 }),
    xetHash: "006f21035e60884d32222e481016873ac78609c58edb5148914caa2b62e76d1e",
    sha256: "sha256:272d05ec6efca51a9b5127260099e860d09e0dcfd2a96cc9aa777a25d9a7094c" }),
]);

const TOTAL_FILE_BYTES = FILES.reduce((sum, item) => sum + item.bytes, 0);
const COLUMNS = Object.freeze([
  "bench", "agent", "model", "task_id", "grade_pass", "grade_score",
  "grade_reason", "verifier_raw_reward", "verifier_n_passed",
  "verifier_n_failed", "latency_s", "mode", "ok", "instruction",
  "conversations",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_LAUNCH_PAD_${code}`
    : `AGENT_LAUNCH_PAD_${code}:${detail}`);
}

export function agentLaunchPadSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return agentLaunchPadSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)
    || ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function parseJson(bytes, code) {
  try { return JSON.parse(strictUtf8(bytes, code)); }
  catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function checkedRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600
    || status.size < 1n || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("SOURCE_FILE_INVALID", relative);
  }
  return { target, bytes: Number(status.size) };
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const checked = checkedRegular(root, relative, maximumBytes, exactBytes);
  return readFileSync(checked.target);
}

function hashRegular(root, relative, maximumBytes, exactBytes = null) {
  const checked = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(checked.target, O_RDONLY | O_NOFOLLOW);
  try {
    const status = fstatSync(descriptor, { bigint: true });
    if (!status.isFile() || status.size !== BigInt(checked.bytes)) {
      fail("SOURCE_FILE_CHANGED", relative);
    }
    const hash = createHash("sha256");
    const git = createHash("sha1");
    git.update(Buffer.from(`blob ${checked.bytes}\0`, "utf8"));
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (offset < checked.bytes) {
      const count = readSync(descriptor, buffer, 0,
        Math.min(buffer.length, checked.bytes - offset), offset);
      if (count < 1) fail("SOURCE_FILE_SHORT", relative);
      const chunk = buffer.subarray(0, count); hash.update(chunk); git.update(chunk);
      offset += count;
    }
    return { bytes: checked.bytes, sha256: `sha256:${hash.digest("hex")}`,
      gitOid: git.digest("hex") };
  } finally { closeSync(descriptor); }
}

function walkPrivate(root) {
  const found = [];
  function visit(directory, prefix) {
    const status = lstatSync(directory, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_INVALID", prefix);
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name);
      const child = lstatSync(target, { bigint: true });
      if (child.isSymbolicLink()) fail("SOURCE_SYMLINK", relative);
      if (child.isDirectory()) visit(target, relative);
      else if (child.isFile()) {
        if (Number(child.mode & 0o777n) !== 0o600) fail("SOURCE_MODE_INVALID", relative);
        found.push(relative);
      } else fail("SOURCE_TYPE_INVALID", relative);
    }
  }
  visit(path.resolve(root), "");
  return found;
}

export function agentLaunchPadPayloadSpecifications() {
  return FILES.map((item) => ({ ...item,
    lfs: item.lfs === null ? null : { ...item.lfs } }));
}

function treeProjection(tree) {
  if (!Array.isArray(tree) || tree.length !== 7) fail("TREE_SHAPE_INVALID");
  const expected = [{ path: "data", type: "directory", bytes: 0,
    oid: "ec69aded2eeae46fce889a064bd412a0bd0289a4" },
  ...FILES.map((item) => ({ path: item.path, type: "file", bytes: item.bytes,
    oid: item.oid, lfs: item.lfs, xetHash: item.xetHash }))];
  const observed = tree.map((row) => ({ path: row.path, type: row.type,
    bytes: row.size, oid: row.oid,
    ...(row.type === "file" ? { lfs: row.lfs ?? null,
      xetHash: row.xetHash ?? null } : {}) }));
  if (!same(observed, expected)) fail("TREE_CONTENT_INVALID");
  return { entries: 7, files: 6, directories: 1, fileBytes: TOTAL_FILE_BYTES,
    lfsFiles: 4, xetFiles: 4, treeRoot: digest(TREE_ROOT_DOMAIN, observed) };
}

export function inspectAgentLaunchPadMetadata(recordBytes, treeBytes) {
  const record = parseJson(recordBytes, "record");
  const tree = parseJson(treeBytes, "tree");
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((row) => row.rfilename)) : [];
  if (record.id !== AGENT_LAUNCH_PAD_DATASET_ID
    || record.sha !== AGENT_LAUNCH_PAD_REVISION || record.private !== false
    || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== AGENT_LAUNCH_PAD_CARD_LICENSE
    || !same(siblings, sorted(FILES.map((item) => item.path)))
    || record.cardData?.dataset_info?.splits?.[0]?.num_examples !== 1_406
    || record.cardData?.dataset_info?.download_size !== 83_280_578) {
    fail("RECORD_CONTENT_INVALID");
  }
  return deepFreeze({ record: {
    createdAt: record.createdAt, lastModified: record.lastModified,
    usedStorageBytes: record.usedStorage, downloadsAtAcquisition: record.downloads,
    public: true, gated: false, disabled: false,
    cardLicenseClaim: record.cardData.license,
    configuredTrainExamples: 1_406, configuredTrainDownloadBytes: 83_280_578,
  }, tree: treeProjection(tree) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, os, sys
import pyarrow.parquet as pq

root=sys.argv[1]
paths={
  "all":os.path.join(root,"files/all.parquet"),
  "train":os.path.join(root,"files/data/train-00000-of-00001.parquet"),
  "science":os.path.join(root,"files/scienceagentbench.parquet"),
  "terminal":os.path.join(root,"files/terminal-bench-2.parquet"),
}
columns=["bench","agent","model","task_id","grade_pass","grade_score","grade_reason","verifier_raw_reward","verifier_n_passed","verifier_n_failed","latency_s","mode","ok","instruction","conversations"]
keycols=columns[:4]
def canon(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)
def hash_list(domain, values):
  h=hashlib.sha256(); h.update((domain+"\0[").encode())
  for i,v in enumerate(values):
    if i: h.update(b",")
    h.update(canon(v).encode())
  h.update(b"]"); return "sha256:"+h.hexdigest()
def label(v):
  if v is None:return "null"
  if v is True:return "true"
  if v is False:return "false"
  return str(v)
def count(rows, field): return dict(sorted(collections.Counter(label(r[field]) for r in rows).items()))
def key(r): return tuple(r[c] for c in keycols)
def profile(name,p):
  pf=pq.ParquetFile(p); table=pf.read()
  if table.column_names!=columns: raise ValueError("columns:"+name)
  rows=table.to_pylist(); keys=[key(r) for r in rows]
  for r in rows:
    for c in columns:
      if isinstance(r[c],float) and not math.isfinite(r[c]): raise ValueError("nonfinite")
  conv=collections.Counter(); roles=collections.Counter()
  for r in rows:
    messages=r["conversations"]
    if messages is None: conv["rowsNull"]+=1; continue
    if len(messages)==0: conv["rowsEmpty"]+=1
    conv["messages"]+=len(messages)
    for m in messages:
      if not isinstance(m,dict) or set(m)!=set(["from","value"]): conv["malformed"]+=1; continue
      roles[label(m["from"])]+=1
      if isinstance(m["value"],str):
        conv["valueChars"]+=len(m["value"]); conv["valueUtf8Bytes"]+=len(m["value"].encode())
  ordered=sorted(rows,key=key)
  meta=pf.metadata
  return rows,{
    "rows":len(rows),"columns":len(columns),"physicalColumns":meta.num_columns,
    "rowGroups":meta.num_row_groups,"createdBy":meta.created_by,
    "compression":sorted(set(meta.row_group(0).column(i).compression for i in range(meta.num_columns))),
    "schemaTypes":[str(f.type) for f in table.schema],
    "schemaMetadataKeys":sorted(k.decode() for k in (table.schema.metadata or {}).keys()),
    "keysUnique":len(set(keys)),
    "keyRoot":hash_list("launchpad/keys/v1",[list(key(r)) for r in ordered]),
    "rowRoot":hash_list("launchpad/rows/v1",ordered),
    "nullCounts":{c:sum(r[c] is None for r in rows) for c in columns},
    "counts":{c:count(rows,c) for c in ["bench","agent","model","grade_pass","ok","mode"]},
    "publisherPassByModel":dict(sorted(collections.Counter(r["model"] for r in rows if r["grade_pass"] is True).items())),
    "instruction":{"emptyRows":sum(r["instruction"]=="" for r in rows),"nonemptyRows":sum(isinstance(r["instruction"],str) and r["instruction"]!="" for r in rows),"unique":len(set(r["instruction"] for r in rows)),"chars":sum(len(r["instruction"]) for r in rows if isinstance(r["instruction"],str)),"utf8Bytes":sum(len(r["instruction"].encode()) for r in rows if isinstance(r["instruction"],str))},
    "conversation":{"rowsNull":conv["rowsNull"],"rowsEmpty":conv["rowsEmpty"],"messages":conv["messages"],"malformedMessages":conv["malformed"],"valueChars":conv["valueChars"],"valueUtf8Bytes":conv["valueUtf8Bytes"],"roleCounts":dict(sorted(roles.items()))},
  }
data={}; profiles={}
for name,p in paths.items(): data[name],profiles[name]=profile(name,p)
allmap={key(r):r for r in data["all"]}; trainmap={key(r):r for r in data["train"]}
common=sorted(set(allmap)&set(trainmap)); allonly=sorted(set(allmap)-set(trainmap)); trainonly=sorted(set(trainmap)-set(allmap))
fielddiff=collections.Counter(); diffsets=collections.Counter(); perbench=collections.Counter(); peragent=collections.Counter(); permodel=collections.Counter(); gradecross=collections.Counter(); gradechanged=collections.Counter(); drift=[]; exact=0
for k in common:
  a=allmap[k]; t=trainmap[k]; ds=tuple(c for c in columns if a[c]!=t[c])
  if not ds: exact+=1; continue
  drift.append(k); diffsets[",".join(ds)]+=1; perbench[k[0]]+=1; peragent[k[1]]+=1; permodel[k[2]]+=1
  for c in ds: fielddiff[c]+=1
  gradecross[label(a["grade_pass"])+"->"+label(t["grade_pass"])]+=1
  if a["grade_pass"]!=t["grade_pass"]: gradechanged[label(a["grade_pass"])+"->"+label(t["grade_pass"])]+=1
out={"profiles":profiles,"crossVersion":{
  "commonKeys":len(common),"allOnlyKeys":len(allonly),"trainOnlyKeys":len(trainonly),"exactCommonRows":exact,"driftedCommonRows":len(drift),
  "trainOnlyBenchCounts":dict(sorted(collections.Counter(k[0] for k in trainonly).items())),
  "trainOnlyPublisherGradeCounts":dict(sorted(collections.Counter(label(trainmap[k]["grade_pass"]) for k in trainonly).items())),
  "trainOnlyKeyRoot":hash_list("launchpad/train-only-keys/v1",[list(k) for k in trainonly]),
  "driftKeyRoot":hash_list("launchpad/drift-keys/v1",[list(k) for k in drift]),
  "fieldDifferenceCounts":{c:fielddiff[c] for c in columns},"differenceSignatureCounts":dict(sorted(diffsets.items())),
  "driftBenchCounts":dict(sorted(perbench.items())),"driftAgentCounts":dict(sorted(peragent.items())),"driftModelCounts":dict(sorted(permodel.items())),
  "publisherGradeTransitionsWithinDrift":dict(sorted(gradecross.items())),"publisherGradeDivergenceTransitions":dict(sorted(gradechanged.items())),
  "gradeDivergenceRows":sum(gradechanged.values()),
  "allIsOrderedTerminalThenScience":data["all"]==data["terminal"]+data["science"],
  "allIsExactTerminalScienceMultiset":collections.Counter(canon(r) for r in data["all"])==collections.Counter(canon(r) for r in data["terminal"]+data["science"]),
  "allTerminalRowsExactlyEqualTerminalFile":[r for r in data["all"] if r["bench"]=="terminal-bench-2"]==data["terminal"],
  "allScienceRowsExactlyEqualScienceFile":[r for r in data["all"] if r["bench"]=="scienceagentbench"]==data["science"],
}}
print(json.dumps(out,sort_keys=True,separators=(",",":"),allow_nan=False))
`;

function findPython(options = {}) {
  const candidates = [options.pythonExecutable,
    process.env.OUTSIDER_AGENT_LAUNCH_PAD_PYTHON,
    "/private/tmp/armbench-parquet-venv/bin/python",
    ".venv/bin/python", "/opt/anaconda3/bin/python"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? "python3";
}

function replayParquets(root, options = {}) {
  const result = spawnSync(findPython(options), ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    timeout: options.replayTimeoutMs ?? 180_000,
  });
  if (result.status !== 0) fail("PARQUET_REPLAY_FAILED",
    String(result.stderr || result.error || result.status).slice(0, 1_000));
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "parquet-replay");
  const p = replay.profiles; const c = replay.crossVersion;
  if (p?.all?.rows !== 1_380 || p?.terminal?.rows !== 1_204
    || p?.science?.rows !== 176 || p?.train?.rows !== 1_406
    || Object.values(p).some((profile) => profile.columns !== 15
      || profile.physicalColumns !== 16 || profile.rowGroups !== 1
      || profile.keysUnique !== profile.rows)
    || c?.commonKeys !== 1_380 || c.allOnlyKeys !== 0 || c.trainOnlyKeys !== 26
    || c.exactCommonRows !== 805 || c.driftedCommonRows !== 575
    || c.gradeDivergenceRows !== 62
    || c.allIsOrderedTerminalThenScience !== true
    || c.allIsExactTerminalScienceMultiset !== true
    || c.allTerminalRowsExactlyEqualTerminalFile !== true
    || c.allScienceRowsExactlyEqualScienceFile !== true
    || !same(c.driftBenchCounts, { "terminal-bench-2": 575 })
    || !same(c.driftAgentCounts, { "hermes-agent": 575 })
    || !same(c.trainOnlyBenchCounts, { "terminal-bench-2": 26 })
    || !same(p.all.publisherPassByModel, {
      "inclusionai/ling-2.6-1t:free": 22,
      "minimax/minimax-m2.5:free": 24,
      "openai/gpt-oss-120b:free": 20,
      "poolside/laguna-m.1:free": 21,
      "poolside/laguna-xs.2:free": 16,
      "tencent/hy3-preview:free": 30,
      "z-ai/glm-4.5-air:free": 12,
    })
    || p.all.conversation.malformedMessages !== 0
    || p.train.conversation.malformedMessages !== 0) fail("PARQUET_PROFILE_INVALID");
  return deepFreeze(replay);
}

function replayText(root) {
  const readme = strictUtf8(readRegular(root, "files/README.md", 10_000, 3_850), "readme");
  const attributes = strictUtf8(readRegular(root, "files/.gitattributes", 10_000, 2_504), "attributes");
  const required = ["Total trajectories**: 1380", "grade_pass=True**: 145",
    "terminal-bench-2`: 1204 cells, 138 grade_pass",
    "scienceagentbench`: 176 cells, 7 grade_pass",
    "each cell graded by the benchmark's own verifier",
    "terminal-bench: Apache 2.0; SAB: research use", "distill-grade corpus"];
  if (required.some((needle) => !readme.includes(needle))
    || !attributes.includes("*.parquet filter=lfs diff=lfs merge=lfs -text")) {
    fail("TEXT_PROFILE_INVALID");
  }
  return deepFreeze({ readmeClaimedRows: 1_380, readmeClaimedPublisherPasses: 145,
    readmeClaimedTerminalRows: 1_204, readmeClaimedTerminalPasses: 138,
    readmeClaimedScienceRows: 176, readmeClaimedSciencePasses: 7,
    cardFrontmatterLicenseClaim: "apache-2.0",
    terminalUnderlyingLicenseClaim: "Apache 2.0",
    scienceUnderlyingLicenseClaim: "research use",
    publisherOwnVerifierClaimPresent: true,
    publisherDistillationUseSuggestionPresent: true,
    parquetLfsPatternPresent: true,
    sourceCodeFilesPresent: false,
    sourceOrTrajectoryInstructionsExecuted: false });
}

const HEADER_PATHS = FILES.map((item) =>
  `metadata/object-response-headers/${item.path}.headers.json`);
const CORE_PATHS = Object.freeze([
  "metadata/dataset-record-before.json", "metadata/dataset-record-after.json",
  "metadata/full-tree-before.json", "metadata/full-tree-after.json",
  ...HEADER_PATHS, ...FILES.map((item) => `files/${item.path}`),
]);

function validateObjectHeaders(root) {
  return FILES.map((specification) => {
    const relative = `metadata/object-response-headers/${specification.path}.headers.json`;
    const header = parseJson(readRegular(root, relative, MAX_METADATA_BYTES), "object-header");
    if (header.path !== specification.path
      || ![200, 302, 307].includes(header.status)
      || header.headers?.xRepoCommit !== AGENT_LAUNCH_PAD_REVISION
      || header.headers?.xLinkedEtag !== `\"${specification.lfs?.oid ?? specification.oid}\"`
      || specification.lfs !== null && (header.headers.xLinkedSize !== String(specification.bytes)
        || header.headers.xXetHash !== specification.xetHash)) {
      fail("OBJECT_HEADER_INVALID", specification.path);
    }
    return header;
  });
}

function collectCoreSource(sourceDirectory, expectedExtraPaths = [], options = {}) {
  const root = path.resolve(sourceDirectory);
  if (!same(walkPrivate(root), sorted([...CORE_PATHS, ...expectedExtraPaths]))) {
    fail("SOURCE_LAYOUT_INVALID");
  }
  const recordBefore = readRegular(root, "metadata/dataset-record-before.json", MAX_METADATA_BYTES);
  const recordAfter = readRegular(root, "metadata/dataset-record-after.json", MAX_METADATA_BYTES);
  const treeBefore = readRegular(root, "metadata/full-tree-before.json", MAX_METADATA_BYTES);
  const treeAfter = readRegular(root, "metadata/full-tree-after.json", MAX_METADATA_BYTES);
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("ACQUISITION_BRACKET_CHANGED");
  }
  if (agentLaunchPadSha256(recordBefore) !== RECORD_SHA256
    || agentLaunchPadSha256(treeBefore) !== TREE_SHA256) {
    fail("ACQUISITION_METADATA_DIGEST_INVALID");
  }
  const metadata = inspectAgentLaunchPadMetadata(recordBefore, treeBefore);
  const entries = [];
  for (const relative of CORE_PATHS.filter((item) => item.startsWith("metadata/"))) {
    const measured = hashRegular(root, relative, MAX_METADATA_BYTES);
    entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256 });
  }
  for (const specification of FILES) {
    const relative = `files/${specification.path}`;
    const measured = hashRegular(root, relative, MAX_SOURCE_FILE_BYTES, specification.bytes);
    if (measured.sha256 !== specification.sha256
      || specification.lfs === null && measured.gitOid !== specification.oid
      || specification.lfs !== null
        && measured.sha256 !== `sha256:${specification.lfs.oid}`) {
      fail("REPOSITORY_FILE_DIGEST_INVALID", specification.path);
    }
    entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256,
      oid: specification.oid, lfs: specification.lfs, xetHash: specification.xetHash });
  }
  const objectHeaders = validateObjectHeaders(root);
  const replay = replayParquets(root, options);
  const text = replayText(root);
  return { root, metadata, entries, objectHeaders, replay, text };
}

function sourceManifestBody(collected) {
  const entries = [...collected.entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: SOURCE_SCHEMA, datasetId: AGENT_LAUNCH_PAD_DATASET_ID,
    revision: AGENT_LAUNCH_PAD_REVISION,
    fixedTreeFiles: collected.metadata.tree.files,
    fixedTreeDirectories: collected.metadata.tree.directories,
    fixedTreeBytes: collected.metadata.tree.fileBytes,
    fixedTreeRoot: collected.metadata.tree.treeRoot,
    completeFixedRepositoryPayload: true, sourceFiles: entries.length, entries,
    allVersionRows: collected.replay.profiles.all.rows,
    trainVersionRows: collected.replay.profiles.train.rows,
    commonKeys: collected.replay.crossVersion.commonKeys,
    driftedCommonRows: collected.replay.crossVersion.driftedCommonRows,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, entries) };
}

export function createAgentLaunchPadSourceManifestFromDirectory(sourceDirectory, options = {}) {
  const collected = collectCoreSource(sourceDirectory, [], options);
  const body = sourceManifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function collectCompleteSource(sourceDirectory, options = {}) {
  const collected = collectCoreSource(sourceDirectory, ["source-manifest.json"], options);
  const body = sourceManifestBody(collected);
  const sourceManifest = deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
  const bytes = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(bytes)) fail("SOURCE_MANIFEST_MISMATCH");
  if (sourceManifest.manifestHash !== EXPECTED_SOURCE_MANIFEST_HASH
    || sourceManifest.sourceRoot !== EXPECTED_SOURCE_ROOT) {
    fail("SOURCE_MANIFEST_PIN_INVALID");
  }
  return { ...collected, sourceManifest, sourceManifestBytes: bytes };
}

function reportBody(source) {
  const p = source.replay.profiles; const cross = source.replay.crossVersion;
  return {
    schema: AGENT_LAUNCH_PAD_REPORT_SCHEMA,
    disposition: AGENT_LAUNCH_PAD_DISPOSITION,
    source: {
      datasetId: AGENT_LAUNCH_PAD_DATASET_ID, revision: AGENT_LAUNCH_PAD_REVISION,
      public: true, gated: false, disabled: false,
      createdAt: source.metadata.record.createdAt,
      lastModified: source.metadata.record.lastModified,
      recordUsedStorageBytes: source.metadata.record.usedStorageBytes,
      recordUsedStorageIsNotCurrentTreeBytes:
        source.metadata.record.usedStorageBytes !== TOTAL_FILE_BYTES,
      downloadsAtAcquisition: source.metadata.record.downloadsAtAcquisition,
      recordBeforeAfterByteIdentical: true, treeBeforeAfterByteIdentical: true,
      fixedTreeEntries: 7, fixedTreeFiles: 6, fixedTreeDirectories: 1,
      fixedTreeBytes: TOTAL_FILE_BYTES, fixedTreeLfsFiles: 4, fixedTreeXetFiles: 4,
      fixedTreeRoot: source.metadata.tree.treeRoot,
      completeFixedRepositoryPayloadAcquired: true,
      sourceManifestHash: source.sourceManifest.manifestHash,
      sourceManifestFileSha256: agentLaunchPadSha256(source.sourceManifestBytes),
      sourceRoot: source.sourceManifest.sourceRoot,
      rawFilesPrivate: true, allSourceFilesMode: "0600", allSourceDirectoriesMode: "0700",
    },
    parquetReplay: { profiles: p,
      allPhysicalColumnsDecodedFromCurrentBytes: true,
      allRowsDecodedFromCurrentBytes: true,
      rawInstructionOrConversationProjectedIntoReport: false,
      trajectoryContentOrEmbeddedInstructionsExecuted: false },
    populationRegistry: {
      allVersionRows: 1_380, terminalSubsetRows: 1_204, scienceSubsetRows: 176,
      allVersionIsExactOrderedTerminalThenScience: true,
      allAndSubsetsRepresentOnePopulation: true,
      trainVersionRows: 1_406, commonKeysAcrossVersions: 1_380,
      trainOnlyKeys: 26, allOnlyKeys: 0,
      unionUniqueKeysAcrossVersions: 1_406,
      allVersionAndTrainVersionConflict: true,
      versionsAreNonAdditive: true, crossTotal: null,
    },
    crossVersionConflict: cross,
    documentationDrift: {
      readmeClaimedRows: source.text.readmeClaimedRows,
      readmeClaimedPublisherPasses: source.text.readmeClaimedPublisherPasses,
      readmeMatchesAllAndSubsetsVersion: p.all.rows === 1_380
        && p.all.counts.grade_pass.true === 145,
      readmeMatchesTrainVersion: false,
      readmePerModelPublisherPassesMatchAllVersion: true,
      trainVersionRows: p.train.rows,
      trainVersionPublisherPasses: p.train.counts.grade_pass.true,
      trainConfiguredInCardExamples: source.metadata.record.configuredTrainExamples,
      cardConfiguredTrainMatchesTrainVersion: true,
      readmeFileListOmitsConfiguredTrainConflict: true,
      currentBytesSupersedeNarrativeWhereTheyConflict: true,
    },
    publisherOutcomeBoundary: {
      allVersionPublisherGradeTrue: p.all.counts.grade_pass.true,
      allVersionPublisherGradeFalse: p.all.counts.grade_pass.false,
      allVersionPublisherGradeNull: p.all.counts.grade_pass.null,
      trainVersionPublisherGradeTrue: p.train.counts.grade_pass.true,
      trainVersionPublisherGradeFalse: p.train.counts.grade_pass.false,
      trainVersionPublisherGradeNull: p.train.counts.grade_pass.null,
      publisherHarnessVerifierSignals: true,
      publisherVerifierOutcomesIndependent: false,
      realWorldOutcomeRows: 0, independentOutcomeRows: 0,
      physicalEffectRows: 0, recoveryRows: 0, retryRows: 0,
      longitudinalRows: 0,
    },
    trajectoryBoundary: {
      sourceNativeAgentCellRowsInAllVersion: 1_380,
      sourceNativeAgentCellRowsInTrainVersion: 1_406,
      rawConversationRowsRetainedPrivately: true,
      rawInstructionsRetainedPrivately: true,
      completePhysicalEpisodeRows: 0,
      publisherSandboxCellsAreRealWorldExecutions: false,
      siblingCellsAreRetriesOrRecoveryAttempts: false,
      sourceTrajectoriesExecutedDuringReplay: false,
    },
    rightsPrivacyAndUse: {
      rights: {
        datasetCardLicenseClaim: AGENT_LAUNCH_PAD_CARD_LICENSE,
        repositoryLicenseFilePresent: false,
        readmeTerminalUnderlyingClaim: source.text.terminalUnderlyingLicenseClaim,
        readmeScienceUnderlyingClaim: source.text.scienceUnderlyingLicenseClaim,
        scienceRowsCarryResearchUseClaim: true,
        perRowUpstreamRightsIndependentlyClosed: false,
        publisherDistillationUseSuggestionPresent:
          source.text.publisherDistillationUseSuggestionPresent,
        cardClaimNotProjectedOverUnderlyingRows: true,
        rightsDisposition: "FAIL_CLOSED", authorizedTrainingRows: 0,
        legalConclusionEstablished: false,
      },
      privacy: { rawSourcePrivate: true, noPiiGuaranteed: false,
        instructionAndConversationContentProjected: false,
        privateSourceFilesMode: "0600", privateSourceDirectoriesMode: "0700" },
      use: { quarantineEvaluationOnly: true, offlineTrainingRows: 0,
        productionTrainingRows: 0, networkAdmissionRows: 0, authorityRows: 0,
        ceuRows: 0, autonomousActionAuthorized: false },
    },
    zeroClaimBoundary: {
      physicalSourceEpisodes: 0, completePhysicalEpisodeRows: 0,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0, physicalEffectRows: 0,
      retryRows: 0, recoveryRows: 0, longitudinalRows: 0,
      delegationRows: 0, authorizedTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, authorityDelta: 0,
      autonomousActionAuthorized: false,
    },
  };
}

export function buildAgentLaunchPadReportFromSource(sourceDirectory, options = {}) {
  const source = collectCompleteSource(sourceDirectory, options);
  const body = reportBody(source);
  return deepFreeze({ ...body, artifactHash: digest(REPORT_DOMAIN, body) });
}

function reportErrors(report) {
  const errors = [];
  if (!exactObject(report) || report.schema !== AGENT_LAUNCH_PAD_REPORT_SCHEMA) {
    return ["SCHEMA_INVALID"];
  }
  if (report.disposition !== AGENT_LAUNCH_PAD_DISPOSITION
    || report.source?.datasetId !== AGENT_LAUNCH_PAD_DATASET_ID
    || report.source?.revision !== AGENT_LAUNCH_PAD_REVISION
    || report.source?.fixedTreeFiles !== 6 || report.source?.fixedTreeBytes !== TOTAL_FILE_BYTES
    || report.populationRegistry?.allVersionRows !== 1_380
    || report.populationRegistry?.trainVersionRows !== 1_406
    || report.populationRegistry?.crossTotal !== null
    || report.populationRegistry?.versionsAreNonAdditive !== true) {
    errors.push("SOURCE_POPULATION_BOUNDARY");
  }
  if (report.crossVersionConflict?.driftedCommonRows !== 575
    || report.crossVersionConflict?.gradeDivergenceRows !== 62
    || report.crossVersionConflict?.trainOnlyKeys !== 26) errors.push("VERSION_CONFLICT_BOUNDARY");
  const zero = report.zeroClaimBoundary;
  if (!exactObject(zero) || Object.entries(zero).some(([key, value]) =>
    key === "autonomousActionAuthorized" ? value !== false : value !== 0)) {
    errors.push("ZERO_CLAIM_BOUNDARY");
  }
  const rights = report.rightsPrivacyAndUse;
  if (rights?.rights?.authorizedTrainingRows !== 0
    || rights.rights.rightsDisposition !== "FAIL_CLOSED"
    || rights.privacy?.rawSourcePrivate !== true || rights.privacy?.noPiiGuaranteed !== false
    || rights.use?.networkAdmissionRows !== 0 || rights.use?.authorityRows !== 0) {
    errors.push("RIGHTS_PRIVACY_USE_BOUNDARY");
  }
  const { artifactHash: ignored, ...body } = report;
  if (!HASH.test(report.artifactHash ?? "")
    || report.artifactHash !== digest(REPORT_DOMAIN, body)) errors.push("ARTIFACT_HASH");
  return errors;
}

export function verifyAgentLaunchPadReport(report) {
  const errors = reportErrors(report);
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createAgentLaunchPadReceipt(report) {
  const checked = verifyAgentLaunchPadReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  const body = { schema: AGENT_LAUNCH_PAD_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot, disposition: AGENT_LAUNCH_PAD_DISPOSITION,
    fixedTreeFiles: 6, fixedTreeBytes: TOTAL_FILE_BYTES,
    allVersionRows: 1_380, trainVersionRows: 1_406, crossTotal: null,
    driftedCommonRows: 575, gradeDivergenceRows: 62, trainOnlyKeys: 26,
    independentOutcomeRows: 0, recoveryRows: 0, authorizedTrainingRows: 0,
    networkAdmissionRows: 0, authorityDelta: 0,
    receiptWrittenLast: true, noClobber: true };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAgentLaunchPadSourceDirectory(sourceDirectory, options = {}) {
  try {
    const source = collectCompleteSource(sourceDirectory, options);
    return deepFreeze({ ok: true, sourceManifest: source.sourceManifest,
      metadata: source.metadata, replay: source.replay,
      verificationLevel: "FULL_FIXED_REPOSITORY_AND_CONFLICTING_PARQUET_VERSIONS_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}

export function verifyAgentLaunchPadArtifactDirectory(directory, options = {}) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const report = buildAgentLaunchPadReportFromSource(checkedPath(root, "source"), options);
    if (!serialize(report).equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const receipt = createAgentLaunchPadReceipt(report);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report, receipt,
      reportFileSha256: agentLaunchPadSha256(reportBytes),
      receiptFileSha256: agentLaunchPadSha256(receiptBytes),
      verificationLevel: "FULL_FIXED_REPOSITORY_AND_CONFLICTING_PARQUET_VERSIONS_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}

export function serializeAgentLaunchPadArtifact(value) { return serialize(value); }
