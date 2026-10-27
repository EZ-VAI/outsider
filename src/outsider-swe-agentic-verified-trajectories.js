/*
 * Complete fixed-revision replay of a compact SWE agent trajectory release.
 *
 * The repository publishes only 71 hidden-test-passing sessions from a
 * publisher-declared 278-session collection. Raw issues, prompts, tool
 * commands/results, and patches stay private. Hidden-test counters remain
 * publisher-native harness evidence: this adapter does not rerun the tests.
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
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const SWE_AGENTIC_VERIFIED_SCHEMA =
  "outsider/swe-agentic-verified-trajectories/v1";
export const SWE_AGENTIC_VERIFIED_RECEIPT_SCHEMA =
  "outsider/swe-agentic-verified-trajectories-receipt/v1";
export const SWE_AGENTIC_VERIFIED_DATASET_ID =
  "pearsonkyle/swe-agentic-trajectories";
export const SWE_AGENTIC_VERIFIED_REVISION =
  "11a7d928b7f2eb1bb88f275d070cb30a14bbb27c";
export const SWE_AGENTIC_VERIFIED_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/swe-agentic-verified-report/v1";
const RECEIPT_DOMAIN = "outsider/swe-agentic-verified-receipt/v1";
const MANIFEST_DOMAIN = "outsider/swe-agentic-verified-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/swe-agentic-verified-source-root/v1";
const TOOL_SCHEMA_DOMAIN = "outsider/swe-agentic-tool-schema/v1";
const SESSION_ROOT_DOMAIN = "outsider/swe-agentic-session-shapes/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_DATA_BYTES = 5 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

const OBJECTS = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a" }),
  Object.freeze({ path: "README.md", bytes: 4_267,
    oid: "d5901573a9d36d8792bcb8263195392fd81b7bf5" }),
  Object.freeze({ path: "data/resolved.jsonl", bytes: 4_221_470,
    oid: "f5c494fa447d003b63b5be859bee3bf495bcb11a" }),
  Object.freeze({ path: "manifest.json", bytes: 871,
    oid: "6b9555272cca722ef455e89fef32fb400fb17129" }),
]);
export const SWE_AGENTIC_VERIFIED_SOURCE_OBJECTS = OBJECTS;

const TREE_PROFILE = Object.freeze({
  dataTreeOid: "6cc64531d7c7067cc34371c7e85f29f2a8d3b3fb",
  entries: 5,
  files: 4,
  directories: 1,
  logicalBytes: 4_229_112,
  usedStorageBytes: 4_110_407,
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  "full-tree-after.json", "full-tree-before.json",
]);
const ROW_FIELDS = Object.freeze([
  "completion_tokens", "exit_status", "instance_id", "messages",
  "n_fail_to_pass", "n_fail_to_pass_passed", "n_messages", "n_model_calls",
  "n_pass_to_pass", "n_pass_to_pass_passed", "n_tool_calls", "patch_chars",
  "patch_produced", "prompt_tokens", "repo", "resolved", "source_model",
  "submission", "system_prompt", "tool_errors", "tools", "tools_used",
  "total_tokens", "wall_sec",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWE_AGENTIC_VERIFIED_${code}`
    : `SWE_AGENTIC_VERIFIED_${code}:${detail}`);
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

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseJson(bytes, code) {
  try {
    return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(code);
  }
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
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
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
  } finally {
    closeSync(descriptor);
  }
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
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) result.push(relative);
    else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function recordProjection(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((entry) => entry?.rfilename)) : [];
  const projection = {
    id: record.id, revision: record.sha, private: record.private,
    gated: record.gated, disabled: record.disabled, usedStorage: record.usedStorage,
    lastModified: record.lastModified, siblings,
    cardLicense: record.cardData?.license ?? null,
    licenseTags: Array.isArray(record.tags)
      ? sorted(record.tags.filter((tag) => String(tag).startsWith("license:"))) : [],
  };
  if (projection.id !== SWE_AGENTIC_VERIFIED_DATASET_ID
    || projection.revision !== SWE_AGENTIC_VERIFIED_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== TREE_PROFILE.usedStorageBytes
    || projection.cardLicense !== "other"
    || !same(projection.licenseTags, ["license:other"])
    || !same(projection.siblings, OBJECTS.map((entry) => entry.path))) {
    fail("DATASET_RECORD_INVALID");
  }
  return projection;
}

function treeProjection(bytes) {
  const tree = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(tree) || tree.length !== TREE_PROFILE.entries) fail("TREE_INVALID");
  const projection = tree.map((entry) => ({
    path: entry?.path, type: entry?.type, oid: entry?.oid, bytes: entry?.size,
    lfs: entry?.lfs ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : 1);
  const expected = [
    ...OBJECTS.map((entry) => ({ ...entry, type: "file", lfs: null })),
    { path: "data", type: "directory", oid: TREE_PROFILE.dataTreeOid,
      bytes: 0, lfs: null },
  ].sort((left, right) => left.path < right.path ? -1 : 1);
  if (!same(projection, expected)
    || projection.reduce((sum, entry) => sum + entry.bytes, 0)
      !== TREE_PROFILE.logicalBytes) fail("TREE_PROFILE_INVALID");
  return projection;
}

function verifyReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const markers = ["license: other", "71 | 71", "hidden tests", "Failed and empty-patch",
    "deliberately excluded", "retain their own licenses", "resolved=true"];
  if (markers.some((marker) => !text.includes(marker))) fail("README_PROFILE_INVALID");
}

function verifyPublisherManifest(bytes) {
  const value = parseJson(bytes, "PUBLISHER_MANIFEST_JSON_INVALID");
  const resolved = value?.splits?.resolved;
  const all = value?.splits?.all;
  if (value?.name !== "swe-agentic-trajectories" || value?.version !== "0.1.0"
    || value?.hf_repo !== SWE_AGENTIC_VERIFIED_DATASET_ID
    || value?.built_at !== "2026-07-30T16:28:40"
    || !Array.isArray(value?.published) || value.published.length !== 0
    || resolved?.file !== "data/resolved.jsonl" || resolved?.publish !== true
    || resolved?.rows !== 71 || resolved?.resolved_rows !== 71
    || resolved?.bytes !== 4_221_470
    || resolved?.sha256 !== "2615a46c5914203ab9a03c99d27198aed0e2f91b79f7313de8c2fbe6e8cd3f06"
    || all?.file !== "data/all.jsonl" || all?.publish !== false
    || all?.rows !== 278 || all?.resolved_rows !== 71
    || all?.bytes !== 20_312_191
    || all?.sha256 !== "25934018b5e6b1a986ef5c0f0db1c130ce6f8bf7fd99927afce4328ef4460a98") {
    fail("PUBLISHER_MANIFEST_PROFILE_INVALID");
  }
  return value;
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/swe-agentic-verified-source-manifest/v1",
    datasetId: SWE_AGENTIC_VERIFIED_DATASET_ID,
    revision: SWE_AGENTIC_VERIFIED_REVISION, entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expectedPaths = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...OBJECTS.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expectedPaths))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length,
      sha256: sha256(bytes), gitBlobOid: null });
  }
  const before = recordProjection(metadata.get("dataset-record-before.json"));
  const after = recordProjection(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const treeBefore = treeProjection(metadata.get("full-tree-before.json"));
  const treeAfter = treeProjection(metadata.get("full-tree-after.json"));
  if (!same(treeBefore, treeAfter)) fail("TREE_MATERIAL_STATE_CHANGED");
  for (const object of OBJECTS) {
    const relative = `files/${object.path}`;
    const bytes = readRegular(root, relative, MAX_DATA_BYTES, object.bytes);
    if (gitBlobOid(bytes) !== object.oid) fail("SOURCE_OBJECT_PIN_MISMATCH", object.path);
    if (object.path === "README.md") verifyReadme(bytes);
    if (object.path === "manifest.json") verifyPublisherManifest(bytes);
    entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes),
      gitBlobOid: object.oid });
  }
  return { root, before, entries };
}

export function createSweAgenticVerifiedSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

function requireCount(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) fail("ROW_COUNT_INVALID", field);
  return value;
}

function increment(target, key, count = 1) {
  target[key] = (target[key] ?? 0) + count;
}

function replayRows(root) {
  const bytes = readRegular(root, "files/data/resolved.jsonl",
    MAX_DATA_BYTES, OBJECTS[2].bytes);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n")) fail("JSONL_TERMINATOR_INVALID");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== 71 || lines.some((line) => line.length === 0)) {
    fail("JSONL_ROW_COUNT_INVALID");
  }
  const instances = new Set();
  const repos = new Set();
  const roles = {};
  const exits = {};
  const sourceModels = {};
  const toolSchemas = new Set();
  const sessionShapes = [];
  let messages = 0;
  let modelCalls = 0;
  let toolCallRequests = 0;
  let toolResultMessages = 0;
  let publisherToolsUsed = 0;
  let toolErrors = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let wallSeconds = 0;
  let patchCharacters = 0;
  let failToPass = 0;
  let passToPass = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let row;
    try { row = JSONParse(lines[index]); } catch { fail("JSONL_ROW_INVALID", index); }
    if (!plain(row) || !same(sorted(Object.keys(row)), sorted(ROW_FIELDS))) {
      fail("ROW_SCHEMA_INVALID", index);
    }
    if (typeof row.instance_id !== "string" || row.instance_id.length < 3
      || typeof row.repo !== "string" || !/^[^/\s]+\/[^/\s]+$/u.test(row.repo)
      || typeof row.source_model !== "string" || row.source_model.length < 3
      || typeof row.submission !== "string" || row.submission.length < 1
      || typeof row.system_prompt !== "string" || row.system_prompt.length < 1
      || !["completed", "max_turns"].includes(row.exit_status)
      || row.resolved !== true || row.patch_produced !== true
      || !Array.isArray(row.messages) || !Array.isArray(row.tools)
      || !Number.isFinite(row.wall_sec) || row.wall_sec < 0) {
      fail("ROW_VALUE_INVALID", index);
    }
    for (const field of ["completion_tokens", "n_fail_to_pass",
      "n_fail_to_pass_passed", "n_messages", "n_model_calls", "n_pass_to_pass",
      "n_pass_to_pass_passed", "n_tool_calls", "patch_chars", "prompt_tokens",
      "tool_errors", "tools_used", "total_tokens"]) requireCount(row[field], field);
    if (instances.has(row.instance_id) || row.n_messages !== row.messages.length
      || row.patch_chars !== row.submission.length
      || row.total_tokens !== row.prompt_tokens + row.completion_tokens
      || row.n_fail_to_pass !== row.n_fail_to_pass_passed
      || row.n_pass_to_pass !== row.n_pass_to_pass_passed
      || row.messages[0]?.role !== "system"
      || row.messages[0]?.content !== row.system_prompt) fail("ROW_CROSSWALK_INVALID", index);
    instances.add(row.instance_id);
    repos.add(row.repo);
    increment(exits, row.exit_status);
    increment(sourceModels, row.source_model);
    let calls = 0;
    for (const message of row.messages) {
      if (!plain(message) || !["assistant", "system", "tool", "user"].includes(message.role)
        || typeof message.content !== "string") fail("MESSAGE_INVALID", index);
      increment(roles, message.role);
      if (message.role === "tool") toolResultMessages += 1;
      if (message.tool_calls !== undefined && message.tool_calls !== null) {
        if (!Array.isArray(message.tool_calls)) fail("TOOL_CALL_LIST_INVALID", index);
        for (const call of message.tool_calls) {
          if (!plain(call) || !same(sorted(Object.keys(call)), ["function", "type"])
            || call.type !== "function" || !plain(call.function)
            || !same(sorted(Object.keys(call.function)), ["arguments", "name"])
            || call.function.name !== "bash" || !plain(call.function.arguments)
            || !same(Object.keys(call.function.arguments), ["command"])
            || typeof call.function.arguments.command !== "string") {
            fail("TOOL_CALL_INVALID", index);
          }
          calls += 1;
        }
      }
    }
    if (calls !== row.n_tool_calls) fail("TOOL_CALL_COUNT_INVALID", index);
    const toolSchemaHash = digest(TOOL_SCHEMA_DOMAIN, row.tools);
    toolSchemas.add(toolSchemaHash);
    messages += row.n_messages;
    modelCalls += row.n_model_calls;
    toolCallRequests += calls;
    publisherToolsUsed += row.tools_used;
    toolErrors += row.tool_errors;
    promptTokens += row.prompt_tokens;
    completionTokens += row.completion_tokens;
    totalTokens += row.total_tokens;
    wallSeconds += row.wall_sec;
    patchCharacters += row.patch_chars;
    failToPass += row.n_fail_to_pass;
    passToPass += row.n_pass_to_pass;
    sessionShapes.push({
      instanceHash: sha256(BufferFrom(row.instance_id, "utf8")),
      repositoryHash: sha256(BufferFrom(row.repo, "utf8")),
      messages: row.n_messages, modelCalls: row.n_model_calls,
      toolCalls: row.n_tool_calls, toolErrors: row.tool_errors,
      exitStatus: row.exit_status, failToPass: row.n_fail_to_pass,
      passToPass: row.n_pass_to_pass, patchCharacters: row.patch_chars,
    });
  }
  if (instances.size !== 71 || repos.size !== 64 || toolSchemas.size !== 1
    || messages !== 4_682 || modelCalls !== 2_483 || toolCallRequests !== 2_436
    || toolResultMessages !== 2_234 || publisherToolsUsed !== 2_451
    || toolErrors !== 318 || promptTokens !== 33_493_125
    || completionTokens !== 1_030_828 || totalTokens !== 34_523_953
    || patchCharacters !== 106_467 || failToPass !== 133 || passToPass !== 2_360
    || !same(exits, { completed: 69, max_turns: 2 })
    || !same(roles, { assistant: 2_290, system: 71, tool: 2_234, user: 87 })
    || !same(sourceModels, { "Ornith-1.0-9B-Q5_K_M": 71 })) {
    fail("AGGREGATE_PROFILE_INVALID");
  }
  return deepFreeze({
    publishedVerifiedSessions: 71, uniqueInstances: 71, uniqueRepositories: 64,
    messages, messageRoles: roles, modelCalls, toolCallRequests,
    toolResultMessages, toolCallMinusResultMessageCount: 202,
    exactToolCallResultIdentityJoinEstablished: false,
    publisherToolsUsed, publisherToolErrors: toolErrors,
    promptTokens, completionTokens, totalTokens,
    wallSeconds: Number(wallSeconds.toFixed(6)), patchCharacters,
    failToPassAssertions: failToPass, passToPassAssertions: passToPass,
    hiddenTestAssertionsReportedPassed: failToPass + passToPass,
    exitStatusRows: exits, sourceModelRows: sourceModels,
    toolSchemaVariants: 1, toolSchemaHash: [...toolSchemas][0],
    allRowsResolvedTrue: true, allRowsPatchProducedTrue: true,
    allPerTestCountersReportPassed: true,
    sessionShapeRoot: digest(SESSION_ROOT_DOMAIN, sessionShapes),
    rawIssuePromptMessageCommandOutputPatchProjected: false,
  });
}

export function buildSweAgenticVerifiedArtifactFromSourceDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = replayRows(collected.root);
  const reportBody = {
    schema: SWE_AGENTIC_VERIFIED_SCHEMA,
    disposition: SWE_AGENTIC_VERIFIED_DISPOSITION,
    source: {
      id: SWE_AGENTIC_VERIFIED_DATASET_ID,
      revision: SWE_AGENTIC_VERIFIED_REVISION,
      lastModified: collected.before.lastModified,
      public: true, gated: false,
      completeFixedRevisionRepositoryReplayed: true,
      repositoryFiles: TREE_PROFILE.files,
      repositoryDirectories: TREE_PROFILE.directories,
      repositoryLogicalBytes: TREE_PROFILE.logicalBytes,
      repositoryUsedStorageBytes: TREE_PROFILE.usedStorageBytes,
      selectedObjects: OBJECTS.length,
      selectedBytes: TREE_PROFILE.logicalBytes,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRecordAndTreeStateStable: true,
    },
    selection: {
      publisherDeclaredOriginalCollectionRows: 278,
      publisherDeclaredResolvedRows: 71,
      publishedResolvedRowsReplayed: 71,
      publisherDeclaredUnpublishedNonresolvedRows: 207,
      unpublishedAllFileBytesClaim: 20_312_191,
      unpublishedAllFileSha256Claim:
        "sha256:25934018b5e6b1a986ef5c0f0db1c130ce6f8bf7fd99927afce4328ef4460a98",
      unpublishedAllFileBytesAcquired: 0,
      unpublishedAllFileHashVerified: false,
      failuresAndEmptyPatchesDeliberatelyExcludedByPublisher: true,
      completePublishedResolvedSplit: true,
      completeOriginalAttemptCensus: false,
      observedPublishedSuccessRate: null,
      successRateCalculationProhibitedBySelection: true,
      resolvedSplitPublishFlag: true,
      topLevelPublishedListEmpty: true,
      publisherManifestPublicationFieldsInTension: true,
    },
    replay,
    denominators: {
      PUBLISHED_VERIFIED_AGENT_SESSION: 71,
      MESSAGE_RECORD_WITHIN_PUBLISHED_SESSION: 4_682,
      ASSISTANT_TOOL_CALL_REQUEST: 2_436,
      SOURCE_NATIVE_HIDDEN_TEST_ASSERTION_COUNTER: 2_493,
      crossPopulationTotal: null,
      additionProhibited: true,
    },
    outcome: {
      publisherHiddenTestAdjudicatedRows: 71,
      publisherReportedPassedHiddenTestAssertions: 2_493,
      hiddenTestExecutionLogsAcquired: 0,
      hiddenTestsIndependentlyRerunByThisArtifact: false,
      independentOutcomeRows: 0,
      realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
      publisherToolErrorCount: 318,
      toolErrorsDoNotEstablishRecoveryEpisodes: true,
    },
    rights: {
      datasetCardLicenseClaim: "other",
      upstreamRepositoryTermsRetainedPerPublisher: true,
      upstreamRepositoryLicenseObjectsAcquired: 0,
      useSpecificClearanceEstablished: false,
      legalConclusionEstablished: false,
      evaluationUseByThisArtifact: true,
      trainingUseAuthorized: false,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawIssueAndSystemPromptPresent: true,
      rawMessagesAndToolCommandsPresent: true,
      rawToolOutputsPresent: true,
      rawPatchesPresent: true,
      rawSourcePrivate: true,
      noPiiGuaranteed: false,
      rawProjectionRows: 0,
    },
    boundary: {
      publisherEvaluatedOutcomeRows: 71,
      independentOutcomeRows: 0,
      realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
      preActionDelegationRows: 0,
      physicalEffectRows: 0,
      offlineTrainingRows: 0,
      productionTrainingRows: 0,
      networkAdmissionRows: 0,
      actorCreditRows: 0,
      ceuRows: 0,
      pricingRows: 0,
      authorityRows: 0,
      autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createSweAgenticVerifiedReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: SWE_AGENTIC_VERIFIED_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: SWE_AGENTIC_VERIFIED_DISPOSITION,
    publishedVerifiedSessions: 71,
    publisherDeclaredUnpublishedNonresolvedRows: 207,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifySweAgenticVerifiedArtifactDirectory(directory) {
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
    const built = buildSweAgenticVerifiedArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createSweAgenticVerifiedReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeSweAgenticVerifiedArtifact(value) {
  return serialize(value);
}
