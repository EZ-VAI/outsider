/*
 * Public evidence acquisition wave 5.
 *
 * This module admits two deliberately different empirical sources:
 *
 * - Trace Commons: voluntarily donated, contributor-reviewed and
 *   maintainer-merged real coding-agent sessions from public repositories.
 * - ROBUST: manually curated ROS bug/fix records mined from organic project
 *   issues and pull requests for two industrial-arm codebases.
 *
 * The source bytes are real records.  Their permitted use is nevertheless
 * narrow.  Neither source supplies an independent execution replay, an
 * exposure denominator, adjudicated harm, economic loss, a causal experiment,
 * or authority to price, guarantee, settle, or train automatically.
 */

import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPinnedPublicAgentSourceSnapshot }
  from "./outsider-public-agent-artifacts.js";

export const PUBLIC_EVIDENCE_WAVE5_SCHEMAS = Object.freeze({
  manifest: "outsider/public-evidence-wave5-manifest/v1",
  record: "outsider/public-evidence-wave5-record/v1",
  recordSet: "outsider/public-evidence-wave5-record-set/v1",
  summary: "outsider/public-evidence-wave5-summary/v1",
  verification: "outsider/public-evidence-wave5-verification/v1",
});

export const PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT =
  "2026-08-21T00:00:00.000Z";

export const TRACE_COMMONS_WAVE5_PIN = Object.freeze({
  id: "trace-commons/agent-traces",
  revision: "112ebd4d03ce852b00e935d523107c3d0c9a65bf",
  licenseId: "CC-BY-4.0",
  sourceKind: "TRACE_COMMONS_ORGANIC_AGENT_SESSION_SAMPLE",
  selectionRule: "per nonempty harness at pinned revision: lexicographically first raw session whose byte size is 16KiB..256KiB",
  selectedSessions: 3,
  selectedHarnesses: Object.freeze(["claude_code", "cursor", "opencode"]),
});

export const ROBUST_ROS_WAVE5_PIN = Object.freeze({
  id: "robust-rosin/robust:industrial-arms",
  repository: "robust-rosin/robust",
  revision: "521fe75319c256995fae6f5a4b756f0bfa4bf65e",
  tree: "70f8f66e9e81bf7f119829857d0e58ad18bbd760",
  sourceKind: "ROBUST_ORGANIC_ROS_BUG_FIX_TAXONOMY",
  namespaces: Object.freeze(["motoman", "universal_robot"]),
  candidateBugFiles: 47,
  notABugMarkers: 1,
  admittedBugRecords: 46,
  licenseId: "NO_ROOT_LICENSE_DETECTED",
  selectionRule: "all .bug records in the motoman and universal_robot namespaces at the pinned tree; exclude adjacent NOT_A_BUG marker",
});

const TRACE_SELECTED = Object.freeze([
  Object.freeze({
    harness: "claude_code",
    path: "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl",
    oid: "00ca9fa9962904a912f82584aa078980d511f2d2",
    sizeBytes: 200_514,
    sha256: "sha256:5780bf4aaa8af2af35e58e1f25360c669cc07af751a16b8c6bdb1cdd23c40dee",
  }),
  Object.freeze({
    harness: "cursor",
    path: "sessions/cursor/debaa898-grafana-loki-monitoring.jsonl",
    oid: "48b158f18bfdabd071d8776e20ff960fa2e6aa6a",
    sizeBytes: 25_429,
    sha256: "sha256:b492fc7adec7151291c64cdabf0868749c7c144ca3de48be7d7f5787544e6876",
  }),
  Object.freeze({
    harness: "opencode",
    path: "sessions/opencode/ses_129b55f7effeSKRtimLg9wxpXa.json",
    oid: "2647ae3504b450b200e076aad1d61109c31089a9",
    sizeBytes: 97_897,
    sha256: "sha256:ed7632840a5316a0f9bea90d4411aea103b8938775f76cc4b652fd4f19acb744",
  }),
]);

