/*
 * BrowseComp-Plus complete search-agent run.
 *
 * One complete 830-question Qwen run is streamed from a fixed public revision.
 * Raw questions, reasoning, web observations, tool calls, and answers remain
 * private. Publisher completion status is replayed; correctness is not inferred
 * from answer strings and the judge/corpus terms are not inherited as authority.
 */

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

export const BROWSECOMP_SEARCH_RUN_SCHEMA =
  "outsider/browsecomp-search-agent-complete-run/v1";
export const BROWSECOMP_SEARCH_RUN_RECEIPT_SCHEMA =
  "outsider/browsecomp-search-agent-complete-run-receipt/v1";
export const BROWSECOMP_SEARCH_DATASET_ID = "liuqi6777/bcp_search_agent_trajectory";
export const BROWSECOMP_SEARCH_DATASET_REVISION =
  "af778a3994cfcb30a8a9ab5abcbcb7c7fcbf645f";
export const BROWSECOMP_SEARCH_RUN_ID = "qwen35-35b-a3b";
export const BROWSECOMP_SEARCH_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/browsecomp-search-agent-complete-run-report/v1";
const RECEIPT_DOMAIN = "outsider/browsecomp-search-agent-complete-run-receipt/v1";
const MANIFEST_DOMAIN = "outsider/browsecomp-search-agent-source-manifest/v1";
const ROOT_TREE_OID = "fb8ac8dd8976ca8dbec114126926890d6c2e6b22";
const RUN_TREE_OID = "697c742dfca6cf91db54fb2c6b81d6c456afeeac";
const TRAJECTORY_BYTES = 277_075_664;
const TRAJECTORY_SHA256 =
  "sha256:4c0d3925b49d34d560286e5e0e35ecf0f95feca6994b79bb243aee32dc1c3076";
const TRAJECTORY_GIT_OID = "e95d71fc5477be0d889fcee536b7c82a3df19ece";
const MAX_SMALL_FILE_BYTES = 4 * 1024 * 1024;
const MAX_JSONL_LINE_BYTES = 4 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SMALL_FILES = Object.freeze({
  "README.md": Object.freeze({ bytes: 4_557,
    oid: "6592d954481aa90a986b44f85de479ca706677f8" }),
  "manifest.json": Object.freeze({ bytes: 2_565,
    oid: "3a944f9eb632e93b5d0df27981d823ca365ee89a" }),
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json", "full-tree.json",
  "root-tree.json", "run-tree.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `BROWSECOMP_SEARCH_${code}`
    : `BROWSECOMP_SEARCH_${code}:${detail}`);
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

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
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

function requireDirectory(directory, expected) {
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
  if (!same(sorted(readdirSync(directory)), sorted(expected))) {
    fail("DIRECTORY_LAYOUT_INVALID", directory);
  }
}

function checkedPath(root, relative) {
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")
    || relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", String(relative));
  return target;
}

function stableFileDescriptor(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const before = fstatSync(descriptor, { bigint: true });
  return { descriptor, before, relative };
}

function assertStableDescriptor(state, bytesRead) {
  const after = fstatSync(state.descriptor, { bigint: true });
  if (state.before.dev !== after.dev || state.before.ino !== after.ino
    || state.before.size !== after.size || state.before.mode !== after.mode
    || state.before.mtimeNs !== after.mtimeNs || state.before.ctimeNs !== after.ctimeNs
    || BigInt(bytesRead) !== after.size) fail("FILE_CHANGED_DURING_READ", state.relative);
}

function readSmall(root, relative, expected = null) {
  const state = stableFileDescriptor(root, relative, MAX_SMALL_FILE_BYTES,
    expected?.bytes ?? null);
  try {
    const bytes = readFileSync(state.descriptor);
    assertStableDescriptor(state, bytes.length);
    if (expected !== null && gitBlobOid(bytes) !== expected.oid) {
      fail("FILE_PIN_MISMATCH", relative);
    }
    return bytes;
  } finally { closeSync(state.descriptor); }
}

function baseName(entry) {
  return entry.path.split("/").at(-1);
}

function gitTreeOid(entries, code) {
  if (!Array.isArray(entries) || entries.length === 0) fail(`${code}_INVALID`);
  const names = new Set();
  const ordered = [...entries].sort((left, right) => Buffer.compare(
    BufferFrom(`${baseName(left)}${left.type === "directory" ? "/" : ""}`, "utf8"),
    BufferFrom(`${baseName(right)}${right.type === "directory" ? "/" : ""}`, "utf8"),
  ));
  const chunks = [];
  for (const entry of ordered) {
    const name = baseName(entry);
    if (!entry || !["directory", "file"].includes(entry.type)
      || !/^[^/\0]+$/u.test(name) || names.has(name)
      || !/^[a-f0-9]{40}$/u.test(entry.oid)
      || !Number.isSafeInteger(entry.size) || entry.size < 0) fail(`${code}_ENTRY_INVALID`);
    names.add(name);
    chunks.push(BufferFrom(`${entry.type === "directory" ? "40000" : "100644"} ${name}\0`,
      "utf8"), BufferFrom(entry.oid, "hex"));
  }
  const body = Buffer.concat(chunks);
  return createHash("sha1").update(BufferFrom(`tree ${body.length}\0`, "utf8"))
    .update(body).digest("hex");
}

function exactEntry(entries, name, type, code) {
  const matches = entries.filter((entry) => baseName(entry) === name);
  if (matches.length !== 1 || matches[0].type !== type) fail(code);
  return matches[0];
}

function verifyRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== BROWSECOMP_SEARCH_DATASET_ID
    || record.sha !== BROWSECOMP_SEARCH_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.usedStorage !== 2_218_490_971 || record.cardData?.license !== "apache-2.0"
    || !Array.isArray(record.siblings) || record.siblings.length !== 9) {
    fail("DATASET_RECORD_INVALID");
  }
  return { id: record.id, revision: record.sha, licenseClaim: record.cardData.license,
    usedStorage: record.usedStorage, siblingCount: record.siblings.length,
    lastModified: record.lastModified, private: false, gated: false, disabled: false };
}

