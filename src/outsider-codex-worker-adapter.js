/* Codex rollout JSONL + native hook metadata -> Worker Adapter v1.
 *
 * Rollout parsing is real observation.  The hook schema/list probe is real
 * provider capability metadata.  Neither is, by itself, proof that a trusted
 * hook fired in a live worker.  INTERVENE remains explicitly UNSUPPORTED until
 * both metadata and a bound PreToolUse/PostToolUse/Stop event chain are replayed
 * from their source artifacts, even when the installed binary exposes every
 * lifecycle hook we need.
 */

import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";
import {
  createWorkerCapabilityHandshake, createWorkerEvent, createWorkerObservation,
  verifyWorkerObservation, workerDigest,
} from "./outsider-worker-adapter.js";

export const CODEX_HOOK_PROBE_SCHEMA = "outsider/codex-hook-capability-probe/v1";
export const CODEX_LIVE_CONFORMANCE_SCHEMA = "outsider/codex-live-hook-conformance/v1";
export const CODEX_WORKER_ADAPTER_VERSION = 1;
export const CODEX_WORKER_ADAPTER_CLOSURE_HASH = workerDigest({
  name: "outsider-codex-worker-adapter",
  version: CODEX_WORKER_ADAPTER_VERSION,
  input: "codex-rollout-jsonl",
  rawContentPolicy: "hash-only",
  callPairing: ["function_call", "custom_tool_call"],
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const EXPECTED_HOOK_EVENTS = Object.freeze([
  "preToolUse", "permissionRequest", "postToolUse", "preCompact", "postCompact",
  "sessionStart", "userPromptSubmit", "subagentStart", "subagentStop", "stop",
]);
const REQUIRED_CONTROL_EVENTS = Object.freeze(["preToolUse", "postToolUse", "stop"]);
const REQUIRED_OUTPUT_KINDS = Object.freeze(["context", "feedback", "stop"]);
const TOP_LEVEL_TYPES = new Set([
  "session_meta", "event_msg", "response_item", "world_state", "turn_context",
  "compacted", "inter_agent_communication_metadata",
]);
const RESPONSE_TYPES = new Set([
  "message", "agent_message", "reasoning", "custom_tool_call", "custom_tool_call_output",
  "function_call", "function_call_output",
]);
const EVENT_MESSAGE_TYPES = new Set([
  "agent_message", "agent_reasoning", "context_compacted", "mcp_tool_call_end",
  "patch_apply_end", "sub_agent_activity", "task_complete", "task_started",
  "thread_settings_applied", "token_count", "turn_aborted", "user_message",
  "web_search_end",
]);

const plain = (value) => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function addressed(body) { return Object.freeze({ ...body, recordHash: workerDigest(body) }); }

function sortedUnique(values) { return [...new Set(values)].sort(); }

export function createCodexHookCapabilityProbe({
  binaryVersion,
  binarySha256,
  schemaBundleHash,
  eventNames,
  outputEntryKinds,
  configuredHooks = [],
} = {}) {
  if (typeof binaryVersion !== "string" || !binaryVersion
    || !HASH.test(String(binarySha256 ?? ""))
    || !HASH.test(String(schemaBundleHash ?? ""))
    || !Array.isArray(eventNames) || !Array.isArray(outputEntryKinds)
    || !Array.isArray(configuredHooks)) {
    throw new Error("CODEX_HOOK_PROBE_INPUT_INVALID");
  }
  const events = sortedUnique(eventNames);
  const outputs = sortedUnique(outputEntryKinds);
  if (events.some((name) => !EXPECTED_HOOK_EVENTS.includes(name))
    || outputs.some((kind) => !["warning", "stop", "feedback", "context", "error"].includes(kind))) {
    throw new Error("CODEX_HOOK_PROBE_SCHEMA_VALUE_INVALID");
  }
  const hooks = configuredHooks.map((hook) => {
    if (!plain(hook) || typeof hook.eventName !== "string"
      || typeof hook.enabled !== "boolean"
      || !["managed", "untrusted", "trusted", "modified"].includes(hook.trustStatus)
      || !HASH.test(String(hook.currentHash ?? ""))) {
      throw new Error("CODEX_HOOK_METADATA_INVALID");
    }
    return { eventName: hook.eventName, enabled: hook.enabled,
      trustStatus: hook.trustStatus, currentHash: hook.currentHash };
  }).sort((a, b) => a.eventName.localeCompare(b.eventName)
    || a.currentHash.localeCompare(b.currentHash));
  const engineSupportsCandidate = REQUIRED_CONTROL_EVENTS.every((name) => events.includes(name))
    && REQUIRED_OUTPUT_KINDS.every((kind) => outputs.includes(kind));
  const requiredHooks = REQUIRED_CONTROL_EVENTS.map((eventName) =>
    hooks.find((hook) => hook.eventName === eventName));
  const installedPreToolTrusted = Boolean(requiredHooks[0]?.enabled
    && ["managed", "trusted"].includes(requiredHooks[0].trustStatus));
  const installedControlHooksTrusted = requiredHooks.every((hook) => Boolean(hook?.enabled)
    && ["managed", "trusted"].includes(hook.trustStatus));
  const installedControlHookHashes = sortedUnique(requiredHooks
    .filter(Boolean).map((hook) => hook.currentHash));
  const body = {
    schema: CODEX_HOOK_PROBE_SCHEMA,
    provider: "codex",
    binary: { version: binaryVersion, sha256: binarySha256 },
    generatedSchema: { bundleHash: schemaBundleHash, eventNames: events,
      outputEntryKinds: outputs },
    configuredHooks: hooks,
    assessment: {
      zeroModelProbe: true,
      engineSupportsControlledCandidate: engineSupportsCandidate,
      installedPreToolTrusted,
      installedControlHooksTrusted,
      installedControlHookHash: installedControlHooksTrusted
        && installedControlHookHashes.length === 1 ? installedControlHookHashes[0] : null,
      liveHookConformanceObserved: false,
      candidateControlLevel: engineSupportsCandidate
        ? "LIFECYCLE_CONTROLLED_CANDIDATE" : "UNSUPPORTED",
      claimableControlLevel: "OBSERVATION_ONLY",
    },
    authority: { bypassedHookTrust: false, invokedModel: false,
      selfAssertedUntilSourceReplay: true,
      establishesIntervention: false,
      establishesSemanticOutcome: false },
  };
  return addressed(body);
}

export function codexHookMetadataFromList(hooksList) {
  return (hooksList?.data ?? []).flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => typeof hook.command === "string" && /outsider/i.test(hook.command))
    .map((hook) => ({ eventName: hook.eventName, enabled: hook.enabled,
      trustStatus: hook.trustStatus, currentHash: hook.currentHash }));
}

export function codexHookSchemaCapabilities(schemaBytes) {
  const schema = JSON.parse(Buffer.isBuffer(schemaBytes)
    ? schemaBytes.toString("utf8") : String(schemaBytes));
  const definitions = schema.definitions ?? {};
  return { eventNames: definitions.HookEventName?.enum ?? [],
    outputEntryKinds: definitions.HookOutputEntryKind?.enum ?? [] };
}

export function verifyCodexHookCapabilityProbe(record, {
  binaryBytes = null,
  schemaBytes = null,
  hooksList = null,
} = {}) {
  if (!plain(record) || record.schema !== CODEX_HOOK_PROBE_SCHEMA) {
    return { ok: false, error: "CODEX_HOOK_PROBE_SCHEMA_INVALID" };
  }
  const { recordHash, ...body } = record;
  if (!HASH.test(String(recordHash ?? "")) || workerDigest(body) !== recordHash) {
    return { ok: false, error: "CODEX_HOOK_PROBE_HASH_INVALID" };
  }
  try {
    const rebuilt = createCodexHookCapabilityProbe({
      binaryVersion: record.binary?.version,
      binarySha256: record.binary?.sha256,
      schemaBundleHash: record.generatedSchema?.bundleHash,
      eventNames: record.generatedSchema?.eventNames,
      outputEntryKinds: record.generatedSchema?.outputEntryKinds,
      configuredHooks: record.configuredHooks,
    });
    if (rebuilt.recordHash !== record.recordHash || record.authority?.bypassedHookTrust !== false
      || record.authority?.invokedModel !== false
      || record.authority?.selfAssertedUntilSourceReplay !== true
      || record.authority?.establishesIntervention !== false) {
      throw new Error("CODEX_HOOK_PROBE_REBUILD_INVALID");
    }
    let metadataReplayed = false;
    if (binaryBytes !== null || schemaBytes !== null || hooksList !== null) {
      if (binaryBytes === null || schemaBytes === null || hooksList === null) {
        return { ok: false, error: "CODEX_HOOK_PROBE_REPLAY_SOURCES_INCOMPLETE" };
      }
      const schemaCapabilities = codexHookSchemaCapabilities(schemaBytes);
      const listedHooks = codexHookMetadataFromList(hooksList);
      const replay = createCodexHookCapabilityProbe({ binaryVersion: record.binary.version,
        binarySha256: workerDigest(binaryBytes), schemaBundleHash: workerDigest(schemaBytes),
        eventNames: schemaCapabilities.eventNames,
        outputEntryKinds: schemaCapabilities.outputEntryKinds,
        configuredHooks: listedHooks });
      if (replay.recordHash !== record.recordHash) {
        return { ok: false, error: "CODEX_HOOK_PROBE_SOURCE_REPLAY_MISMATCH" };
      }
      metadataReplayed = true;
    }
    return { ok: true, recordHash, verificationMode: metadataReplayed
      ? "FULL_LOCAL_METADATA_REPLAY" : "SELF_CHECK_ONLY", metadataReplayed,
    ...record.assessment };
  } catch (error) {
    return { ok: false, error: `CODEX_HOOK_PROBE_INVALID:${error?.message ?? error}` };
  }
}

function normalizedConformanceEvents(events) {
  if (!Array.isArray(events) || !events.length) throw new Error("CODEX_CONFORMANCE_EVENTS_REQUIRED");
  let prior = -1;
  const seen = new Set();
  return events.map((event) => {
    if (!plain(event) || !Number.isSafeInteger(event.sequence) || event.sequence <= prior
      || !["PreToolUse", "PostToolUse", "Stop"].includes(event.eventName)
      || !HASH.test(String(event.sessionIdHash ?? ""))
      || !HASH.test(String(event.hookCurrentHash ?? ""))
      || !(event.toolUseIdHash === null || HASH.test(String(event.toolUseIdHash)))
      || !(event.decision === null || ["allow", "deny"].includes(event.decision))
      || typeof event.additionalContextObserved !== "boolean"
      || typeof event.updatedInputObserved !== "boolean"
      || typeof event.stopContinuationObserved !== "boolean") {
      throw new Error("CODEX_CONFORMANCE_EVENT_INVALID");
    }
    prior = event.sequence;
    const key = `${event.eventName}:${event.sequence}`;
    if (seen.has(key)) throw new Error("CODEX_CONFORMANCE_EVENT_DUPLICATE");
    seen.add(key);
    if (event.eventName === "PreToolUse"
      && (!event.toolUseIdHash || !event.decision || event.stopContinuationObserved)) {
      throw new Error("CODEX_CONFORMANCE_PRE_TOOL_INVALID");
    }
    if (event.eventName === "PostToolUse"
      && (!event.toolUseIdHash || event.decision !== null || event.additionalContextObserved
        || event.updatedInputObserved || event.stopContinuationObserved)) {
      throw new Error("CODEX_CONFORMANCE_POST_TOOL_INVALID");
    }
    if (event.eventName === "Stop"
      && (event.toolUseIdHash !== null || event.decision !== null
        || event.additionalContextObserved || event.updatedInputObserved
        || !event.stopContinuationObserved)) throw new Error("CODEX_CONFORMANCE_STOP_INVALID");
    return { sequence: event.sequence, eventName: event.eventName,
      sessionIdHash: event.sessionIdHash, toolUseIdHash: event.toolUseIdHash,
      hookCurrentHash: event.hookCurrentHash, decision: event.decision,
      additionalContextObserved: event.additionalContextObserved,
      updatedInputObserved: event.updatedInputObserved,
      stopContinuationObserved: event.stopContinuationObserved };
  });
}

export function createCodexLiveConformance({
  binarySha256,
  schemaBundleHash,
  hookCurrentHash,
  events,
} = {}) {
  for (const [label, value] of Object.entries({ binarySha256, schemaBundleHash,
    hookCurrentHash })) if (!HASH.test(String(value ?? ""))) {
    throw new Error(`CODEX_CONFORMANCE_${label.toUpperCase()}_INVALID`);
  }
  const normalized = normalizedConformanceEvents(events);
  if (normalized.some((event) => event.hookCurrentHash !== hookCurrentHash)) {
    throw new Error("CODEX_CONFORMANCE_HOOK_HASH_DRIFT");
  }
  const sessions = sortedUnique(normalized.map((event) => event.sessionIdHash));
  const pre = normalized.filter((event) => event.eventName === "PreToolUse");
  const post = normalized.filter((event) => event.eventName === "PostToolUse");
  const stops = normalized.filter((event) => event.eventName === "Stop");
  const paired = pre.filter((event) => post.some((candidate) =>
    candidate.toolUseIdHash === event.toolUseIdHash && candidate.sequence > event.sequence));
  const orphanPost = post.some((event) => !pre.some((candidate) =>
    candidate.toolUseIdHash === event.toolUseIdHash && candidate.sequence < event.sequence));
  const unsettledAllowed = pre.some((event) => event.decision === "allow"
    && !post.some((candidate) => candidate.toolUseIdHash === event.toolUseIdHash
      && candidate.sequence > event.sequence));
  const complete = sessions.length === 1 && paired.length >= 1 && !orphanPost
    && !unsettledAllowed && stops.length === 1
    && normalized.at(-1)?.eventName === "Stop"
    && pre.some((event) => event.decision === "deny")
    && pre.some((event) => event.additionalContextObserved)
    && pre.some((event) => event.updatedInputObserved)
    && normalized.some((event) => event.eventName === "Stop"
      && event.stopContinuationObserved);
  const sourceBytes = Buffer.from(canonicalizeStrict(normalized));
  const body = {
    schema: CODEX_LIVE_CONFORMANCE_SCHEMA,
    provider: "codex",
    binarySha256,
    schemaBundleHash,
    hookCurrentHash,
    sourceSnapshotHash: workerDigest(sourceBytes),
    sourceByteLength: sourceBytes.length,
    assessment: { complete, oneSession: sessions.length === 1,
      prePostPairs: paired.length,
      orphanPostObserved: orphanPost,
      unsettledAllowedObserved: unsettledAllowed,
      denyObserved: pre.some((event) => event.decision === "deny"),
      additionalContextObserved: pre.some((event) => event.additionalContextObserved),
      updatedInputObserved: pre.some((event) => event.updatedInputObserved),
      stopContinuationObserved: normalized.some((event) => event.eventName === "Stop"
        && event.stopContinuationObserved) },
    authority: { verificationMode: "SOURCE_REPLAY_REQUIRED",
      selfReportedHostEvents: true, bypassedHookTrust: false,
      authenticatedControllerEnvelopes: false,
      establishesIntervention: false,
      establishesSemanticOutcome: false },
  };
  return addressed(body);
}

export function verifyCodexLiveConformance(record, { events = null } = {}) {
  if (!plain(record) || record.schema !== CODEX_LIVE_CONFORMANCE_SCHEMA) {
    return { ok: false, error: "CODEX_CONFORMANCE_SCHEMA_INVALID" };
  }
  const { recordHash, ...body } = record;
  if (!HASH.test(String(recordHash ?? "")) || workerDigest(body) !== recordHash) {
    return { ok: false, error: "CODEX_CONFORMANCE_HASH_INVALID" };
  }
  if (events === null) return { ok: false, error: "CODEX_CONFORMANCE_SOURCE_REPLAY_REQUIRED",
    sourceArtifactsReverified: false };
  try {
    const replay = createCodexLiveConformance({ binarySha256: record.binarySha256,
      schemaBundleHash: record.schemaBundleHash, hookCurrentHash: record.hookCurrentHash,
      events });
    if (replay.recordHash !== record.recordHash || !record.assessment.complete
      || record.authority?.bypassedHookTrust !== false
      || record.authority?.selfReportedHostEvents !== true
      || record.authority?.authenticatedControllerEnvelopes !== false
      || record.authority?.establishesIntervention !== false) {
      throw new Error("CODEX_CONFORMANCE_REPLAY_MISMATCH");
    }
    return { ok: true, recordHash, sourceArtifactsReverified: true,
      complete: true, verificationMode: "CALLER_ASSERTED_EVENT_REPLAY",
      authenticatedControllerEnvelopes: false, establishesIntervention: false };
  } catch (error) {
    return { ok: false, error: `CODEX_CONFORMANCE_INVALID:${error?.message ?? error}`,
      sourceArtifactsReverified: false };
  }
}

function sourceBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string") return Buffer.from(input);
  if (Array.isArray(input)) return Buffer.from(input.map((entry) => (
    typeof entry === "string" ? entry : JSON.stringify(entry))).join("\n") + "\n");
  throw new Error("CODEX_ROLLOUT_SOURCE_INVALID");
}