export const PUBLIC_EVIDENCE_WAVE5_SOURCE_OBJECT_PINS = Object.freeze({
  traceCommons: Object.freeze({
    "README.md": Object.freeze({ sizeBytes: 7_793,
      sha256: "sha256:0fa4399587dbc7666e23a5c791052b06e47901fb6aa3601f755a6fcdcc036e7f" }),
    "repository-revision.json": Object.freeze({ sizeBytes: 161,
      sha256: "sha256:94cb23518e6670b309c9d61e4bd2002a4974df8bc892a3f1b9a5e60e8e2367d1" }),
    "selected-tree.json": Object.freeze({ sizeBytes: 703,
      sha256: "sha256:e66ffab2dc9772a403b8759e7de3ec28b77e01dba7ade2b4041f42789770d4ef" }),
  }),
  robustRos: Object.freeze({
    "README.md": Object.freeze({ sizeBytes: 4_792,
      sha256: "sha256:7b35b9e30d251c3c56fa49acf25d04d430cd34a89d91dde3ae166eb9cd843316" }),
    "repository-commit.json": Object.freeze({ sizeBytes: 358,
      sha256: "sha256:7454599309b92c872045909ea78220fe17e5d0c8b70fdf23f10d15584a999012" }),
    "repository-tree.json": Object.freeze({ sizeBytes: 92_558,
      sha256: "sha256:9604036e8ad787848b54d14c35bd5e6438e9f334f878eeadf0e8d7547adef451" }),
  }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const BUG_PATH = /^(motoman|universal_robot)\/([a-f0-9]{7})\/\2\.bug$/;
const NOT_A_BUG_PATH = /^(motoman|universal_robot)\/([a-f0-9]{7})\/NOT_A_BUG$/;
const TAXONOMY_CODE = /^[A-Z][A-Z0-9_-]*(?::[A-Z0-9_-]+)+$/;
const WRITE_LIKE = new Set(["Edit", "Write", "NotebookEdit", "edit_file",
  "write_file", "apply_patch"]);

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}
function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function exactKeys(value, keys) {
  return plain(value) && same(Object.keys(value).sort(), [...keys].sort());
}
function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;
}
function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(code, error instanceof Error ? error.message : String(error)); }
}
function parseJsonLines(bytes, code) {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail(code, "FINAL_NEWLINE_MISSING");
  return text.split("\n").slice(0, -1).map((line, index) => {
    if (!line) fail(code, `EMPTY_LINE:${index}`);
    try { return JSON.parse(line); }
    catch { fail(code, `JSON_INVALID:${index}`); }
  });
}
function pinRead(directory, path, pin, code) {
  return readPinnedPublicAgentSourceSnapshot(join(directory, path), pin, code);
}
function listFiles(root, prefix = "") {
  const directory = join(root, prefix);
  const output = [];
  for (const name of readdirSync(directory).sort()) {
    const local = prefix ? `${prefix}/${name}` : name;
    const absolute = join(root, local);
    const stat = statSync(absolute);
    if (stat.isDirectory()) output.push(...listFiles(root, local));
    else if (stat.isFile()) output.push(local);
    else fail("PUBLIC_EVIDENCE_WAVE5_SOURCE_SPECIAL_FILE", local);
  }
  return output;
}
function sourceRoot(id, revision) {
  return digest({ id, revision }, "outsider/public-evidence-wave5/source-root/v1");
}
function useBoundary() {
  return {
    disposition: "DESCRIPTIVE_SOURCE_REPLAY_ONLY",
    causalExperienceUnits: 0,
    independentOutcomeUnits: 0,
    economicLossRows: 0,
    exposureDenominatorRows: 0,
    pricingEligibleRows: 0,
    productionModelEligibleRows: 0,
    automaticTraining: false,
    permits: { CEU: false, MODEL: false, LOSS: false, PRICE: false,
      GUARANTEE: false, SETTLE: false },
  };
}
function traceAxes() {
  return {
    environmentReality: {
      class: "REAL_SOFTWARE",
      observationOrigin: "VOLUNTARILY_DONATED_RECORDED_SESSION",
      empiricalStatus: "EMPIRICAL_RECORDED",
      organicInteractionPublisherDeclared: true,
      executionIndependentlyReplayed: false,
    },
    evidenceAuthority: {
      publisherDeclared: true,
      contributorReviewedBeforeSubmission: true,
      maintainerReviewedBeforeMerge: true,
      reviewIdentityIndependentlyVerifiedPerRow: false,
      outcomeIndependentlyAdjudicated: false,
    },
    rights: {
      compilationLicenseId: TRACE_COMMONS_WAVE5_PIN.licenseId,
      compilationPublisherPermitsTrainingWithAttribution: true,
      embeddedMaterialLicensesUniformlyVerified: false,
      contributorRightToPublishCertifiedNotIndependentlyReverified: true,
      outsiderGrantsNoAdditionalRights: true,
    },
    permittedUse: {
      outsiderUses: ["DESCRIPTIVE", "SHADOW_RESEARCH"],
      rawTextPersistedInProjection: false,
      automaticTraining: false,
    },
  };
}
function robustAxes() {
  return {
    environmentReality: {
      class: "REAL_SOFTWARE",
      observationOrigin: "ORGANIC_OPEN_SOURCE_ISSUE_AND_FIX_METADATA",
      empiricalStatus: "EMPIRICAL_RECORDED_METADATA",
      physicalRobotContext: true,
      physicalExecutionStreamAcquired: false,
      bugEnvironmentIndependentlyReplayed: false,
    },
    evidenceAuthority: {
      publisherDeclared: true,
      manuallyCuratedTaxonomyPublisherDeclared: true,
      sourceIssueAndFixReferencesPresent: true,
      coderIdentityIndependentlyVerifiedPerRow: false,
      outcomeIndependentlyAdjudicated: false,
    },
    rights: {
      repositoryPubliclyAccessible: true,
      rootLicenseOrCopyingFileDetectedAtPinnedTree: false,
      githubLicenseMetadataDeclared: false,
      licenseId: ROBUST_ROS_WAVE5_PIN.licenseId,
      outsiderGrantsNoAdditionalRights: true,
    },
    permittedUse: {
      outsiderUses: ["DESCRIPTIVE_SOURCE_REPLAY"],
      rawDescriptionPersistedInProjection: false,
      automaticTraining: false,
    },
  };
}

function manifestSources() {
  return [
    {
      id: TRACE_COMMONS_WAVE5_PIN.id,
      revision: TRACE_COMMONS_WAVE5_PIN.revision,
      sourceKind: TRACE_COMMONS_WAVE5_PIN.sourceKind,
      selectionRule: TRACE_COMMONS_WAVE5_PIN.selectionRule,
      selectedRecords: TRACE_COMMONS_WAVE5_PIN.selectedSessions,
      selectedHarnesses: TRACE_COMMONS_WAVE5_PIN.selectedHarnesses,
      axes: traceAxes(),
    },
    {
      id: ROBUST_ROS_WAVE5_PIN.id,
      revision: ROBUST_ROS_WAVE5_PIN.revision,
      tree: ROBUST_ROS_WAVE5_PIN.tree,
      sourceKind: ROBUST_ROS_WAVE5_PIN.sourceKind,
      selectionRule: ROBUST_ROS_WAVE5_PIN.selectionRule,
      candidateBugFiles: ROBUST_ROS_WAVE5_PIN.candidateBugFiles,
      excludedNotABug: ROBUST_ROS_WAVE5_PIN.notABugMarkers,
      selectedRecords: ROBUST_ROS_WAVE5_PIN.admittedBugRecords,
      axes: robustAxes(),
    },
  ];
}

function toolFamilyCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) =>
    left.localeCompare(right)));
}

function normalizeClaudeTrace(bytes, selection) {
  const rows = parseJsonLines(bytes, "PUBLIC_EVIDENCE_WAVE5_CLAUDE_JSONL_INVALID");
  const sessionId = selection.path.match(/\/([^/]+)\.jsonl$/)?.[1];
  if (!sessionId) fail("PUBLIC_EVIDENCE_WAVE5_TRACE_SESSION_ID_INVALID");
  const tools = new Map();
  const calls = new Map();
  const results = new Map();
  const counts = { sourceEvents: rows.length, humanPromptTextBlocks: 0,
    assistantTextBlocks: 0, userMessageEnvelopes: 0, assistantMessageEnvelopes: 0,
    toolCalls: 0, toolResults: 0, sourceNativeToolErrors: 0,
    writeLikeToolCalls: 0, fileHistorySnapshots: 0, queueOperations: 0 };
  let firstErrorSequence = null;
  let sequence = 0;
  for (const row of rows) {
    if (!plain(row) || typeof row.type !== "string") {
      fail("PUBLIC_EVIDENCE_WAVE5_CLAUDE_EVENT_INVALID");
    }
    if (row.sessionId != null && row.sessionId !== sessionId) {
      fail("PUBLIC_EVIDENCE_WAVE5_CLAUDE_SESSION_JOIN_INVALID");
    }
    if (row.type === "file-history-snapshot") counts.fileHistorySnapshots += 1;
    if (row.type === "queue-operation") counts.queueOperations += 1;
    const role = row.message?.role;
    if (role === "user") counts.userMessageEnvelopes += 1;
    if (role === "assistant") counts.assistantMessageEnvelopes += 1;
    const content = row.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      sequence += 1;
      if (!plain(block) || typeof block.type !== "string") {
        fail("PUBLIC_EVIDENCE_WAVE5_CLAUDE_BLOCK_INVALID");
      }
      if (block.type === "text") {
        if (typeof block.text !== "string") fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TEXT_INVALID");
        if (role === "user") counts.humanPromptTextBlocks += 1;
        if (role === "assistant") counts.assistantTextBlocks += 1;
      }
      if (block.type === "tool_use") {
        if (typeof block.id !== "string" || typeof block.name !== "string"
          || calls.has(block.id)) fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TOOL_CALL_INVALID");
        calls.set(block.id, sequence);
        tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
        counts.toolCalls += 1;
        if (WRITE_LIKE.has(block.name)) counts.writeLikeToolCalls += 1;
      }
      if (block.type === "tool_result") {
        if (typeof block.tool_use_id !== "string" || results.has(block.tool_use_id)) {
          fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TOOL_RESULT_INVALID");
        }
        results.set(block.tool_use_id, sequence);
        counts.toolResults += 1;
        if (block.is_error === true) {
          counts.sourceNativeToolErrors += 1;
          if (firstErrorSequence == null) firstErrorSequence = sequence;
        }
      }
    }
  }
  if (calls.size !== results.size || [...calls].some(([id]) => !results.has(id))) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TOOL_PAIRING_INVALID");
  }
  const continuedAfterObservedToolError = firstErrorSequence != null
    && [...calls.values()].some((position) => position > firstErrorSequence);
  return { sessionIdHash: digest(sessionId,
    "outsider/public-evidence-wave5/session-id/v1"), counts,
  toolFamilyCounts: toolFamilyCounts(tools),
  humanFollowupPromptCount: Math.max(0, counts.humanPromptTextBlocks - 1),
  continuedAfterObservedToolError };
}

