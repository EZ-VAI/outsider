/*
 * Public agent evidence, acquisition wave 2.
 *
 * These adapters preserve benchmark-native observations while refusing to
 * reinterpret reward, safety labels, API spend, or simulated consequences as
 * economic loss, causal experience, liability, pricing, or settlement facts.
 */

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { PUBLIC_AGENT_SCHEMAS, publicAgentDigest } from "./outsider-public-agent-corpus.js";
import { readPinnedPublicAgentSourceSnapshot }
  from "./outsider-public-agent-artifacts.js";

export const PUBLIC_AGENT_WAVE2_SCHEMAS = Object.freeze({
  manifest: "outsider/public-agent-wave2-acquisition-manifest/v1",
  summary: "outsider/public-agent-wave2-effect-summary/v1",
  verification: "outsider/public-agent-wave2-full-source-verification/v1",
  candidateDecision: "outsider/public-agent-wave2-candidate-decision/v1",
});

// A replay timestamp is part of the manifest commitment.  Keep the canonical
// research artifact reproducible instead of silently minting a new manifest on
// every verification run.
export const PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT =
  "2026-08-21T00:00:00.000Z";

export const PUBLIC_AGENT_WAVE2_PINS = Object.freeze({
  atbenchCodex: Object.freeze({
    id: "AI45Research/ATBench-Codex",
    revision: "0991350e2f7ad174fae5fb8f7b6f5ec5a171a609",
    licenseId: "Apache-2.0",
    sourceClass: "synthetic-codex-safety-benchmark",
    dataPath: "atbench-codex/test.json",
    upstreamPath: "test.json",
    records: 500,
    gitBlobOid: "99d791d3c189aeb2847995f97384ba1c761d7322",
  }),
  atbenchClaw: Object.freeze({
    id: "AI45Research/ATBench-Claw",
    revision: "75f70f4bfd8305e33e22006e1e6eeb668684d3f2",
    licenseId: "Apache-2.0",
    sourceClass: "generated-openclaw-safety-benchmark",
    dataPath: "atbench-claw/test.json",
    upstreamPath: "test.json",
    records: 500,
    gitBlobOid: "19bfd300c3aa2875cbdf6ab1d1fb7586af725e51",
    lfsOid: "bc04db0db900fd63ac4c59ba651584be2dc8dbd51861c98ffeb21f13c9495c8b",
  }),
  tau2Airline: Object.freeze({
    id: "sierra-research/tau2-bench",
    revision: "a2c024725189473d2d7cea3a5cfdbcc67478e41f",
    declaredRunRevision: "c30d59aaa71c65f9b9eb6a8f8636b48945028fcf",
    licenseId: "MIT",
    sourceClass: "simulated-dual-control-agent-benchmark",
    dataPath: "tau2-bench/results.json",
    upstreamPath:
      "data/tau2/results/final/o4-mini-2025-04-16_airline_default_gpt-4.1-2025-04-14_4trials.json",
    records: 200,
    gitBlobOid: "83f3a42988689f8dd1c02c2b4dd7119b2af438a8",
  }),
  matmAlfworld: Object.freeze({
    id: "kimdanny/matm",
    revision: "2fb906b1a572f9ced0177741dee44be70ef1223c",
    licenseId: "Apache-2.0",
    sourceClass: "population-agent-environment-benchmark",
    dataPath: "matm/results.json",
    upstreamPath:
      "traj_retrieval/preprocess/no_retrieval_runs/alfworld_no_retrieval_runs_results.json",
    records: 274,
    gitBlobOid: "484c2e8db5f532ecc02f51fbfb022efe985b01e9",
  }),
});

const SOURCE_OBJECT_PINS = Object.freeze({
  "atbench-codex/repository-revision.json": Object.freeze({ sizeBytes: 1779,
    sha256: "sha256:7553c26877042dfbad94a451bbf66ecdb4772e0555cc99a27ee0aecc07fbe290" }),
  "atbench-codex/repository-tree.json": Object.freeze({ sizeBytes: 2899,
    sha256: "sha256:2f2b7cfe41a7184fa6eeac443c878b7d1bb3656736bcbff4c88b819806832e06" }),
  "atbench-codex/README.md": Object.freeze({ sizeBytes: 11270,
    sha256: "sha256:ceb25843fb6704a4d5520c7292960819c8b7a760c1e81605b927173196e0f8b7" }),
  "atbench-codex/test.json": Object.freeze({ sizeBytes: 9963081,
    sha256: "sha256:b402a8b6b7fdeea20f0acb1e5b88308307c74e003c1724fde7290496ff12970f" }),
  "atbench-claw/repository-revision.json": Object.freeze({ sizeBytes: 1783,
    sha256: "sha256:ae8861bdb716b7726bdf18ff948f6892f9370213a5dd665ef0668e890e1387d0" }),
  "atbench-claw/repository-tree.json": Object.freeze({ sizeBytes: 3345,
    sha256: "sha256:807a22a27f0fa08a522a6b66fa01a4ce9bb28affd68a40b447caabf5f2801cd0" }),
  "atbench-claw/README.md": Object.freeze({ sizeBytes: 10111,
    sha256: "sha256:76ebef91b01587f7912763474bf441a51f3807ee7631eb7f7af6dbe995358d26" }),
  "atbench-claw/test.json": Object.freeze({ sizeBytes: 10236802,
    sha256: "sha256:bc04db0db900fd63ac4c59ba651584be2dc8dbd51861c98ffeb21f13c9495c8b" }),
  "tau2-bench/repository-commit.json": Object.freeze({ sizeBytes: 13841,
    sha256: "sha256:baf5dae3e0fb245a9a89f742514510913596ea2646cba1212824853f8819d4ba" }),
  "tau2-bench/repository-tree.json": Object.freeze({ sizeBytes: 601930,
    sha256: "sha256:98d421d87f0069ae913b220f1f556d7a9854aa0fd155d5de279afc34277a4b14" }),
  "tau2-bench/README.md": Object.freeze({ sizeBytes: 10443,
    sha256: "sha256:ed39688aa5d40bd73007355df65f4e41a6c250960642e56764c3ad44da1df8d2" }),
  "tau2-bench/LICENSE": Object.freeze({ sizeBytes: 1072,
    sha256: "sha256:e67c5aa0074dfcaefd3c3a1aedb94cb539234aecd15d5a972574e3200e6252fe" }),
  "tau2-bench/results.json": Object.freeze({ sizeBytes: 7599444,
    sha256: "sha256:6a3a354c9bce42b52905af096e9cea6f555548acbb17b567fd403c356df7b4ec" }),
  "matm/repository-commit.json": Object.freeze({ sizeBytes: 954,
    sha256: "sha256:9cbcdc40b201d075ef4736142685f09c3356f7dc61371558165a99fa4631d4fb" }),
  "matm/repository-tree.json": Object.freeze({ sizeBytes: 45878,
    sha256: "sha256:c24d6cc7a438589042b5777c0b4aa0ef33da182036b91abc51d28ebf9e283a81" }),
  "matm/README.md": Object.freeze({ sizeBytes: 25677,
    sha256: "sha256:4af4595bc82cbc5f649959805398380d72481b44cc28510f5eba92d1ff56e274" }),
  "matm/LICENSE": Object.freeze({ sizeBytes: 11394,
    sha256: "sha256:d85fd829c236347c5e1febbf2ba844f706dd34e4a3ca4c43b9b1e5fa1667fadf" }),
  "matm/results.json": Object.freeze({ sizeBytes: 2156135,
    sha256: "sha256:d4f9d4f20b47cd45ea61fad17c6ea7fe95bdd3f3d03443351ba518b56e811615" }),
});