/** Read one already-open inode and refuse a concurrently mutated snapshot. */
export function readCodexRolloutSnapshot(path) {
  const descriptor = openSync(path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key]) throw new Error("CODEX_ROLLOUT_CHANGED_DURING_READ");
    }
    if (BigInt(bytes.length) !== after.size) throw new Error("CODEX_ROLLOUT_SIZE_MISMATCH");
    return bytes;
  } finally { closeSync(descriptor); }
}

function timestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
}

function rawArguments(payload) {
  const value = payload?.type === "function_call" ? payload.arguments : payload?.input;
  if (typeof value === "string") return value;
  return canonicalizeStrict(value ?? null);
}

function actionName(payload) {
  const namespace = typeof payload?.namespace === "string" && payload.namespace
    ? `${payload.namespace}.` : "";
  return `${namespace}${String(payload?.name ?? "unknown")}`.slice(0, 256);
}

function resultStatus(payload) {
  const value = payload?.output;
  let decoded = value;
  if (typeof value === "string") {
    try { decoded = JSON.parse(value); } catch { decoded = null; }
    const exit = value.match(/(?:Process exited with code|exit(?:_| )code)\s*[:=]?\s*(-?\d+)/i);
    if (exit) return Number(exit[1]) === 0 ? "SUCCEEDED" : "FAILED";
  }
  if (plain(decoded)) {
    const exit = decoded.exit_code ?? decoded.exitCode ?? decoded.metadata?.exit_code;
    if (Number.isFinite(exit)) return Number(exit) === 0 ? "SUCCEEDED" : "FAILED";
    if (decoded.is_error === true || decoded.error) return "FAILED";
    if (decoded.success === true || decoded.status === "completed") return "SUCCEEDED";
    if (decoded.success === false || decoded.status === "failed") return "FAILED";
  }
  return "OBSERVED_UNKNOWN";
}