function normalizeCursorTrace(bytes, selection) {
  const rows = parseJsonLines(bytes, "PUBLIC_EVIDENCE_WAVE5_CURSOR_JSONL_INVALID");
  const tools = new Map();
  const counts = { sourceEvents: rows.length, humanPromptTextBlocks: 0,
    assistantTextBlocks: 0, userMessageEnvelopes: 0, assistantMessageEnvelopes: 0,
    toolCalls: 0, toolResults: 0, sourceNativeToolErrors: 0,
    writeLikeToolCalls: 0, turnEndedEvents: 0 };
  for (const row of rows) {
    if (!plain(row)) fail("PUBLIC_EVIDENCE_WAVE5_CURSOR_EVENT_INVALID");
    if (row.type === "turn_ended") {
      if (typeof row.status !== "string") fail("PUBLIC_EVIDENCE_WAVE5_CURSOR_TURN_INVALID");
      counts.turnEndedEvents += 1;
      continue;
    }
    if (!(row.role === "user" || row.role === "assistant") || !plain(row.message)
      || !Array.isArray(row.message.content)) fail("PUBLIC_EVIDENCE_WAVE5_CURSOR_EVENT_INVALID");
    if (row.role === "user") counts.userMessageEnvelopes += 1;
    else counts.assistantMessageEnvelopes += 1;
    for (const block of row.message.content) {
      if (!plain(block) || typeof block.type !== "string") {
        fail("PUBLIC_EVIDENCE_WAVE5_CURSOR_BLOCK_INVALID");
      }
      if (block.type === "text") {
        if (typeof block.text !== "string") fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TEXT_INVALID");
        if (row.role === "user") counts.humanPromptTextBlocks += 1;
        else counts.assistantTextBlocks += 1;
      } else if (block.type === "tool_use") {
        if (typeof block.name !== "string" || !plain(block.input)) {
          fail("PUBLIC_EVIDENCE_WAVE5_CURSOR_TOOL_CALL_INVALID");
        }
        tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
        counts.toolCalls += 1;
        if (WRITE_LIKE.has(block.name)) counts.writeLikeToolCalls += 1;
      }
    }
  }
  return { sessionIdHash: digest(selection.path,
    "outsider/public-evidence-wave5/session-path/v1"), counts,
  toolFamilyCounts: toolFamilyCounts(tools),
  humanFollowupPromptCount: Math.max(0, counts.humanPromptTextBlocks - 1),
  continuedAfterObservedToolError: false };
}

function normalizeOpenCodeTrace(bytes, selection) {
  const row = parseJson(bytes, "PUBLIC_EVIDENCE_WAVE5_OPENCODE_JSON_INVALID");
  const expectedId = selection.path.match(/\/([^/]+)\.json$/)?.[1];
  if (!plain(row) || !plain(row.info) || row.info.id !== expectedId
    || !Array.isArray(row.messages)) fail("PUBLIC_EVIDENCE_WAVE5_OPENCODE_SHAPE_INVALID");
  const tools = new Map();
  const counts = { sourceEvents: row.messages.length, humanPromptTextBlocks: 0,
    assistantTextBlocks: 0, userMessageEnvelopes: 0, assistantMessageEnvelopes: 0,
    toolCalls: 0, toolResults: 0, sourceNativeToolErrors: 0,
    sourceNativeCompletedToolStates: 0, writeLikeToolCalls: 0 };
  for (const message of row.messages) {
    if (!plain(message) || !plain(message.info)
      || !(message.info.role === "user" || message.info.role === "assistant")
      || message.info.sessionID !== expectedId || !Array.isArray(message.parts)) {
      fail("PUBLIC_EVIDENCE_WAVE5_OPENCODE_MESSAGE_INVALID");
    }
    if (message.info.role === "user") counts.userMessageEnvelopes += 1;
    else counts.assistantMessageEnvelopes += 1;
    for (const part of message.parts) {
      if (!plain(part) || typeof part.type !== "string") {
        fail("PUBLIC_EVIDENCE_WAVE5_OPENCODE_PART_INVALID");
      }
      if (part.type === "text") {
        if (typeof part.text !== "string") fail("PUBLIC_EVIDENCE_WAVE5_TRACE_TEXT_INVALID");
        if (message.info.role === "user") counts.humanPromptTextBlocks += 1;
        else counts.assistantTextBlocks += 1;
      }
      if (part.type === "tool") {
        if (typeof part.tool !== "string" || !plain(part.state)
          || typeof part.state.status !== "string") {
          fail("PUBLIC_EVIDENCE_WAVE5_OPENCODE_TOOL_INVALID");
        }
        tools.set(part.tool, (tools.get(part.tool) ?? 0) + 1);
        counts.toolCalls += 1;
        counts.toolResults += 1;
        if (part.state.status === "error") counts.sourceNativeToolErrors += 1;
        if (part.state.status === "completed") counts.sourceNativeCompletedToolStates += 1;
        if (WRITE_LIKE.has(part.tool)) counts.writeLikeToolCalls += 1;
      }
    }
  }
  return { sessionIdHash: digest(expectedId,
    "outsider/public-evidence-wave5/session-id/v1"), counts,
  toolFamilyCounts: toolFamilyCounts(tools),
  humanFollowupPromptCount: Math.max(0, counts.humanPromptTextBlocks - 1),
  continuedAfterObservedToolError: false };
}

