/*
 * DeepSeek Harness -> Outsider observation adapter.
 *
 * This is deliberately not an actuator.  DeepSeek Harness is a patchable
 * execution plane; its durable SessionEvent log is valuable Way evidence, but
 * an in-process plugin cannot independently attest the world it belongs to.
 * This adapter therefore emits privacy-safe, content-addressed observations
 * and explicitly establishes neither delivery nor Outsider causal effect.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const DEEPSEEK_HARNESS_PIN = Object.freeze({
  repository: "https://github.com/deepseek-ai/deepseek-harness",
  commit: "47f943859bef60e4160492346772ded9b24f765a",
  sessionFormatVersion: 0,
});

const digest = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;

/** Privacy-safe identity of one exact Harness tool action. */
export function deepSeekHarnessActionRef(name, rawArguments) {
  if (typeof name !== "string" || !name || typeof rawArguments !== "string") {
    throw new Error("DEEPSEEK_HARNESS_ACTION_INVALID");
  }
  return digest({ name, argumentsHash: digest(rawArguments) });
}

const UNDERSTOOD_TYPES = new Set([
  "agent/inbox/spliced", "approval/asked", "approval/decided", "approval/policy",
  "assistant/chunk", "assistant/message", "command/run", "command/done",
  "compaction/start", "compaction/end", "compaction/prune", "compaction/summary",
  "feedback/record", "goal/change", "hook/invoked", "hook/result", "llm/retry",
  "llm/retry-started", "permission/preset", "plan/mode", "request/context",
  "request/header", "sandbox/mode", "schedule/change", "step/start", "step/end",
  "tool/call", "tool/result", "tool/code-dispatch", "tool/code-dispatch-start",
  "tool-workflow/agent-start", "tool-workflow/agent-end",
  "tool-workflow/run-start", "tool-workflow/run-end", "turn/start", "turn/end",
  "user/message",
]);

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function eventsFrom(input) {
  if (Array.isArray(input)) return input;
  if (plain(input) && Array.isArray(input.events)) return input.events;
  throw new Error("DEEPSEEK_HARNESS_SESSION_EVENTS_REQUIRED");
}

function resultBlock(event) {
  const blocks = event?.data?.message?.content;
  if (!Array.isArray(blocks)) return null;
  const results = blocks.filter((block) => plain(block) && block.type === "tool-result");
  return results.length === 1 ? results[0] : null;
}

function tokenUsage(event) {
  const usage = event?.data?.usage;
  if (!plain(usage)) return null;
  const keys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
    "reasoningTokens"];
  const out = {};
  for (const key of keys) {
    if (usage[key] == null) continue;
    if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) return null;
    out[key] = usage[key];
  }
  return Number.isSafeInteger(out.inputTokens) && Number.isSafeInteger(out.outputTokens)
    ? out : null;
}

function addUsage(total, usage) {
  if (!usage) return;
  for (const [key, value] of Object.entries(usage)) total[key] = (total[key] ?? 0) + value;
}

function inspect(input) {
  const events = eventsFrom(input);
  const errors = [];
  const unrecognizedRequired = [];
  const calls = new Map();
  const results = new Map();
  const hooks = new Map();
  const tokenTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    cacheWriteTokens: 0, reasoningTokens: 0 };
  const refs = [];
  const counts = {};
  let previousSeq = -1;
  let previousTime = -1;

  for (const event of events) {
    if (!plain(event) || typeof event.type !== "string" || !Number.isSafeInteger(event.seq)
      || event.seq < 0 || !Number.isFinite(event.time) || !plain(event.data)) {
      errors.push("INVALID_SESSION_EVENT_ENVELOPE");
      continue;
    }
    if (event.seq <= previousSeq) errors.push(`NON_MONOTONIC_SEQ:${event.seq}`);
    if (event.time < previousTime) errors.push(`NON_MONOTONIC_TIME:${event.seq}`);
    previousSeq = Math.max(previousSeq, event.seq);
    previousTime = Math.max(previousTime, event.time);
    if (Array.isArray(event.sourceEventSeqs)
      && event.sourceEventSeqs.some((seq) => !Number.isSafeInteger(seq) || seq >= event.seq)) {
      errors.push(`INVALID_SOURCE_EVENT_REFERENCE:${event.seq}`);
    }
    if (!UNDERSTOOD_TYPES.has(event.type) && event.ignorable !== true) {
      unrecognizedRequired.push({ seq: event.seq, type: event.type });
    }
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    const eventHash = digest(event);
    refs.push({ seq: event.seq, time: event.time, type: event.type, eventHash,
      understood: UNDERSTOOD_TYPES.has(event.type), ignorable: event.ignorable === true });

    if (event.type === "tool/call") {
      const { callId, name, arguments: rawArguments } = event.data;
      if (typeof callId !== "string" || typeof name !== "string"
        || typeof rawArguments !== "string" || calls.has(callId)) {
        errors.push(`INVALID_OR_DUPLICATE_TOOL_CALL:${event.seq}`);
      } else calls.set(callId, { callIdHash: digest(callId), callSeq: event.seq,
        name, argumentsHash: digest(rawArguments),
        actionRef: deepSeekHarnessActionRef(name, rawArguments),
        resultSeq: null, isError: null });
    }
    if (event.type === "tool/result") {
      const block = resultBlock(event);
      const callId = block?.toolCallId;
      if (!block || typeof callId !== "string" || results.has(callId)) {
        errors.push(`INVALID_OR_DUPLICATE_TOOL_RESULT:${event.seq}`);
      } else {
        results.set(callId, event.seq);
        const call = calls.get(callId);
        if (!call || call.callSeq >= event.seq) errors.push(`ORPHAN_TOOL_RESULT:${event.seq}`);
        else {
          call.resultSeq = event.seq;
          call.isError = block.isError === true || Boolean(event.data.error);
          call.resultHash = digest(block);
        }
      }
    }
    if (event.type === "hook/invoked") {
      const id = event.data.handlerId;
      if (typeof id !== "string" || hooks.has(id)) errors.push(`INVALID_HOOK_INVOKED:${event.seq}`);
      else hooks.set(id, { handlerIdHash: digest(id), point: event.data.point,
        dialect: event.data.dialect, invokedSeq: event.seq, resultSeq: null });
    }
    if (event.type === "hook/result") {
      const hook = hooks.get(event.data.handlerId);
      if (!hook || hook.resultSeq !== null || hook.invokedSeq >= event.seq) {
        errors.push(`ORPHAN_HOOK_RESULT:${event.seq}`);
      } else {
        hook.resultSeq = event.seq;
        hook.decision = event.data.decision;
        hook.exitCode = event.data.exitCode ?? null;
        hook.durationMs = event.data.durationMs;
      }
    }
    if (event.type === "assistant/message") {
      const usage = tokenUsage(event);
      if (event.data.usage != null && !usage) errors.push(`INVALID_TOKEN_USAGE:${event.seq}`);
      addUsage(tokenTotals, usage);
    }
  }
  for (const call of calls.values()) {
    if (call.resultSeq === null) errors.push(`UNSETTLED_TOOL_CALL:${call.callSeq}`);
  }
  for (const hook of hooks.values()) {
    if (hook.resultSeq === null) errors.push(`UNSETTLED_HOOK:${hook.invokedSeq}`);
  }
  return { events, refs, counts, calls: [...calls.values()], hooks: [...hooks.values()],
    tokenTotals, errors: [...new Set(errors)], unrecognizedRequired };
}