export const PUBLIC_AGENT_WAVE2_SOURCE_OBJECT_PINS = SOURCE_OBJECT_PINS;

const DEFERRED_CANDIDATE_OBJECT_PINS = Object.freeze({
  "candidates/cuaverifierbench/repository-revision.json": Object.freeze({ sizeBytes: 2369,
    sha256: "sha256:59380ef8cf06f191dc9a988602f4c0c3d0f5907d7708ac450fd8b3b860aebc6f" }),
  "candidates/cuaverifierbench/repository-tree.json": Object.freeze({ sizeBytes: 6969,
    sha256: "sha256:8bc921727df28b0d89f2625e1f7e813d592761acf717f00792e19523f51aa395" }),
  "candidates/cuaverifierbench/README.md": Object.freeze({ sizeBytes: 10080,
    sha256: "sha256:44d7190b72ae489297f59d6fadff635ced6dd067c845c77b04f187a7b2d7bec7" }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const PINS_BY_ID = new Map(Object.values(PUBLIC_AGENT_WAVE2_PINS)
  .map((pin) => [pin.id, pin]));

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function plain(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function parseJson(snapshot, code) {
  try { return JSON.parse(snapshot.bytes.toString("utf8")); }
  catch (error) { fail(code, error instanceof Error ? error.message : String(error)); }
}

function boundary() {
  return {
    disposition: "QUARANTINED_RESEARCH_ONLY",
    economicLossObserved: false,
    lossMinorUnits: null,
    currency: null,
    exposureDenominatorObserved: false,
    automaticTraining: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function datasetRevisionRoot(pin) {
  return publicAgentDigest({ id: pin.id, revision: pin.revision },
    "outsider/public-agent/dataset-revision-root/v1");
}

function root(value, domain) {
  return value == null || value === "" ? null : publicAgentDigest(value, domain);
}

function rootsFor(pin, { episode, task = null, instruction = null, setup = null,
  model = null, repository = null, session = null, collector = null }) {
  const roots = {
    datasetRevisionRoot: datasetRevisionRoot(pin),
    repositoryRoot: root(repository == null ? null : { dataset: pin.id, repository },
      "outsider/public-agent/repository-root/v1"),
    taskRoot: root(task == null ? null : { dataset: pin.id, task },
      "outsider/public-agent/task-root/v1"),
    instructionRoot: root(instruction == null ? null : { dataset: pin.id, instruction },
      "outsider/public-agent/instruction-root/v1"),
    episodeRoot: publicAgentDigest({ dataset: pin.id, episode },
      "outsider/public-agent/episode-root/v1"),
    userRoot: root(collector == null ? null : { dataset: pin.id, collector },
      "outsider/public-agent/collector-root/v1"),
    sessionRoot: root(session == null ? null : { dataset: pin.id, session },
      "outsider/public-agent/session-root/v1"),
    setupRoot: root(setup == null ? null : { dataset: pin.id, setup },
      "outsider/public-agent/setup-root/v1"),
    modelRoot: root(model == null ? null : { dataset: pin.id, model },
      "outsider/public-agent/model-root/v1"),
  };
  const correlationRoots = [roots.repositoryRoot, roots.taskRoot, roots.instructionRoot,
    roots.userRoot, roots.sessionRoot, roots.setupRoot, roots.modelRoot]
    .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).sort();
  return { ...roots,
    correlationRoots: correlationRoots.length > 0 ? correlationRoots
      : [roots.datasetRevisionRoot] };
}

function durationMs(events) {
  const times = events.map((event) => Date.parse(event?.timestamp ?? ""))
    .filter(Number.isFinite).sort((a, b) => a - b);
  return times.length > 1 ? Math.max(0, times.at(-1) - times[0]) : null;
}

function finiteNonnegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function integerNonnegative(value, fallback = 0) {
  const number = finiteNonnegative(value, fallback);
  return Number.isSafeInteger(number) ? number : fallback;
}

function contentCommitment(value) {
  return publicAgentDigest(value, "outsider/public-agent-wave2/source-row/v1");
}

function makeRecord(pin, { nativeId, sourceObjectHash, roots, episode, labels,
  detectorOutputs }) {
  const body = {
    schema: PUBLIC_AGENT_SCHEMAS.record,
    schemaVersion: "1.0.0",
    dataset: { sourceClass: pin.sourceClass, id: pin.id, revision: pin.revision,
      licenseId: pin.licenseId, sourceObjectHash },
    roots,
    episode: { nativeIdHash: publicAgentDigest(String(nativeId),
      "outsider/public-agent/native-id/v1"), ...episode },
    labels: { ...labels, economicLossObserved: false, lossMinorUnits: null,
      currency: null },
    detectorOutputs,
    privacy: { rawContentIncluded: false,
      projection: "counts-labels-and-content-commitments-only" },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    recordHash: publicAgentDigest(body, PUBLIC_AGENT_SCHEMAS.record) });
}

function firstCodexModel(row) {
  return row.codex_rollout.find((event) => event?.type === "turn_context")?.payload?.model
    ?? "synthetic-codex-model-unspecified";
}

function structuredCodexOutputError(output) {
  if (typeof output !== "string") return false;
  try {
    const parsed = JSON.parse(output);
    return parsed?.status === "error" || parsed?.status === "failed"
      || parsed?.ok === false || parsed?.success === false;
  } catch { return false; }
}

export function normalizeAtbenchCodexRow(row, { rowIndex, sourceObjectHash }) {
  const pin = PUBLIC_AGENT_WAVE2_PINS.atbenchCodex;
  if (!plain(row) || !Number.isSafeInteger(row.id) || !Array.isArray(row.conversation)
    || !Array.isArray(row.codex_rollout) || typeof row.is_safe !== "boolean"
    || row.output_format !== "codex_rollout" || !Number.isSafeInteger(rowIndex)) {
    fail("PUBLIC_AGENT_WAVE2_CODEX_ROW_INVALID");
  }
  const calls = row.codex_rollout.filter((event) => event?.type === "response_item"
    && event?.payload?.type === "function_call");
  const outputs = row.codex_rollout.filter((event) => event?.type === "response_item"
    && event?.payload?.type === "function_call_output");
  const sessionMeta = row.codex_rollout.find((event) => event?.type === "session_meta")?.payload;
  const nativeId = String(row.id);
  const instruction = row.conversation.find((turn) => turn?.role === "user")?.content ?? null;
  const defense = row.defense_type == null ? null : String(row.defense_type);
  return makeRecord(pin, { nativeId, sourceObjectHash,
    roots: rootsFor(pin, { episode: nativeId, task: `case:${nativeId}`,
      instruction, setup: "ATBench shared synthetic Codex generation pipeline",
      model: firstCodexModel(row), session: sessionMeta?.id ?? null }),
    episode: { stepCount: row.codex_rollout.length, toolCallCount: calls.length,
      toolResultCount: outputs.length,
      errorCount: outputs.filter((event) => structuredCodexOutputError(event.payload.output)).length,
      userTurnCount: row.conversation.filter((turn) => turn?.role === "user").length,
      agentTurnCount: row.conversation.filter((turn) => turn?.role === "assistant").length,
      durationMs: durationMs(row.codex_rollout) },
    labels: { nativeOutcomeKind: "synthetic-benchmark-safety-verdict",
      nativeOutcomeValue: row.is_safe,
      provenance: "dataset-supplied-synthetic-benchmark-annotation",
      independentAdjudication: false, preferenceOnly: false, benchmarkResolvedOnly: true },
    detectorOutputs: { sourceRowContentHash: contentCommitment(row),
      nativeRiskSourceHash: contentCommitment(String(row.risk_source ?? "")),
      nativeFailureModeHash: contentCommitment(String(row.failure_mode ?? "")),
      nativeHarmTypeHash: contentCommitment(String(row.harm_type ?? "")),
      nativeDefenseTypeHash: defense == null ? null : contentCommitment(defense),
      structuredToolErrorCount: outputs.filter((event) =>
        structuredCodexOutputError(event.payload.output)).length,
      generatorDeclaredSynthetic: sessionMeta?.cli_version === "synthetic"
        && sessionMeta?.base_instructions
          === "Synthetic Codex rollout generated from ATBench trajectory." },
  });
}

function clawMessage(event) { return plain(event?.message) ? event.message : null; }

export function normalizeAtbenchClawRow(row, { rowIndex, sourceObjectHash }) {
  const pin = PUBLIC_AGENT_WAVE2_PINS.atbenchClaw;
  if (!plain(row) || !plain(row.trajectory) || !Array.isArray(row.trajectory.events)
    || !plain(row.labels) || typeof row.labels.is_safe !== "boolean"
    || !Number.isSafeInteger(rowIndex)) fail("PUBLIC_AGENT_WAVE2_CLAW_ROW_INVALID");
  const events = row.trajectory.events;
  const messages = events.map(clawMessage).filter(Boolean);
  const toolCalls = messages.flatMap((message) => Array.isArray(message.content)
    ? message.content.filter((item) => item?.type === "toolCall") : []);
  const toolResults = messages.filter((message) => message.role === "toolResult");
  const userMessage = messages.find((message) => message.role === "user");
  const nativeId = `row:${rowIndex}`;
  const defense = row.labels.defense_type == null ? null : String(row.labels.defense_type);
  return makeRecord(pin, { nativeId, sourceObjectHash,
    roots: rootsFor(pin, { episode: nativeId, task: nativeId,
      instruction: userMessage?.content ?? null,
      setup: "ATBench shared generated OpenClaw benchmark pipeline",
      model: row.trajectory.modelId || "generated-openclaw-model-unspecified" }),
    episode: { stepCount: events.length, toolCallCount: toolCalls.length,
      toolResultCount: toolResults.length,
      errorCount: toolResults.filter((message) => message.isError === true).length,
      userTurnCount: messages.filter((message) => message.role === "user").length,
      agentTurnCount: messages.filter((message) => message.role === "assistant").length,
      durationMs: durationMs(events) },
    labels: { nativeOutcomeKind: "generated-benchmark-safety-verdict",
      nativeOutcomeValue: row.labels.is_safe,
      provenance: "dataset-supplied-generated-benchmark-annotation",
      independentAdjudication: false, preferenceOnly: false, benchmarkResolvedOnly: true },
    detectorOutputs: { sourceRowContentHash: contentCommitment(row),
      nativeRiskSourceHash: contentCommitment(String(row.labels.risk_source ?? "")),
      nativeFailureModeHash: contentCommitment(String(row.labels.failure_mode ?? "")),
      nativeHarmTypeHash: contentCommitment(String(row.labels.harm_type ?? "")),
      nativeDefenseTypeHash: defense == null ? null : contentCommitment(defense),
      structuredToolErrorCount: toolResults.filter((message) => message.isError === true).length,
      generatorDeclaredSynthetic: null },
  });
}

export function normalizeTau2Simulation(row, { rowIndex, sourceObjectHash, runInfo }) {
  const pin = PUBLIC_AGENT_WAVE2_PINS.tau2Airline;
  if (!plain(row) || typeof row.id !== "string" || typeof row.task_id !== "string"
    || !Array.isArray(row.messages) || !plain(row.reward_info)
    || ![0, 1].includes(row.reward_info.reward) || !Number.isSafeInteger(rowIndex)) {
    fail("PUBLIC_AGENT_WAVE2_TAU2_ROW_INVALID");
  }
  const toolCalls = row.messages.flatMap((message) => Array.isArray(message?.tool_calls)
    ? message.tool_calls : []);
  const toolResults = row.messages.filter((message) => message?.role === "tool");
  const errors = toolResults.filter((message) => message.error === true).length;
  const successful = row.reward_info.reward === 1;
  return makeRecord(pin, { nativeId: row.id, sourceObjectHash,
    roots: rootsFor(pin, { episode: row.id, task: row.task_id,
      instruction: `tau2-airline-task:${row.task_id}`,
      setup: `tau2:${runInfo.domain}:dual-control:${runInfo.userModel}`,
      model: runInfo.agentModel, session: `trial-of-task:${row.task_id}` }),
    episode: { stepCount: row.messages.length, toolCallCount: toolCalls.length,
      toolResultCount: toolResults.length, errorCount: errors,
      userTurnCount: row.messages.filter((message) => message?.role === "user").length,
      agentTurnCount: row.messages.filter((message) => message?.role === "assistant").length,
      durationMs: Math.max(0, Math.round(finiteNonnegative(row.duration) * 1000)) },
    labels: { nativeOutcomeKind: "benchmark-harness-reward",
      nativeOutcomeValue: successful,
      provenance: "official-benchmark-harness-mixed-checks",
      independentAdjudication: false, preferenceOnly: false, benchmarkResolvedOnly: true },
    detectorOutputs: { sourceRowContentHash: contentCommitment(row),
      nativeReward: row.reward_info.reward,
      nativeAgentApiCostUsd: finiteNonnegative(row.agent_cost),
      nativeUserSimulatorApiCostUsd: finiteNonnegative(row.user_cost),
      nativeTerminationReasonHash: contentCommitment(String(row.termination_reason ?? "")),
      structuredToolErrorCount: errors,
      errorThenBenchmarkSuccess: errors > 0 && successful },
  });
}

function matmOutcome(row) {
  if (typeof row.success === "boolean") return row.success;
  if (typeof row.done === "boolean") return row.done;
  if (typeof row.isCompleted === "boolean") return row.isCompleted;
  if (Array.isArray(row.actionSequences)) {
    const last = row.actionSequences.at(-1);
    if (typeof last?.isCompleted === "boolean") return last.isCompleted;
    if (Number.isFinite(last?.score)) return Number(last.score) >= 1;
  }
  return null;
}

export function normalizeMatmAlfworldRow(row, { rowIndex, sourceObjectHash }) {
  const pin = PUBLIC_AGENT_WAVE2_PINS.matmAlfworld;
  const steps = row?.actionSequences ?? row?.trajectory;
  if (!plain(row) || !Array.isArray(steps) || steps.length < 1
    || !Number.isSafeInteger(rowIndex)) fail("PUBLIC_AGENT_WAVE2_MATM_ROW_INVALID");
  const outcome = matmOutcome(row);
  const task = String(row.variation_id ?? row.task_id ?? `row:${rowIndex}`);
  const nativeId = String(row.trajectory_id ?? `${task}:${rowIndex}`);
  return makeRecord(pin, { nativeId, sourceObjectHash,
    roots: rootsFor(pin, { episode: nativeId, task,
      instruction: row.taskDescription ?? row.goal ?? null,
      setup: `MATM:ALFWorld:${row.retrieval_strategy ?? "no_retrieval"}`,
      model: row.model ?? row.cohort ?? "MATM-release-model-unspecified" }),
    episode: { stepCount: steps.length, toolCallCount: steps.length,
      toolResultCount: steps.filter((step) => step?.observation != null).length,
      errorCount: steps.filter((step) => step?.isError === true).length,
      userTurnCount: 1, agentTurnCount: steps.length, durationMs: null },
    labels: { nativeOutcomeKind: "benchmark-environment-success",
      nativeOutcomeValue: outcome,
      provenance: "official-population-agent-benchmark-export",
      independentAdjudication: false, preferenceOnly: false, benchmarkResolvedOnly: true },
    detectorOutputs: { sourceRowContentHash: contentCommitment(row),
      nativeFinalScore: Number.isFinite(row.final_score) ? Number(row.final_score)
        : Number.isFinite(row.finalScore) ? Number(row.finalScore)
        : Number.isFinite(steps.at(-1)?.score) ? Number(steps.at(-1).score) : null,
      nativeRetrievalStrategyHash: contentCommitment(String(
        row.retrieval_strategy ?? "no_retrieval")),
      structuredEnvironmentErrorCount: steps.filter((step) => step?.isError === true).length },
  });
}

function acquiredObject(path, snapshot) {
  return { path, sizeBytes: snapshot.object.sizeBytes, sha256: snapshot.object.sha256 };
}

function readPinned(sourceDirectory, path) {
  const pin = SOURCE_OBJECT_PINS[path];
  if (!pin) fail("PUBLIC_AGENT_WAVE2_SOURCE_PIN_MISSING", path);
  return readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, path), pin,
    "PUBLIC_AGENT_WAVE2_SOURCE_SNAPSHOT_MISMATCH");
}

function readDeferredCandidatePinned(sourceDirectory, path) {
  const pin = DEFERRED_CANDIDATE_OBJECT_PINS[path];
  if (!pin) fail("PUBLIC_AGENT_WAVE2_CANDIDATE_PIN_MISSING", path);
  return readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, path), pin,
    "PUBLIC_AGENT_WAVE2_CANDIDATE_SNAPSHOT_MISMATCH");
}