function traceRecord(sourceDirectory, selection, index) {
  const snapshot = pinRead(sourceDirectory, selection.path,
    { sizeBytes: selection.sizeBytes, sha256: selection.sha256 },
    "PUBLIC_EVIDENCE_WAVE5_TRACE_OBJECT_MISMATCH");
  if (gitBlobOid(snapshot.bytes) !== selection.oid) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_GIT_OBJECT_MISMATCH", selection.path);
  }
  const trace = selection.harness === "claude_code"
    ? normalizeClaudeTrace(snapshot.bytes, selection)
    : selection.harness === "cursor"
      ? normalizeCursorTrace(snapshot.bytes, selection)
      : normalizeOpenCodeTrace(snapshot.bytes, selection);
  const body = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.record,
    recordType: "ORGANIC_AGENT_SESSION_STRUCTURE",
    dataset: { id: TRACE_COMMONS_WAVE5_PIN.id,
      revision: TRACE_COMMONS_WAVE5_PIN.revision,
      sourceKind: TRACE_COMMONS_WAVE5_PIN.sourceKind },
    identity: {
      sourceRoot: sourceRoot(TRACE_COMMONS_WAVE5_PIN.id,
        TRACE_COMMONS_WAVE5_PIN.revision),
      sourceRecordHash: selection.sha256,
      sessionIdHash: trace.sessionIdHash,
      ordinal: index,
    },
    selection: { harness: selection.harness, sourcePathHash: digest(selection.path,
      "outsider/public-evidence-wave5/source-path/v1"),
    rule: TRACE_COMMONS_WAVE5_PIN.selectionRule, outcomeBlind: true },
    axes: traceAxes(),
    observations: {
      ...trace.counts,
      toolFamilyCounts: trace.toolFamilyCounts,
      humanFollowupPromptCount: trace.humanFollowupPromptCount,
      continuedAfterObservedToolError: trace.continuedAfterObservedToolError,
      nativeSuccessLabelPresent: false,
      terminalRecoveryEstablished: false,
      externalConsequenceObserved: false,
    },
    useBoundary: useBoundary(),
  };
  return { ...body, recordHash: digest(body,
    "outsider/public-evidence-wave5/record/v1") };
}

function scalar(lines, section, key, { required = false } = {}) {
  let active = section == null;
  for (const line of lines) {
    const top = line.match(/^([a-z][a-z-]*):(?:\s|$)/);
    if (top) active = section == null ? true : top[1] === section;
    if (!active) continue;
    const pattern = section == null
      ? new RegExp(`^${key}:\\s*(.*)$`)
      : new RegExp(`^  ${key}:\\s*(.*)$`);
    const match = line.match(pattern);
    if (match) {
      const value = match[1].trim().replace(/^(['"])(.*)\1$/, "$2");
      return value === "null" ? null : value;
    }
  }
  if (required) fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_FIELD_MISSING", `${section}:${key}`);
  return null;
}

function taxonomy(lines, section) {
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) return [];
  const output = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[a-z][a-z-]*:/.test(lines[index])) break;
    const match = lines[index].match(/^  -\s+(.+)$/);
    if (!match) continue;
    const value = match[1].trim();
    if (!TAXONOMY_CODE.test(value) || output.includes(value)) {
      fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_TAXONOMY_INVALID", value);
    }
    output.push(value);
  }
  return output.sort();
}

function normalizeRobustBug(bytes, path) {
  const text = bytes.toString("utf8");
  if (!text.startsWith("%YAML 1.1\n---\n") || !text.endsWith("\n")) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_YAML_ENVELOPE_INVALID", path);
  }
  const match = path.match(BUG_PATH);
  if (!match) fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_PATH_INVALID", path);
  const lines = text.split("\n");
  const id = scalar(lines, null, "id", { required: true });
  const system = scalar(lines, null, "system", { required: true });
  const severity = scalar(lines, null, "severity", { required: true });
  if (id !== match[2] || system !== match[1] || !/^[a-z][a-z0-9_-]{0,63}$/.test(system)
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(severity)) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_IDENTITY_INVALID", path);
  }
  const bounded = (value, field) => {
    if (value != null && (typeof value !== "string" || value.length > 160
      || /[\r\n]/.test(value))) fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_SCALAR_INVALID", field);
    return value;
  };
  const faultCodes = taxonomy(lines, "fault-codes");
  const failureCodes = taxonomy(lines, "failure-codes");
  const issueValue = bounded(scalar(lines, "bug", "issue"), "issue");
  const pullRequestValue = bounded(scalar(lines, "fix", "pull-request"), "pull-request");
  const issue = issueValue === "" ? null : issueValue;
  const pullRequest = pullRequestValue === "" ? null : pullRequestValue;
  const fixHashes = lines.map((line) => line.match(/^      hash:\s*([a-f0-9]{40})$/)?.[1])
    .filter(Boolean);
  if (new Set(fixHashes).size !== fixHashes.length) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_FIX_HASH_DUPLICATE", path);
  }
  return {
    sourceNativeIdHash: digest(`${system}:${id}`,
      "outsider/public-evidence-wave5/robust-id/v1"),
    system,
    severity,
    phase: bounded(scalar(lines, "bug", "phase", { required: true }), "phase"),
    specificity: bounded(scalar(lines, "bug", "specificity"), "specificity"),
    architecturalLocation: bounded(scalar(lines, "bug", "architectural-location"),
      "architectural-location"),
    subsystem: bounded(scalar(lines, "bug", "subsystem"), "subsystem"),
    detectedBy: bounded(scalar(lines, "bug", "detected-by"), "detected-by"),
    reportedBy: bounded(scalar(lines, "bug", "reported-by"), "reported-by"),
    reproducibility: bounded(scalar(lines, "bug", "reproducibility"), "reproducibility"),
    issueReferencePresent: issue != null && issue.length > 0,
    issueReferenceHash: issue == null ? null : digest(issue,
      "outsider/public-evidence-wave5/robust-issue/v1"),
    pullRequestReferencePresent: pullRequest != null && pullRequest.length > 0,
    pullRequestReferenceHash: pullRequest == null ? null : digest(pullRequest,
      "outsider/public-evidence-wave5/robust-pull-request/v1"),
    fixCommitCount: fixHashes.length,
    fixCommitSetHash: digest(fixHashes.sort(),
      "outsider/public-evidence-wave5/robust-fix-commits/v1"),
    faultCodes,
    failureCodes,
    publisherPhysicalClassificationMarker: /#PHYSICAL\b/.test(text),
  };
}