function capabilityFor({ cliVersions, sessionRefHash, sourceSnapshotHash, hookProbe,
  hookProbeSources, liveConformance }) {
  const probe = hookProbe == null ? null : verifyCodexHookCapabilityProbe(hookProbe,
    hookProbeSources ?? {});
  if (probe && !probe.ok) throw new Error(`CODEX_HOOK_PROBE_INVALID:${probe.error}`);
  let conformance = null;
  if (liveConformance !== null) {
    if (!plain(liveConformance) || !plain(liveConformance.record)
      || !Array.isArray(liveConformance.events)) {
      throw new Error("CODEX_LIVE_CONFORMANCE_SOURCES_REQUIRED");
    }
    conformance = verifyCodexLiveConformance(liveConformance.record,
      { events: liveConformance.events });
    if (!conformance.ok) throw new Error(`CODEX_LIVE_CONFORMANCE_INVALID:${conformance.error}`);
  }
  const trustedHookHash = hookProbe?.assessment?.installedControlHookHash ?? null;
  const sourceBoundConformance = Boolean(conformance?.ok
    && probe?.metadataReplayed
    && probe?.engineSupportsControlledCandidate
    && probe?.installedControlHooksTrusted
    && trustedHookHash
    && liveConformance.record.binarySha256 === hookProbe.binary.sha256
    && liveConformance.record.schemaBundleHash === hookProbe.generatedSchema.bundleHash
    && liveConformance.record.hookCurrentHash === trustedHookHash);
  if (conformance?.ok && !sourceBoundConformance) {
    throw new Error("CODEX_LIVE_CONFORMANCE_NOT_BOUND_TO_REPLAYED_METADATA");
  }
  /*
   * Source replay proves internal consistency, not origin.  `events` are
   * caller-provided and can be fabricated; they are deliberately labelled as
   * such in the artifact.  Only a future verifier for authenticated controller
   * envelopes (or a sealed Stage 0.5 run cross-bound to these IDs) may flip this.
   */
  const authoritativeConformance = Boolean(sourceBoundConformance
    && conformance.authenticatedControllerEnvelopes
    && conformance.establishesIntervention);
  const interventionReason = hookProbe == null ? "codex_hook_probe_missing"
    : !probe.metadataReplayed ? "codex_hook_metadata_not_replayed"
      : !probe.engineSupportsControlledCandidate ? "codex_hook_schema_incomplete"
        : !probe.installedControlHooksTrusted ? "codex_control_hooks_untrusted"
          : sourceBoundConformance ? "codex_hook_conformance_not_authenticated"
            : "codex_hook_live_conformance_missing";
  const evidence = [sourceSnapshotHash];
  if (hookProbe) evidence.push(hookProbe.recordHash);
  if (sourceBoundConformance) evidence.push(liveConformance.record.recordHash);
  return createWorkerCapabilityHandshake({
    provider: "codex",
    surface: "codex-rollout-jsonl",
    runtime: {
      name: "codex-cli",
      version: cliVersions.length === 1 ? cliVersions[0] : null,
      sourceRevision: null,
      closureHash: workerDigest({ cliVersions, hookProbeHash: hookProbe?.recordHash ?? null }),
    },
    adapter: { name: "outsider-codex-worker-adapter",
      version: CODEX_WORKER_ADAPTER_VERSION, closureHash: CODEX_WORKER_ADAPTER_CLOSURE_HASH },
    sessionRefHash,
    capabilities: {
      OBSERVE: { status: "SUPPORTED",
        scopes: ["STRUCTURED_EVENTS", "ACTION_RESULT_PAIRING", "LIFECYCLE", "MULTI_AGENT"],
        evidenceRefs: evidence, reasonCode: null },
      INTERVENE: authoritativeConformance
        ? { status: "SUPPORTED",
          scopes: ["DENY_ACTION", "CORRECT_PRE_ACTION", "BLOCK_COMPLETION"],
          evidenceRefs: [hookProbe.recordHash, liveConformance.record.recordHash], reasonCode: null }
        : { status: "UNSUPPORTED", scopes: [], evidenceRefs: hookProbe ? [hookProbe.recordHash] : [],
          reasonCode: interventionReason },
      VERIFY: { status: "SUPPORTED",
        scopes: ["SOURCE_BYTES", "STRUCTURAL_PAIRING",
          ...(authoritativeConformance ? ["DURABLE_DELIVERY"] : [])],
        evidenceRefs: evidence,
        reasonCode: null },
    },
  });
}