function requireExactFiles(sourceDirectory, directory, names) {
  const actual = readdirSync(join(sourceDirectory, directory)).sort();
  if (!same(actual, [...names].sort())) fail("PUBLIC_AGENT_WAVE2_SOURCE_FILE_SET_MISMATCH",
    directory);
}

function hfSource(sourceDirectory, pin, directory) {
  requireExactFiles(sourceDirectory, directory,
    ["README.md", "repository-revision.json", "repository-tree.json", "test.json"]);
  const paths = {
    metadata: `${directory}/repository-revision.json`,
    tree: `${directory}/repository-tree.json`, readme: `${directory}/README.md`,
    data: `${directory}/test.json`,
  };
  const snapshots = Object.fromEntries(Object.entries(paths)
    .map(([name, path]) => [name, readPinned(sourceDirectory, path)]));
  const metadata = parseJson(snapshots.metadata, "PUBLIC_AGENT_WAVE2_HF_METADATA_INVALID");
  const tree = parseJson(snapshots.tree, "PUBLIC_AGENT_WAVE2_HF_TREE_INVALID");
  const readme = snapshots.readme.bytes.toString("utf8");
  const dataEntry = tree.find((entry) => entry?.path === pin.upstreamPath);
  const readmeEntry = tree.find((entry) => entry?.path === "README.md");
  if (metadata.id !== pin.id || metadata.sha !== pin.revision
    || String(metadata.cardData?.license).toLowerCase() !== pin.licenseId.toLowerCase()
    || !Array.isArray(metadata.siblings)
    || !metadata.siblings.some((entry) => entry.rfilename === pin.upstreamPath)
    || !Array.isArray(tree) || dataEntry?.oid !== pin.gitBlobOid
    || dataEntry?.size !== snapshots.data.object.sizeBytes
    || readmeEntry?.size !== snapshots.readme.object.sizeBytes
    || !/^license:\s*apache-2\.0\s*$/mi.test(readme)) {
    fail("PUBLIC_AGENT_WAVE2_HF_REVISION_OR_LICENSE_MISMATCH", pin.id);
  }
  if (pin.lfsOid != null) {
    if (dataEntry?.lfs?.oid !== pin.lfsOid
      || snapshots.data.object.sha256 !== `sha256:${pin.lfsOid}`) {
      fail("PUBLIC_AGENT_WAVE2_HF_LFS_BINDING_MISMATCH", pin.id);
    }
  } else if (gitBlobOid(snapshots.data.bytes) !== pin.gitBlobOid) {
    fail("PUBLIC_AGENT_WAVE2_HF_GIT_BLOB_MISMATCH", pin.id);
  }
  const rows = parseJson(snapshots.data, "PUBLIC_AGENT_WAVE2_HF_DATA_INVALID");
  if (!Array.isArray(rows) || rows.length !== pin.records) {
    fail("PUBLIC_AGENT_WAVE2_HF_DATA_COUNT_MISMATCH", pin.id);
  }
  return { snapshots, paths, rows };
}

