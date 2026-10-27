/*
 * MCPMark four-run sibling slice.
 *
 * One fixed filesystem task is replayed across all four fresh runs of the
 * GPT-4.1/filesystem group.  Each run includes the complete messages, ordered
 * execution log, publisher harness result, and the corresponding full-run
 * summary.  Publisher programmatic success is retained as a benchmark label;
 * task environments and verifier implementations are not in this slice, so it
 * is never promoted to independent outcome truth or training authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
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

export const MCPMARK_FOUR_RUN_SCHEMA = "outsider/mcpmark-four-run-sibling/v1";
export const MCPMARK_FOUR_RUN_RECEIPT_SCHEMA =
  "outsider/mcpmark-four-run-sibling-run-receipt/v1";
export const MCPMARK_DATASET_ID = "Jakumetsu/mcpmark-trajectory-log";
export const MCPMARK_DATASET_REVISION =
  "e50578f0ab904d8e6a7c576c387c1e76ae482c89";
export const MCPMARK_GROUP = "gpt-4-1__filesystem";
export const MCPMARK_TASK = "file_context__duplicates_searching";
export const MCPMARK_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/mcpmark-four-run-sibling-report/v1";
const RECEIPT_DOMAIN = "outsider/mcpmark-four-run-sibling-receipt/v1";
const MANIFEST_DOMAIN = "outsider/mcpmark-four-run-sibling-source-manifest/v1";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

const TOP_TREE_OID = "65fac5a3cc64feb4b8af642570733ab99fff5894";
const DATA_ROOT_TREE_OID = "20a0dff1990e67876648f950d46ff1997fe66480";
const GROUP_TREE_OID = "1fc5c5fa074a0d0e8334646ba7d43a466fcb2d9c";
const RUN_TREE_OIDS = Object.freeze([
  "b2acac8306b1a3bbecd0d83df45ad2669cc34611",
  "eae4df939e2bd8485ec56785af3b4d46909be2d8",
  "7591197ecad39ae3aca1e9c911872316bca9ad62",
  "c6b6de02d6dc6a1933f637cdc67c0c2f6c172245",
]);
const TASK_TREE_OIDS = Object.freeze([
  "6aff863c25d403fb68c41a0ac76ece6ab9e91d07",
  "d49ed8fcf09e0a88981daaf46e229ee456ea16ec",
  "d0b86f91cc50ff54d60c00ff420949ebff4d6c32",
  "6c6ebc6a3f8d88d0fdd319d8eca1b003c733e6c9",
]);
const EXPECTED_SUCCESS = Object.freeze([true, true, false, true]);
const SOURCE_FILE_NAMES = Object.freeze(["README.md",
  ...[1, 2, 3, 4].flatMap((run) => [
    `run-${run}-execution.log`, `run-${run}-messages.json`,
    `run-${run}-meta.json`, `run-${run}-summary.json`,
  ])]);
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json", "group-tree.json",
  "root-tree-page-01.json", "root-tree-page-02.json", "root-tree-page-03.json",
  "top-tree.json",
  ...[1, 2, 3, 4].flatMap((run) => [
    `run-${run}-tree.json`, `run-${run}-task-tree.json`,
  ]),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `MCPMARK_${code}` : `MCPMARK_${code}:${detail}`);
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

function readPrivateStable(root, relative, expected = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(MAX_FILE_BYTES)) fail("FILE_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mode !== after.mode || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    if (expected !== null && (bytes.length !== expected.bytes
      || gitBlobOid(bytes) !== expected.oid)) fail("FILE_PIN_MISMATCH", relative);
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function verifyRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== MCPMARK_DATASET_ID || record.sha !== MCPMARK_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "mit" || record.usedStorage !== 254_794_404
    || !Array.isArray(record.siblings) || record.siblings.length !== 35_959) {
    fail("DATASET_RECORD_INVALID");
  }
  return { id: record.id, revision: record.sha, licenseClaim: record.cardData.license,
    usedStorage: record.usedStorage, siblingCount: record.siblings.length,
    lastModified: record.lastModified, private: false, gated: false, disabled: false };
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
      || typeof entry.path !== "string" || !/^[^/\0]+$/u.test(name)
      || names.has(name) || !/^[a-f0-9]{40}$/u.test(entry.oid)
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

function verifyTreeLineage(metadata) {
  const top = parseJson(metadata.get("top-tree.json"), "TOP_TREE_JSON_INVALID");
  if (gitTreeOid(top, "TOP_TREE") !== TOP_TREE_OID) fail("TOP_TREE_HASH_MISMATCH");
  const dataRoot = exactEntry(top, "mcpmark-v1-0905", "directory",
    "DATA_ROOT_MEMBER_INVALID");
  const readme = exactEntry(top, "README.md", "file", "README_MEMBER_INVALID");
  if (dataRoot.oid !== DATA_ROOT_TREE_OID || readme.oid
    !== "742f6c7e28649765e5110d6354a6c225a86dd8d3" || readme.size !== 1_029) {
    fail("TOP_TREE_PINS_INVALID");
  }
  const rootPages = [1, 2, 3].map((page) => parseJson(metadata.get(
    `root-tree-page-0${page}.json`), `ROOT_TREE_PAGE_${page}_INVALID`));
  if (rootPages.some((page, index) => !Array.isArray(page)
    || page.length !== (index < 2 ? 50 : 20))) fail("ROOT_TREE_PAGINATION_INVALID");
  const root = rootPages.flat();
  if (new Set(root.map((entry) => entry.path)).size !== 120
    || gitTreeOid(root, "DATA_ROOT_TREE") !== DATA_ROOT_TREE_OID) {
    fail("DATA_ROOT_TREE_HASH_MISMATCH");
  }
  const groupMember = exactEntry(root, MCPMARK_GROUP, "directory",
    "GROUP_MEMBER_INVALID");
  if (groupMember.oid !== GROUP_TREE_OID) fail("GROUP_MEMBER_HASH_MISMATCH");
  const group = parseJson(metadata.get("group-tree.json"), "GROUP_TREE_JSON_INVALID");
  if (group.length !== 4 || gitTreeOid(group, "GROUP_TREE") !== GROUP_TREE_OID) {
    fail("GROUP_TREE_HASH_MISMATCH");
  }
  const expectedFiles = new Map([["README.md", { oid: readme.oid, bytes: readme.size,
    sourcePath: "README.md" }]]);
  for (let run = 1; run <= 4; run += 1) {
    const runMember = exactEntry(group, `run-${run}`, "directory", "RUN_MEMBER_INVALID");
    if (runMember.oid !== RUN_TREE_OIDS[run - 1]) fail("RUN_MEMBER_HASH_MISMATCH", run);
    const runTree = parseJson(metadata.get(`run-${run}-tree.json`),
      `RUN_${run}_TREE_JSON_INVALID`);
    if (runTree.length !== 31 || gitTreeOid(runTree, `RUN_${run}_TREE`)
      !== RUN_TREE_OIDS[run - 1]) fail("RUN_TREE_HASH_MISMATCH", run);
    const taskMember = exactEntry(runTree, MCPMARK_TASK, "directory",
      "TASK_MEMBER_INVALID");
    const summaryMember = exactEntry(runTree, "summary.json", "file",
      "SUMMARY_MEMBER_INVALID");
    if (taskMember.oid !== TASK_TREE_OIDS[run - 1]) fail("TASK_MEMBER_HASH_MISMATCH", run);
    expectedFiles.set(`run-${run}-summary.json`, { oid: summaryMember.oid,
      bytes: summaryMember.size,
      sourcePath: `mcpmark-v1-0905/${MCPMARK_GROUP}/run-${run}/summary.json` });
    const taskTree = parseJson(metadata.get(`run-${run}-task-tree.json`),
      `RUN_${run}_TASK_TREE_JSON_INVALID`);
    if (taskTree.length !== 3 || gitTreeOid(taskTree, `RUN_${run}_TASK_TREE`)
      !== TASK_TREE_OIDS[run - 1]) fail("TASK_TREE_HASH_MISMATCH", run);
    for (const remote of ["execution.log", "messages.json", "meta.json"]) {
      const member = exactEntry(taskTree, remote, "file", "TASK_FILE_MEMBER_INVALID");
      expectedFiles.set(`run-${run}-${remote}`, { oid: member.oid, bytes: member.size,
        sourcePath: `mcpmark-v1-0905/${MCPMARK_GROUP}/run-${run}/${MCPMARK_TASK}/${remote}` });
    }
  }
  return { expectedFiles, topTreeOid: TOP_TREE_OID, dataRootTreeOid: DATA_ROOT_TREE_OID,
    dataRootEntryCount: root.length, groupTreeOid: GROUP_TREE_OID,
    groupRunCount: group.length };
}

function replayRun(fileBytes, run) {
  const meta = parseJson(fileBytes.get(`run-${run}-meta.json`), "META_JSON_INVALID");
  const summary = parseJson(fileBytes.get(`run-${run}-summary.json`),
    "SUMMARY_JSON_INVALID");
  const messages = parseJson(fileBytes.get(`run-${run}-messages.json`),
    "MESSAGES_JSON_INVALID");
  const log = new TextDecoder("utf-8", { fatal: true }).decode(
    fileBytes.get(`run-${run}-execution.log`));
  if (!meta || meta.task_name !== MCPMARK_TASK || meta.model_name !== "gpt-4.1"
    || meta.mcp !== "filesystem" || meta.execution_result?.success
      !== EXPECTED_SUCCESS[run - 1]
    || !Number.isSafeInteger(meta.turn_count) || meta.turn_count < 1
    || !meta.time || typeof meta.time.start !== "string" || typeof meta.time.end !== "string"
    || !Array.isArray(messages) || messages.length < 4
    || summary.model_name !== "gpt-4.1" || summary.total_tasks !== 30
    || summary.successful_tasks + summary.failed_tasks !== 30) fail("RUN_PROFILE_INVALID", run);
  const start = Date.parse(meta.time.start);
  const end = Date.parse(meta.time.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    fail("RUN_TIME_INVALID", run);
  }
  const calls = messages.filter((message) => message?.type === "function_call");
  const outputs = messages.filter((message) => message?.type === "function_call_output");
  const users = messages.filter((message) => message?.role === "user");
  if (users.length !== 1 || typeof users[0].content !== "string"
    || calls.length === 0 || calls.length !== outputs.length
    || new Set(calls.map((call) => call.call_id)).size !== calls.length
    || !same(sorted(calls.map((call) => call.call_id)),
      sorted(outputs.map((output) => output.call_id)))) fail("MESSAGE_JOIN_INVALID", run);
  const toolLines = log.split(/\r?\n/u).filter((line) => line.startsWith("| "));
  if (toolLines.length !== calls.length || !calls.every((call, index) =>
    toolLines[index] === `| ${call.name} ${call.arguments}`)) {
    fail("EXECUTION_LOG_CALL_SEQUENCE_MISMATCH", run);
  }
  const allRaw = `${new TextDecoder("utf-8", { fatal: true }).decode(
    fileBytes.get(`run-${run}-messages.json`))}\n${log}`;
  const localPathOccurrences = [...allRaw.matchAll(/\/home\/[A-Za-z0-9._/-]+/gu)].length;
  return { run, publisherHarnessSuccess: meta.execution_result.success,
    messages: messages.length, functionCalls: calls.length,
    functionCallOutputs: outputs.length, executionLogCalls: toolLines.length,
    turnCount: meta.turn_count, totalTokens: meta.token_usage?.total_tokens ?? null,
    durationMs: end - start, taskPromptHash: sha256(BufferFrom(users[0].content, "utf8")),
    localPathOccurrences, runSummary: { totalTasks: summary.total_tasks,
      successfulTasks: summary.successful_tasks, failedTasks: summary.failed_tasks,
      successRate: summary.success_rate } };
}

function manifestBody(entries) {
  return { schema: "outsider/mcpmark-four-run-sibling-source-manifest/v1",
    datasetId: MCPMARK_DATASET_ID, revision: MCPMARK_DATASET_REVISION,
    entries: sorted(entries.map((entry) => entry.path)).map((entryPath) =>
      entries.find((entry) => entry.path === entryPath)) };
}

function collectSource(root, withManifest = false) {
  requireDirectory(root, withManifest
    ? ["files", "metadata", "source-manifest.json"]
    : ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"), SOURCE_FILE_NAMES);
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readPrivateStable(root, `metadata/${file}`);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, sourcePath: null, bytes: bytes.length,
      sha256: sha256(bytes), sourceObjectId: null });
  }
  const before = verifyRecord(metadata.get("dataset-record-before.json"));
  const after = verifyRecord(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const lineage = verifyTreeLineage(metadata);
  const files = new Map();
  for (const file of SOURCE_FILE_NAMES) {
    const expected = lineage.expectedFiles.get(file);
    if (!expected) fail("SOURCE_EXPECTATION_MISSING", file);
    const bytes = readPrivateStable(root, `files/${file}`, expected);
    files.set(file, bytes);
    entries.push({ path: `files/${file}`, sourcePath: expected.sourcePath,
      bytes: bytes.length, sha256: sha256(bytes), sourceObjectId: expected.oid });
  }
  return { before, lineage, files, entries };
}

export function createMcpmarkFourRunSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(PathResolve(sourceDirectory), false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildMcpmarkFourRunSiblingFromSourceDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, ["files", "metadata", "source-manifest.json"]);
  const collected = collectSource(root, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  if (!serialize(sourceManifest).equals(readPrivateStable(root, "source-manifest.json"))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const runs = [1, 2, 3, 4].map((run) => replayRun(collected.files, run));
  const promptHashes = new Set(runs.map((run) => run.taskPromptHash));
  if (promptHashes.size !== 1 || !same(runs.map((run) => run.publisherHarnessSuccess),
    EXPECTED_SUCCESS)) fail("SIBLING_RUN_PROFILE_MISMATCH");
  const reportBody = {
    schema: MCPMARK_FOUR_RUN_SCHEMA, disposition: MCPMARK_DISPOSITION,
    source: { ...collected.before,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      topTreeOid: collected.lineage.topTreeOid,
      dataRootTreeOid: collected.lineage.dataRootTreeOid,
      dataRootEntryCount: collected.lineage.dataRootEntryCount,
      groupTreeOid: collected.lineage.groupTreeOid,
      fullGroupRunCount: collected.lineage.groupRunCount,
      selectedFileCount: SOURCE_FILE_NAMES.length,
      selectedBytes: SOURCE_FILE_NAMES.reduce((sum, file) =>
        sum + collected.files.get(file).length, 0),
      completeSelectedBytesReplayed: true, completeDatasetPayloadReplayed: false,
      rawTraceBytesProjected: false },
    siblingDesign: { group: MCPMARK_GROUP, task: MCPMARK_TASK,
      freshRunCount: 4, allPublishedFreshRunsForSelectedGroupTaskPresent: true,
      exactTaskPromptAcrossRuns: true, taskPromptHash: runs[0].taskPromptHash,
      publisherSuccessCount: runs.filter((run) => run.publisherHarnessSuccess).length,
      publisherFailureCount: runs.filter((run) => !run.publisherHarnessSuccess).length,
      publisherOutcomeSequence: runs.map((run) => run.publisherHarnessSuccess),
      runReplay: runs, fullGroupTasksPerRun: 30,
      fullGroupTaskRunsRepresentedBySummaries: 120,
      selectedTaskRunsReplayed: 4 },
    evidenceBoundary: { messagesAndToolCallsReplayed: true,
      exactOrderedExecutionLogsReplayed: true, publisherHarnessOutcomesReplayed: true,
      taskEnvironmentBytesReplayed: false, verifierImplementationBytesReplayed: false,
      publisherHarnessOutcomeIsIndependentTruth: false,
      recoverySuffixPresent: false, completeAttemptCensusOutsideSelectedTask: false },
    privacy: { localPathOccurrences: runs.reduce((sum, run) =>
      sum + run.localPathOccurrences, 0), rawPromptsAndToolOutputsPrivate: true,
      noPiiGuaranteed: false, rawProjectionRows: 0 },
    rights: { datasetLicenseClaim: "MIT", legalConclusionEstablished: false,
      evaluationUseOnlyByThisArtifact: true, trainingUseAuthorized: false },
    boundary: { pairedSiblingEvaluationMorphologies: 4,
      independentOutcomeRows: 0, longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
      preActionDelegationRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0, actorCreditRows: 0,
      ceuRows: 0, pricingRows: 0, authorityRows: 0,
      autonomousActionAuthorized: false },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: MCPMARK_FOUR_RUN_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: MCPMARK_DISPOSITION, pairedSiblingEvaluationMorphologies: 4,
    independentOutcomeRows: 0, offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false };
}

export function createMcpmarkFourRunReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyMcpmarkFourRunArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readPrivateStable(root, "report.json");
    const receiptBytes = readPrivateStable(root, "run-receipt.json");
    const rebuilt = buildMcpmarkFourRunSiblingFromSourceDirectory(PathJoin(root, "source"));
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readPrivateStable(root, "source/source-manifest.json");
    const receipt = createMcpmarkFourRunReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: rebuilt.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeMcpmarkFourRunArtifact(value) {
  return serialize(value);
}
