#!/usr/bin/env node
/* Evaluation-only host-protocol recorder.  It delegates the exact payload to
 * the shipped hook and records only bounded field names plus hashed lineage;
 * source, prompts, tool arguments and transcript paths are never copied. */
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const bytes = Buffer.concat(chunks);
const recorderSourceHash = `sha256:${createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url))).digest("hex")}`;
let input = null;
try { input = JSON.parse(bytes.toString("utf8") || "{}"); } catch { /* delegated hook owns error */ }
const hash = (label, value) => value == null ? null
  : `sha256:${createHash("sha256").update(`${label}\0${String(value)}`).digest("hex")}`;
const boundedName = (value) => {
  const name = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name) ? name : null;
};
const boundedIdentifier = (value) => {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(id) ? id : null;
};
const boundedKeys = (value) => Object.keys(value && typeof value === "object" ? value : {})
  .sort().slice(0, 80).map((key) => String(key).slice(0, 80));
const transcriptModelEvidence = (file) => {
  if (!file) return { models: [], contentHash: null };
  try {
    const content = readFileSync(String(file));
    const models = [...new Set(content.toString("utf8").split(/\r?\n/).flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const parsed = JSON.parse(line);
        const model = boundedName(parsed?.message?.model ?? parsed?.model);
        return model ? [model] : [];
      } catch { return []; }
    }))].sort();
    return {
      models: models.slice(0, 8),
      contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    };
  } catch {
    return { models: [], contentHash: null };
  }
};
const responseIdentity = (value) => {
  const seen = new Set();
  const visit = (candidate, depth = 0) => {
    if (candidate == null || depth > 6) return null;
    /* Free-form tool text is worker-visible and may contain a forged agentId.
       Capability evidence is accepted only from host-owned structured fields. */
    if (typeof candidate === "string") return null;
    if (typeof candidate !== "object" || seen.has(candidate)) return null;
    seen.add(candidate);
    const status = ["teammate_spawned", "async_launched"].includes(candidate.status)
      ? candidate.status : null;
    const isAsync = typeof candidate.isAsync === "boolean" ? candidate.isAsync : null;
    const agentId = candidate.agentId ?? candidate.resumedAgentId ?? candidate.agent_id ?? null;
    const pinName = boundedName(candidate.pin?.name ?? candidate.name);
    if (status || agentId || pinName) return {
      status, isAsync, agentId: agentId == null ? null : String(agentId), pinName,
    };
    for (const nested of Array.isArray(candidate) ? candidate : Object.values(candidate)) {
      const found = visit(nested, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return visit(value);
};
const logFile = process.env.OUTSIDER_AGENT_TEAM_PROBE_PAYLOAD_LOG;
const envelopeId = randomUUID();
let receivedEnvelope = null;
let r3Injection = null;
const appendEnvelope = (record) => {
  if (!logFile) return false;
  try {
    mkdirSync(path.dirname(logFile), { recursive: true });
    appendFileSync(logFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    return true;
  } catch {
    /* Missing or incomplete recorder evidence invalidates the probe.  It must
       never change the real hook's control decision. */
    return false;
  }
};
if (logFile && input) {
  const toolInput = input.tool_input ?? input.toolInput ?? {};
  const toolResponse = input.tool_response ?? input.toolResponse ?? null;
  /* R3 evaluation-only deterministic drift.  The first lead completion intent
     for the integration task atomically replaces the composition adapter
     before the shipped hook evaluates TaskCompleted.  This makes the red
     integration boundary structural, not dependent on Claude volunteering a
     mistake.  The exact before/after hashes are sealed in the host envelope. */
  if (process.env.OUTSIDER_AGENT_TEAM_R3_DRIFT === "1"
    && String(input.hook_event_name ?? input.hookEventName) === "PreToolUse"
    && String(input.tool_name ?? input.toolName) === "TaskUpdate"
    && String(toolInput.taskId ?? toolInput.task_id) === "3"
    && String(toolInput.status ?? "") === "completed") {
    const marker = process.env.OUTSIDER_AGENT_TEAM_R3_MARKER;
    const cwd = String(input.cwd ?? "");
    const target = cwd ? path.join(cwd, "src", "index.js") : null;
    try {
      if (!marker || !target) throw new Error("R3_INJECTION_PATH_MISSING");
      const fd = openSync(marker, "wx", 0o600);
      closeSync(fd);
      const before = readFileSync(target);
      const injected = Buffer.from(`import { storedValue } from "./store.js";\nimport { scheduledValue } from "./scheduler.js";\nexport function integratedValue() { return storedValue() - scheduledValue(); }\n`);
      writeFileSync(target, injected, { mode: 0o600 });
      const markerHash = `sha256:${createHash("sha256").update(Buffer.alloc(0)).digest("hex")}`;
      r3Injection = {
        applied: true,
        sourceHash: recorderSourceHash,
        markerHash,
        logicalTarget: "src/index.js",
        beforeHash: `sha256:${createHash("sha256").update(before).digest("hex")}`,
        afterHash: `sha256:${createHash("sha256").update(injected).digest("hex")}`,
      };
      input._outsider_evaluator_fault = {
        schema: "outsider/evaluator-fault/v1",
        kind: "r3-integration-drift",
        evaluatorOwned: true,
        sourceHash: recorderSourceHash,
        markerHash,
        logicalTarget: r3Injection.logicalTarget,
        beforeHash: r3Injection.beforeHash,
        afterHash: r3Injection.afterHash,
      };
    } catch (error) {
      if (String(error?.code) !== "EEXIST") {
        r3Injection = { applied: false, error: String(error?.message ?? error).slice(0, 300) };
      }
    }
  }
  const requestedAgentName = String(input.tool_name ?? input.toolName ?? "") === "Agent"
    ? boundedName(toolInput.name) : null;
  const requestedAgentModel = String(input.tool_name ?? input.toolName ?? "") === "Agent"
    ? boundedName(toolInput.model) : null;
  const requiredAgentModel = boundedName(process.env.OUTSIDER_AGENT_TEAM_REQUIRED_MODEL);
  const modelGuardViolation = String(input.hook_event_name ?? input.hookEventName) === "PreToolUse"
    && String(input.tool_name ?? input.toolName) === "Agent" && requiredAgentModel
    && requestedAgentModel !== requiredAgentModel;
  const transcriptEvidence = transcriptModelEvidence(
    input.transcript_path ?? input.transcriptPath);
  const taskUpdate = String(input.tool_name ?? input.toolName ?? "") === "TaskUpdate"
    ? {
      taskId: boundedIdentifier(toolInput.taskId ?? toolInput.task_id),
      status: boundedName(toolInput.status),
      owner: boundedName(toolInput.owner),
    } : null;
  const responseAgent = String(input.tool_name ?? input.toolName ?? "") === "Agent"
    ? responseIdentity(toolResponse) : null;
  const record = {
    schema: "outsider/agent-team-host-envelope/v2",
    recorderSourceHash,
    at: new Date().toISOString(),
    pid: process.pid,
    envelopeId,
    phase: "received",
    hookEventName: boundedName(input.hook_event_name ?? input.hookEventName),
    inputKeys: boundedKeys(input),
    toolInputKeys: boundedKeys(toolInput),
    toolResponseKeys: toolResponse && typeof toolResponse === "object" && !Array.isArray(toolResponse)
      ? boundedKeys(toolResponse) : [],
    sessionHash: hash("session", input.session_id ?? input.sessionId),
    transcriptHash: hash("transcript", input.transcript_path ?? input.transcriptPath),
    cwdHash: hash("cwd", input.cwd),
    agentIdHash: hash("agent", input.agent_id ?? input.agentId
      ?? input.subagent_id ?? input.subagentId),
    inputHostAgentIdHash: hash("host-agent", input.agent_id ?? input.agentId
      ?? input.subagent_id ?? input.subagentId),
    parentAgentIdHash: hash("parent-agent", input.parent_agent_id ?? input.parentAgentId),
    teammateName: boundedName(input.teammate_name ?? input.teammateName),
    teamName: boundedName(input.team_name ?? input.teamName),
    taskId: boundedIdentifier(input.task_id ?? input.taskId),
    toolUseId: boundedIdentifier(input.tool_use_id ?? input.toolUseId),
    toolName: boundedName(input.tool_name ?? input.toolName),
    requestedAgentName,
    requestedAgentNameHash: hash("teammate-name", requestedAgentName),
    requestedAgentModel,
    requiredAgentModel,
    modelGuardViolation: Boolean(modelGuardViolation),
    runtimeModels: transcriptEvidence.models,
    transcriptContentHash: transcriptEvidence.contentHash,
    taskUpdateTaskId: taskUpdate?.taskId ?? null,
    taskUpdateStatus: taskUpdate?.status ?? null,
    taskUpdateOwner: taskUpdate?.owner ?? null,
    responseAgentIdHash: hash("agent", responseAgent?.agentId),
    responseHostAgentIdHash: hash("host-agent", responseAgent?.agentId),
    responsePinName: responseAgent?.pinName ?? null,
    responseStatus: responseAgent?.status ?? null,
    responseIsAsync: responseAgent?.isAsync ?? null,
    evaluatorR3Injection: r3Injection,
  };
  if (appendEnvelope(record)) receivedEnvelope = record;
}

const realHook = process.env.OUTSIDER_AGENT_TEAM_PROBE_REAL_HOOK;
if (!realHook) {
  process.stderr.write("AGENT_TEAM_PROBE_REAL_HOOK_REQUIRED\n");
  process.exit(1);
}
const delegated = spawnSync(process.execPath, [realHook, "claude-code"], {
  input: input ? Buffer.from(JSON.stringify(input)) : bytes,
  env: process.env,
  encoding: null,
  maxBuffer: 8 * 1024 * 1024,
});
const evaluatorModelGuardBlocked = receivedEnvelope?.modelGuardViolation === true
  && !delegated.error && Number(delegated.status) === 0;
/* The second append is a quiescence receipt.  A worker process exiting does
 * not imply every already-started hook RPC has returned.  The formal probe
 * waits for one successful delegated receipt for every received envelope
 * before it assesses or seals evidence. */
if (receivedEnvelope) {
  appendEnvelope({
    schema: "outsider/agent-team-host-envelope/v2",
    recorderSourceHash,
    at: new Date().toISOString(),
    pid: process.pid,
    envelopeId,
    phase: "delegated",
    receivedEnvelopeHash: `sha256:${createHash("sha256")
      .update(JSON.stringify(receivedEnvelope)).digest("hex")}`,
    hookEventName: receivedEnvelope.hookEventName,
    toolUseId: receivedEnvelope.toolUseId,
    delegatedStatus: evaluatorModelGuardBlocked ? 2 : delegated.status ?? null,
    realHookStatus: delegated.status ?? null,
    evaluatorModelGuardBlocked,
    delegatedSignal: delegated.signal ?? null,
    delegatedError: delegated.error ? String(delegated.error.message ?? delegated.error) : null,
  });
}
if (!evaluatorModelGuardBlocked && delegated.stdout) process.stdout.write(delegated.stdout);
if (delegated.stderr) process.stderr.write(delegated.stderr);
if (evaluatorModelGuardBlocked) {
  process.stderr.write(`OUTSIDER_EVALUATOR_MODEL_POLICY_REJECTED: Agent must explicitly set model=${receivedEnvelope.requiredAgentModel}\n`);
}
if (delegated.error) process.stderr.write(`${delegated.error.message}\n`);
process.exit(delegated.error ? 1 : evaluatorModelGuardBlocked ? 2 : delegated.status ?? 1);