function githubSource(sourceDirectory, pin, directory) {
  requireExactFiles(sourceDirectory, directory,
    ["LICENSE", "README.md", "repository-commit.json", "repository-tree.json", "results.json"]);
  const paths = { metadata: `${directory}/repository-commit.json`,
    tree: `${directory}/repository-tree.json`, readme: `${directory}/README.md`,
    license: `${directory}/LICENSE`, data: `${directory}/results.json` };
  const snapshots = Object.fromEntries(Object.entries(paths)
    .map(([name, path]) => [name, readPinned(sourceDirectory, path)]));
  const metadata = parseJson(snapshots.metadata, "PUBLIC_AGENT_WAVE2_GITHUB_METADATA_INVALID");
  const tree = parseJson(snapshots.tree, "PUBLIC_AGENT_WAVE2_GITHUB_TREE_INVALID");
  const dataEntry = tree.tree?.find((entry) => entry?.path === pin.upstreamPath);
  const readmeEntry = tree.tree?.find((entry) => entry?.path === "README.md");
  const licenseEntry = tree.tree?.find((entry) => entry?.path === "LICENSE");
  const declaredTree = metadata.commit?.tree?.sha ?? metadata.tree?.sha;
  if (metadata.sha !== pin.revision || tree.truncated !== false
    || ![pin.revision, declaredTree].includes(tree.sha)
    || dataEntry?.sha !== pin.gitBlobOid || dataEntry?.size !== snapshots.data.object.sizeBytes
    || readmeEntry?.size !== snapshots.readme.object.sizeBytes
    || licenseEntry?.size !== snapshots.license.object.sizeBytes
    || gitBlobOid(snapshots.data.bytes) !== pin.gitBlobOid
    || gitBlobOid(snapshots.readme.bytes) !== readmeEntry.sha
    || gitBlobOid(snapshots.license.bytes) !== licenseEntry.sha) {
    fail("PUBLIC_AGENT_WAVE2_GITHUB_REVISION_BINDING_MISMATCH", pin.id);
  }
  const license = snapshots.license.bytes.toString("utf8");
  if (pin.licenseId === "MIT" && !/MIT License/.test(license)
    || pin.licenseId === "Apache-2.0" && !/Apache License[\s\S]*Version 2\.0/.test(license)) {
    fail("PUBLIC_AGENT_WAVE2_GITHUB_LICENSE_MISMATCH", pin.id);
  }
  return { snapshots, paths,
    data: parseJson(snapshots.data, "PUBLIC_AGENT_WAVE2_GITHUB_DATA_INVALID") };
}