function verifyTrees(metadata) {
  const root = parseJson(metadata.get("root-tree.json"), "ROOT_TREE_JSON_INVALID");
  if (root.length !== 9 || gitTreeOid(root, "ROOT_TREE") !== ROOT_TREE_OID) {
    fail("ROOT_TREE_HASH_MISMATCH");
  }
  const runMember = exactEntry(root, BROWSECOMP_SEARCH_RUN_ID, "directory",
    "RUN_MEMBER_INVALID");
  if (runMember.oid !== RUN_TREE_OID) fail("RUN_MEMBER_HASH_MISMATCH");
  for (const [file, expected] of Object.entries(SMALL_FILES)) {
    const member = exactEntry(root, file, "file", "SMALL_MEMBER_INVALID");
    if (member.oid !== expected.oid || member.size !== expected.bytes) {
      fail("SMALL_MEMBER_PIN_MISMATCH", file);
    }
  }
  const run = parseJson(metadata.get("run-tree.json"), "RUN_TREE_JSON_INVALID");
  if (run.length !== 1 || gitTreeOid(run, "RUN_TREE") !== RUN_TREE_OID) {
    fail("RUN_TREE_HASH_MISMATCH");
  }
  const trajectory = exactEntry(run, "predictions.jsonl", "file",
    "TRAJECTORY_MEMBER_INVALID");
  if (trajectory.oid !== TRAJECTORY_GIT_OID || trajectory.size !== TRAJECTORY_BYTES
    || trajectory.lfs?.oid !== TRAJECTORY_SHA256.slice(7)
    || trajectory.lfs?.size !== TRAJECTORY_BYTES) fail("TRAJECTORY_MEMBER_PIN_MISMATCH");
  const full = parseJson(metadata.get("full-tree.json"), "FULL_TREE_JSON_INVALID");
  const files = full.filter((entry) => entry?.type === "file");
  const directories = full.filter((entry) => entry?.type === "directory");
  const logicalBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  if (full.length !== 15 || files.length !== 9 || directories.length !== 6
    || logicalBytes !== 2_218_500_984) fail("FULL_TREE_PROFILE_MISMATCH");
  return { rootTreeOid: ROOT_TREE_OID, runTreeOid: RUN_TREE_OID,
    fullTreeEntries: full.length, fullTreeFiles: files.length,
    fullTreeDirectories: directories.length, fullTreeLogicalBytes: logicalBytes };
}

function verifyPublisherManifest(bytes) {
  const manifest = parseJson(bytes, "PUBLISHER_MANIFEST_JSON_INVALID");
  if (manifest.dataset !== "browsecomp_plus.jsonl" || manifest.num_questions !== 830
    || !Array.isArray(manifest.runs) || manifest.runs.length !== 6) {
    fail("PUBLISHER_MANIFEST_INVALID");
  }
  const run = manifest.runs.find((entry) => entry?.run_id === BROWSECOMP_SEARCH_RUN_ID);
  if (!run || run.rows_in !== 830 || run.rows_out !== 830
    || run.duplicates_dropped !== 0 || run.records_scrubbed !== 0
    || run.questions_missing_from_run !== 0 || run.questions_not_in_dataset !== 0
    || run.terminations?.answer !== 819 || run.terminations?.incomplete !== 11
    || run.bytes !== TRAJECTORY_BYTES || run.sha256 !== TRAJECTORY_SHA256.slice(7)) {
    fail("PUBLISHER_RUN_MANIFEST_INVALID");
  }
  return { declaredRunCount: manifest.runs.length, declaredQuestions: manifest.num_questions,
    selectedRun: run };
}