function robustRecord(sourceDirectory, treeEntry, index) {
  const snapshot = readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, treeEntry.path),
    null, "PUBLIC_EVIDENCE_WAVE5_ROBUST_OBJECT_MISSING");
  if (snapshot.object.sizeBytes !== treeEntry.size || gitBlobOid(snapshot.bytes) !== treeEntry.sha) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_GIT_OBJECT_MISMATCH", treeEntry.path);
  }
  const bug = normalizeRobustBug(snapshot.bytes, treeEntry.path);
  const body = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.record,
    recordType: "ORGANIC_ROBOT_SOFTWARE_BUG_FIX_TAXONOMY",
    dataset: { id: ROBUST_ROS_WAVE5_PIN.id, revision: ROBUST_ROS_WAVE5_PIN.revision,
      sourceKind: ROBUST_ROS_WAVE5_PIN.sourceKind },
    identity: {
      sourceRoot: sourceRoot(ROBUST_ROS_WAVE5_PIN.id, ROBUST_ROS_WAVE5_PIN.revision),
      sourceRecordHash: snapshot.object.sha256,
      sourceNativeIdHash: bug.sourceNativeIdHash,
      ordinal: index,
    },
    selection: { namespace: bug.system, sourcePathHash: digest(treeEntry.path,
      "outsider/public-evidence-wave5/source-path/v1"),
    rule: ROBUST_ROS_WAVE5_PIN.selectionRule, outcomeBlind: true },
    axes: robustAxes(),
    observations: {
      system: bug.system,
      severity: bug.severity,
      phase: bug.phase,
      specificity: bug.specificity,
      architecturalLocation: bug.architecturalLocation,
      subsystem: bug.subsystem,
      detectedBy: bug.detectedBy,
      reportedBy: bug.reportedBy,
      reproducibility: bug.reproducibility,
      issueReferencePresent: bug.issueReferencePresent,
      issueReferenceHash: bug.issueReferenceHash,
      pullRequestReferencePresent: bug.pullRequestReferencePresent,
      pullRequestReferenceHash: bug.pullRequestReferenceHash,
      fixCommitCount: bug.fixCommitCount,
      fixCommitSetHash: bug.fixCommitSetHash,
      faultCodes: bug.faultCodes,
      failureCodes: bug.failureCodes,
      publisherPhysicalClassificationMarker: bug.publisherPhysicalClassificationMarker,
      sourceNativeFailureTaxonomy: true,
      physicalExecutionObservedByOutsider: false,
      independentConsequenceAdjudication: false,
    },
    useBoundary: useBoundary(),
  };
  return { ...body, recordHash: digest(body,
    "outsider/public-evidence-wave5/record/v1") };
}

function requireTraceSupport(sourceDirectory) {
  const pins = PUBLIC_EVIDENCE_WAVE5_SOURCE_OBJECT_PINS.traceCommons;
  const readme = pinRead(sourceDirectory, "README.md", pins["README.md"],
    "PUBLIC_EVIDENCE_WAVE5_TRACE_README_MISMATCH");
  const revision = pinRead(sourceDirectory, "repository-revision.json",
    pins["repository-revision.json"], "PUBLIC_EVIDENCE_WAVE5_TRACE_REVISION_MISMATCH");
  const tree = pinRead(sourceDirectory, "selected-tree.json", pins["selected-tree.json"],
    "PUBLIC_EVIDENCE_WAVE5_TRACE_TREE_MISMATCH");
  const revisionValue = parseJson(revision.bytes,
    "PUBLIC_EVIDENCE_WAVE5_TRACE_REVISION_JSON_INVALID");
  const treeValue = parseJson(tree.bytes, "PUBLIC_EVIDENCE_WAVE5_TRACE_TREE_JSON_INVALID");
  if (!same(revisionValue, { id: TRACE_COMMONS_WAVE5_PIN.id,
    revision: TRACE_COMMONS_WAVE5_PIN.revision, private: false, gated: false,
    disabled: false, licenseId: TRACE_COMMONS_WAVE5_PIN.licenseId })) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_REVISION_SEMANTICS_INVALID");
  }
  if (!same(treeValue, { id: TRACE_COMMONS_WAVE5_PIN.id,
    revision: TRACE_COMMONS_WAVE5_PIN.revision,
    selectionRule: TRACE_COMMONS_WAVE5_PIN.selectionRule,
    selected: TRACE_SELECTED.map(({ harness, path, oid, sizeBytes }) =>
      ({ harness, path, oid, sizeBytes })) })) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_SELECTION_INVALID");
  }
  const text = readme.bytes.toString("utf8");
  if (!text.includes("license: cc-by-4.0")
    || !text.includes("certifies that the session is not private or confidential")
    || !text.includes("we do not and cannot verify the\nprovenance or license")) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_RIGHTS_EVIDENCE_INVALID");
  }
  const expected = ["README.md", "repository-revision.json", "selected-tree.json",
    ...TRACE_SELECTED.map(({ path }) => path)].sort();
  if (!same(listFiles(sourceDirectory), expected)) {
    fail("PUBLIC_EVIDENCE_WAVE5_TRACE_FILE_SET_INVALID");
  }
  return { supportObjects: [readme.object, revision.object, tree.object] };
}

function requireRobustSupport(sourceDirectory) {
  const pins = PUBLIC_EVIDENCE_WAVE5_SOURCE_OBJECT_PINS.robustRos;
  const readme = pinRead(sourceDirectory, "README.md", pins["README.md"],
    "PUBLIC_EVIDENCE_WAVE5_ROBUST_README_MISMATCH");
  const commit = pinRead(sourceDirectory, "repository-commit.json",
    pins["repository-commit.json"], "PUBLIC_EVIDENCE_WAVE5_ROBUST_COMMIT_MISMATCH");
  const tree = pinRead(sourceDirectory, "repository-tree.json", pins["repository-tree.json"],
    "PUBLIC_EVIDENCE_WAVE5_ROBUST_TREE_MISMATCH");
  const commitValue = parseJson(commit.bytes, "PUBLIC_EVIDENCE_WAVE5_ROBUST_COMMIT_INVALID");
  const treeValue = parseJson(tree.bytes, "PUBLIC_EVIDENCE_WAVE5_ROBUST_TREE_INVALID");
  if (commitValue.sha !== ROBUST_ROS_WAVE5_PIN.revision
    || commitValue.tree?.sha !== ROBUST_ROS_WAVE5_PIN.tree
    || treeValue.sha !== ROBUST_ROS_WAVE5_PIN.tree || treeValue.truncated !== false
    || !Array.isArray(treeValue.tree)) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_REVISION_BINDING_INVALID");
  }
  const rootLicense = treeValue.tree.some((entry) => entry.type === "blob"
    && !entry.path.includes("/") && /^(LICENSE|LICENSE\..*|COPYING|COPYING\..*)$/i.test(entry.path));
  if (rootLicense) fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_RIGHTS_BOUNDARY_CHANGED");
  const bugEntries = treeValue.tree.filter((entry) => entry.type === "blob"
    && BUG_PATH.test(entry.path)).sort((left, right) => left.path.localeCompare(right.path));
  const markerEntries = treeValue.tree.filter((entry) => entry.type === "blob"
    && NOT_A_BUG_PATH.test(entry.path)).sort((left, right) => left.path.localeCompare(right.path));
  if (bugEntries.length !== ROBUST_ROS_WAVE5_PIN.candidateBugFiles
    || markerEntries.length !== ROBUST_ROS_WAVE5_PIN.notABugMarkers) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_SELECTION_COUNT_INVALID");
  }
  const markerIds = new Set(markerEntries.map((entry) => entry.path.split("/")[1]));
  const admitted = bugEntries.filter((entry) => !markerIds.has(entry.path.split("/")[1]));
  if (admitted.length !== ROBUST_ROS_WAVE5_PIN.admittedBugRecords) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_ADMITTED_COUNT_INVALID");
  }
  const readmeText = readme.bytes.toString("utf8");
  if (!readmeText.includes("ROBUST dataset can be added to BugZoo")
    || /SPDX-License-Identifier|Creative Commons|Apache License|MIT License/.test(readmeText)) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_README_BOUNDARY_INVALID");
  }
  const expected = ["README.md", "repository-commit.json", "repository-tree.json",
    ...bugEntries.map(({ path }) => path), ...markerEntries.map(({ path }) => path)].sort();
  if (!same(listFiles(sourceDirectory), expected)) {
    fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_FILE_SET_INVALID");
  }
  const selectedObjects = [];
  for (const entry of [...bugEntries, ...markerEntries]) {
    const snapshot = readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, entry.path),
      null, "PUBLIC_EVIDENCE_WAVE5_ROBUST_SELECTED_OBJECT_MISSING");
    if (snapshot.object.sizeBytes !== entry.size || gitBlobOid(snapshot.bytes) !== entry.sha) {
      fail("PUBLIC_EVIDENCE_WAVE5_ROBUST_SELECTED_OBJECT_MISMATCH", entry.path);
    }
    selectedObjects.push(snapshot.object);
  }
  return { supportObjects: [readme.object, commit.object, tree.object], admitted,
    selectedObjects, excludedNotABug: markerEntries.length,
    candidateBugFiles: bugEntries.length };
}