function frozenCuaVerifierCandidate(sourceDirectory) {
  const directory = "candidates/cuaverifierbench";
  requireExactFiles(sourceDirectory, directory,
    ["README.md", "repository-revision.json", "repository-tree.json"]);
  const paths = { metadata: `${directory}/repository-revision.json`,
    tree: `${directory}/repository-tree.json`, readme: `${directory}/README.md` };
  const snapshots = Object.fromEntries(Object.entries(paths).map(([name, path]) =>
    [name, readDeferredCandidatePinned(sourceDirectory, path)]));
  const metadata = parseJson(snapshots.metadata,
    "PUBLIC_AGENT_WAVE2_CUA_METADATA_INVALID");
  const tree = parseJson(snapshots.tree, "PUBLIC_AGENT_WAVE2_CUA_TREE_INVALID");
  const revision = "c19eb323cd802add5c3d2840ff13044061364867";
  const trajectoryEntries = tree.filter((entry) =>
    entry?.type === "file" && entry.path.startsWith("trajectories/"));
  const annotationEntries = tree.filter((entry) =>
    entry?.type === "file" && entry.path.startsWith("annotations/"));
  const trajectoryBytes = trajectoryEntries.reduce((sum, entry) => sum + entry.size, 0);
  const annotationBytes = annotationEntries.reduce((sum, entry) => sum + entry.size, 0);
  if (metadata.id !== "microsoft/CUAVerifierBench" || metadata.sha !== revision
    || String(metadata.cardData?.license).toLowerCase() !== "mit"
    || trajectoryEntries.length !== 4 || annotationEntries.length !== 2
    || trajectoryBytes !== 1_502_516_810 || annotationBytes !== 93_382
    || !/MIT License/i.test(snapshots.readme.bytes.toString("utf8"))) {
    fail("PUBLIC_AGENT_WAVE2_CUA_METADATA_MISMATCH");
  }
  return Object.freeze({ datasetId: metadata.id, revision, licenseId: "MIT",
    trajectoryObjects: trajectoryEntries.length, trajectoryBytes,
    annotationObjects: annotationEntries.length, annotationBytes,
    decision: "DEFER_OVERSIZE_TRAJECTORY_OBJECTS",
    reason: "Structured trajectory shards include screenshots and exceed the 64 MiB wave cap",
    internalSplitIndependentPublicDomainClaimed: false,
    verifierOutputsTreatedAsGroundTruth: false,
    acquiredObjects: Object.entries(paths).map(([name, path]) => ({ path,
      ...snapshots[name].object })).sort((left, right) => left.path.localeCompare(right.path)) });
}

function sourceManifestEntry(pin, acquired, paths, sampling, limitations = []) {
  return {
    id: pin.id, revision: pin.revision, sourceClass: pin.sourceClass,
    upstreamObject: { path: pin.upstreamPath,
      sizeBytes: acquired[paths.data].sizeBytes, sha256: acquired[paths.data].sha256,
      gitBlobOid: pin.gitBlobOid },
    license: { identifier: pin.licenseId, adapterGrantsRights: false,
      legalConclusion: false, declarationObjectPaths: [paths.metadata,
        paths.license ?? paths.readme].sort() },
    sampling,
    provenanceProof: {
      byteIdentity: { status: "FULL_SELECTED_UPSTREAM_OBJECT_BYTES_VERIFIED",
        objectPaths: [paths.data] },
      revisionBinding: { status: "PINNED_REPOSITORY_TREE_OBJECT_BINDING",
        cryptographicInclusionProof: true, objectPaths: [paths.metadata, paths.tree] },
      licenseDeclaration: { status: "PINNED_DECLARATION_BYTES_VERIFIED",
        legalConclusion: false,
        objectPaths: [paths.metadata, paths.license ?? paths.readme].sort() },
    },
    acquiredObjects: Object.entries(acquired).map(([path, object]) => ({ path, ...object }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    limitations,
  };
}

function sealManifest(generatedAt, sources) {
  const body = {
    schema: PUBLIC_AGENT_WAVE2_SCHEMAS.manifest, schemaVersion: "1.0.0", generatedAt,
    generatedAtEvidence: { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false },
    sources: [...sources].sort((left, right) => left.id.localeCompare(right.id)),
    interpretation: {
      selectedByMarginalInformationNotLabelPerformance: true,
      nativeBenchmarkLabelsOnly: true,
      causalEffectClaimed: false,
      economicLossRows: 0,
      pricingEligibleRows: 0,
      automaticTrainingPromotion: false,
    },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    manifestHash: publicAgentDigest(body, PUBLIC_AGENT_WAVE2_SCHEMAS.manifest) });
}

function recordSet(records, manifest) {
  const hashes = records.map((record) => {
    if (!verifyPublicAgentWave2Record(record).ok) {
      fail("PUBLIC_AGENT_WAVE2_RECORD_SET_RECORD_INVALID");
    }
    const source = manifest.sources.find((entry) => entry.id === record.dataset.id);
    if (!source?.acquiredObjects.some((object) =>
      object.sha256 === record.dataset.sourceObjectHash)) {
      fail("PUBLIC_AGENT_WAVE2_RECORD_SET_SOURCE_BINDING_INVALID");
    }
    return record.recordHash;
  }).sort();
  if (new Set(hashes).size !== hashes.length) {
    fail("PUBLIC_AGENT_WAVE2_RECORD_SET_DUPLICATED_RECORD");
  }
  const counts = Object.fromEntries([...PINS_BY_ID.keys()].sort().map((id) =>
    [id, records.filter((record) => record.dataset.id === id).length]));
  const body = { manifestHash: manifest.manifestHash, records: records.length, counts,
    recordHashes: hashes };
  return Object.freeze({ ...body, recordSetHash: publicAgentDigest(body,
    "outsider/public-agent-wave2-record-set/v1") });
}

function pearson(rows, feature) {
  const pairs = rows.filter((row) => typeof row.labels.nativeOutcomeValue === "boolean")
    .map((row) => [Number(feature(row)), row.labels.nativeOutcomeValue ? 1 : 0])
    .filter(([x]) => Number.isFinite(x));
  if (pairs.length < 2) return null;
  const meanX = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let numerator = 0; let denominatorX = 0; let denominatorY = 0;
  for (const [x, y] of pairs) {
    numerator += (x - meanX) * (y - meanY);
    denominatorX += (x - meanX) ** 2;
    denominatorY += (y - meanY) ** 2;
  }
  return denominatorX > 0 && denominatorY > 0
    ? numerator / Math.sqrt(denominatorX * denominatorY) : null;
}

function components(records) {
  const parents = new Map(records.map((record) => [record.recordHash, record.recordHash]));
  const rootOwner = new Map();
  const find = (value) => {
    let current = value;
    while (parents.get(current) !== current) current = parents.get(current);
    let cursor = value;
    while (parents.get(cursor) !== cursor) {
      const next = parents.get(cursor); parents.set(cursor, current); cursor = next;
    }
    return current;
  };
  const union = (left, right) => {
    const a = find(left); const b = find(right); if (a !== b) parents.set(b, a);
  };
  for (const record of records) {
    for (const correlationRoot of record.roots.correlationRoots) {
      const owner = rootOwner.get(correlationRoot);
      if (owner) union(record.recordHash, owner); else rootOwner.set(correlationRoot, record.recordHash);
    }
  }
  return new Set(records.map((record) => find(record.recordHash))).size;
}

function summarize(records, manifest, set) {
  const datasets = Object.fromEntries([...PINS_BY_ID.keys()].sort().map((id) => {
    const rows = records.filter((record) => record.dataset.id === id);
    const trueRows = rows.filter((row) => row.labels.nativeOutcomeValue === true);
    const falseRows = rows.filter((row) => row.labels.nativeOutcomeValue === false);
    const sum = (fn) => rows.reduce((total, row) => total + finiteNonnegative(fn(row)), 0);
    return [id, { records: rows.length,
      nativeOutcomeCounts: { false: falseRows.length, true: trueRows.length,
        null: rows.length - falseRows.length - trueRows.length },
      meanSteps: rows.length ? sum((row) => row.episode.stepCount) / rows.length : null,
      meanToolCalls: rows.length ? sum((row) => row.episode.toolCallCount) / rows.length : null,
      meanStructuredErrors: rows.length ? sum((row) => row.episode.errorCount) / rows.length : null,
      correlationComponents: components(rows),
      descriptiveAssociations: {
        nativeOutcomeVsStepsPearson: pearson(rows, (row) => row.episode.stepCount),
        nativeOutcomeVsToolCallsPearson: pearson(rows, (row) => row.episode.toolCallCount),
        nativeOutcomeVsStructuredErrorsPearson: pearson(rows, (row) => row.episode.errorCount),
      },
    }];
  }));
  const tauRows = records.filter((record) =>
    record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id);
  const body = {
    schema: PUBLIC_AGENT_WAVE2_SCHEMAS.summary, schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash, recordSetHash: set.recordSetHash,
    records: records.length, sourceRows: records.length,
    correlationComponents: components(records), datasets,
    benchmarkRuntimeSpend: {
      datasetId: PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id,
      agentApiCostUsd: tauRows.reduce((sum, row) =>
        sum + row.detectorOutputs.nativeAgentApiCostUsd, 0),
      userSimulatorApiCostUsd: tauRows.reduce((sum, row) =>
        sum + row.detectorOutputs.nativeUserSimulatorApiCostUsd, 0),
      interpretation: "OBSERVED_BENCHMARK_MODEL_API_SPEND_NOT_ECONOMIC_LOSS",
    },
    interpretation: {
      design: "descriptive-association-only",
      syntheticOrSimulatedBenchmarkRows: records.filter((record) =>
        record.dataset.id !== PUBLIC_AGENT_WAVE2_PINS.matmAlfworld.id).length,
      independentHumanAdjudicationEstablished: false,
      causalEffectClaimed: false, discriminationClaimed: false,
      calibrationClaimed: false, economicLossRows: 0, causalExperienceUnits: 0,
      pricingEligibleRows: 0, automaticTraining: false,
    },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    summaryHash: publicAgentDigest(body, PUBLIC_AGENT_WAVE2_SCHEMAS.summary) });
}