function streamTrajectory(root, relative, profileOnly = false) {
  const state = stableFileDescriptor(root, relative, TRAJECTORY_BYTES, TRAJECTORY_BYTES);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let carry = Buffer.alloc(0);
  let total = 0;
  let rows = 0;
  let answer = 0;
  let incomplete = 0;
  let messages = 0;
  let toolCalls = 0;
  let toolResults = 0;
  let modelCalls = 0;
  let totalTokens = 0;
  let exactStringMatches = 0;
  const questionHashes = new Set();
  function consume(line) {
    if (line.length < 2 || line.length > MAX_JSONL_LINE_BYTES) fail("JSONL_LINE_INVALID", rows + 1);
    const value = parseJson(line, "TRAJECTORY_ROW_JSON_INVALID");
    if (!value || typeof value !== "object" || Array.isArray(value)
      || sorted(Object.keys(value)).join("\0")
        !== ["answer", "messages", "metadata", "prediction", "question", "termination"]
          .sort().join("\0")
      || typeof value.question !== "string" || value.question.length === 0
      || typeof value.answer !== "string" || typeof value.prediction !== "string"
      || !["answer", "incomplete"].includes(value.termination)
      || !Array.isArray(value.messages) || !value.metadata
      || value.metadata.rollout_id !== 1
      || value.metadata.dataset_name !== "browsecomp_plus"
      || value.metadata.model_name !== "Qwen/Qwen3.5-35B-A3B"
      || !Array.isArray(value.metadata.model_calls)) fail("TRAJECTORY_ROW_INVALID", rows + 1);
    const questionHash = sha256(BufferFrom(value.question, "utf8"));
    if (questionHashes.has(questionHash)) {
      fail("TRAJECTORY_ID_DUPLICATE", rows + 1);
    }
    questionHashes.add(questionHash);
    answer += value.termination === "answer" ? 1 : 0;
    incomplete += value.termination === "incomplete" ? 1 : 0;
    exactStringMatches += value.prediction.trim() === value.answer.trim() ? 1 : 0;
    messages += value.messages.length;
    const calls = [];
    const results = [];
    for (const message of value.messages) {
      if (!message || typeof message !== "object" || typeof message.role !== "string") {
        fail("MESSAGE_INVALID", rows + 1);
      }
      if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          if (typeof call?.id !== "string" || typeof call.name !== "string") {
            fail("TOOL_CALL_INVALID", rows + 1);
          }
          calls.push(call.id);
        }
      }
      if (message.role === "tool") {
        if (typeof message.tool_call_id !== "string") fail("TOOL_RESULT_INVALID", rows + 1);
        results.push(message.tool_call_id);
      }
    }
    if (!same(sorted(calls), sorted(results))) fail("TOOL_CALL_RESULT_JOIN_INVALID", rows + 1);
    toolCalls += calls.length;
    toolResults += results.length;
    modelCalls += value.metadata.model_calls.length;
    for (const call of value.metadata.model_calls) {
      const used = call?.response?.usage?.total_tokens;
      if (Number.isSafeInteger(used) && used >= 0) totalTokens += used;
    }
    rows += 1;
  }
  try {
    for (;;) {
      const read = readSync(state.descriptor, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const chunk = buffer.subarray(0, read);
      hash.update(chunk);
      total += read;
      const combined = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
      let start = 0;
      for (let index = 0; index < combined.length; index += 1) {
        if (combined[index] === 0x0a) {
          if (!profileOnly) consume(combined.subarray(start, index));
          else rows += 1;
          start = index + 1;
        }
      }
      carry = Buffer.from(combined.subarray(start));
      if (carry.length > MAX_JSONL_LINE_BYTES) fail("JSONL_LINE_TOO_LARGE");
    }
    if (carry.length !== 0) fail("JSONL_FINAL_NEWLINE_MISSING");
    assertStableDescriptor(state, total);
  } finally { closeSync(state.descriptor); }
  const fileHash = `sha256:${hash.digest("hex")}`;
  if (fileHash !== TRAJECTORY_SHA256 || rows !== 830) fail("TRAJECTORY_FILE_PIN_MISMATCH");
  if (profileOnly) return { bytes: total, sha256: fileHash, rows };
  if (answer !== 819 || incomplete !== 11 || questionHashes.size !== 830
    || toolCalls !== toolResults) fail("TRAJECTORY_PROFILE_MISMATCH");
  return { bytes: total, sha256: fileHash, rows, terminationAnswer: answer,
    terminationIncomplete: incomplete, uniqueQuestions: questionHashes.size,
    publisherRolloutId: 1, messages, toolCalls, toolResults, modelCalls,
    totalTokens, exactTrimmedPredictionReferenceMatches: exactStringMatches };
}