export function createDeepSeekHarnessObservation(input, {
  sessionId = null,
  repositoryCommit = DEEPSEEK_HARNESS_PIN.commit,
} = {}) {
  const inspected = inspect(input);
  if (repositoryCommit !== DEEPSEEK_HARNESS_PIN.commit) {
    throw new Error("DEEPSEEK_HARNESS_COMMIT_NOT_PINNED");
  }
  const complete = inspected.errors.length === 0
    && inspected.unrecognizedRequired.length === 0;
  const startedAt = inspected.refs[0]?.time ?? null;
  const endedAt = inspected.refs.at(-1)?.time ?? null;
  const body = {
    schema: "outsider/deepseek-harness-observation/v1",
    adapterVersion: 1,
    source: { ...DEEPSEEK_HARNESS_PIN, repositoryCommit,
      sessionIdHash: sessionId == null ? null : digest(String(sessionId)),
      eventLogHash: digest(inspected.events) },
    authority: { mode: "OBSERVATION_ONLY", executionPlane: "deepseek-harness",
      establishesDelivery: false, establishesOutsiderCausalContribution: false,
      establishesLossOrLiability: false },
    integrity: { complete, errors: inspected.errors,
      unrecognizedRequired: inspected.unrecognizedRequired },
    capacity: { observedOnly: true, eventCount: inspected.refs.length,
      durationMs: startedAt == null || endedAt == null ? null : endedAt - startedAt,
      turnsStarted: inspected.counts["turn/start"] ?? 0,
      turnsEnded: inspected.counts["turn/end"] ?? 0,
      stepsStarted: inspected.counts["step/start"] ?? 0,
      stepsEnded: inspected.counts["step/end"] ?? 0,
      toolCalls: inspected.calls.length,
      toolErrors: inspected.calls.filter((call) => call.isError === true).length,
      hookInvocations: inspected.hooks.length,
      hookBlocks: inspected.hooks.filter((hook) => hook.decision !== "pass").length,
      llmRetries: inspected.counts["llm/retry"] ?? 0,
      compactions: inspected.counts["compaction/summary"] ?? 0,
      tokenUsage: inspected.tokenTotals },
    toolPairs: inspected.calls,
    hookPairs: inspected.hooks,
    eventRefs: inspected.refs,
    learning: { eligibleForDeliveryLearning: false,
      eligibleForCorrectionEffectLearning: false,
      reason: "host execution evidence only; no frozen Outsider contract or sealed causal proof" },
  };
  return { ...body, recordHash: digest(body) };
}

export function verifyDeepSeekHarnessObservation(record) {
  if (!plain(record) || record.schema !== "outsider/deepseek-harness-observation/v1") {
    return { ok: false, error: "DEEPSEEK_HARNESS_OBSERVATION_SCHEMA_INVALID" };
  }
  const { recordHash, ...body } = record;
  if (recordHash !== digest(body)) {
    return { ok: false, error: "DEEPSEEK_HARNESS_OBSERVATION_HASH_INVALID" };
  }
  if (record.source?.repositoryCommit !== DEEPSEEK_HARNESS_PIN.commit
    || record.authority?.mode !== "OBSERVATION_ONLY"
    || record.authority?.establishesDelivery !== false
    || record.authority?.establishesOutsiderCausalContribution !== false
    || record.learning?.eligibleForCorrectionEffectLearning !== false) {
    return { ok: false, error: "DEEPSEEK_HARNESS_OBSERVATION_AUTHORITY_INVALID" };
  }
  if (!Array.isArray(record.toolPairs) || record.toolPairs.some((pair) =>
    pair?.actionRef !== digest({ name: pair?.name, argumentsHash: pair?.argumentsHash })
    || !Number.isSafeInteger(pair?.callSeq)
    || !Number.isSafeInteger(pair?.resultSeq) || pair.resultSeq <= pair.callSeq)) {
    return { ok: false, error: "DEEPSEEK_HARNESS_TOOL_PAIR_INVALID" };
  }
  return { ok: true, recordHash };
}