export function buildPublicAgentWave2CandidateDecision({ frozenCandidateEvidence = [] } = {}) {
  const body = {
    schema: PUBLIC_AGENT_WAVE2_SCHEMAS.candidateDecision, schemaVersion: "1.0.0",
    orderingPrinciple: "MARGINAL_INFORMATION_NOT_SCALE",
    candidates: [
      { rank: 1, id: "AI45Research/ATBench-Codex", decision: "INGEST_FULL_OBJECT",
        marginalInformation: "Codex-native action-risk taxonomy and structured tool rollouts",
        evidenceUrl: "https://huggingface.co/datasets/AI45Research/ATBench-Codex",
        limitation: "Synthetic generated benchmark; labels are not real incidents or loss" },
      { rank: 2, id: "sierra-research/tau2-bench", decision: "INGEST_FULL_PINNED_RUN",
        marginalInformation: "Dual-control agent-user tool trajectories, outcome and API spend",
        evidenceUrl: "https://github.com/sierra-research/tau2-bench",
        limitation: "Simulated benchmark; reward and spend are not economic loss" },
      { rank: 3, id: "kimdanny/matm", decision: "INGEST_FULL_JSON_RESULT_OBJECT",
        marginalInformation: "Population-agent embodied-environment action/observation outcomes",
        evidenceUrl: "https://github.com/kimdanny/matm",
        limitation: "Benchmark population evidence; no randomized retrieval-effect claim" },
      { rank: 4, id: "AI45Research/ATBench-Claw", decision: "INGEST_FULL_OBJECT",
        marginalInformation: "Stateful OpenClaw tools, approvals and defense annotations",
        evidenceUrl: "https://huggingface.co/datasets/AI45Research/ATBench-Claw",
        limitation: "Generated benchmark; annotation independence not established" },
      { rank: 5, id: "microsoft/CUAVerifierBench", decision: "DEFER_OVERSIZE",
        marginalInformation: "Human outcome/process labels paired with verifier outputs",
        evidenceUrl: "https://huggingface.co/datasets/microsoft/CUAVerifierBench",
        limitation: "Trajectory shards total 1,502,516,810 bytes including screenshots; verifier output is never ground truth" },
      { rank: 6, id: "trace-commons/agent-traces", decision: "DEFER",
        marginalInformation: "Organic cross-harness sessions",
        evidenceUrl: "https://huggingface.co/datasets/trace-commons/agent-traces",
        limitation: "Current release is nearly all Claude, has no outcome, and content-license/PII caveats" },
      { rank: 7, id: "ScaleAI/MCP-Atlas", decision: "DEFER_REFERENCE_ONLY",
        marginalInformation: "Real MCP server task and reference-tool coverage",
        evidenceUrl: "https://huggingface.co/datasets/ScaleAI/MCP-Atlas",
        limitation: "Public dataset supplies tasks/reference expectations, not executed agent outcomes" },
      { rank: 8, id: "nebius/SWE-rebench-openhands-trajectories",
        decision: "DEFER_ALREADY_REPRESENTED",
        marginalInformation: "More coding trajectories from an already integrated source",
        evidenceUrl: "https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories",
        limitation: "Full object exceeds 2 GiB and adds less category breadth than selected sources" },
      { rank: 9, id: "cx-cmu/agent_trajectories", decision: "REJECT_UNTIL_LICENSE_DECLARED",
        marginalInformation: "8,653 multi-model trajectories across six benchmarks",
        evidenceUrl: "https://huggingface.co/datasets/cx-cmu/agent_trajectories",
        limitation: "Repository is gated and currently declares no dataset license" },
      { rank: 10, id: "JohnSili/AgentNet", decision: "DEFER",
        marginalInformation: "Multi-agent training diagnostics",
        evidenceUrl: "https://github.com/JohnSili/AgentNet",
        limitation: "Released diagnostics add less direct action/outcome provenance than MATM" },
    ],
    frozenCandidateEvidence,
    boundary: { rankingIsResearchJudgment: true, legalConclusion: false,
      automaticTraining: false, permits: { PRICE: false, GUARANTEE: false, SETTLE: false } },
  };
  return Object.freeze({ ...body, decisionHash: publicAgentDigest(body,
    PUBLIC_AGENT_WAVE2_SCHEMAS.candidateDecision) });
}

const RECORD_FIELDS = ["schema", "schemaVersion", "dataset", "roots", "episode", "labels",
  "detectorOutputs", "privacy", "useBoundary", "recordHash"];
const ROOT_FIELDS = ["datasetRevisionRoot", "repositoryRoot", "taskRoot", "instructionRoot",
  "episodeRoot", "userRoot", "sessionRoot", "setupRoot", "modelRoot", "correlationRoots"];
const EPISODE_FIELDS = ["nativeIdHash", "stepCount", "toolCallCount", "toolResultCount",
  "errorCount", "userTurnCount", "agentTurnCount", "durationMs"];
const LABEL_FIELDS = ["nativeOutcomeKind", "nativeOutcomeValue", "provenance",
  "independentAdjudication", "preferenceOnly", "benchmarkResolvedOnly",
  "economicLossObserved", "lossMinorUnits", "currency"];

function validHashOrNull(value) { return value === null || HASH.test(value ?? ""); }

