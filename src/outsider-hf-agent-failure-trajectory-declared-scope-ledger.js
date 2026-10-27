/*
 * Exact, metadata-only terminal ledger for four declared Hugging Face searches.
 *
 * Search descriptions, tags, and dataset payloads are treated as untrusted data.
 * Raw API JSON remains private and is never executed or projected into the
 * public report.  A terminal ledger disposition closes only the four pinned
 * search-result sets; it does not claim payload or global-source exhaustion.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const HF_AGENT_FAILURE_TRAJECTORY_LEDGER_SCHEMA =
  "outsider/hf-agent-failure-trajectory-declared-scope-ledger/v1";
export const HF_AGENT_FAILURE_TRAJECTORY_SOURCE_SCHEMA =
  "outsider/hf-agent-failure-trajectory-declared-scope-source/v1";
export const HF_AGENT_FAILURE_TRAJECTORY_RECEIPT_SCHEMA =
  "outsider/hf-agent-failure-trajectory-declared-scope-receipt/v1";
export const HF_AGENT_FAILURE_TRAJECTORY_SCOPE =
  "FOUR_EXACT_HF_FULL_SEARCH_QUERIES_TERMINAL_LEDGER";
export const HF_AGENT_FAILURE_TRAJECTORY_DISPOSITION =
  "METADATA_ONLY_QUARANTINE_DISCOVERY_LEDGER";

const REPORT_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_LEDGER_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_SOURCE_SCHEMA}/manifest`;
const SOURCE_ROOT_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_SOURCE_SCHEMA}/root`;
const COVERAGE_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_SOURCE_SCHEMA}/coverage`;
const LEDGER_DOMAIN = `${HF_AGENT_FAILURE_TRAJECTORY_LEDGER_SCHEMA}/candidate-ledger`;
const MAX_CONTROL_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const HF_AGENT_FAILURE_TRAJECTORY_QUERIES = Object.freeze([
  Object.freeze({ key: "agent-trajectory", term: "agent trajectory",
    full: true, limit: 1_000, expectedRecords: 36, expectedBytes: 37_076,
    expectedSha256:
      "sha256:d0cc76ae2ef56507c8a5e901387b9af956ade1b88d936604508256c230508ca1" }),
  Object.freeze({ key: "agent-trajectories", term: "agent trajectories",
    full: true, limit: 1_000, expectedRecords: 48, expectedBytes: 67_194,
    expectedSha256:
      "sha256:e0bee1b3579629d920746bc00cf27f4c97c0ee94e30bfe7a3b205576be5e6c70" }),
  Object.freeze({ key: "tool-use-trajectory", term: "tool use trajectory",
    full: true, limit: 1_000, expectedRecords: 0, expectedBytes: 2,
    expectedSha256:
      "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" }),
  Object.freeze({ key: "agent-failure", term: "agent failure",
    full: true, limit: 1_000, expectedRecords: 8, expectedBytes: 10_752,
    expectedSha256:
      "sha256:d4851b620c915b9bd62454474b66f64dbc55c8bf8e00f1df01e08b9c885a932a" }),
]);

const YOUNGJUNG_IDS = Object.freeze([
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_agent_nominal",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_debug_cheatcode_modified_attempt_15",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_debug_cheatcode_modified_attempt_20",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_nominalrecovery_attempt_2",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_nominalrecovery_success",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_nominal_attempt_1_score_96p83",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_nominalrecovery_attempt_1_score_94p98",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_nominalrecovery_attempt_1_score_97p05",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_recovery_attempt_1",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_recovery_attempt_2",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_recovery_attempt_3",
  "yoonjung0705/aic_sfp2nic_agent_expert_trajectory_sample_vlm_moveit_recovery_attempt_4",
]);

export const HF_AGENT_FAILURE_TRAJECTORY_ALREADY_ACQUIRED_IDS = Object.freeze([
  "Anonymousblind/agent-failure-dynamics",
  "liuqi6777/bcp_search_agent_trajectory",
  "obaydata/mcp-agent-trajectory-benchmark",
  "orlando23/failed_agent_trajectory",
  "sunnydubey1111/agent-trajectory-sentinel",
  ...YOUNGJUNG_IDS,
].sort((left, right) => left.localeCompare(right)));

const COVERAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    datasetIds: Object.freeze(["orlando23/failed_agent_trajectory"]),
    kind: "COMPLETE_FIXED_REVISION_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-mobile-agent-failure-census.js",
      "artifacts/outsider-mobile-agent-failure-census-20260829-v1/report.json",
    ]),
  }),
  Object.freeze({
    datasetIds: Object.freeze(["sunnydubey1111/agent-trajectory-sentinel"]),
    kind: "COMPLETE_SELECTED_RECOVERY_SOURCE_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-agent-trajectory-sentinel-quarantine.js",
      "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2/report.json",
    ]),
  }),
  Object.freeze({
    datasetIds: Object.freeze(["liuqi6777/bcp_search_agent_trajectory"]),
    kind: "COMPLETE_SELECTED_RUN_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-browsecomp-search-agent-run.js",
      "artifacts/outsider-browsecomp-search-agent-run-20260829-v1/report.json",
    ]),
  }),
  Object.freeze({
    datasetIds: Object.freeze(["Anonymousblind/agent-failure-dynamics"]),
    kind: "COMPLETE_FIXED_REVISION_REPOSITORY_BYTES_REPLAYED",
    paths: Object.freeze([
      "src/outsider-agent-failure-dynamics-full-repo.js",
      "artifacts/outsider-agent-failure-dynamics-full-repo-20260829-v1/report.json",
    ]),
  }),
  Object.freeze({
    datasetIds: YOUNGJUNG_IDS,
    kind: "FULL_12_REPOSITORY_NO_VIDEO_BYTE_AND_PYARROW_REPLAY",
    paths: Object.freeze([
      "artifacts/outsider-ur5e-agent-recovery-lineage-20260829-v2/artifact-manifest.json",
    ]),
  }),
  Object.freeze({
    datasetIds: Object.freeze(["obaydata/mcp-agent-trajectory-benchmark"]),
    kind: "PINNED_FULL_413_FILE_REPOSITORY_BYTES",
    paths: Object.freeze([
      "src/outsider-mcp-agent-trajectory-benchmark.js",
      "artifacts/outsider-mcp-agent-trajectory-benchmark-20260829-v3/artifact-manifest.json",
      "artifacts/outsider-mcp-agent-trajectory-benchmark-20260829-v3/mcp-agent-trajectory-benchmark.json",
    ]),
  }),
  Object.freeze({
    datasetIds: Object.freeze(["cx-cmu/agent_trajectories"]),
    kind: "EXISTING_METADATA_ONLY_GATED_NO_LICENSE_DISPOSITION",
    paths: Object.freeze([
      "src/outsider-public-agent-wave2.js",
      "artifacts/public-agent-wave2-20260821/final-v1/candidate-decision.json",
    ]),
  }),
]);

const DUPLICATE_OF = Object.freeze({
  "ElenaFu/SWE-agent-trajectories": "nebius/SWE-agent-trajectories",
  "banyohavlusu23/SWE-agent-trajectories": "nebius/SWE-agent-trajectories",
});

const SYNTHETIC_TRAINING_REASON = Object.freeze({
  "zake7749/deepseek-v4-pro-agent-tool-calling-trajectory":
    "PUBLISHER_GENERATED_SFT_TRAJECTORIES_NO_OUTCOME_CLAIM_IN_SEARCH_RECORD",
  "kosiasuzu/agenticml-agent-trajectory-dataset":
    "PUBLISHER_SYNTHETIC_TOOL_USE_TRAINING_NO_OUTCOME_CLAIM_IN_SEARCH_RECORD",
  "chirag070901/jira-agent-trajectories":
    "PUBLISHER_SYNTHETIC_SIMULATION_DEMONSTRATIONS_NO_OUTCOME_CLAIM_IN_SEARCH_RECORD",
  "chirag070901/jira-agent-trajectories-neutral-v2":
    "PUBLISHER_SYNTHETIC_SIMULATION_DEMONSTRATIONS_NO_OUTCOME_CLAIM_IN_SEARCH_RECORD",
});

const PRIORITY = Object.freeze({
  "agent-eto/eto-sft-trajectory": [100,
    "PUBLISHER_ITERATIVE_FAILURE_TRAJECTORY_COLLECTION"],
  "zake7749/Qwen-3.6-plus-agent-tool-calling-trajectory": [99,
    "PUBLISHER_PASSING_NEAR_PASSING_REWARD_AND_SCORE_SIGNALS"],
  "agent-distillation/Qwen2.5-32B-Instruct_cot_trajectories_2k": [98,
    "PUBLISHER_CORRECT_AND_INCORRECT_TRAJECTORY_SPLIT"],
  "JetBrains-Research/agent-trajectories-swesmith-random-subset": [97,
    "PUBLISHER_RESOLVED_COLUMN_FROM_SWE_BENCH_EVALUATION"],
  "AlexWortega/agent-launch-pad-trajectories": [96,
    "PUBLISHER_BENCH_VERIFIER_GRADE_PASS_SIGNAL"],
  "SecureAI-SE/fuzz-agent-trajectories": [95,
    "PUBLISHER_GROUND_TRUTH_VERIFIED_TOOL_TRAJECTORIES"],
  "GXCafe/ai-agent-failure-logs": [94,
    "PUBLISHER_LONG_RUNNING_UNATTENDED_FAILURE_LOG_CLAIM"],
  "Agent-Eval-Refine/Agent-Trajectories": [93,
    "PUBLISHER_EVALUATED_WEB_MOBILE_AND_IOS_TRAJECTORIES"],
  "AI-Secure/DTap-Bench-Agent-Trajectories": [92,
    "PUBLISHER_RED_TEAM_BENCHMARK_EVALUATION_TRAJECTORIES"],
  "zwright/hermes-flight-recorder-self-improving-agent-trajectories": [91,
    "PUBLISHER_SUCCESS_REFUSAL_AND_FROZEN_EVALUATION_SPLITS"],
  "solsticestudioai/agent-failure-atlas-benchmark": [90,
    "PUBLISHER_SYNTHETIC_FAILURE_AND_RECOVERY_DETECTOR_SMOKE_SET"],
  "taejoon89/Ko-Agent-Trajectories-1.0": [89,
    "PUBLISHER_CROSS_JUDGE_EVALUATION_SUBSET"],
  "WenyiWU0111/CoMEM-agent-memory-trajectories": [88,
    "PUBLISHER_EXECUTED_GUI_TRAJECTORIES_FOR_TRAINING_AND_EVALUATION"],
  "Kwai-Klear/SWE-smith-mini_swe_agent_plus-trajectories-66k": [87,
    "PUBLISHER_END_TO_END_SWE_TRAJECTORIES_AND_SOLVE_RATE_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-ls20-agent-trajectories": [86,
    "PUBLISHER_COMPLETE_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-tr87-agent-trajectories": [85,
    "PUBLISHER_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-wa30-agent-trajectories": [84,
    "PUBLISHER_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-lf52-agent-trajectories": [83,
    "PUBLISHER_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-su15-agent-trajectories": [82,
    "PUBLISHER_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
  "AgentNativeResearchLab/arc-agi3-ka59-agent-trajectories": [81,
    "PUBLISHER_GAMEPLAY_LEVEL_OUTCOME_NARRATIVE"],
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `HF_AGENT_TRAJECTORY_LEDGER_${code}`
    : `HF_AGENT_TRAJECTORY_LEDGER_${code}:${detail}`);
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

function readPrivate(root, relative, expectedBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600
    || link.size > BigInt(MAX_CONTROL_BYTES)
    || expectedBytes !== null && link.size !== BigInt(expectedBytes)) {
    fail("PRIVATE_FILE_INVALID", relative);
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

function listPrivateFiles(root, prefix = "") {
  const directory = prefix === "" ? path.resolve(root) : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_INVALID", prefix);
  const result = [];
  for (const name of sorted(readdirSync(directory))) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = lstatSync(checkedPath(root, relative), { bigint: true });
    if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
    if (child.isDirectory()) result.push(...listPrivateFiles(root, relative));
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
      result.push(relative);
    } else fail("ENTRY_INVALID", relative);
  }
  return result;
}

function recordFlags(description, tags) {
  const surface = `${description}\n${tags.join("\n")}`.toLowerCase();
  const test = (pattern) => pattern.test(surface);
  return {
    publisherMentionsSyntheticOrGenerated: test(/synthetic|synthesized|generated/iu),
    publisherMentionsTrainingOrDistillation: test(/training|fine-tun|\bsft\b|\bdpo\b|distill|teach(?:es)? a language-model policy/iu),
    publisherMentionsEvaluationOrBenchmark: test(/evaluat|benchmark|test split|verifier/iu),
    publisherMentionsFailureOrIncorrect: test(/fail|incorrect|error|hazard/iu),
    publisherMentionsRecoveryOrRetry: test(/recover|retry|self-correct/iu),
    publisherMentionsOutcomeLikeSignal: test(/outcome|reward|score|resolved|grade_pass|success|correct|incorrect|\bwin\b|verified/iu),
    publisherMentionsCompleteOrFullTrace: test(/complete|full (?:execution |tool-use )?trace|end-to-end/iu),
    publisherMentionsRealWorldOrHuman: test(/real-world|human demonstration|human annotat|unattended for 43 days/iu),
    publisherMentionsToolCodeOrCommand: test(/tool|function.call|\bcode\b|command|mcp|http_request/iu),
  };
}

function licenseProjection(record, tags) {
  const raw = record.cardData?.license;
  const cardClaim = typeof raw === "string" && raw.length > 0 ? raw : null;
  const tagClaims = sorted(tags.filter((tag) => tag.startsWith("license:"))
    .map((tag) => tag.slice("license:".length)).filter(Boolean));
  return {
    cardLicenseValue: cardClaim,
    cardLicenseRawType: raw === undefined ? "missing"
      : Array.isArray(raw) ? "array" : raw === null ? "null" : typeof raw,
    licenseTagClaims: tagClaims,
    publisherLicenseClaims: sorted(new Set([
      ...(cardClaim === null ? [] : [cardClaim]), ...tagClaims,
    ])),
  };
}

function normalizeDescriptionForMirror(value) {
  return value.replace(/https:\/\/huggingface\.co\/datasets\/[^.\s]+\.?/gu, "")
    .replace(/\s+/gu, " ").trim();
}

function projectRecord(record, queryKey) {
  if (!record || typeof record !== "object" || Array.isArray(record)
    || typeof record.id !== "string" || record.id.length === 0
    || !SHA1.test(record.sha ?? "") || typeof record.author !== "string"
    || record.private !== false || record.disabled !== false
    || ![false, "auto", "manual"].includes(record.gated)
    || !(record.description === undefined || record.description === null
      || typeof record.description === "string")
    || !Array.isArray(record.tags)
    || record.tags.some((tag) => typeof tag !== "string")) {
    fail("SEARCH_RECORD_INVALID", record?.id ?? queryKey);
  }
  const description = typeof record.description === "string"
    ? record.description : "";
  const tags = sorted(record.tags);
  const descriptionBytes = Buffer.byteLength(description, "utf8");
  const normalizedMirrorPrefix = normalizeDescriptionForMirror(description)
    .slice(0, 400);
  return {
    datasetId: record.id,
    observedRevision: record.sha,
    author: record.author,
    queryMemberships: [queryKey],
    access: { private: false, gated: record.gated, disabled: false,
      publicRecord: true, publicUngated: record.gated === false },
    recordProjection: {
      createdAt: record.createdAt ?? null,
      lastModified: record.lastModified ?? null,
      tags,
      tagsSha256: sha256(Buffer.from(tags.join("\n"), "utf8")),
      formatTags: tags.filter((tag) => tag.startsWith("format:")),
      modalityTags: tags.filter((tag) => tag.startsWith("modality:")),
      sizeCategoryTags: tags.filter((tag) => tag.startsWith("size_categories:")),
      descriptionBytes,
      descriptionSha256: sha256(Buffer.from(description, "utf8")),
      normalizedDescriptionPrefixBytes:
        Buffer.byteLength(normalizedMirrorPrefix, "utf8"),
      normalizedDescriptionPrefixSha256:
        sha256(Buffer.from(normalizedMirrorPrefix, "utf8")),
      evidenceFlags: recordFlags(description, tags),
      ...licenseProjection(record, tags),
    },
  };
}

function replayQueries(root) {
  const membership = new Map();
  const querySummaries = [];
  const descriptors = [];
  for (const query of HF_AGENT_FAILURE_TRAJECTORY_QUERIES) {
    const beforePath = `queries/${query.key}-before.json`;
    const afterPath = `queries/${query.key}-after.json`;
    const before = readPrivate(root, beforePath, query.expectedBytes);
    const after = readPrivate(root, afterPath, query.expectedBytes);
    if (sha256(before) !== query.expectedSha256
      || sha256(after) !== query.expectedSha256 || !before.equals(after)) {
      fail("QUERY_BRACKET_INVALID", query.key);
    }
    const records = parseJson(before, "QUERY_JSON_INVALID");
    if (!Array.isArray(records) || records.length !== query.expectedRecords) {
      fail("QUERY_COUNT_INVALID", query.key);
    }
    for (const record of records) {
      const projected = projectRecord(record, query.key);
      const current = membership.get(projected.datasetId);
      if (current) {
        if (current.observedRevision !== projected.observedRevision
          || !same(current.recordProjection, projected.recordProjection)
          || !same(current.access, projected.access)) {
          fail("CROSS_QUERY_RECORD_MISMATCH", projected.datasetId);
        }
        current.queryMemberships.push(query.key);
      } else membership.set(projected.datasetId, projected);
    }
    querySummaries.push({ key: query.key, term: query.term,
      full: true, limit: 1_000, records: records.length,
      beforeAfterExactBytes: true, bytes: before.length, sha256: sha256(before) });
    descriptors.push({ path: beforePath, bytes: before.length, sha256: sha256(before) },
      { path: afterPath, bytes: after.length, sha256: sha256(after) });
  }
  const records = [...membership.values()].sort((left, right) =>
    left.datasetId.localeCompare(right.datasetId));
  for (const record of records) record.queryMemberships.sort();
  if (records.length !== 92
    || new Set(records.map((record) => record.datasetId)).size !== 92
    || records.filter((record) => record.access.publicUngated).length !== 84
    || records.filter((record) => record.access.gated !== false).length !== 8
    || records.some((record) => record.access.private || record.access.disabled)) {
    fail("DECLARED_UNION_PROFILE_INVALID");
  }
  return { records, querySummaries, descriptors };
}

function coverageCore(value) {
  return { schema: value.schema, scanScope: value.scanScope,
    evidence: value.evidence };
}

function validateCoverageSnapshot(value) {
  if (!value || value.schema !==
      "outsider/hf-agent-failure-trajectory-worktree-coverage-snapshot/v1"
    || value.scanScope !== "EXACT_EXPECTED_CURRENT_WORKTREE_EVIDENCE_PATHS"
    || !Array.isArray(value.evidence)
    || value.snapshotHash !== digest(COVERAGE_DOMAIN, coverageCore(value))) {
    fail("COVERAGE_SNAPSHOT_INVALID");
  }
  const expected = new Map(COVERAGE_DEFINITIONS.map((definition) => [
    definition.kind, definition,
  ]));
  if (value.evidence.length !== expected.size) fail("COVERAGE_COUNT_INVALID");
  for (const item of value.evidence) {
    const definition = expected.get(item.kind);
    if (!definition || !same(item.datasetIds, [...definition.datasetIds].sort())
      || !Array.isArray(item.files) || item.files.length !== definition.paths.length
      || item.files.some((file, index) =>
        file.path !== definition.paths[index] || !Number.isSafeInteger(file.bytes)
        || file.bytes < 1 || !HASH.test(file.sha256 ?? "")
        || ![0o600, 0o644].includes(file.mode)
        || file.containsEveryDatasetId !== true)) {
      fail("COVERAGE_EVIDENCE_INVALID", item?.kind);
    }
  }
  const acquired = new Set(value.evidence
    .filter((item) => item.kind !== "EXISTING_METADATA_ONLY_GATED_NO_LICENSE_DISPOSITION")
    .flatMap((item) => item.datasetIds));
  if (!same(sorted(acquired), HF_AGENT_FAILURE_TRAJECTORY_ALREADY_ACQUIRED_IDS)) {
    fail("COVERAGE_ACQUIRED_SET_INVALID");
  }
  return value;
}

export function createHfAgentFailureTrajectoryCoverageSnapshot(workspace) {
  const root = path.resolve(workspace);
  const evidence = COVERAGE_DEFINITIONS.map((definition) => ({
    datasetIds: [...definition.datasetIds].sort(), kind: definition.kind,
    files: definition.paths.map((relative) => {
      safeRelative(relative);
      const target = path.resolve(root, relative);
      const relation = path.relative(root, target);
      if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
        || path.isAbsolute(relation)) fail("WORKTREE_PATH_INVALID", relative);
      const status = lstatSync(target);
      if (!status.isFile() || status.isSymbolicLink()) {
        fail("WORKTREE_EVIDENCE_NOT_REGULAR", relative);
      }
      const bytes = readFileSync(target);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const containsEveryDatasetId = definition.datasetIds.every((datasetId) =>
        text.includes(datasetId));
      if (!containsEveryDatasetId) fail("WORKTREE_EVIDENCE_ID_MISSING", relative);
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes),
        mode: status.mode & 0o777, containsEveryDatasetId };
    }),
  }));
  const body = { schema:
    "outsider/hf-agent-failure-trajectory-worktree-coverage-snapshot/v1",
  scanScope: "EXACT_EXPECTED_CURRENT_WORKTREE_EVIDENCE_PATHS", evidence };
  return deepFreeze({ ...body, snapshotHash: digest(COVERAGE_DOMAIN, body) });
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const replay = replayQueries(root);
  const coverageBytes = readPrivate(root, "worktree-coverage-snapshot.json");
  const coverage = validateCoverageSnapshot(parseJson(coverageBytes,
    "COVERAGE_JSON_INVALID"));
  const descriptors = [...replay.descriptors,
    { path: "worktree-coverage-snapshot.json", bytes: coverageBytes.length,
      sha256: sha256(coverageBytes) }].sort((left, right) =>
    left.path.localeCompare(right.path));
  const expectedFiles = [
    ...descriptors.map((entry) => entry.path),
    ...(withManifest ? ["source-manifest.json"] : []),
  ].sort();
  if (!same(listPrivateFiles(root), expectedFiles)) fail("SOURCE_LAYOUT_INVALID");
  return { root, ...replay, coverage, descriptors };
}

function manifestBody(collected) {
  return {
    schema: HF_AGENT_FAILURE_TRAJECTORY_SOURCE_SCHEMA,
    scope: HF_AGENT_FAILURE_TRAJECTORY_SCOPE,
    provider: "Hugging Face official datasets search API",
    queryParameters: collected.querySummaries.map((query) => ({
      key: query.key, term: query.term, full: true, limit: 1_000,
    })),
    queryBeforeAfterExact: true,
    querySummaries: collected.querySummaries,
    declaredUnionRecords: 92,
    sourceObjects: collected.descriptors,
    coverageSnapshotHash: collected.coverage.snapshotHash,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createHfAgentFailureTrajectorySourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function coverageByDataset(coverage) {
  const result = new Map();
  for (const item of coverage.evidence) {
    for (const datasetId of item.datasetIds) result.set(datasetId, {
      kind: item.kind, evidenceFileCount: item.files.length,
      evidenceRoot: digest(`${COVERAGE_DOMAIN}/dataset`, {
        datasetId, kind: item.kind, files: item.files,
      }),
    });
  }
  return result;
}

function metadataReason(record) {
  const flags = record.recordProjection.evidenceFlags;
  if (record.recordProjection.descriptionBytes === 0) {
    return "SEARCH_RECORD_DESCRIPTION_EMPTY_NO_PAYLOAD_REPLAY";
  }
  if (record.datasetId === "RobinChen2001/A-Survey-for-LLM-Agent-Trajectory-Analysis") {
    return "SURVEY_AND_PAPER_COLLECTION_NOT_EXECUTION_TRAJECTORY_BYTES";
  }
  if (record.datasetId === "finaspirant/wearable-agent-trajectory-annotations") {
    return "LLM_SIMULATED_ANNOTATION_RECORD_NOT_EXECUTION_OUTCOME";
  }
  if (record.datasetId.startsWith("SwarmandBee/defendable-pain-")) {
    return "THREE_ROW_NARRATIVE_RECEIPTS_NOT_EXECUTION_CENSUS";
  }
  if (record.datasetId === "melanieyes/adaption-ai-agent-security-failures") {
    return "PROMPT_COMPLETION_SECURITY_PAIRS_NOT_EXECUTION_TRAJECTORIES";
  }
  if (flags.publisherMentionsTrainingOrDistillation
    && !flags.publisherMentionsOutcomeLikeSignal) {
    return "TRAINING_OR_DISTILLATION_RECORD_WITHOUT_OUTCOME_ASSERTION";
  }
  if (flags.publisherMentionsSyntheticOrGenerated
    && !flags.publisherMentionsOutcomeLikeSignal) {
    return "GENERATED_OR_SIMULATED_RECORD_WITHOUT_OUTCOME_ASSERTION";
  }
  if (flags.publisherMentionsFailureOrIncorrect
    || flags.publisherMentionsOutcomeLikeSignal) {
    return "SEARCH_SIGNAL_RETAINED_BUT_NOT_PRIORITIZED_WITHOUT_PAYLOAD_REPLAY";
  }
  return "NO_PRIORITY_OUTCOME_FAILURE_OR_RECOVERY_ASSERTION_IN_SEARCH_RECORD";
}

function dispositionFor(record, coverageMap) {
  const coverage = coverageMap.get(record.datasetId) ?? null;
  if (HF_AGENT_FAILURE_TRAJECTORY_ALREADY_ACQUIRED_IDS.includes(record.datasetId)) {
    if (!coverage) fail("ACQUIRED_COVERAGE_MISSING", record.datasetId);
    return { code: "ALREADY_ACQUIRED_CURRENT_WORKTREE", terminal: true,
      reasonCode: coverage.kind, priorityScore: null, payloadAcquisitionQueued: false };
  }
  if (record.access.gated !== false) {
    return { code: "GATED_NO_BYPASS", terminal: true,
      reasonCode: record.access.gated === "auto"
        ? "PUBLIC_RECORD_AUTO_GATED_NO_BYPASS"
        : "PUBLIC_RECORD_MANUAL_GATED_NO_BYPASS",
      priorityScore: null, payloadAcquisitionQueued: false };
  }
  if (Object.hasOwn(DUPLICATE_OF, record.datasetId)) {
    return { code: "DUPLICATE_OR_MIRROR", terminal: true,
      reasonCode: "PUBLISHER_SEARCH_METADATA_MIRROR_FINGERPRINT",
      duplicateOf: DUPLICATE_OF[record.datasetId],
      priorityScore: null, payloadAcquisitionQueued: false };
  }
  if (Object.hasOwn(SYNTHETIC_TRAINING_REASON, record.datasetId)) {
    return { code: "SYNTHETIC_TRAINING_ONLY_NO_OUTCOME", terminal: true,
      reasonCode: SYNTHETIC_TRAINING_REASON[record.datasetId],
      priorityScore: null, payloadAcquisitionQueued: false };
  }
  if (Object.hasOwn(PRIORITY, record.datasetId)) {
    return { code: "PENDING_PRIORITY_ACQUISITION", terminal: true,
      reasonCode: PRIORITY[record.datasetId][1],
      priorityScore: PRIORITY[record.datasetId][0],
      payloadAcquisitionQueued: true };
  }
  return { code: "METADATA_ONLY", terminal: true,
    reasonCode: metadataReason(record), priorityScore: null,
    payloadAcquisitionQueued: false };
}

function buildCandidateLedger(records, coverage) {
  const coverageMap = coverageByDataset(coverage);
  const entries = records.map((record) => {
    const disposition = dispositionFor(record, coverageMap);
    const licenseClaims = record.recordProjection.publisherLicenseClaims;
    const duplicate = DUPLICATE_OF[record.datasetId] ?? null;
    return {
      ...record,
      disposition,
      worktreeCoverage: coverageMap.get(record.datasetId) ?? {
        kind: "NONE", evidenceFileCount: 0, evidenceRoot: null,
      },
      duplicateEvidence: duplicate === null ? null : {
        comparedTo: duplicate,
        exactFirst400NormalizedDescriptionBytes: true,
        exactSortedTagVector: true,
        payloadByteIdentityEstablished: false,
      },
      rights: {
        publisherLicenseClaims: licenseClaims,
        licenseClaimPresent: licenseClaims.length > 0,
        publicAvailabilityTreatedAsUseAuthorization: false,
        useSpecificRightsIndependentlyAdjudicated: false,
        cardClaimTreatedAsTrainingAuthorization: false,
        redistributionAuthorizedByThisLedger: false,
        commercialUseAuthorizedByThisLedger: false,
        authorizedTrainingRows: 0,
      },
      privacy: {
        noPiiOrSensitiveDataGuaranteed: false,
        independentPrivacyReviewPerformed: false,
        rawPayloadBytesAcquiredByThisLedger: 0,
        rawVisualBytesAcquiredByThisLedger: 0,
        imageOrMultimodalTagPresent:
          record.recordProjection.modalityTags.includes("modality:image"),
      },
      activeContent: {
        untrustedAgentTrajectoryOrFailureContentPossible: true,
        toolCodeOrCommandSignalInSearchRecord:
          record.recordProjection.evidenceFlags.publisherMentionsToolCodeOrCommand,
        rawPayloadBytesAcquiredByThisLedger: 0,
        payloadExecuted: false,
        safeToExecuteEstablished: false,
      },
      outcomeBoundary: {
        publisherNativeOutcomeRowsReplayedByThisLedger: 0,
        independentlyVerifiedOutcomeRows: 0,
        publisherNativeRecoveryRowsReplayedByThisLedger: 0,
        independentlyVerifiedRecoveryRows: 0,
        completeAttemptCensusEstablished: false,
        searchRecordKeywordIsNotPayloadFieldEvidence: true,
      },
      useBoundary: {
        authorizedTrainingRows: 0, offlineTrainingRows: 0,
        productionTrainingRows: 0, networkAdmissionRows: 0,
        authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
      },
    };
  });
  for (const entry of entries.filter((item) => item.duplicateEvidence)) {
    const source = entries.find((item) => item.datasetId
      === entry.duplicateEvidence.comparedTo);
    if (!source
      || entry.recordProjection.normalizedDescriptionPrefixSha256
        !== source.recordProjection.normalizedDescriptionPrefixSha256
      || !same(entry.recordProjection.tags, source.recordProjection.tags)) {
      fail("MIRROR_FINGERPRINT_INVALID", entry.datasetId);
    }
  }
  const counts = Object.fromEntries(sorted(new Set(entries.map((entry) =>
    entry.disposition.code))).map((code) => [code,
    entries.filter((entry) => entry.disposition.code === code).length]));
  if (!same(counts, {
    ALREADY_ACQUIRED_CURRENT_WORKTREE: 17,
    DUPLICATE_OR_MIRROR: 2,
    GATED_NO_BYPASS: 8,
    METADATA_ONLY: 41,
    PENDING_PRIORITY_ACQUISITION: 20,
    SYNTHETIC_TRAINING_ONLY_NO_OUTCOME: 4,
  }) || entries.some((entry) => entry.disposition.terminal !== true)) {
    fail("DISPOSITION_PROFILE_INVALID", JSON.stringify(counts));
  }
  const ledgerHash = digest(LEDGER_DOMAIN, entries);
  return { entries, counts, ledgerHash };
}

export function buildHfAgentFailureTrajectoryArtifactFromSourceDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const manifestBodyValue = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...manifestBodyValue,
    manifestHash: digest(MANIFEST_DOMAIN, manifestBodyValue) });
  const storedManifest = readPrivate(collected.root, "source-manifest.json");
  if (!serialize(sourceManifest).equals(storedManifest)) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const ledger = buildCandidateLedger(collected.records, collected.coverage);
  const priorityQueue = ledger.entries
    .filter((entry) => entry.disposition.code === "PENDING_PRIORITY_ACQUISITION")
    .sort((left, right) => right.disposition.priorityScore
      - left.disposition.priorityScore
      || left.datasetId.localeCompare(right.datasetId))
    .map((entry, index) => ({ rank: index + 1, datasetId: entry.datasetId,
      revision: entry.observedRevision,
      priorityScore: entry.disposition.priorityScore,
      reasonCode: entry.disposition.reasonCode,
      gated: entry.access.gated,
      publisherLicenseClaims: entry.rights.publisherLicenseClaims,
      payloadBytesAcquiredByThisLedger: 0,
    }));
  const licenseClaimCounts = {};
  for (const entry of ledger.entries) {
    const claims = entry.rights.publisherLicenseClaims.length === 0
      ? ["UNDECLARED"] : entry.rights.publisherLicenseClaims;
    for (const claim of claims) licenseClaimCounts[claim] =
      (licenseClaimCounts[claim] ?? 0) + 1;
  }
  const reportBody = {
    schema: HF_AGENT_FAILURE_TRAJECTORY_LEDGER_SCHEMA,
    disposition: HF_AGENT_FAILURE_TRAJECTORY_DISPOSITION,
    scope: {
      kind: HF_AGENT_FAILURE_TRAJECTORY_SCOPE,
      provider: "Hugging Face official datasets search API",
      exactQueries: collected.querySummaries.map((query) => ({
        key: query.key, term: query.term, full: true, limit: 1_000,
        records: query.records,
      })),
      queryResultRows: 92, unionDatasetRecords: 92,
      payloadFilesAcquiredByThisLedger: 0,
      payloadBytesAcquiredByThisLedger: 0,
      terminalMeansSearchRecordDispositionNotPayloadExhaustion: true,
    },
    source: {
      queryBeforeAfterExact: true,
      querySummaries: collected.querySummaries,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: sha256(storedManifest),
      sourceRoot: sourceManifest.sourceRoot,
      coverageSnapshotHash: collected.coverage.snapshotHash,
      rawSearchJsonPrivate: true,
      rawDescriptionsProjectedIntoReport: false,
      downloadedDescriptionsTagsOrPayloadsExecuted: false,
    },
    discovery: {
      declaredScopeExhausted: true,
      globalExhaustion: false,
      sourceUniverseExhausted: false,
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      unionDatasetRecords: 92, terminalDatasetRecords: 92,
      publicRecords: 92, publicUngatedRecords: 84,
      gatedRecords: 8,
      gatedAutoRecords: ledger.entries.filter((entry) =>
        entry.access.gated === "auto").length,
      gatedManualRecords: ledger.entries.filter((entry) =>
        entry.access.gated === "manual").length,
      privateRecords: 0, disabledRecords: 0,
      dispositionCounts: ledger.counts,
      terminalDefinition:
        "ONE_TERMINAL_DISCOVERY_DISPOSITION_PER PINNED SEARCH RECORD; PENDING PRIORITY MEANS QUEUED FOR A SEPARATE PAYLOAD ACQUISITION",
    },
    worktreeCoverage: {
      snapshotKind: collected.coverage.scanScope,
      evidenceGroups: collected.coverage.evidence.length,
      alreadyAcquiredDatasetRecords: 17,
      metadataOnlyExistingDatasetRecords: 1,
      existingAdaptersModifiedByThisLedger: false,
      coverageSnapshotHash: collected.coverage.snapshotHash,
    },
    candidateLedger: {
      entries: ledger.entries, ledgerHash: ledger.ledgerHash,
      rawDescriptionProjectionRows: 0,
      rawPayloadProjectionRows: 0,
    },
    priorityQueue: {
      entries: priorityQueue,
      queuedDatasetRecords: priorityQueue.length,
      payloadDownloadsPerformedByThisLedger: 0,
      queueOrderBoundToPinnedRecordProjectionAndExplicitPolicy: true,
    },
    rights: {
      publisherLicenseClaimCounts: Object.fromEntries(Object.entries(
        licenseClaimCounts).sort(([left], [right]) => left.localeCompare(right))),
      licenseClaimsArePublisherMetadataNotLegalConclusions: true,
      useSpecificRightsIndependentlyAdjudicatedRows: 0,
      authorizedTrainingRows: 0,
      redistributionAuthorizedRows: 0,
      commercialUseAuthorizedRows: 0,
    },
    privacy: {
      noPiiOrSensitiveDataGuaranteedRows: 0,
      independentPrivacyReviewRows: 0,
      rawPayloadBytesAcquiredByThisLedger: 0,
      rawVisualBytesAcquiredByThisLedger: 0,
      publicAvailabilityDoesNotResolvePrivacy: true,
    },
    activeContent: {
      candidatesTreatedAsPotentiallyActiveOrAdversarial: 92,
      payloadsExecuted: 0, commandsExecuted: 0,
      networkActionsReplayed: 0, rawPayloadBytesAcquired: 0,
      safeToExecuteEstablishedRows: 0,
    },
    outcomeBoundary: {
      publisherNativeOutcomeRowsReplayed: 0,
      independentlyVerifiedOutcomeRows: 0,
      publisherNativeRecoveryRowsReplayed: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeAttemptCensusEstablished: false,
      searchMetadataSignalsPromotedToPayloadFacts: false,
    },
    boundary: {
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createHfAgentFailureTrajectoryReceipt(report, reportBytes,
  manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: HF_AGENT_FAILURE_TRAJECTORY_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: HF_AGENT_FAILURE_TRAJECTORY_SCOPE,
    unionDatasetRecords: 92, terminalDatasetRecords: 92,
    declaredScopeExhausted: true, globalExhaustion: false,
    sourceUniverseExhausted: false,
    priorityQueueRecords: report.priorityQueue.queuedDatasetRecords,
    payloadBytesAcquiredByThisLedger: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyHfAgentFailureTrajectoryArtifactDirectory(directory) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readPrivate(root, "report.json");
    const receiptBytes = readPrivate(root, "run-receipt.json");
    const built = buildHfAgentFailureTrajectoryArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!reportBytes.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestBytes = readPrivate(root, "source/source-manifest.json");
    const receipt = createHfAgentFailureTrajectoryReceipt(
      built.report, expectedReport, manifestBytes);
    if (!receiptBytes.equals(serialize(receipt))) fail("RECEIPT_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeHfAgentFailureTrajectoryArtifact(value) {
  return serialize(value);
}