function manifestBody(entries) {
  return { schema: "outsider/browsecomp-search-agent-source-manifest/v1",
    datasetId: BROWSECOMP_SEARCH_DATASET_ID,
    revision: BROWSECOMP_SEARCH_DATASET_REVISION,
    entries: sorted(entries.map((entry) => entry.path)).map((entryPath) =>
      entries.find((entry) => entry.path === entryPath)) };
}

function collectSource(root, withManifest) {
  requireDirectory(root, withManifest
    ? ["files", "metadata", "source-manifest.json"] : ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"),
    ["README.md", "manifest.json", "predictions.jsonl"]);
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readSmall(root, `metadata/${file}`);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, sourcePath: null, bytes: bytes.length,
      sha256: sha256(bytes), sourceObjectId: null });
  }
  const before = verifyRecord(metadata.get("dataset-record-before.json"));
  const after = verifyRecord(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const tree = verifyTrees(metadata);
  const small = new Map();
  for (const [file, expected] of Object.entries(SMALL_FILES)) {
    const bytes = readSmall(root, `files/${file}`, expected);
    small.set(file, bytes);
    entries.push({ path: `files/${file}`, sourcePath: file, bytes: bytes.length,
      sha256: sha256(bytes), sourceObjectId: expected.oid });
  }
  const trajectory = streamTrajectory(root, "files/predictions.jsonl", true);
  entries.push({ path: "files/predictions.jsonl",
    sourcePath: `${BROWSECOMP_SEARCH_RUN_ID}/predictions.jsonl`,
    bytes: trajectory.bytes, sha256: trajectory.sha256,
    sourceObjectId: TRAJECTORY_GIT_OID });
  return { before, tree, small, entries };
}

export function createBrowsecompSearchRunSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(PathResolve(sourceDirectory), false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildBrowsecompSearchRunFromSourceDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  const collected = collectSource(root, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  if (!serialize(sourceManifest).equals(readSmall(root, "source-manifest.json"))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const publisher = verifyPublisherManifest(collected.small.get("manifest.json"));
  const replay = streamTrajectory(root, "files/predictions.jsonl", false);
  const reportBody = {
    schema: BROWSECOMP_SEARCH_RUN_SCHEMA, disposition: BROWSECOMP_SEARCH_DISPOSITION,
    source: { ...collected.before, sourceManifestHash: sourceManifest.sourceManifestHash,
      ...collected.tree, selectedRunId: BROWSECOMP_SEARCH_RUN_ID,
      selectedBytes: replay.bytes + SMALL_FILES["README.md"].bytes
        + SMALL_FILES["manifest.json"].bytes,
      selectedFileCount: 3, completeSelectedRunBytesReplayed: true,
      completeDatasetPayloadReplayed: false, rawTraceBytesProjected: false },
    publisherManifest: { ...publisher, publisherClaimsReplayed: true,
      fullRunManifestCoversSixAgents: true },
    runReplay: { ...replay, complete830QuestionRun: true,
      rawMessagesAndReasoningProjected: false,
      exactStringMatchIsNotCorrectness: true,
      judgeOutcomeRowsReplayed: 0, independentOutcomeRows: 0 },
    rights: { trajectoryRepositoryLicenseClaim: "Apache-2.0",
      underlyingQuestionsCorpusAndQrelsHaveSeparateTerms: true,
      upstreamTermsBytesReplayed: false, legalConclusionEstablished: false,
      evaluationUseOnlyByThisArtifact: true, trainingUseAuthorized: false },
    privacy: { fullWebObservationsAndReasoningPresentInRawSource: true,
      rawSourcePrivate: true, noPiiGuaranteed: false, rawProjectionRows: 0 },
    boundary: { searchAgentTrajectoryMorphologies: 830,
      completionStatusRows: 830, correctnessOutcomeRows: 0,
      independentOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0, preActionDelegationRows: 0,
      offlineTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: BROWSECOMP_SEARCH_RUN_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: BROWSECOMP_SEARCH_DISPOSITION,
    searchAgentTrajectoryMorphologies: 830, correctnessOutcomeRows: 0,
    independentOutcomeRows: 0, offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false };
}

export function createBrowsecompSearchRunReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyBrowsecompSearchRunArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readSmall(root, "report.json");
    const receiptBytes = readSmall(root, "run-receipt.json");
    const rebuilt = buildBrowsecompSearchRunFromSourceDirectory(PathJoin(root, "source"));
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readSmall(root, "source/source-manifest.json");
    const receipt = createBrowsecompSearchRunReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: rebuilt.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeBrowsecompSearchRunArtifact(value) {
  return serialize(value);
}