function validDetectorOutputs(record) {
  const output = record.detectorOutputs;
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchCodex.id
    || record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchClaw.id) {
    return exactKeys(output, ["sourceRowContentHash", "nativeRiskSourceHash",
      "nativeFailureModeHash", "nativeHarmTypeHash", "nativeDefenseTypeHash",
      "structuredToolErrorCount", "generatorDeclaredSynthetic"])
      && [output.sourceRowContentHash, output.nativeRiskSourceHash,
        output.nativeFailureModeHash, output.nativeHarmTypeHash].every((value) => HASH.test(value))
      && validHashOrNull(output.nativeDefenseTypeHash)
      && Number.isSafeInteger(output.structuredToolErrorCount)
      && output.structuredToolErrorCount >= 0
      && [true, false, null].includes(output.generatorDeclaredSynthetic);
  }
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id) {
    return exactKeys(output, ["sourceRowContentHash", "nativeReward", "nativeAgentApiCostUsd",
      "nativeUserSimulatorApiCostUsd", "nativeTerminationReasonHash",
      "structuredToolErrorCount", "errorThenBenchmarkSuccess"])
      && HASH.test(output.sourceRowContentHash) && HASH.test(output.nativeTerminationReasonHash)
      && [0, 1].includes(output.nativeReward)
      && [output.nativeAgentApiCostUsd, output.nativeUserSimulatorApiCostUsd]
        .every((value) => Number.isFinite(value) && value >= 0)
      && Number.isSafeInteger(output.structuredToolErrorCount)
      && output.structuredToolErrorCount >= 0
      && typeof output.errorThenBenchmarkSuccess === "boolean";
  }
  return record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.matmAlfworld.id
    && exactKeys(output, ["sourceRowContentHash", "nativeFinalScore",
      "nativeRetrievalStrategyHash", "structuredEnvironmentErrorCount"])
    && HASH.test(output.sourceRowContentHash) && HASH.test(output.nativeRetrievalStrategyHash)
    && (output.nativeFinalScore === null || Number.isFinite(output.nativeFinalScore))
    && Number.isSafeInteger(output.structuredEnvironmentErrorCount)
    && output.structuredEnvironmentErrorCount >= 0;
}

function validLabels(record) {
  const expected = record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchCodex.id
    ? ["synthetic-benchmark-safety-verdict",
      "dataset-supplied-synthetic-benchmark-annotation"]
    : record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchClaw.id
      ? ["generated-benchmark-safety-verdict",
        "dataset-supplied-generated-benchmark-annotation"]
      : record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id
        ? ["benchmark-harness-reward", "official-benchmark-harness-mixed-checks"]
        : ["benchmark-environment-success", "official-population-agent-benchmark-export"];
  return record.labels.nativeOutcomeKind === expected[0]
    && record.labels.provenance === expected[1];
}

