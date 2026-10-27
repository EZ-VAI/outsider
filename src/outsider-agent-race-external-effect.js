/*
 * Agent Race bounded external-digital-effect evidence.
 *
 * Four public coding-agent traces run one publisher-declared ML task through
 * three harnesses and two driver-model families.  This adapter replays the
 * complete fixed-revision trace repository and observes the four named model
 * repositories at fixed commits.  Repository existence is a digital effect;
 * it is not independent evidence that training was correct or that published
 * metrics are true.  Raw traces remain local and are never training, network,
 * credit, authority, pricing, or action input.
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
const ObjectKeys = Object.keys;
const ArrayIsArray = Array.isArray;
const NumberIsSafeInteger = Number.isSafeInteger;
const PathResolve = path.resolve;
const PathRelative = path.relative;
const PathJoin = path.join;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const AGENT_RACE_EXTERNAL_EFFECT_SCHEMA =
  "outsider/agent-race-external-digital-effect/v1";
export const AGENT_RACE_RUN_RECEIPT_SCHEMA =
  "outsider/agent-race-external-digital-effect-run-receipt/v1";
export const AGENT_RACE_DATASET_ID = "davanstrien/agent-race-traces";
export const AGENT_RACE_DATASET_REVISION =
  "4a8ac15d62c37aad4402c8f2021a2cef074c3806";
export const AGENT_RACE_UPSTREAM_DATASET_ID = "biglam/on_the_books";
export const AGENT_RACE_UPSTREAM_DATASET_REVISION =
  "f41f04d9eb03c25a03f6665baa62c18ef7357625";
export const AGENT_RACE_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const REPORT_HASH_DOMAIN = "outsider/agent-race-external-effect-report/v1";
const RECEIPT_HASH_DOMAIN = "outsider/agent-race-external-effect-receipt/v1";
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const SOURCE_FILES = Object.freeze({
  ".gitattributes": Object.freeze({
    bytes: 2_504,
    gitOid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a",
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb",
  }),
  "README.md": Object.freeze({
    bytes: 2_894,
    gitOid: "00df8b8b30e7644d068731a2c3fa41796537afe5",
    sha256: "sha256:3e2e534d993d173c07b45d95d708fe7d2c5614175224e0cc644f06767c4c1c0d",
  }),
  "claude-code.jsonl": Object.freeze({
    bytes: 327_550,
    gitOid: "fa8b0d59bb6fa616326514ec745ab7d5c38f73bc",
    sha256: "sha256:42014674c6dcdbda39fbc42b203e2d1c257c62c9ca2a74fd0bd9a0725db912a3",
  }),
  "ml-intern-claude-opus.jsonl": Object.freeze({
    bytes: 98_820,
    gitOid: "754f4863863b50e41ba2f25ba60073473d15a261",
    sha256: "sha256:e23fc809904c052bd37939ee09ffd6dd09a71bbf9e0c80efb3a759a098868e82",
  }),
  "ml-intern-kimi.jsonl": Object.freeze({
    bytes: 212_676,
    gitOid: "ad81918be632cd046d7658741742aed739199f24",
    sha256: "sha256:953faf13a322f98b7c4519f3ccc7f8cffd58521c8070edac046bc5b356e933d8",
  }),
  "pi-kimi.jsonl": Object.freeze({
    bytes: 154_761,
    gitOid: "6446e91158474e5d78f9f2ed849223a9ef9e6b76",
    sha256: "sha256:d5a2a58c6ec589cf81d27d387cf95543aaa0d36133e37d9fac085a82fecd4276",
  }),
});

export const AGENT_RACE_RUNS = Object.freeze([
  Object.freeze({
    traceFile: "claude-code.jsonl", harness: "CLAUDE_CODE",
    driverModelFamily: "CLAUDE_OPUS", targetRepository:
      "davanstrien/jim-crow-laws-claude-code",
    targetRevision: "15bf6132d4300dc12672f08224171615e20b3906",
    events: 180, toolCalls: 45, toolResults: 45, toolErrors: 4,
    normalizedPromptHash:
      "sha256:6abe2bf3629bb518c805c18cc7fe75120f469462fb6989693b476b2046916dc8",
  }),
  Object.freeze({
    traceFile: "ml-intern-claude-opus.jsonl", harness: "ML_INTERN",
    driverModelFamily: "CLAUDE_OPUS", targetRepository:
      "davanstrien/jim-crow-laws-ml-agent",
    targetRevision: "961aabacaad8628c46fe7b4ebed0a8033d91f81c",
    events: 54, toolCalls: 26, toolResults: 26, toolErrors: 0,
    normalizedPromptHash:
      "sha256:db752d41474deb73c0d926b35608b22bfb69cc2dd93bfaba6201754a8be5da0d",
  }),
  Object.freeze({
    traceFile: "ml-intern-kimi.jsonl", harness: "ML_INTERN",
    driverModelFamily: "KIMI_K2_6", targetRepository:
      "davanstrien/jim-crow-laws-ml-agent-kimi",
    targetRevision: "ec5df2e26ec99428b0a8ac62ceb9ca4abcf30b1a",
    events: 127, toolCalls: 67, toolResults: 67, toolErrors: 0,
    normalizedPromptHash:
      "sha256:db752d41474deb73c0d926b35608b22bfb69cc2dd93bfaba6201754a8be5da0d",
  }),
  Object.freeze({
    traceFile: "pi-kimi.jsonl", harness: "PI_CODING_AGENT",
    driverModelFamily: "KIMI_K2_6", targetRepository:
      "davanstrien/jim-crow-laws-pi-kimi",
    targetRevision: "bd1b808a8ee5f57afa2cfb1996f83fc55e9162ab",
    events: 72, toolCalls: 33, toolResults: 33, toolErrors: 3,
    normalizedPromptHash:
      "sha256:ea4b9428a0653bb7b590862a99d8f2eadbceab26f954dbe2e34cbc0f01fb2bb2",
  }),
]);

const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json", "dataset-tree.json",
  "model-claude-code-record.json", "model-claude-code-tree.json",
  "model-ml-intern-claude-opus-record.json",
  "model-ml-intern-claude-opus-tree.json",
  "model-ml-intern-kimi-record.json", "model-ml-intern-kimi-tree.json",
  "model-pi-kimi-record.json", "model-pi-kimi-tree.json",
  "upstream-dataset-record.json",
]);

const MODEL_METADATA_PREFIX = Object.freeze({
  "claude-code.jsonl": "model-claude-code",
  "ml-intern-claude-opus.jsonl": "model-ml-intern-claude-opus",
  "ml-intern-kimi.jsonl": "model-ml-intern-kimi",
  "pi-kimi.jsonl": "model-pi-kimi",
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_RACE_${code}`
    : `AGENT_RACE_${code}:${detail}`);
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

function parseJsonl(bytes, code) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n")) fail(`${code}_NEWLINE_MISSING`);
  const lines = text.slice(0, -1).split("\n");
  return lines.map((line, index) => {
    if (line.length === 0) fail(`${code}_EMPTY_LINE`, index + 1);
    const value = parseJson(BufferFrom(line, "utf8"), `${code}_JSON_INVALID`);
    if (!value || typeof value !== "object" || ArrayIsArray(value)) {
      fail(`${code}_ROW_INVALID`, index + 1);
    }
    return value;
  });
}

function requireDirectory(directory, expected) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
  if (!same(sorted(readdirSync(directory)), sorted(expected))) {
    fail("DIRECTORY_LAYOUT_INVALID", directory);
  }
}

function checkedPath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")) {
    fail("PATH_INVALID", String(relative));
  }
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, expected = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600
    || link.size < 1n || link.size > BigInt(MAX_FILE_BYTES)) {
    fail("FILE_UNSAFE", relative);
  }
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
      || sha256(bytes) !== expected.sha256)) fail("FILE_PIN_MISMATCH", relative);
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function verifyDatasetRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== AGENT_RACE_DATASET_ID
    || record.sha !== AGENT_RACE_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "cc-by-4.0") fail("DATASET_RECORD_INVALID");
  const siblings = sorted((record.siblings ?? []).map((entry) => entry?.rfilename));
  if (!same(siblings, sorted(ObjectKeys(SOURCE_FILES)))) fail("DATASET_SIBLINGS_INVALID");
  return { id: record.id, revision: record.sha, licenseClaim: record.cardData.license,
    private: record.private, gated: record.gated, disabled: record.disabled };
}

function verifyDatasetTree(bytes) {
  const entries = parseJson(bytes, "DATASET_TREE_JSON_INVALID");
  if (!ArrayIsArray(entries) || entries.length !== ObjectKeys(SOURCE_FILES).length) {
    fail("DATASET_TREE_INVALID");
  }
  const byPath = new Map(entries.map((entry) => [entry?.path, entry]));
  if (byPath.size !== entries.length) fail("DATASET_TREE_DUPLICATE");
  for (const [file, expected] of Object.entries(SOURCE_FILES)) {
    const entry = byPath.get(file);
    if (!entry || entry.type !== "file" || entry.oid !== expected.gitOid
      || entry.size !== expected.bytes || entry.lfs !== undefined) {
      fail("DATASET_TREE_FILE_INVALID", file);
    }
  }
  return { fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0) };
}

function verifyUpstreamRecord(bytes) {
  const record = parseJson(bytes, "UPSTREAM_RECORD_JSON_INVALID");
  if (record.id !== AGENT_RACE_UPSTREAM_DATASET_ID
    || record.sha !== AGENT_RACE_UPSTREAM_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "cc-by-3.0") fail("UPSTREAM_RECORD_INVALID");
  return { id: record.id, revision: record.sha, licenseClaim: record.cardData.license };
}

function verifyModelRecord(bytes, run) {
  const record = parseJson(bytes, "MODEL_RECORD_JSON_INVALID");
  if (record.id !== run.targetRepository || record.modelId !== run.targetRepository
    || record.sha !== run.targetRevision || record.private !== false
    || record.gated !== false || record.disabled !== false
    || !ArrayIsArray(record.siblings)) fail("MODEL_RECORD_INVALID", run.traceFile);
  const siblings = new Set(record.siblings.map((entry) => entry?.rfilename));
  for (const file of ["README.md", "config.json", "model.safetensors",
    "tokenizer.json", "tokenizer_config.json"]) {
    if (!siblings.has(file)) fail("MODEL_REQUIRED_MEMBER_MISSING", `${run.traceFile}:${file}`);
  }
  return { repository: record.id, revision: record.sha,
    createdAt: record.createdAt, lastModified: record.lastModified,
    publishedMetricClaimsPresent: ArrayIsArray(record["model-index"])
      && record["model-index"].some((item) => ArrayIsArray(item?.results)
        && item.results.some((result) => ArrayIsArray(result?.metrics)
          && result.metrics.length > 0)),
    publishedMetricsIndependentlyVerified: false };
}

function verifyModelTree(bytes, run) {
  const entries = parseJson(bytes, "MODEL_TREE_JSON_INVALID");
  if (!ArrayIsArray(entries) || entries.length < 5) fail("MODEL_TREE_INVALID", run.traceFile);
  const paths = new Set(entries.filter((entry) => entry?.type === "file")
    .map((entry) => entry.path));
  for (const file of ["README.md", "config.json", "model.safetensors",
    "tokenizer.json", "tokenizer_config.json"]) {
    if (!paths.has(file)) fail("MODEL_TREE_REQUIRED_MEMBER_MISSING",
      `${run.traceFile}:${file}`);
  }
  return { repository: run.targetRepository, revision: run.targetRevision,
    fileCount: paths.size, modelWeightsBytesReplayed: false };
}

function contentBlocks(message) {
  if (!message || typeof message !== "object" || !ArrayIsArray(message.content)) return [];
  return message.content.filter((block) => block && typeof block === "object"
    && !ArrayIsArray(block));
}

function firstUserText(rows) {
  for (const row of rows) {
    if (row.message?.role !== "user" && row.type !== "user") continue;
    if (typeof row.message?.content === "string" && row.message.content.trim() !== "") {
      return row.message.content;
    }
    const text = contentBlocks(row.message).find((block) => block.type === "text"
      && typeof block.text === "string" && block.text.trim() !== "");
    if (text) return text.text;
  }
  fail("TASK_PROMPT_MISSING");
}

function countPattern(text, expression) {
  return [...text.matchAll(expression)].length;
}

function replayTrace(bytes, run) {
  const rows = parseJsonl(bytes, `TRACE_${run.traceFile}`);
  const toolUseIds = new Set();
  const toolResultIds = new Set();
  let toolErrors = 0;
  for (const row of rows) {
    for (const block of contentBlocks(row.message)) {
      if (block.type === "tool_use") {
        if (typeof block.id !== "string" || block.id.length === 0
          || toolUseIds.has(block.id)) fail("TOOL_USE_ID_INVALID", run.traceFile);
        toolUseIds.add(block.id);
      } else if (block.type === "tool_result") {
        if (typeof block.tool_use_id !== "string" || block.tool_use_id.length === 0
          || toolResultIds.has(block.tool_use_id)) fail("TOOL_RESULT_ID_INVALID", run.traceFile);
        toolResultIds.add(block.tool_use_id);
        if (block.is_error === true) toolErrors += 1;
      } else if (block.type === "toolCall") {
        if (typeof block.id !== "string" || block.id.length === 0
          || toolUseIds.has(block.id)) fail("TOOL_CALL_ID_INVALID", run.traceFile);
        toolUseIds.add(block.id);
      }
    }
    if (row.message?.role === "toolResult") {
      if (typeof row.message.toolCallId !== "string" || row.message.toolCallId.length === 0
        || toolResultIds.has(row.message.toolCallId)) {
        fail("PI_TOOL_RESULT_ID_INVALID", run.traceFile);
      }
      toolResultIds.add(row.message.toolCallId);
      if (row.message.isError === true) toolErrors += 1;
    }
  }
  if (!same(sorted(toolUseIds), sorted(toolResultIds))
    || rows.length !== run.events || toolUseIds.size !== run.toolCalls
    || toolResultIds.size !== run.toolResults || toolErrors !== run.toolErrors) {
    fail("TRACE_REPLAY_PROFILE_MISMATCH", run.traceFile);
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const prompt = firstUserText(rows);
  if (!prompt.includes(run.targetRepository)
    || !prompt.includes(AGENT_RACE_UPSTREAM_DATASET_ID)) {
    fail("TRACE_TASK_BINDING_MISSING", run.traceFile);
  }
  const normalizedPrompt = prompt.split(run.targetRepository)
    .join("<TARGET_MODEL_REPOSITORY>");
  if (sha256(BufferFrom(normalizedPrompt, "utf8")) !== run.normalizedPromptHash) {
    fail("NORMALIZED_PROMPT_HASH_MISMATCH", run.traceFile);
  }
  const secretCandidates = countPattern(raw, /\bhf_[A-Za-z0-9]{20,}\b/gu)
    + countPattern(raw, /\bAKIA[A-Z0-9]{16}\b/gu)
    + countPattern(raw, /\bgh[opusr]_[A-Za-z0-9]{20,}\b/gu)
    + countPattern(raw, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu);
  const emailCandidates = countPattern(raw,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu);
  const ipv4Candidates = countPattern(raw, /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu);
  const localPathCandidates = countPattern(raw, /\/(?:home|Users)\/[^/\s"']+/gu);
  if (secretCandidates !== 0 || emailCandidates !== 0 || ipv4Candidates !== 0) {
    fail("HIGH_CONFIDENCE_PRIVACY_SCAN_HIT", run.traceFile);
  }
  return { traceFile: run.traceFile, harness: run.harness,
    driverModelFamily: run.driverModelFamily, events: rows.length,
    toolCalls: toolUseIds.size, toolResults: toolResultIds.size, toolErrors,
    taskPromptPresent: true, targetRepositoryOccurrences:
      raw.split(run.targetRepository).length - 1,
    upstreamDatasetOccurrences: raw.split(AGENT_RACE_UPSTREAM_DATASET_ID).length - 1,
    exactTargetCommitOccurrences: raw.split(run.targetRevision).length - 1,
    normalizedPromptHash: run.normalizedPromptHash,
    localPathCandidates, secretCandidates, emailCandidates, ipv4Candidates };
}

function sourceManifestBody(entries) {
  return { schema: "outsider/agent-race-source-manifest/v1",
    datasetId: AGENT_RACE_DATASET_ID, revision: AGENT_RACE_DATASET_REVISION,
    entries: sorted(entries.map((entry) => entry.path)).map((entryPath) =>
      entries.find((entry) => entry.path === entryPath)) };
}

export function createAgentRaceSourceManifestFromSourceDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"), ObjectKeys(SOURCE_FILES));
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);
  const entries = [];
  for (const [file, expected] of Object.entries(SOURCE_FILES)) {
    const bytes = readPrivateStable(root, `files/${file}`, expected);
    entries.push({ path: `files/${file}`, bytes: bytes.length, sha256: sha256(bytes),
      sourceObjectId: expected.gitOid });
  }
  for (const file of METADATA_FILES) {
    const bytes = readPrivateStable(root, `metadata/${file}`);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length, sha256: sha256(bytes),
      sourceObjectId: null });
  }
  const body = sourceManifestBody(entries);
  return deepFreeze({ ...body,
    sourceManifestHash: digest("outsider/agent-race-source-manifest/v1", body) });
}

export function buildAgentRaceExternalEffectFromSourceDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, ["files", "metadata", "source-manifest.json"]);
  requireDirectory(PathJoin(root, "files"), ObjectKeys(SOURCE_FILES));
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);

  const entries = [];
  const fileBytes = new Map();
  for (const [file, expected] of Object.entries(SOURCE_FILES)) {
    const bytes = readPrivateStable(root, `files/${file}`, expected);
    fileBytes.set(file, bytes);
    entries.push({ path: `files/${file}`, bytes: bytes.length, sha256: sha256(bytes),
      sourceObjectId: expected.gitOid });
  }
  const metadataBytes = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readPrivateStable(root, `metadata/${file}`);
    metadataBytes.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length, sha256: sha256(bytes),
      sourceObjectId: null });
  }

  const datasetBefore = verifyDatasetRecord(metadataBytes.get("dataset-record-before.json"));
  const datasetAfter = verifyDatasetRecord(metadataBytes.get("dataset-record-after.json"));
  if (!same(datasetBefore, datasetAfter)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const tree = verifyDatasetTree(metadataBytes.get("dataset-tree.json"));
  const upstream = verifyUpstreamRecord(metadataBytes.get("upstream-dataset-record.json"));

  const traceRuns = [];
  const externalRepositories = [];
  for (const run of AGENT_RACE_RUNS) {
    traceRuns.push(replayTrace(fileBytes.get(run.traceFile), run));
    const prefix = MODEL_METADATA_PREFIX[run.traceFile];
    const record = verifyModelRecord(metadataBytes.get(`${prefix}-record.json`), run);
    const modelTree = verifyModelTree(metadataBytes.get(`${prefix}-tree.json`), run);
    externalRepositories.push({ ...record, ...modelTree,
      traceTargetRepositoryNameJoined: true,
      exactCommitHashPresentInTrace: traceRuns.at(-1).exactTargetCommitOccurrences > 0 });
  }

  const manifestBody = sourceManifestBody(entries);
  const sourceManifest = deepFreeze({ ...manifestBody,
    sourceManifestHash: digest("outsider/agent-race-source-manifest/v1", manifestBody) });
  const manifestBytes = readPrivateStable(root, "source-manifest.json");
  if (!serialize(sourceManifest).equals(manifestBytes)) fail("SOURCE_MANIFEST_MISMATCH");

  const reportBody = {
    schema: AGENT_RACE_EXTERNAL_EFFECT_SCHEMA,
    disposition: AGENT_RACE_DISPOSITION,
    source: { ...datasetBefore, completeRepositoryFileClosureReplayed: true,
      repositoryFileCount: tree.fileCount, repositoryFileBytes: tree.totalBytes,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      rawTraceBytesProjected: false },
    upstreamDataset: { ...upstream, payloadRowsReplayed: false,
      upstreamRightsInheritedAsLegalConclusion: false },
    comparisonDesign: { runCount: traceRuns.length, harnessCount: 3,
      driverModelFamilyCount: 2, publisherSameTaskClaimPresent: true,
      sharedUpstreamDatasetReferenceCount: traceRuns.filter((run) =>
        run.upstreamDatasetOccurrences > 0).length,
      rawPromptExactAcrossAllRuns: false,
      normalizedPromptHashCount: new Set(traceRuns.map((run) =>
        run.normalizedPromptHash)).size,
      onlyMlInternPairHasExactTargetNormalizedPrompt: true },
    traceReplay: { runs: traceRuns,
      eventCount: traceRuns.reduce((sum, run) => sum + run.events, 0),
      toolCallCount: traceRuns.reduce((sum, run) => sum + run.toolCalls, 0),
      toolResultCount: traceRuns.reduce((sum, run) => sum + run.toolResults, 0),
      toolErrorCount: traceRuns.reduce((sum, run) => sum + run.toolErrors, 0),
      actionEffectEpisodeMorphologyCount: 4,
      completeAttemptCensusEstablished: false,
      preActionDelegationAuthorizationCount: 0 },
    externalDigitalEffect: { repositories: externalRepositories,
      namedRepositoryArtifactsObservedAtFixedRevision: externalRepositories.length,
      traceTargetRepositoryNameJoinCount: externalRepositories.filter((item) =>
        item.traceTargetRepositoryNameJoined).length,
      traceExactCommitJoinCount: externalRepositories.filter((item) =>
        item.exactCommitHashPresentInTrace).length,
      repositoryExistenceObservedWithinHuggingFaceScope: true,
      modelWeightBytesReplayed: false,
      trainingCorrectnessIndependentlyVerified: false,
      modelQualityIndependentlyVerified: false,
      taskSuccessIndependentlyVerified: false },
    privacy: { highConfidenceSecretCandidates: traceRuns.reduce((sum, run) =>
      sum + run.secretCandidates, 0),
      emailCandidates: traceRuns.reduce((sum, run) => sum + run.emailCandidates, 0),
      ipv4Candidates: traceRuns.reduce((sum, run) => sum + run.ipv4Candidates, 0),
      localPathCandidates: traceRuns.reduce((sum, run) =>
        sum + run.localPathCandidates, 0),
      noPiiGuaranteed: false, rawTraceProjectionRows: 0 },
    rights: { traceRepositoryLicenseClaim: "CC-BY-4.0",
      upstreamDatasetLicenseClaim: "CC-BY-3.0",
      externalModelRepositoryLicenseClaimsMixed: true,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false },
    boundary: { realDigitalActionTraceObserved: true,
      externallyObservedDigitalRepositoryEffect: true,
      independentOutcomeTruthEstablished: false,
      longitudinalOutcomeEstablished: false, recoveryEpisodeEstablished: false,
      productionTrainingRows: 0, offlineTrainingRows: 0,
      networkAdmissionRows: 0, delegationAuthorityRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      autonomousActionAuthorized: false },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_HASH_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: AGENT_RACE_RUN_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: AGENT_RACE_DISPOSITION,
    externalDigitalEffectRows: 4, independentOutcomeRows: 0,
    productionTrainingRows: 0, offlineTrainingRows: 0,
    networkAdmissionRows: 0, delegationAuthorityRows: 0,
    actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
    autonomousActionAuthorized: false };
}

export function createAgentRaceRunReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_HASH_DOMAIN, body) });
}

export function verifyAgentRaceArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readPrivateStable(root, "report.json");
    const receiptBytes = readPrivateStable(root, "run-receipt.json");
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "RECEIPT_JSON_INVALID");
    const rebuilt = buildAgentRaceExternalEffectFromSourceDirectory(PathJoin(root, "source"));
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes) || !same(report, rebuilt.report)) {
      fail("REPORT_SOURCE_REPLAY_MISMATCH");
    }
    const manifestBytes = readPrivateStable(root, "source/source-manifest.json");
    const expectedReceipt = createAgentRaceRunReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(expectedReceipt).equals(receiptBytes) || !same(receipt, expectedReceipt)) {
      fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report: rebuilt.report, receipt: expectedReceipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAgentRaceArtifact(value) {
  return serialize(value);
}