export function createCodexWorkerObservation(input, {
  hookProbe = null,
  hookProbeSources = null,
  liveConformance = null,
} = {}) {
  const bytes = sourceBytes(input);
  const sourceSnapshotHash = workerDigest(bytes);
  const native = [];
  const gaps = [];
  const counts = {};
  const cliVersions = [];
  const sessionIds = [];
  for (const [index, line] of bytes.toString("utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); }
    catch { gaps.push(`INVALID_JSON_LINE:${index}`); continue; }
    if (!plain(entry) || typeof entry.type !== "string" || !plain(entry.payload)) {
      gaps.push(`INVALID_EVENT_ENVELOPE:${index}`); continue;
    }
    native.push({ index, entry });
    const subtype = typeof entry.payload.type === "string" ? entry.payload.type : "none";
    const typeKey = `${entry.type}:${subtype}`;
    counts[typeKey] = (counts[typeKey] ?? 0) + 1;
    if (!TOP_LEVEL_TYPES.has(entry.type)) {
      gaps.push(`UNKNOWN_TOP_LEVEL_TYPE:${index}:${workerDigest(entry.type)}`);
    }
    if (entry.type === "response_item" && !RESPONSE_TYPES.has(subtype)) {
      gaps.push(`UNKNOWN_RESPONSE_ITEM_TYPE:${index}:${workerDigest(subtype)}`);
    }
    if (entry.type === "event_msg" && !EVENT_MESSAGE_TYPES.has(subtype)) {
      gaps.push(`UNKNOWN_EVENT_MESSAGE_TYPE:${index}:${workerDigest(subtype)}`);
    }
    if (entry.type === "session_meta") {
      if (typeof entry.payload.cli_version === "string") cliVersions.push(entry.payload.cli_version);
      for (const id of [entry.payload.id, entry.payload.session_id]) {
        if (typeof id === "string") sessionIds.push(id);
      }
    }
  }
  const versions = sortedUnique(cliVersions);
  const sessionRefHash = sessionIds.length ? workerDigest(sortedUnique(sessionIds)) : null;
  if (!versions.length) gaps.push("CODEX_CLI_VERSION_MISSING");
  if (!sessionRefHash) gaps.push("CODEX_SESSION_ID_MISSING");
  const handshake = capabilityFor({ cliVersions: versions, sessionRefHash,
    sourceSnapshotHash, hookProbe, hookProbeSources, liveConformance });
  const calls = new Map();
  const output = [];
  let ordinal = 0;
  for (const { index, entry } of native) {
    const payload = entry.payload;
    const type = payload.type;
    const nativeRefHash = workerDigest(entry);
    const observedAt = timestamp(entry.timestamp);
    if (entry.type === "session_meta") {
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "SESSION_START", nativeType: "session_meta", nativeRefHash }));
      continue;
    }
    if (entry.type === "response_item"
      && ["function_call", "custom_tool_call"].includes(type)) {
      if (typeof payload.call_id !== "string" || !payload.call_id || calls.has(payload.call_id)) {
        gaps.push(`INVALID_OR_DUPLICATE_CALL:${index}`); continue;
      }
      const args = rawArguments(payload);
      const callRefHash = workerDigest({ provider: "codex", callIdHash: workerDigest(payload.call_id) });
      calls.set(payload.call_id, { callRefHash, proposedIndex: index, result: false });
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "ACTION_PROPOSED", nativeType: type, nativeRefHash,
        callRefHash, actionName: actionName(payload), argumentsHash: workerDigest(args) }));
      continue;
    }
    if (entry.type === "response_item"
      && ["function_call_output", "custom_tool_call_output"].includes(type)) {
      const call = calls.get(payload.call_id);
      if (!call || call.result) { gaps.push(`ORPHAN_OR_DUPLICATE_RESULT:${index}`); continue; }
      call.result = true;
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "ACTION_RESULT", nativeType: type, nativeRefHash,
        callRefHash: call.callRefHash, resultHash: workerDigest(payload.output ?? null),
        resultStatus: resultStatus(payload) }));
      continue;
    }
    if (entry.type === "event_msg" && type === "task_started") {
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "TASK_START", nativeType: type, nativeRefHash }));
    } else if (entry.type === "event_msg" && type === "task_complete") {
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "TASK_END", nativeType: type, nativeRefHash }));
    } else if (entry.type === "event_msg" && type === "turn_aborted") {
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "TASK_ABORT", nativeType: type, nativeRefHash }));
    } else if (entry.type === "event_msg" && type === "sub_agent_activity") {
      output.push(createWorkerEvent({ ordinal: ordinal++, nativeSequence: index,
        observedAt, kind: "AGENT_ACTIVITY", nativeType: type, nativeRefHash }));
    }
  }
  for (const [callId, call] of calls) {
    if (!call.result) gaps.push(`UNSETTLED_CALL:${call.proposedIndex}:${workerDigest(callId)}`);
  }
  return createWorkerObservation({
    handshake,
    sourceFormat: "codex-rollout-jsonl/v1",
    sourceSnapshotHash,
    sourceByteLength: bytes.length,
    nativeEventCount: native.length,
    nativeTypeCounts: counts,
    events: output,
    gaps,
  });
}

export function verifyCodexWorkerObservation(record, { sourceBytes: bytes = null } = {}) {
  const checked = verifyWorkerObservation(record, { sourceBytes: bytes });
  if (!checked.ok) return checked;
  if (record.capabilityHandshake?.provider !== "codex"
    || record.capabilityHandshake?.adapter?.closureHash !== CODEX_WORKER_ADAPTER_CLOSURE_HASH
    || record.source?.format !== "codex-rollout-jsonl/v1"
    || record.authority?.establishesSemanticOutcome !== false) {
    return { ok: false, error: "CODEX_WORKER_OBSERVATION_BOUNDARY_INVALID",
      sourceArtifactsReverified: checked.sourceArtifactsReverified };
  }
  return checked;
}