function frequency(records, select) {
  const counts = new Map();
  for (const record of records) {
    const values = select(record);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value == null) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function summaryCounts(records) {
  const traceRecords = records.filter((record) =>
    record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE");
  const robustRecords = records.filter((record) =>
    record.recordType === "ORGANIC_ROBOT_SOFTWARE_BUG_FIX_TAXONOMY");
  return {
    records: records.length,
    organicAgentSessions: traceRecords.length,
    robustRobotSoftwareBugs: robustRecords.length,
    harnesses: frequency(traceRecords, (record) => record.selection.harness),
    agentSourceEvents: traceRecords.reduce((sum, record) =>
      sum + record.observations.sourceEvents, 0),
    agentToolCalls: traceRecords.reduce((sum, record) =>
      sum + record.observations.toolCalls, 0),
    agentToolResultsPreserved: traceRecords.reduce((sum, record) =>
      sum + record.observations.toolResults, 0),
    agentSourceNativeToolErrors: traceRecords.reduce((sum, record) =>
      sum + record.observations.sourceNativeToolErrors, 0),
    agentWriteLikeToolCalls: traceRecords.reduce((sum, record) =>
      sum + record.observations.writeLikeToolCalls, 0),
    agentHumanFollowupPrompts: traceRecords.reduce((sum, record) =>
      sum + record.observations.humanFollowupPromptCount, 0),
    robustSystems: frequency(robustRecords, (record) => record.observations.system),
    robustFaultCodes: frequency(robustRecords, (record) => record.observations.faultCodes),
    robustFailureCodes: frequency(robustRecords,
      (record) => record.observations.failureCodes),
    robustPhases: frequency(robustRecords, (record) => record.observations.phase),
    robustWithIssueReference: robustRecords.filter((record) =>
      record.observations.issueReferencePresent).length,
    robustWithFixCommit: robustRecords.filter((record) =>
      record.observations.fixCommitCount > 0).length,
    robustPublisherPhysicalMarkers: robustRecords.filter((record) =>
      record.observations.publisherPhysicalClassificationMarker).length,
    causalExperienceUnits: 0,
    independentOutcomeUnits: 0,
    economicLossRows: 0,
    pricingEligibleRows: 0,
    productionModelEligibleRows: 0,
  };
}

function summaryInterpretation() {
  return {
    sourceRecordsAreEmpirical: true,
    shadowResearchIsPermittedUseNotRealityClass: true,
    failureRateEstimable: false,
    toolErrorRateEstimableBeyondSelectedSessions: false,
    robotBugFrequencyPopulationEstimable: false,
    physicalRobotExecutionEstablishedByBugMetadata: false,
    automaticTraining: false,
  };
}

function verificationTrust() {
  return {
    traceRevisionAndGitObjectsPinned: true,
    traceContributorAndMaintainerReviewPublisherDeclared: true,
    traceEmbeddedRightsUniformlyVerified: false,
    robustRevisionTreeAndGitObjectsPinned: true,
    robustRootLicenseDetected: false,
    robustBugEnvironmentIndependentlyReplayed: false,
    independentOutcomeAdjudication: false,
    exposureDenominatorEstablished: false,
  };
}

export function verifyPublicEvidenceWave5Source({ traceCommonsDirectory,
  robustRosDirectory, generatedAt = PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT } = {}) {
  if (typeof traceCommonsDirectory !== "string" || typeof robustRosDirectory !== "string"
    || new Date(generatedAt).toISOString() !== generatedAt) {
    fail("PUBLIC_EVIDENCE_WAVE5_SOURCE_ARGUMENT_INVALID");
  }
  const traceSupport = requireTraceSupport(traceCommonsDirectory);
  const robustSupport = requireRobustSupport(robustRosDirectory);
  const traceRecords = TRACE_SELECTED.map((selection, index) =>
    traceRecord(traceCommonsDirectory, selection, index));
  const robustRecords = robustSupport.admitted.map((entry, index) =>
    robustRecord(robustRosDirectory, entry, index));
  const records = [...traceRecords, ...robustRecords];
  const manifestBody = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.manifest,
    generatedAt,
    sources: manifestSources(),
    boundary: useBoundary(),
  };
  const manifest = { ...manifestBody, manifestHash: digest(manifestBody,
    "outsider/public-evidence-wave5/manifest/v1") };
  const recordSetBody = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.recordSet,
    manifestHash: manifest.manifestHash,
    records: records.length,
    uniqueIdentities: new Set(records.map((record) =>
      `${record.identity.sourceRoot}:${record.identity.sourceRecordHash}`)).size,
    recordHashes: records.map(({ recordHash }) => recordHash),
  };
  const recordSet = { ...recordSetBody, recordSetHash: digest(recordSetBody,
    "outsider/public-evidence-wave5/record-set/v1") };
  const summaryBody = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.summary,
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    counts: summaryCounts(records),
    interpretation: summaryInterpretation(),
    boundary: useBoundary(),
  };
  const summary = { ...summaryBody, summaryHash: digest(summaryBody,
    "outsider/public-evidence-wave5/summary/v1") };
  const sourceObjects = [
    ...traceSupport.supportObjects,
    ...TRACE_SELECTED.map(({ sizeBytes, sha256 }) => ({ sizeBytes, sha256 })),
    ...robustSupport.supportObjects,
    ...robustSupport.selectedObjects,
  ];
  const verificationBody = {
    schema: PUBLIC_EVIDENCE_WAVE5_SCHEMAS.verification,
    generatedAt,
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    summaryHash: summary.summaryHash,
    sourceArtifactsReverified: true,
    selectedSourceObjectsReverified: sourceObjects.length,
    selectedSourceBytesReverified: sourceObjects.reduce((sum, object) =>
      sum + object.sizeBytes, 0),
    sourceNativeRowsReparsed: records.length,
    rawTextPersistedInProjection: false,
    trust: verificationTrust(),
    boundary: useBoundary(),
  };
  const verification = { ...verificationBody, verificationHash: digest(verificationBody,
    "outsider/public-evidence-wave5/verification/v1") };
  return { manifest, records, recordSet, summary, verification };
}