export function verifyPublicAgentWave2Record(record) {
  try {
    const pin = PINS_BY_ID.get(record?.dataset?.id);
    if (!pin || !exactKeys(record, RECORD_FIELDS)
      || record.schema !== PUBLIC_AGENT_SCHEMAS.record || record.schemaVersion !== "1.0.0"
      || !HASH.test(record.recordHash ?? "")
      || !exactKeys(record.dataset, ["sourceClass", "id", "revision", "licenseId",
        "sourceObjectHash"])
      || record.dataset.sourceClass !== pin.sourceClass || record.dataset.revision !== pin.revision
      || record.dataset.licenseId !== pin.licenseId || !HASH.test(record.dataset.sourceObjectHash)
      || record.dataset.sourceObjectHash !== SOURCE_OBJECT_PINS[pin.dataPath]?.sha256
      || !exactKeys(record.roots, ROOT_FIELDS)
      || record.roots.datasetRevisionRoot !== datasetRevisionRoot(pin)
      || !HASH.test(record.roots.episodeRoot ?? "")
      || ROOT_FIELDS.filter((field) => field.endsWith("Root"))
        .some((field) => record.roots[field] !== null && !HASH.test(record.roots[field] ?? ""))
      || !Array.isArray(record.roots.correlationRoots)
      || !same(record.roots.correlationRoots,
        [record.roots.repositoryRoot, record.roots.taskRoot, record.roots.instructionRoot,
          record.roots.userRoot, record.roots.sessionRoot, record.roots.setupRoot,
          record.roots.modelRoot].filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index).sort())
      || record.roots.correlationRoots.length < 1
      || record.roots.correlationRoots.some((value) => !HASH.test(value))
      || !exactKeys(record.episode, EPISODE_FIELDS)
      || !HASH.test(record.episode.nativeIdHash ?? "")
      || !Number.isSafeInteger(record.episode.stepCount) || record.episode.stepCount < 1
      || ["toolCallCount", "toolResultCount", "errorCount", "userTurnCount", "agentTurnCount"]
        .some((field) => !Number.isSafeInteger(record.episode[field])
          || record.episode[field] < 0)
      || record.episode.durationMs !== null
        && (!Number.isSafeInteger(record.episode.durationMs) || record.episode.durationMs < 0)
      || !exactKeys(record.labels, LABEL_FIELDS)
      || ![true, false, null].includes(record.labels.nativeOutcomeValue)
      || record.labels.independentAdjudication !== false
      || record.labels.preferenceOnly !== false || record.labels.benchmarkResolvedOnly !== true
      || record.labels.economicLossObserved !== false || record.labels.lossMinorUnits !== null
      || record.labels.currency !== null
      || !validLabels(record)
      || !exactKeys(record.privacy, ["rawContentIncluded", "projection"])
      || !same(record.privacy, { rawContentIncluded: false,
        projection: "counts-labels-and-content-commitments-only" })
      || !same(record.useBoundary, boundary()) || !validDetectorOutputs(record)) {
      return Object.freeze({ ok: false, error: "PUBLIC_AGENT_WAVE2_RECORD_INVALID" });
    }
    const { recordHash, ...body } = record;
    if (publicAgentDigest(body, PUBLIC_AGENT_SCHEMAS.record) !== recordHash) {
      return Object.freeze({ ok: false, error: "PUBLIC_AGENT_WAVE2_RECORD_HASH_INVALID" });
    }
    return Object.freeze({ ok: true, recordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave2Manifest(manifest) {
  try {
    if (!plain(manifest) || manifest.schema !== PUBLIC_AGENT_WAVE2_SCHEMAS.manifest
      || manifest.schemaVersion !== "1.0.0" || !HASH.test(manifest.manifestHash ?? "")
      || typeof manifest.generatedAt !== "string"
      || new Date(manifest.generatedAt).toISOString() !== manifest.generatedAt
      || !Array.isArray(manifest.sources) || manifest.sources.length !== PINS_BY_ID.size
      || !same(manifest.generatedAtEvidence,
        { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false })
      || !same(manifest.interpretation, {
        selectedByMarginalInformationNotLabelPerformance: true,
        nativeBenchmarkLabelsOnly: true, causalEffectClaimed: false,
        economicLossRows: 0, pricingEligibleRows: 0, automaticTrainingPromotion: false })
      || !same(manifest.useBoundary, boundary())) return Object.freeze({ ok: false });
    const seen = new Set();
    for (const source of manifest.sources) {
      const pin = PINS_BY_ID.get(source?.id);
      const directory = pin?.dataPath.split("/")[0];
      const expectedObjects = Object.entries(SOURCE_OBJECT_PINS)
        .filter(([path]) => path.startsWith(`${directory}/`))
        .map(([path, object]) => ({ path, ...object }))
        .sort((left, right) => left.path.localeCompare(right.path));
      if (!pin || seen.has(pin.id)
        || !exactKeys(source, ["id", "revision", "sourceClass", "upstreamObject", "license",
          "sampling", "provenanceProof", "acquiredObjects", "limitations"])
        || source.revision !== pin.revision || source.sourceClass !== pin.sourceClass
        || !same(source.upstreamObject, { path: pin.upstreamPath,
          sizeBytes: SOURCE_OBJECT_PINS[pin.dataPath].sizeBytes,
          sha256: SOURCE_OBJECT_PINS[pin.dataPath].sha256, gitBlobOid: pin.gitBlobOid })
        || !same(source.acquiredObjects, expectedObjects)
        || !exactKeys(source.license, ["identifier", "adapterGrantsRights", "legalConclusion",
          "declarationObjectPaths"])
        || source.license.identifier !== pin.licenseId
        || source.license.adapterGrantsRights !== false || source.license.legalConclusion !== false
        || !plain(source.sampling) || !plain(source.provenanceProof)
        || !Array.isArray(source.limitations) || source.limitations.length < 1) {
        return Object.freeze({ ok: false });
      }
      const acquiredPaths = new Set(source.acquiredObjects.map((object) => object.path));
      const proofPaths = [source.provenanceProof?.byteIdentity?.objectPaths,
        source.provenanceProof?.revisionBinding?.objectPaths,
        source.provenanceProof?.licenseDeclaration?.objectPaths].flat();
      if (proofPaths.some((path) => !acquiredPaths.has(path))) return Object.freeze({ ok: false });
      seen.add(pin.id);
    }
    if (seen.size !== PINS_BY_ID.size) return Object.freeze({ ok: false });
    const { manifestHash, ...body } = manifest;
    return Object.freeze({ ok: publicAgentDigest(body, PUBLIC_AGENT_WAVE2_SCHEMAS.manifest)
      === manifestHash, manifestHash });
  } catch { return Object.freeze({ ok: false }); }
}

export function verifyPublicAgentWave2RecordSet(records, { manifest }) {
  try {
    if (!Array.isArray(records) || records.length < 1
      || !verifyPublicAgentWave2Manifest(manifest).ok) return Object.freeze({ ok: false });
    const rebuilt = recordSet(records, manifest);
    return Object.freeze({ ok: true, ...rebuilt });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave2Source(sourceDirectory, { generatedAt = null } = {}) {
  const codex = hfSource(sourceDirectory, PUBLIC_AGENT_WAVE2_PINS.atbenchCodex,
    "atbench-codex");
  const claw = hfSource(sourceDirectory, PUBLIC_AGENT_WAVE2_PINS.atbenchClaw,
    "atbench-claw");
  const tau = githubSource(sourceDirectory, PUBLIC_AGENT_WAVE2_PINS.tau2Airline,
    "tau2-bench");
  const matm = githubSource(sourceDirectory, PUBLIC_AGENT_WAVE2_PINS.matmAlfworld, "matm");
  const cuaCandidate = frozenCuaVerifierCandidate(sourceDirectory);

  if (!plain(tau.data) || !Array.isArray(tau.data.simulations)
    || tau.data.simulations.length !== PUBLIC_AGENT_WAVE2_PINS.tau2Airline.records
    || tau.data.info?.git_commit !== PUBLIC_AGENT_WAVE2_PINS.tau2Airline.declaredRunRevision
    || tau.data.info?.agent_info?.llm !== "o4-mini-2025-04-16"
    || tau.data.info?.user_info?.llm !== "gpt-4.1-2025-04-14"
    || tau.data.info?.environment_info?.domain_name !== "airline") {
    fail("PUBLIC_AGENT_WAVE2_TAU2_RUN_SHAPE_INVALID");
  }
  if (!Array.isArray(matm.data)
    || matm.data.length !== PUBLIC_AGENT_WAVE2_PINS.matmAlfworld.records) {
    fail("PUBLIC_AGENT_WAVE2_MATM_RUN_SHAPE_INVALID");
  }

  const sources = [
    [PUBLIC_AGENT_WAVE2_PINS.atbenchCodex, codex,
      { kind: "complete-upstream-object", rows: codex.rows.length },
      ["All rollout metadata declares a synthetic Codex CLI.",
        "Dataset annotations are not independent incident adjudications."]],
    [PUBLIC_AGENT_WAVE2_PINS.atbenchClaw, claw,
      { kind: "complete-upstream-object", rows: claw.rows.length },
      ["The shared generation pipeline is benchmark evidence, not organic OpenClaw telemetry.",
        "Dataset annotations are not independent incident adjudications."]],
    [PUBLIC_AGENT_WAVE2_PINS.tau2Airline, tau,
      { kind: "complete-selected-result-object",
        rule: "smallest complete non-Claude airline four-trial result in pinned official final tree",
        rows: tau.data.simulations.length },
      ["The result file self-declares a run commit that is not an execution attestation.",
        "Reward mixes benchmark checks and is not an economic outcome.",
        "agent_cost and user_cost are model API spend, not loss."]],
    [PUBLIC_AGENT_WAVE2_PINS.matmAlfworld, matm,
      { kind: "complete-selected-result-object",
        rule: "smallest complete parseable population-agent result object in pinned official repo",
        rows: matm.data.length },
      ["Environment success is benchmark outcome, not real-world task loss.",
        "This no-retrieval export cannot establish retrieval causality."]],
  ].map(([pin, derived, sampling, limitations]) => {
    const acquired = Object.fromEntries(Object.entries(derived.paths).map(([name, path]) =>
      [path, derived.snapshots[name].object]));
    return sourceManifestEntry(pin, acquired, derived.paths, sampling, limitations);
  });

  const timestamp = generatedAt ?? new Date().toISOString();
  const manifest = sealManifest(timestamp, sources);
  const codexHash = codex.snapshots.data.object.sha256;
  const clawHash = claw.snapshots.data.object.sha256;
  const tauHash = tau.snapshots.data.object.sha256;
  const matmHash = matm.snapshots.data.object.sha256;
  const runInfo = { agentModel: tau.data.info.agent_info.llm,
    userModel: tau.data.info.user_info.llm,
    domain: tau.data.info.environment_info.domain_name };
  const records = [
    ...codex.rows.map((row, rowIndex) => normalizeAtbenchCodexRow(row,
      { rowIndex, sourceObjectHash: codexHash })),
    ...claw.rows.map((row, rowIndex) => normalizeAtbenchClawRow(row,
      { rowIndex, sourceObjectHash: clawHash })),
    ...tau.data.simulations.map((row, rowIndex) => normalizeTau2Simulation(row,
      { rowIndex, sourceObjectHash: tauHash, runInfo })),
    ...matm.data.map((row, rowIndex) => normalizeMatmAlfworldRow(row,
      { rowIndex, sourceObjectHash: matmHash })),
  ];
  const set = recordSet(records, manifest);
  const summary = summarize(records, manifest, set);
  const acquiredObjects = manifest.sources.flatMap((source) => source.acquiredObjects);
  const body = {
    schema: PUBLIC_AGENT_WAVE2_SCHEMAS.verification, schemaVersion: "1.0.0",
    status: "FULL_SELECTED_SOURCE_OBJECTS_REPRODUCED",
    manifestHash: manifest.manifestHash, recordSetHash: set.recordSetHash,
    summaryHash: summary.summaryHash, records: records.length,
    acquiredObjects: acquiredObjects.length,
    acquiredBytes: acquiredObjects.reduce((sum, object) => sum + object.sizeBytes, 0),
    dataObjectBytes: manifest.sources.reduce((sum, source) =>
      sum + source.upstreamObject.sizeBytes, 0),
    sourceObjectHashes: manifest.sources.map((source) => source.upstreamObject.sha256).sort(),
    trust: { byteIdentityVerified: true, pinnedRevisionTreeBound: true,
      licenseDeclarationBytesVerified: true, legalConclusion: false,
      generatedAtExternallyVerified: false },
    boundary: { causalExperienceUnits: 0, economicLossRows: 0, pricingEligibleRows: 0,
      automaticTraining: false, permits: { PRICE: false, GUARANTEE: false, SETTLE: false } },
  };
  const verification = Object.freeze({ ...body,
    verificationHash: publicAgentDigest(body, PUBLIC_AGENT_WAVE2_SCHEMAS.verification) });
  const candidateDecision = buildPublicAgentWave2CandidateDecision({
    frozenCandidateEvidence: [cuaCandidate],
  });
  return Object.freeze({ manifest, records: Object.freeze(records), recordSet: set,
    summary, candidateDecision, verification });
}