function verifySealed(value, hashField, domain) {
  if (!plain(value) || !HASH.test(value[hashField] ?? "")) return false;
  const body = { ...value };
  delete body[hashField];
  return value[hashField] === digest(body, domain);
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function boundedNullableString(value) {
  return value === null || (typeof value === "string" && value.length <= 160
    && !/[\r\n]/.test(value));
}

function structureOnlyResult(ok) {
  return {
    ok,
    verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false,
  };
}

function verifyToolCounts(observations, keys) {
  if (!exactKeys(observations, keys)) return false;
  const numeric = keys.filter((key) => !["toolFamilyCounts",
    "continuedAfterObservedToolError", "nativeSuccessLabelPresent",
    "terminalRecoveryEstablished", "externalConsequenceObserved"].includes(key));
  if (!numeric.every((key) => nonnegativeInteger(observations[key]))
    || !plain(observations.toolFamilyCounts)
    || !Object.entries(observations.toolFamilyCounts).every(([name, count]) =>
      /^[A-Za-z0-9_.:-]{1,128}$/.test(name) && nonnegativeInteger(count))
    || Object.values(observations.toolFamilyCounts).reduce((sum, count) => sum + count, 0)
      !== observations.toolCalls
    || observations.toolResults > observations.toolCalls
    || observations.sourceNativeToolErrors > observations.toolResults
    || observations.writeLikeToolCalls > observations.toolCalls
    || observations.humanFollowupPromptCount
      !== Math.max(0, observations.humanPromptTextBlocks - 1)
    || observations.userMessageEnvelopes + observations.assistantMessageEnvelopes
      > observations.sourceEvents
    || typeof observations.continuedAfterObservedToolError !== "boolean"
    || observations.nativeSuccessLabelPresent !== false
    || observations.terminalRecoveryEstablished !== false
    || observations.externalConsequenceObserved !== false) return false;
  return true;
}

function verifyAgentRecord(record) {
  const harness = record.selection?.harness;
  const baseObservationKeys = ["sourceEvents", "humanPromptTextBlocks",
    "assistantTextBlocks", "userMessageEnvelopes", "assistantMessageEnvelopes",
    "toolCalls", "toolResults", "sourceNativeToolErrors", "writeLikeToolCalls",
    "toolFamilyCounts", "humanFollowupPromptCount", "continuedAfterObservedToolError",
    "nativeSuccessLabelPresent", "terminalRecoveryEstablished",
    "externalConsequenceObserved"];
  const extras = harness === "claude_code" ? ["fileHistorySnapshots", "queueOperations"]
    : harness === "cursor" ? ["turnEndedEvents"]
      : harness === "opencode" ? ["sourceNativeCompletedToolStates"] : null;
  if (extras == null
    || !exactKeys(record.dataset, ["id", "revision", "sourceKind"])
    || !same(record.dataset, { id: TRACE_COMMONS_WAVE5_PIN.id,
      revision: TRACE_COMMONS_WAVE5_PIN.revision,
      sourceKind: TRACE_COMMONS_WAVE5_PIN.sourceKind })
    || !exactKeys(record.identity,
      ["sourceRoot", "sourceRecordHash", "sessionIdHash", "ordinal"])
    || record.identity.sourceRoot !== sourceRoot(TRACE_COMMONS_WAVE5_PIN.id,
      TRACE_COMMONS_WAVE5_PIN.revision)
    || !HASH.test(record.identity.sourceRecordHash ?? "")
    || !HASH.test(record.identity.sessionIdHash ?? "")
    || record.identity.ordinal !== TRACE_COMMONS_WAVE5_PIN.selectedHarnesses.indexOf(harness)
    || !exactKeys(record.selection,
      ["harness", "sourcePathHash", "rule", "outcomeBlind"])
    || !HASH.test(record.selection.sourcePathHash ?? "")
    || record.selection.rule !== TRACE_COMMONS_WAVE5_PIN.selectionRule
    || record.selection.outcomeBlind !== true
    || !same(record.axes, traceAxes())
    || !verifyToolCounts(record.observations, [...baseObservationKeys, ...extras])) return false;
  if (harness === "opencode"
    && record.observations.sourceNativeCompletedToolStates > record.observations.toolResults) {
    return false;
  }
  return true;
}

function verifyRobustRecord(record) {
  const observations = record.observations;
  const observationKeys = ["system", "severity", "phase", "specificity",
    "architecturalLocation", "subsystem", "detectedBy", "reportedBy",
    "reproducibility", "issueReferencePresent", "issueReferenceHash",
    "pullRequestReferencePresent", "pullRequestReferenceHash", "fixCommitCount",
    "fixCommitSetHash", "faultCodes", "failureCodes",
    "publisherPhysicalClassificationMarker", "sourceNativeFailureTaxonomy",
    "physicalExecutionObservedByOutsider", "independentConsequenceAdjudication"];
  if (!exactKeys(record.dataset, ["id", "revision", "sourceKind"])
    || !same(record.dataset, { id: ROBUST_ROS_WAVE5_PIN.id,
      revision: ROBUST_ROS_WAVE5_PIN.revision,
      sourceKind: ROBUST_ROS_WAVE5_PIN.sourceKind })
    || !exactKeys(record.identity,
      ["sourceRoot", "sourceRecordHash", "sourceNativeIdHash", "ordinal"])
    || record.identity.sourceRoot !== sourceRoot(ROBUST_ROS_WAVE5_PIN.id,
      ROBUST_ROS_WAVE5_PIN.revision)
    || !HASH.test(record.identity.sourceRecordHash ?? "")
    || !HASH.test(record.identity.sourceNativeIdHash ?? "")
    || !nonnegativeInteger(record.identity.ordinal)
    || record.identity.ordinal >= ROBUST_ROS_WAVE5_PIN.admittedBugRecords
    || !exactKeys(record.selection,
      ["namespace", "sourcePathHash", "rule", "outcomeBlind"])
    || !ROBUST_ROS_WAVE5_PIN.namespaces.includes(record.selection.namespace)
    || !HASH.test(record.selection.sourcePathHash ?? "")
    || record.selection.rule !== ROBUST_ROS_WAVE5_PIN.selectionRule
    || record.selection.outcomeBlind !== true
    || !same(record.axes, robustAxes())
    || !exactKeys(observations, observationKeys)
    || observations.system !== record.selection.namespace
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(observations.severity ?? "")
    || !["build", "runtime", "startup"].includes(observations.phase)
    || ![observations.specificity, observations.architecturalLocation,
      observations.subsystem, observations.detectedBy, observations.reportedBy,
      observations.reproducibility].every(boundedNullableString)
    || typeof observations.issueReferencePresent !== "boolean"
    || (observations.issueReferencePresent !== HASH.test(observations.issueReferenceHash ?? ""))
    || typeof observations.pullRequestReferencePresent !== "boolean"
    || (observations.pullRequestReferencePresent
      !== HASH.test(observations.pullRequestReferenceHash ?? ""))
    || !nonnegativeInteger(observations.fixCommitCount)
    || !HASH.test(observations.fixCommitSetHash ?? "")
    || !Array.isArray(observations.faultCodes)
    || !Array.isArray(observations.failureCodes)
    || !same(observations.faultCodes, [...new Set(observations.faultCodes)].sort())
    || !same(observations.failureCodes, [...new Set(observations.failureCodes)].sort())
    || ![...observations.faultCodes, ...observations.failureCodes].every((value) =>
      TAXONOMY_CODE.test(value))
    || typeof observations.publisherPhysicalClassificationMarker !== "boolean"
    || observations.sourceNativeFailureTaxonomy !== true
    || observations.physicalExecutionObservedByOutsider !== false
    || observations.independentConsequenceAdjudication !== false) return false;
  return true;
}

export function verifyPublicEvidenceWave5Record(record) {
  try {
    if (!verifySealed(record, "recordHash", "outsider/public-evidence-wave5/record/v1")
      || !exactKeys(record, ["schema", "recordType", "dataset", "identity",
        "selection", "axes", "observations", "useBoundary", "recordHash"])
      || record.schema !== PUBLIC_EVIDENCE_WAVE5_SCHEMAS.record
      || !same(record.useBoundary, useBoundary())) return structureOnlyResult(false);
    if (record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE") {
      if (!verifyAgentRecord(record)) return structureOnlyResult(false);
    } else if (record.recordType === "ORGANIC_ROBOT_SOFTWARE_BUG_FIX_TAXONOMY") {
      if (!verifyRobustRecord(record)) return structureOnlyResult(false);
    } else return structureOnlyResult(false);
    return structureOnlyResult(true);
  } catch { return structureOnlyResult(false); }
}

export function verifyPublicEvidenceWave5Manifest(manifest) {
  try {
    return structureOnlyResult(verifySealed(manifest, "manifestHash",
      "outsider/public-evidence-wave5/manifest/v1")
      && exactKeys(manifest,
        ["schema", "generatedAt", "sources", "boundary", "manifestHash"])
      && manifest.schema === PUBLIC_EVIDENCE_WAVE5_SCHEMAS.manifest
      && typeof manifest.generatedAt === "string"
      && new Date(manifest.generatedAt).toISOString() === manifest.generatedAt
      && same(manifest.sources, manifestSources())
      && same(manifest.boundary, useBoundary()));
  } catch { return structureOnlyResult(false); }
}

export function verifyPublicEvidenceWave5RecordSet(recordSet, { manifest, records } = {}) {
  try {
    return structureOnlyResult(verifySealed(recordSet, "recordSetHash",
      "outsider/public-evidence-wave5/record-set/v1")
      && exactKeys(recordSet, ["schema", "manifestHash", "records",
        "uniqueIdentities", "recordHashes", "recordSetHash"])
      && recordSet.schema === PUBLIC_EVIDENCE_WAVE5_SCHEMAS.recordSet
      && verifyPublicEvidenceWave5Manifest(manifest).ok
      && manifest.manifestHash === recordSet.manifestHash
      && Array.isArray(records) && records.length === recordSet.records
      && nonnegativeInteger(recordSet.records)
      && nonnegativeInteger(recordSet.uniqueIdentities)
      && Array.isArray(recordSet.recordHashes)
      && recordSet.recordHashes.every((hash) => HASH.test(hash))
      && records.every((record) => verifyPublicEvidenceWave5Record(record).ok)
      && same(records.map(({ recordHash }) => recordHash), recordSet.recordHashes)
      && new Set(records.map((record) =>
        `${record.identity.sourceRoot}:${record.identity.sourceRecordHash}`)).size
        === recordSet.uniqueIdentities);
  } catch { return structureOnlyResult(false); }
}

export function verifyPublicEvidenceWave5Summary(summary,
  { manifest, recordSet, records } = {}) {
  try {
    return structureOnlyResult(verifySealed(summary, "summaryHash",
      "outsider/public-evidence-wave5/summary/v1")
      && exactKeys(summary, ["schema", "manifestHash", "recordSetHash", "counts",
        "interpretation", "boundary", "summaryHash"])
      && summary.schema === PUBLIC_EVIDENCE_WAVE5_SCHEMAS.summary
      && verifyPublicEvidenceWave5RecordSet(recordSet, { manifest, records }).ok
      && summary.manifestHash === manifest.manifestHash
      && summary.recordSetHash === recordSet.recordSetHash
      && same(summary.counts, summaryCounts(records))
      && same(summary.interpretation, summaryInterpretation())
      && same(summary.boundary, useBoundary()));
  } catch { return structureOnlyResult(false); }
}

export function verifyPublicEvidenceWave5Verification(verification,
  { manifest, recordSet, summary, records } = {}) {
  try {
    return structureOnlyResult(verifySealed(verification, "verificationHash",
      "outsider/public-evidence-wave5/verification/v1")
      && exactKeys(verification, ["schema", "generatedAt", "manifestHash",
        "recordSetHash", "summaryHash", "sourceArtifactsReverified",
        "selectedSourceObjectsReverified", "selectedSourceBytesReverified",
        "sourceNativeRowsReparsed", "rawTextPersistedInProjection", "trust",
        "boundary", "verificationHash"])
      && verification.schema === PUBLIC_EVIDENCE_WAVE5_SCHEMAS.verification
      && typeof verification.generatedAt === "string"
      && new Date(verification.generatedAt).toISOString() === verification.generatedAt
      && verifyPublicEvidenceWave5Summary(summary,
        { manifest, recordSet, records }).ok
      && verification.generatedAt === manifest.generatedAt
      && verification.manifestHash === manifest.manifestHash
      && verification.recordSetHash === recordSet.recordSetHash
      && verification.summaryHash === summary.summaryHash
      && verification.sourceArtifactsReverified === true
      && verification.selectedSourceObjectsReverified === 57
      && verification.selectedSourceBytesReverified === 576_071
      && verification.sourceNativeRowsReparsed === 49
      && verification.rawTextPersistedInProjection === false
      && same(verification.trust, verificationTrust())
      && same(verification.boundary, useBoundary()));
  } catch { return structureOnlyResult(false); }
}

export function verifyPublicEvidenceWave5Result(result) {
  try {
    return structureOnlyResult(plain(result)
      && verifyPublicEvidenceWave5Manifest(result.manifest).ok
      && Array.isArray(result.records)
      && result.records.every((record) => verifyPublicEvidenceWave5Record(record).ok)
      && verifyPublicEvidenceWave5RecordSet(result.recordSet,
        { manifest: result.manifest, records: result.records }).ok
      && verifyPublicEvidenceWave5Summary(result.summary,
        { manifest: result.manifest, recordSet: result.recordSet,
          records: result.records }).ok
      && verifyPublicEvidenceWave5Verification(result.verification,
        { manifest: result.manifest, recordSet: result.recordSet,
          summary: result.summary, records: result.records }).ok);
  } catch { return structureOnlyResult(false); }
}

export const PUBLIC_EVIDENCE_WAVE5_SELECTED_TRACE_OBJECTS = TRACE_SELECTED;
