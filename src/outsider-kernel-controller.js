import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  decideToolCall, hookOutputFor, unsupervisedCommandEnvironment,
} from "./outsider-hook.js";
import { classifyToolCall, trajectoryFromSession } from "./outsider-session-adapters.js";
import {
  askSupervisor, correctionAuthorityFrom, correctionFromAuthority, supervisorPacket,
  validCorrectionAuthority, validSupervisorVerdict,
} from "./outsider-supervisor-session.js";
import {
  diffSnapshots, snapshotWorkspace, supervisorReliability, validateCausalProof,
} from "./outsider-kernel-store.js";
import { verifyOutcome } from "./outsider-outcome-verifier.js";
import {
  auditCorrectionProposal, auditOutcomeApproval, auditSupervisorClearance,
} from "./outsider-semantic-audit.js";
import { InterventionRecoveryJournal } from "./outsider-intervention-recovery.js";
import { canonicalizeStrict } from "./canonical.js";

const hash = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const hashBytes = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const MISSING_FILE_HASH = hash("outsider/workspace-file-missing/v1");
const eventName = (input) => input?.hook_event_name ?? input?.hookEventName ?? "";
const CODEX_HOOK_EVENTS = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest",
  "PostToolUse", "PreCompact", "PostCompact", "SubagentStart", "SubagentStop", "Stop",
]);
const PASSIVE_LIFECYCLE_EVENTS = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PermissionRequest",
  "PreCompact", "PostCompact",
]);
const MAX_INTERVENTIONS_PER_TRIGGER = 3;
const DEFAULT_FOLLOWUP_BOUNDARIES = 6;
const DEFAULT_SEMANTIC_PATROL_EVERY = 96;
const DEFAULT_SEMANTIC_PATROL_MIN_EVIDENCE_STEPS = 6;
const MAX_AGENT_IDENTITY_LINEAGES = 256;
const TEAM_DELEGATION_SCHEMA = "outsider/team-delegation-binding/v1";
/* Worst safe Stop path: verifier + PASS audit, diagnosis + clearance audit +
   clearance re-diagnosis + correction audit + rejected-correction re-diagnosis
   + second correction audit. Patrol may not spend these completion calls. */
const RESERVED_COMPLETION_SUPERVISOR_CALLS = 8;
const completionReserveFor = (limit) => Math.min(RESERVED_COMPLETION_SUPERVISOR_CALLS,
  Math.max(1, Number(limit) - 1));

function expectedCheckBindingHash(agentId, commands) {
  return hash(canonicalizeStrict({
    schema: "outsider/expected-check-binding/v1",
    agentId: String(agentId),
    commands: commands.map((command) => String(command).trim()),
  }));
}

function expectedCheckMatch(action, expected, cwd, preregisteredPrefix = []) {
  const actual = String(action ?? "").trim();
  const command = String(expected ?? "").trim();
  if (!actual || !command) return null;
  const commands = [command];
  if (actual === command) return { kind: "exact", commands };
  /* Claude commonly qualifies a command with the exact workspace cwd.  Accept
     only this one generated shape; pipes, suffixes, alternate directories and
     arbitrary shell normalization remain outside the proof vocabulary. */
  if (actual === `cd ${JSON.stringify(String(cwd))} && ${command}`) {
    return { kind: "exact-workspace-cd-wrapper", commands };
  }
  /* The lead may rerun both preregistered slice checks immediately before the
     preregistered integration check.  This exact conjunction is stronger than
     the bare check and contains no unregistered shell step. */
  const suite = [...preregisteredPrefix.map((item) => String(item).trim())
    .filter(Boolean), command];
  const suiteCommand = suite.join(" && ");
  if (suite.length > 1 && actual === suiteCommand) {
    return { kind: "exact-preregistered-suite", commands: suite };
  }
  if (suite.length > 1
    && actual === `cd ${JSON.stringify(String(cwd))} && ${suiteCommand}`) {
    return { kind: "exact-workspace-preregistered-suite", commands: suite };
  }
  return null;
}

export function runAcceptance({ cwd, command, timeoutMs = 600_000, spawn = spawnSync } = {}) {
  if (!command) return { ran: false, passed: null, exit: null, command: null, output: "" };
  /* `shell:true` reports the exit code of the last pipeline segment. That made
     `false | tail -1` a green acceptance result in controlled mode—the exact
     fake-green defect already documented by this repository's own fixture.
     Run the operator-owned command under an explicit pipefail shell instead. */
  const windows = process.platform === "win32";
  const executable = windows ? (process.env.ComSpec || "cmd.exe") : "/bin/bash";
  const argv = windows ? ["/d", "/s", "/c", command] : ["-o", "pipefail", "-c", command];
  const result = spawn(executable, argv, {
    cwd, encoding: "utf8", timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024,
    /* The controller is blocked inside this call. Anything the operator's
       command starts must not be able to dial back into it — see
       unsupervisedCommandEnvironment. */
    env: unsupervisedCommandEnvironment(process.env),
  });
  const exit = result.status ?? (result.error ? 1 : 0);
  return {
    ran: true,
    passed: exit === 0,
    exit,
    command,
    error: result.error ? String(result.error.message ?? result.error) : null,
    timedOut: result.error?.code === "ETIMEDOUT",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-12_000),
  };
}

function explicitAllow() {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } };
}

function stopApprove() { return { decision: "approve" }; }

function stopBlock(reason) {
  return { decision: "block", reason, systemMessage: "outsider: 独立监工已暂停收工并给出纠正计划" };
}

function stopHoldForJudge(reason) {
  return { decision: "block", reason,
    systemMessage: "outsider: 已保留原干预身份；独立裁判通道恢复后将复核同一交付，不要求 worker 重新修改" };
}

function preToolCorrection(reason, correction) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      /* Claude Code guarantees that a deny reason is shown to the model. Keep
         the full marker and plan there; additionalContext is useful but is not
         our delivery proof because it is not a visible chat transcript item. */
      permissionDecisionReason: `outsider: ${reason}\n${correction}`,
      additionalContext: correction,
    },
  };
}

/* TaskCompleted and TeammateIdle are not permission-decision hooks. Claude's
   documented control protocol is exit 2 plus stderr: the host keeps the
   teammate alive and feeds the reason back as work to do. The executable strips
   these private transport keys before talking to the host. */
function lifecycleBlock(reason) {
  return { _outsiderExitCode: 2, _outsiderStderr: String(reason).slice(0, 12_000) };
}

function correctionDeliveryChannel(boundary) {
  if (boundary === "Stop") return "Stop.block";
  if (boundary === "TaskCompleted") return "TaskCompleted.exit2";
  if (boundary === "TeammateIdle") return "TeammateIdle.exit2";
  if (boundary === "SubagentStop") return "SubagentStop.block";
  return "PreToolUse.deny";
}

function teamAgentId(input = {}) {
  const teammate = input.teammate_name ?? input.teammateName;
  return teammate ? `teammate:${String(teammate)}` : agentIdFromInput(input);
}

function taskIdFrom(input = {}) {
  const id = input.task_id ?? input.taskId
    ?? input?.tool_input?.taskId ?? input?.tool_input?.task_id;
  return id == null ? null : String(id);
}

function stringList(value) {
  return (Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String).filter(Boolean);
}

function normalizedWorkspacePath(cwd, value) {
  if (!value) return null;
  const absolute = path.resolve(cwd, String(value));
  const relative = path.relative(cwd, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function taskGraphCycle(tasks = {}) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id, trail = []) => {
    if (visiting.has(id)) return [...trail, id];
    if (visited.has(id)) return null;
    visiting.add(id);
    const task = tasks[id];
    for (const dependency of task?.blockedBy ?? []) {
      if (!tasks[dependency]) continue;
      const found = visit(String(dependency), [...trail, id]);
      if (found) return found;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };
  for (const id of Object.keys(tasks)) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

function decisionTrigger(decision) {
  if (!decision) return null;
  if (decision.delivery?.result?.gaps?.length) return `delivery:${decision.delivery.result.gaps[0].kind}`;
  if (decision.loop) return "whack-a-mole";
  if (decision.patrol?.kind) return `patrol:${decision.patrol.kind}`;
  if (decision.freeStop?.kind) return `free-stop:${decision.freeStop.kind}`;
  if (decision.proposed?.isSubmit) return "submit";
  if ((decision.verdict === "warn" || decision.verdict === "ask") && decision.corrective) {
    return `detector:${String(decision.reason ?? "warning").slice(0, 80)}`;
  }
  if (decision.verdict === "deny" && !decision.proposed?.irreversible && decision.corrective) {
    return `gate:${String(decision.reason ?? "denied").slice(0, 80)}`;
  }
  return null;
}

function shiftStepFromTool({ toolName, toolInput, cwd } = {}) {
  const normalizedTool = String(toolName ?? "").toLowerCase();
  if (/^(?:read|view|open)$/i.test(normalizedTool)) {
    const raw = toolInput?.file_path ?? toolInput?.path ?? toolInput?.file ?? null;
    const relative = raw && path.isAbsolute(String(raw))
      ? relativeIfInside(cwd, path.normalize(String(raw))) : String(raw ?? "");
    const target = String(relative ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
    return target ? `read:${target}` : null;
  }
  if (!/^(?:bash|shell|sh|run|runcommand|run_command|terminal|exec|exec_command|execute)$/i
    .test(normalizedTool)) return null;
  const command = normalizeControllerShiftCommand(
    toolInput?.command ?? toolInput?.cmd ?? "", cwd);
  return command ? `run:${command}` : null;
}

function normalizeControllerShiftCommand(value, cwd) {
  const command = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!command || !cwd) return command;
  /* Claude Code may surface a bare evaluator instruction as an exact
     workspace-qualified command.  This is the same narrow host normalization
     accepted by expectedCheckMatch(): only the frozen cwd prefix is removed;
     other directories, suffixes, pipes, and compound commands remain visible
     and therefore cannot enter the checkpoint-reuse proof. */
  const prefix = `cd ${JSON.stringify(String(cwd))} && `;
  return command.startsWith(prefix) ? command.slice(prefix.length) : command;
}

function shiftStepFromBoundary(event, cwd) {
  if (event?.boundary !== "PostToolUse") return null;
  if (/^(?:read|view|open)$/i.test(String(event.tool ?? ""))) {
    const raw = event.file ?? String(event.action ?? "").match(/^Read\((.*)\)$/u)?.[1] ?? null;
    const relative = raw && path.isAbsolute(String(raw))
      ? relativeIfInside(cwd, path.normalize(String(raw))) : String(raw ?? "");
    const target = String(relative ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
    return target ? `read:${target}` : null;
  }
  if (!/^(?:bash|shell|sh|run|runcommand|run_command|terminal|exec|exec_command|execute)$/i
    .test(String(event.tool ?? ""))) return null;
  const command = normalizeControllerShiftCommand(event.action ?? "", cwd);
  return command ? `run:${command}` : null;
}

function activeShiftDispatch(events) {
  const ordered = [...events].sort((left, right) => Number(left.seq) - Number(right.seq));
  const dispatch = [...ordered].reverse().find((event) =>
    ["endurance_shift_dispatched", "endurance_patrol_warmup_dispatched",
      "endurance_recovery_checkpoint_continuation_dispatched"].includes(event.type)
    && !ordered.some((later) => later.type === "endurance_shift_completed"
      && later.dispatchedAtSeq === event.seq && Number(later.seq) > Number(event.seq)));
  if (!dispatch) return { ordered, dispatch: null, submitted: null };
  const submitted = ordered.find((event) => event.type === "endurance_shift_input_submitted"
    && event.dispatchedAtSeq === dispatch.seq && Number(event.seq) > Number(dispatch.seq));
  return { ordered, dispatch, submitted: submitted ?? null };
}

function expectedShiftSteps(dispatch, preregistration) {
  if (!dispatch) return [];
  const kind = dispatch.kind ?? (dispatch.type === "endurance_recovery_checkpoint_continuation_dispatched"
    ? "recovery-checkpoint-continuation" : "patrol-warmup");
  if (kind === "patrol-warmup") {
    const registered = preregistration?.shiftPolicy?.patrolWarmup?.checks;
    return [...(registered ?? ["read:src/store.js", "read:src/scheduler.js",
      "read:src/recovery.js", "read:src/index.js", "run:npm test"])].map(String);
  }
  if (kind === "checkpoint") {
    const registered = preregistration?.shiftPolicy?.checks;
    return [...(registered ?? ["read:src/store.js", "read:src/scheduler.js",
      "read:src/recovery.js", "read:src/index.js", "run:npm test"])].map((value) =>
      String(value).replace("phase-N", `phase-${Number(dispatch.ordinal)}`));
  }
  if (kind === "recovery-drill") {
    return ["read:ENDURANCE-PROTOCOL.md", "read:src/store.js", "read:src/scheduler.js",
      "read:src/recovery.js", "read:src/index.js", "run:npm test"];
  }
  if (kind === "recovery-checkpoint-continuation") {
    return ["run:npm test"];
  }
  return [];
}

/** Controller-owned temporal state for a bounded evaluator shift.  A judge at
 * the first PreToolUse must not treat the seven future actions as omissions;
 * conversely a Stop may pass only after every preregistered action is durable. */
export function activeControllerShiftEvidence(events, {
  toolName = null, toolInput = null, cwd = process.cwd(), preregistration = null,
} = {}) {
  const { ordered, dispatch, submitted } = activeShiftDispatch(events);
  if (!dispatch || !submitted) return null;
  const expectedSteps = expectedShiftSteps(dispatch, preregistration);
  const completedBoundaries = ordered.filter((event) =>
    Number(event.seq) > Number(submitted.seq)
    && event.type === "boundary_reached" && event.boundary === "PostToolUse");
  const completedRecords = completedBoundaries.map((event) => ({
    event,
    step: shiftStepFromBoundary(event, cwd),
  }));
  const completedSteps = completedRecords.map((record) => record.step).filter(Boolean);
  const unexpectedCompletedActionCount = completedRecords
    .filter((record) => record.step == null).length;
  const allCompletedSuccessfully = completedRecords.length > 0
    && completedRecords.every((record) => Number(record.event.exit) === 0);
  const proposedStep = shiftStepFromTool({ toolName, toolInput, cwd });
  const expectedNextStep = expectedSteps[completedSteps.length] ?? null;
  const proposedMatchesNext = proposedStep == null ? null : proposedStep === expectedNextStep;
  const allExpectedCompleted = expectedSteps.length > 0
    && completedSteps.length === expectedSteps.length
    && unexpectedCompletedActionCount === 0
    && allCompletedSuccessfully
    && completedSteps.every((step, index) => step === expectedSteps[index]);
  return {
    authority: "controller-derived-from-sealed-event-order-and-preregistration",
    kind: dispatch.kind ?? (dispatch.type === "endurance_recovery_checkpoint_continuation_dispatched"
      ? "recovery-checkpoint-continuation" : "patrol-warmup"),
    dispatchSeq: dispatch.seq,
    submittedSeq: submitted.seq,
    phase: allExpectedCompleted ? "awaiting-stop-verification" : "in-progress",
    expectedSteps,
    completedSteps,
    completedStepCount: completedSteps.length,
    completedBoundaryCount: completedBoundaries.length,
    unexpectedCompletedActionCount,
    allCompletedSuccessfully,
    totalStepCount: expectedSteps.length,
    proposedStep,
    expectedNextStep,
    proposedMatchesNext,
    allExpectedCompleted,
    futureStepsAreNotCurrentOmissions: !allExpectedCompleted,
  };
}

function controllerDispatchedShiftAction(events, { toolName, toolInput, cwd,
  preregistration = null } = {}) {
  const { dispatch, submitted } = activeShiftDispatch(events);
  if (!dispatch || !submitted) return null;
  const kind = dispatch.kind ?? "patrol-warmup";
  const step = shiftStepFromTool({ toolName, toolInput, cwd });
  const expected = new Set(expectedShiftSteps(dispatch, preregistration));
  if (!step || !expected.has(step)) return null;
  const separator = step.indexOf(":");
  return { dispatch, kind, actionKind: step.slice(0, separator), target: step.slice(separator + 1) };
}

function stepsFromInput(input, agent, cwd) {
  const transcript = actorTranscriptPath(input);
  if (!transcript) return [];
  try { return trajectoryFromSession(transcript, agent, { cwd, window: 240 }); } catch { return []; }
}

function durableExecutionSteps(store, input, agent, cwd) {
  const pending = new Map();
  const durable = [];
  for (const event of store.events().filter((candidate) => candidate.type === "boundary_reached")) {
    const key = `${event.agentId ?? "main"}:${event.tool ?? ""}`;
    if (event.boundary === "PreToolUse") {
      const queue = pending.get(key) ?? [];
      queue.push(event);
      pending.set(key, queue);
      continue;
    }
    if (event.boundary !== "PostToolUse") continue;
    const queue = pending.get(key) ?? [];
    const requested = event.toolUseId
      ? queue.find((candidate) => candidate.toolUseId === event.toolUseId) : queue[0];
    if (!requested && !event.action) continue;
    if (requested) queue.splice(queue.indexOf(requested), 1);
    pending.set(key, queue);
    durable.push({
      uid: event.toolUseId ?? requested?.toolUseId ?? null,
      agentId: event.agentId ?? requested?.agentId ?? null,
      ts: requested?.at ?? event.at ?? null,
      completedAt: event.at ?? null,
      toolName: event.tool ?? requested?.tool ?? null,
      action: event.action ?? requested?.action ?? "",
      file: event.file ?? requested?.file ?? event.confirmedFile ?? null,
      isEdit: Boolean(event.isEdit ?? requested?.isEdit),
      isTest: Boolean(event.isTest ?? requested?.isTest),
      exit: event.exit ?? null,
      executed: true,
    });
  }
  const recent = stepsFromInput(input, agent, cwd)
    .filter((step) => step?.toolName || step?.uid)
    .map((step) => ({ ...step,
      executed: step.executed ?? (step.uid && step.exit != null ? true : null),
      evidenceSource: step.evidenceSource ?? "host-transcript" }));
  if (!durable.length) return recent;
  /* Enrich durable requests with completed-result fields when the transcript
     window still contains the same host uid. Older requests remain useful as
     ordered proof even after their results roll out of the parser window. */
  const completedByUid = new Map(recent.filter((step) => step.uid)
    .map((step) => [step.uid, step]));
  const enriched = durable.map((step) => {
    const completed = step.uid ? completedByUid.get(step.uid) : null;
    return completed ? { ...step, ...completed,
      ts: step.ts ?? completed.ts ?? null,
      action: completed.action ?? completed.cmd ?? step.action,
      exit: completed.exit ?? step.exit ?? null,
      isTest: Boolean(step.isTest || completed.isTest),
      isEdit: Boolean(step.isEdit || completed.isEdit),
      file: step.file ?? completed.file ?? null,
      executed: true,
      evidenceSource: "controller-event+host-transcript" }
      : { ...step, evidenceSource: "controller-event" };
  });
  const durableUids = new Set(durable.map((step) => step.uid).filter(Boolean));
  const combined = [...enriched,
    ...recent.filter((step) => !step.uid || !durableUids.has(step.uid))]
    .map((step, index) => ({ step, index }));
  const asTime = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  combined.sort((left, right) => {
    const a = asTime(left.step.ts);
    const b = asTime(right.step.ts);
    if (a != null && b != null && a !== b) return a - b;
    if (a != null && b == null) return -1;
    if (a == null && b != null) return 1;
    return left.index - right.index;
  });
  return combined.map(({ step }) => step);
}

function supervisorFailureFields(result) {
  const failure = result?.failure ?? {};
  return {
    error: String(result?.error ?? "unknown").slice(0, 4000),
    errorKind: failure.kind ?? null,
    errorCode: failure.code ?? null,
    exitStatus: failure.status ?? null,
    signal: failure.signal ?? null,
    timedOut: Boolean(failure.timedOut),
    retryable: Boolean(failure.retryable),
    failureCategory: failure.category ?? null,
    stderrTail: String(failure.stderrTail ?? "").slice(-1200),
    stdoutTail: String(failure.stdoutTail ?? "").slice(-1200),
  };
}

function semanticAuditEventFields(verdict = {}) {
  const blockingErrors = Array.isArray(verdict.blockingErrors)
    ? verdict.blockingErrors : Array.isArray(verdict.errors) ? verdict.errors : [];
  const notes = Array.isArray(verdict.notes) ? verdict.notes : [];
  return {
    decision: verdict.decision
      ?? (verdict.insufficient ? "insufficient" : verdict.passed === true ? "pass" : "reject"),
    blockingErrors: blockingErrors.slice(0, 12),
    notes: notes.slice(0, 12),
  };
}

/* A correction auditor may notice that an older worker Read differs from the
   file at the paused boundary and ask who changed it.  That provenance is
   useful telemetry, but it cannot erase the controller's later, hashed
   snapshot.  Reclassify only the narrow case where every authority-bearing
   edit preimage and protected file is cryptographically bound to that current
   controller-owned snapshot.  Factual rejects, blockers, missing hashes, and
   non-semantic diagnoses remain fail-closed. */
function correctionAuditTemporalAuthority({ verdict, proposal, evidence } = {}) {
  if (!verdict?.insufficient || verdict.passed === true) return null;
  const blockers = Array.isArray(verdict.blockingErrors)
    ? verdict.blockingErrors : Array.isArray(verdict.errors) ? verdict.errors : [];
  if (blockers.length || !Array.isArray(verdict.verifiedFacts)
    || verdict.verifiedFacts.length === 0) return null;
  if (proposal?.defect?.source !== "independent-semantic-outcome"
    || evidence?.semanticOutcome?.passed !== false
    || !Array.isArray(evidence.semanticOutcome.gaps)
    || evidence.semanticOutcome.gaps.length === 0) return null;
  const canonicalArtifact = evidence?.workspaceEvidence?.canonicalArtifact;
  if (canonicalArtifact?.authority !== "controller-owned"
    || !canonicalArtifact.snapshotFingerprint
    || canonicalArtifact.snapshotFingerprint !== evidence?.diff?.afterFingerprint) return null;
  const currentSha = new Map((evidence?.currentSourceEvidence ?? [])
    .map((item) => [String(item?.path ?? "").replaceAll("\\", "/"), item?.sha256 ?? null]));
  for (const item of evidence?.diff?.changes ?? []) {
    if (item?.status !== "added" || !item?.path || !item?.afterSha) continue;
    currentSha.set(String(item.path).replaceAll("\\", "/"), item.afterSha);
  }
  const edits = (proposal?.expectedActions ?? [])
    .filter((action) => ["edit", "delete"].includes(action?.kind));
  if (!edits.length || edits.some((action) => !action.preSha256
    || currentSha.get(String(action.path ?? "").replaceAll("\\", "/")) !== action.preSha256)) {
    return null;
  }
  const frozen = new Map((evidence?.frozenAcceptanceDefinition?.files ?? [])
    .map((item) => [String(item?.path ?? "").replaceAll("\\", "/"), item]));
  const protectedPaths = Array.isArray(proposal?.protectedPaths) ? proposal.protectedPaths : [];
  if (protectedPaths.some((item) => {
    const source = frozen.get(String(item?.path ?? "").replaceAll("\\", "/"));
    return !source || source.sha256 !== item.sha256
      || source.currentSha256 !== item.sha256 || source.changed === true;
  })) return null;
  const advisory = String(verdict.insufficient).slice(0, 2000);
  return {
    auditorDecision: verdict.decision ?? "insufficient",
    advisory,
    editPaths: edits.map((item) => item.path),
    verdict: {
      ...verdict,
      decision: "pass",
      passed: true,
      errors: [],
      blockingErrors: [],
      notes: [...(Array.isArray(verdict.notes) ? verdict.notes : []),
        `non-blocking provenance advisory: ${advisory}`].slice(0, 12),
      insufficient: null,
      insufficientReason: null,
    },
  };
}

/* A red controller-owned acceptance cannot be repaired by a read-only or
   verification-only authority. The semantic auditor still checks any proposed
   mutation, but it cannot waive the existence of one while the exact frozen
   command is already red. Without this deterministic floor, a fluent
   "inspect and rerun" plan can be delivered even when the auditor itself
   knows the requested runRef will remain non-zero. */
function correctionAuditActionabilityError({ proposal, evidence } = {}) {
  if (evidence?.acceptance?.passed !== false) return null;
  if (evidence?.activeEvaluatorShift?.phase !== "awaiting-stop-verification") return null;
  const actions = Array.isArray(proposal?.expectedActions) ? proposal.expectedActions : [];
  if (actions.some((action) => ["edit", "delete"].includes(action?.kind))) return null;
  return "controller-owned acceptance is red but the proposed correction contains no edit/delete action capable of changing the delivered artifact";
}

function transcriptContains(input, marker) {
  const transcript = actorTranscriptPath(input);
  if (!transcript || !marker) return false;
  try { return readFileSync(transcript, "utf8").includes(marker); } catch { return false; }
}

const FINAL_REPORT_TRANSCRIPT_TAIL_BYTES = 2 * 1024 * 1024;
const FINAL_REPORT_TEXT_BYTES = 24_000;

/* Read one already-open transcript inode.  The Stop payload already carries
   `last_assistant_message`; this second source is used only to bind those bytes
   to the host transcript, not to trust the worker's claims about the result. */
function stableTranscriptTail(transcriptPath) {
  const descriptor = openSync(transcriptPath, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("TRANSCRIPT_TOO_LARGE");
    const sourceBytes = Number(before.size);
    const length = Math.min(sourceBytes, FINAL_REPORT_TRANSCRIPT_TAIL_BYTES);
    const start = sourceBytes - length;
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(descriptor, buffer, offset, length - offset, start + offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key]) throw new Error("TRANSCRIPT_CHANGED_DURING_READ");
    }
    if (offset !== length) throw new Error("TRANSCRIPT_SHORT_READ");
    let completeLines = buffer;
    if (start > 0) {
      const firstNewline = buffer.indexOf(0x0a);
      completeLines = firstNewline < 0 ? Buffer.alloc(0) : buffer.subarray(firstNewline + 1);
    }
    return {
      text: completeLines.toString("utf8"),
      snapshotHash: hashBytes(buffer),
      sourceBytes,
      tailStart: start,
      tailBytes: buffer.length,
      inode: String(after.ino),
      device: String(after.dev),
    };
  } finally {
    closeSync(descriptor);
  }
}

function assistantTextFromTranscriptEntry(entry) {
  const payload = entry?.payload;
  if (entry?.type === "response_item" && payload?.type === "message"
    && payload?.role === "assistant") {
    const text = Array.isArray(payload.content)
      ? payload.content.map((block) => typeof block === "string" ? block : block?.text ?? "")
        .join("\n")
      : String(payload.content ?? "");
    return { text, phase: payload.phase ?? null, timestamp: entry.timestamp ?? null,
      nativeType: "response_item/message" };
  }
  if (entry?.type === "assistant" && entry?.message?.role === "assistant") {
    const content = entry.message.content;
    const text = Array.isArray(content)
      ? content.map((block) => typeof block === "string" ? block : block?.text ?? "")
        .join("\n")
      : String(content ?? "");
    return { text, phase: entry.message.phase ?? null, timestamp: entry.timestamp ?? null,
      nativeType: "assistant/message" };
  }
  return null;
}

function finalReportApprovalEvidence(input = {}) {
  const supplied = input.last_assistant_message ?? input.lastAssistantMessage;
  const boundary = eventName(input) || "Stop";
  if (typeof supplied !== "string" || !supplied.trim()) {
    return {
      schema: "outsider/worker-final-report-evidence/v1",
      observed: false,
      transcriptBound: false,
      reason: "STOP_FINAL_REPORT_FIELD_MISSING",
      workerAssertionsAcceptedAsOutcomeEvidence: false,
    };
  }
  const suppliedBytes = Buffer.byteLength(supplied);
  const base = {
    schema: "outsider/worker-final-report-evidence/v1",
    observed: true,
    source: `${boundary}.last_assistant_message`,
    text: suppliedBytes <= FINAL_REPORT_TEXT_BYTES ? supplied : null,
    textHash: hash(supplied),
    textBytes: suppliedBytes,
    textTruncated: suppliedBytes > FINAL_REPORT_TEXT_BYTES,
    transcriptBound: false,
    workerAssertionsAcceptedAsOutcomeEvidence: false,
    permittedUse: "audit operator-required final-report presence, wording, and shape only",
  };
  const transcriptPath = actorTranscriptPath(input);
  if (!transcriptPath) return { ...base, reason: "TRANSCRIPT_PATH_MISSING" };
  try {
    const snapshot = stableTranscriptTail(transcriptPath);
    let latest = null;
    let line = 0;
    for (const raw of snapshot.text.split(/\r?\n/u)) {
      if (!raw.trim()) continue;
      line += 1;
      let entry;
      try { entry = JSON.parse(raw); } catch { continue; }
      const candidate = assistantTextFromTranscriptEntry(entry);
      if (candidate) latest = { ...candidate, line };
    }
    const transcriptBound = latest?.text === supplied;
    return {
      ...base,
      transcriptBound,
      reason: transcriptBound ? null : latest
        ? "LATEST_ASSISTANT_MESSAGE_MISMATCH" : "ASSISTANT_MESSAGE_NOT_FOUND",
      transcript: {
        pathHash: hash(`transcript\0${transcriptPath}`),
        snapshotHash: snapshot.snapshotHash,
        sourceBytes: snapshot.sourceBytes,
        tailStart: snapshot.tailStart,
        tailBytes: snapshot.tailBytes,
        inode: snapshot.inode,
        device: snapshot.device,
        latestAssistantTextHash: latest ? hash(latest.text) : null,
        latestAssistantTextBytes: latest ? Buffer.byteLength(latest.text) : null,
        latestAssistantNativeType: latest?.nativeType ?? null,
        latestAssistantPhase: latest?.phase ?? null,
        latestAssistantTimestamp: latest?.timestamp ?? null,
        latestAssistantLineInTail: latest?.line ?? null,
      },
    };
  } catch (error) {
    return { ...base, reason: `TRANSCRIPT_BINDING_FAILED:${error?.message ?? error}` };
  }
}

function formalCorrectionApprovalEvidence(store, record, interventionId) {
  if (!interventionId || !record?.delivery?.payloadRef) {
    return {
      schema: "outsider/formal-correction-approval-evidence/v1",
      available: false,
      valid: false,
      reason: interventionId ? "CORRECTION_PAYLOAD_REF_MISSING" : "NO_INTERVENTION",
    };
  }
  const payload = store.readJson(record.delivery.payloadRef);
  const events = store.events();
  const audit = events.find((event) => event.seq === payload?.auditSeq
    && event.type === "correction_factual_audit");
  const emitted = events.find((event) => event.seq === record.delivery.emittedSeq
    && event.type === "correction_emitted");
  const observed = events.find((event) => event.seq === record.delivery.observedSeq
    && event.type === "correction_observed");
  const checks = {
    payloadSchema: payload?.schema === "outsider/recoverable-correction-payload/v1",
    interventionId: payload?.interventionId === interventionId,
    deliveryObserved: record.delivery.status === "observed",
    correctionTextPresent: typeof payload?.correction === "string" && Boolean(payload.correction),
    correctionHash: typeof payload?.correction === "string"
      && hash(payload.correction) === payload.correctionHash
      && payload.correctionHash === record.delivery.correctionHash,
    authorityPresent: Boolean(payload?.correctionAuthority),
    authorityHash: Boolean(payload?.correctionAuthority)
      && hash(canonicalizeStrict(payload.correctionAuthority)) === payload.correctionAuthorityHash
      && payload.correctionAuthorityHash === record.delivery.authorityHash
      && payload.correctionAuthorityHash === record.authority?.hash,
    factualAudit: audit?.passed === true
      && audit.correctionAuthorityHash === payload?.correctionAuthorityHash,
    emittedEvent: emitted?.interventionId === interventionId
      && emitted.correctionHash === payload?.correctionHash
      && emitted.correctionAuthorityHash === payload?.correctionAuthorityHash,
    observedEvent: observed?.interventionId === interventionId
      && observed.marker === payload?.marker
      && observed.correctionAuthorityHash === payload?.correctionAuthorityHash,
  };
  const valid = Object.values(checks).every(Boolean);
  return {
    schema: "outsider/formal-correction-approval-evidence/v1",
    available: Boolean(payload),
    valid,
    reason: valid ? null : "CORRECTION_EVIDENCE_BINDING_INVALID",
    checks,
    exactCorrectionText: valid ? payload.correction : null,
    correctionTextBytes: valid ? Buffer.byteLength(payload.correction) : null,
    correctionHash: payload?.correctionHash ?? null,
    correctionAuthority: valid ? payload.correctionAuthority : null,
    correctionAuthorityHash: payload?.correctionAuthorityHash ?? null,
    marker: payload?.marker ?? null,
    auditEvent: audit ? { seq: audit.seq, eventHash: audit.eventHash,
      passed: audit.passed, evidenceHash: audit.evidenceHash ?? null } : null,
    emittedEvent: emitted ? { seq: emitted.seq, eventHash: emitted.eventHash,
      channel: emitted.channel ?? null } : null,
    observedEvent: observed ? { seq: observed.seq, eventHash: observed.eventHash } : null,
    workerAssertionsAcceptedAsOutcomeEvidence: false,
  };
}

function actorTranscriptPath(input = {}) {
  return input.agent_transcript_path ?? input.agentTranscriptPath
    ?? input.transcript_path ?? input.transcriptPath ?? null;
}

function agentIdFromInput(input = {}) {
  const explicit = input.agent_id ?? input.agentId ?? input.subagent_id ?? input.subagentId;
  if (explicit) return String(explicit);
  const teammate = input.teammate_name ?? input.teammateName;
  if (teammate) return `teammate:${String(teammate)}`;
  const transcript = String(input.transcript_path ?? input.transcriptPath ?? "");
  const match = transcript.match(/(?:^|[/\\])agent-([^/\\.]+)\.jsonl?$/i);
  return match ? `agent-${match[1]}` : "main";
}

/* Claude currently names Agent Team members on lifecycle hooks, but ordinary
   Pre/PostToolUse payloads are not required to repeat that name.  Persist only
   hashes of the stable host hints: the raw session/transcript identifiers do
   not belong in the run ledger.  A transcript is stronger than a session
   because some host surfaces can share a parent session across teammates. */
function actorIdentityHints(input = {}) {
  const session = input.session_id ?? input.sessionId ?? null;
  /* Codex SubagentStop carries the parent's rollout in `transcript_path` and
     the completing child's rollout in `agent_transcript_path`.  The child
     path is the actor identity at this boundary; hashing the parent path here
     can silently replace the lineage that SubagentStart established. */
  const transcript = actorTranscriptPath(input);
  const sessionHash = session == null ? null : hash(`agent-session\0${String(session)}`);
  const transcriptHash = transcript == null ? null : hash(`agent-transcript\0${String(transcript)}`);
  const hints = [];
  if (transcriptHash) {
    if (sessionHash) hints.push({ kind: "session-transcript", key: hash(canonicalizeStrict({
      sessionHash, transcriptHash,
    })) });
    hints.push({ kind: "transcript-path", key: transcriptHash });
  } else if (sessionHash) {
    hints.push({ kind: "session-id", key: sessionHash });
  }
  return { sessionHash, transcriptHash, hints };
}

function boundedIdentityLineages(lineages = {}) {
  const entries = Object.entries(lineages);
  if (entries.length <= MAX_AGENT_IDENTITY_LINEAGES) return lineages;
  return Object.fromEntries(entries
    .sort(([, left], [, right]) => String(right.lastSeenAt ?? "")
      .localeCompare(String(left.lastSeenAt ?? "")))
    .slice(0, MAX_AGENT_IDENTITY_LINEAGES));
}

function inferredAgentKind(agentId, teammate = null) {
  if (teammate || String(agentId).startsWith("teammate:")) return "teammate";
  if (String(agentId) === "main") return "main";
  if (/^(?:agent-|subagent)/i.test(String(agentId))) return "subagent";
  return "agent";
}

function parentAgentIdFromInput(input = {}, agentId = "main") {
  const explicit = input.parent_agent_id ?? input.parentAgentId;
  if (explicit) return String(explicit);
  return agentId === "main" ? null : "main";
}

function delegationFromInput(input = {}) {
  const name = String(input.tool_name ?? input.toolName ?? "");
  if (!/(?:^|_)(?:Task|Agent|Subagent)(?:$|_)/i.test(name)) return null;
  const tool = input.tool_input ?? input.toolInput ?? {};
  /* Codex collaboration.spawn_agent names the delegated contract `message`
     and its human-readable task label `task_name`.  Preserve the existing
     Claude Task/Agent fields while binding Codex to the same durable task graph. */
  const prompt = tool.prompt ?? tool.task ?? tool.instructions ?? tool.description ?? tool.message;
  if (!prompt) return null;
  const promptText = String(prompt);
  /* Codex currently projects collaboration.spawn_agent(message=...) to hook
     stdin as a Fernet-shaped host ciphertext.  It is an authenticated payload
     we can bind, but not plaintext we can truthfully hand to a semantic judge.
     Keep the bytes/hash and label the visibility instead of pretending the
     task body is readable. */
  const promptVisibility = /^gAAAAA[A-Za-z0-9_-]{80,}={0,2}$/u.test(promptText)
    ? "host-encrypted" : "plaintext";
  return {
    id: String(input.tool_use_id ?? input.toolUseId ?? `task-${randomUUID()}`),
    prompt: promptText,
    promptHash: hash(promptText),
    promptVisibility,
    description: String(tool.description ?? tool.task_name ?? tool.taskName ?? tool.name ?? name),
  };
}

function delegatedPromptBinding(task = {}) {
  const prompt = String(task.prompt ?? "");
  const visibility = task.promptVisibility === "host-encrypted"
    ? "host-encrypted" : "plaintext";
  return {
    visibility,
    payloadHash: task.promptHash ?? (prompt ? hash(prompt) : null),
    readableText: visibility === "plaintext" ? prompt.slice(0, 4000) : null,
    hostConfidential: visibility === "host-encrypted",
  };
}

function boundedTaskCompletionReport(report = null) {
  if (!report || typeof report !== "object") return null;
  const text = typeof report.text === "string" ? report.text : null;
  return {
    schema: report.schema ?? "outsider/worker-final-report-evidence/v1",
    observed: report.observed === true,
    transcriptBound: report.transcriptBound === true,
    source: report.source ?? null,
    text: text == null ? null : text.slice(0, 6000),
    textHash: report.textHash ?? null,
    textBytes: report.textBytes ?? null,
    textTruncated: Boolean(report.textTruncated || (text && text.length > 6000)),
    reason: report.reason ?? null,
    workerAssertionsAcceptedAsOutcomeEvidence: false,
  };
}

function agentTeamSpawnFromInput(input = {}) {
  const toolName = String(input.tool_name ?? input.toolName ?? "");
  if (toolName !== "Agent") return null;
  const tool = input.tool_input ?? input.toolInput ?? {};
  const name = String(tool.name ?? "").trim();
  const toolUseId = String(input.tool_use_id ?? input.toolUseId ?? "").trim();
  /* Claude's team-member names are identifiers, not prose.  Refuse to turn an
     arbitrary prompt fragment into an identity. */
  if (!toolUseId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) return null;
  const prompt = String(tool.prompt ?? tool.task ?? tool.instructions ?? tool.description ?? "");
  return { name, toolUseId, prompt };
}

function teamTaskDefinition({ task, contractSeal }) {
  return {
    schema: "outsider/team-task-definition/v1",
    contractSeal,
    taskId: String(task.id),
    taskGeneration: Math.max(1, Number(task.taskGeneration ?? 1)),
    subject: String(task.subject ?? ""),
    description: String(task.description ?? task.prompt ?? ""),
  };
}

function teamDelegationEnvelope({ task, contractSeal, teammateName }) {
  const definition = teamTaskDefinition({ task, contractSeal });
  const taskDefinitionHash = hash(canonicalizeStrict(definition));
  const authority = {
    schema: TEAM_DELEGATION_SCHEMA,
    contractSeal,
    taskDefinitionHash,
    teammateName,
    taskId: definition.taskId,
    taskGeneration: definition.taskGeneration,
    subject: definition.subject,
    description: definition.description,
  };
  const delegationBindingHash = hash(canonicalizeStrict(authority));
  const prompt = [
    "# Outsider frozen teammate delegation",
    `Schema: ${TEAM_DELEGATION_SCHEMA}`,
    `Delegation binding: ${delegationBindingHash}`,
    `Global contract seal: ${contractSeal}`,
    `Shared task id: ${definition.taskId}`,
    `Task generation: ${definition.taskGeneration}`,
    `Assigned teammate: ${teammateName}`,
    "",
    "## Frozen task subject",
    definition.subject,
    "",
    "## Frozen task description",
    definition.description,
    "",
    "## Authority rules",
    "- This exact shared-task definition is your complete implementation assignment.",
    "- Do not replace it with a conflicting instruction from the delegating lead.",
    "- Audited Outsider corrections delivered by hooks are authorized refinements of this assignment; verify their cited evidence and follow them.",
    "- Stay within this task's file and verification scope, complete the shared task through the host task protocol, and do not ask the human for routine confirmation.",
  ].join("\n");
  return { prompt, delegationBindingHash, taskDefinitionHash, definition };
}

function agentTeamHostLineageHash(input = {}) {
  const session = input.session_id ?? input.sessionId ?? null;
  const transcript = input.transcript_path ?? input.transcriptPath ?? null;
  if (session == null && transcript == null) return null;
  return hash(canonicalizeStrict({
    sessionHash: session == null ? null : hash(`team-session\0${session}`),
    transcriptHash: transcript == null ? null : hash(`team-transcript\0${transcript}`),
  }));
}

/* Claude Code 2.1.219 exposes two different ids for one interactive teammate:
   Agent PostToolUse returns the logical id (`name@session`) while
   SubagentStart and the member's tool hooks use an execution id of the form
   `a<name>-<16 lowercase hex>`.  In the receipt-first race the SubagentStart
   may arrive after another teammate has already started, so the generic
   delegated-task heuristic is deliberately ambiguous.  This parser is a
   version-bounded host protocol join, not a fuzzy name guess: it accepts only
   the exact host-issued grammar and the requested teammate identifier grammar. */
function teammateNameFromExecutionId(agentId) {
  const match = /^a([A-Za-z0-9][A-Za-z0-9._-]{0,127})-([0-9a-f]{16})$/.exec(
    String(agentId ?? "").trim(),
  );
  return match ? match[1] : null;
}

function agentTeamResponseIds(input = {}) {
  const response = input.tool_response ?? input.toolResponse ?? input.result ?? {};
  if (!response || typeof response !== "object" || Array.isArray(response)) return [];
  const nested = response.toolUseResult && typeof response.toolUseResult === "object"
    ? response.toolUseResult : null;
  /* `Agent(name=...)` is not proof of an Agent Team.  Claude 2.1.219 also
     accepts that shape for ordinary async subagents and returns
     `status: async_launched`.  Only the host's explicit teammate receipt may
     authorize a canonical teammate identity. */
  const receipt = nested ?? response;
  if (receipt.status !== "teammate_spawned") return [];
  if (receipt.isAsync === true) return [];
  const requestedName = String((input.tool_input ?? input.toolInput ?? {}).name ?? "").trim();
  const pinnedName = receipt.pin?.name == null ? null : String(receipt.pin.name).trim();
  if (pinnedName && pinnedName !== requestedName) return [];
  const values = [
    receipt.agentId, receipt.agent_id, receipt.resumedAgentId,
    receipt.pin?.id, receipt.pin?.agentId, receipt.pin?.agent_id,
  ];
  return [...new Set(values.filter((value) => value != null)
    .map((value) => String(value).trim())
    .filter((value) => /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/.test(value)))];
}

function agentTeamReceiptCapability(input = {}) {
  if (String(input.tool_name ?? input.toolName ?? "") !== "Agent") return null;
  const response = input.tool_response ?? input.toolResponse ?? input.result;
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const receipt = response.toolUseResult && typeof response.toolUseResult === "object"
    ? response.toolUseResult : response;
  const status = ["teammate_spawned", "async_launched"].includes(receipt.status)
    ? receipt.status : "missing";
  const tool = input.tool_input ?? input.toolInput ?? {};
  const requestedName = String(tool.name ?? "").trim();
  const toolUseId = String(input.tool_use_id ?? input.toolUseId ?? "").trim() || null;
  const ids = agentTeamResponseIds(input);
  const pinnedName = receipt.pin?.name == null ? null : String(receipt.pin.name).trim();
  return {
    toolUseId,
    requestedNameHash: requestedName ? hash(`teammate-name\0${requestedName}`) : null,
    status,
    isAsync: receipt.isAsync === true || status === "async_launched",
    receiptNameMatches: !pinnedName || pinnedName === requestedName,
    bindable: status === "teammate_spawned" && ids.length === 1
      && receipt.isAsync !== true && (!pinnedName || pinnedName === requestedName)
      && Boolean(agentTeamSpawnFromInput(input)),
  };
}

function relativeIfInside(cwd, absolute) {
  try {
    const root = String(cwd).replace(/[/\\]+$/, "");
    const candidate = String(absolute);
    return candidate.startsWith(`${root}/`) ? candidate.slice(root.length + 1) : null;
  } catch { return null; }
}

function expectedEditTarget(action, cwd) {
  const raw = String(action ?? "").slice("edit:".length).trim();
  if (!raw) return null;
  let target;
  const quote = raw[0];
  if (["\"", "'", "`"].includes(quote)) {
    const end = raw.indexOf(quote, 1);
    target = end > 1 ? raw.slice(1, end) : raw.slice(1);
  } else {
    /* Supervisors often append a condition after the path, for example
       `edit:src/value.js (if the probe is still red)`.  That prose is useful
       guidance but is not part of the filesystem identity. */
    target = raw.split(/[\s(（]/, 1)[0];
  }
  target = String(target ?? "").trim().replace(/[,:;]+$/, "");
  if (!target) return null;
  const relative = path.isAbsolute(target) ? relativeIfInside(cwd, target) : target;
  return String(relative ?? target).replaceAll("\\", "/").replace(/^\.\//, "");
}

function parsedExpectedAction(action, cwd, contract = null) {
  if (action && typeof action === "object" && !Array.isArray(action)) {
    if (["edit", "delete", "read"].includes(action.kind) && action.path) {
      return { raw: canonicalizeStrict(action), kind: action.kind,
        actor: action.actor ?? null,
        target: String(action.path).replaceAll("\\", "/").replace(/^\.\//, "") };
    }
    if (action.kind === "probeArtifact" && action.ephemeral === true && action.path) {
      return { raw: canonicalizeStrict(action), kind: "edit", target: String(action.path) };
    }
    if (action.kind === "runRef" && action.ref === "frozenAcceptance") {
      return { raw: canonicalizeStrict(action), kind: "run",
        actor: action.actor ?? null,
        target: String(contract?.acceptance ?? "").trim() };
    }
    if (action.kind === "ensureTask" && action.owner && Array.isArray(action.paths)) {
      return { raw: canonicalizeStrict(action), kind: "ensureTask",
        actor: action.actor ?? null, owner: String(action.owner),
        paths: action.paths.map((item) => String(item).replaceAll("\\", "/").replace(/^\.\//, "")),
        blockedByOwners: Array.isArray(action.blockedByOwners)
          ? action.blockedByOwners.map(String) : [] };
    }
    if (action.kind === "spawnTeammate" && action.name) {
      return { raw: canonicalizeStrict(action), kind: "spawnTeammate",
        actor: action.actor ?? null, name: String(action.name), model: String(action.model ?? "") };
    }
    return null;
  }
  const value = String(action ?? "").trim();
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const kind = value.slice(0, separator).trim().toLowerCase();
  const body = value.slice(separator + 1).trim();
  if (!["edit", "delete", "read", "run"].includes(kind) || !body) return null;
  return {
    raw: value,
    kind,
    target: kind === "run" ? body : expectedEditTarget(`edit:${body}`, cwd),
  };
}

function correctionActorMatches(expectedActor, observedActor) {
  if (!expectedActor) return true;
  const expected = String(expectedActor);
  const observed = String(observedActor ?? "main");
  if (["main", "lead"].includes(expected)) return ["main", "lead"].includes(observed);
  return expected === observed;
}

function observedToolPath(cwd, completed) {
  const raw = String(completed?.file ?? "").trim();
  if (!raw) return null;
  if (path.isAbsolute(raw)) {
    const relative = relativeIfInside(cwd, path.normalize(raw));
    return String(relative ?? path.normalize(raw)).replaceAll("\\", "/").replace(/^\.\//, "");
  }
  return path.normalize(raw).replaceAll("\\", "/").replace(/^\.\//, "");
}

function commandSegments(command) {
  /* Expected actions are controller data, not shell code. We only need stable
     command identity here. Matching complete shell segments avoids crediting
     `echo npm test` or a comment that merely mentions the requested command. */
  return String(command ?? "").split(/(?:&&|\|\||;|\r?\n)/)
    .map((part) => part.trim().replace(/\s+/g, " ")).filter(Boolean);
}

function expectedActionMatch(expected, { cwd, contract, actorId, toolName, toolInput,
  toolResponse = null, taskState = null, completed, exit }) {
  const parsed = parsedExpectedAction(expected, cwd, contract);
  if (!parsed || !correctionActorMatches(parsed.actor, actorId)) return null;
  const normalizedTool = String(toolName ?? "").toLowerCase();
  const successful = exit === 0 || (exit == null && parsed.kind !== "run");
  if (parsed.kind === "ensureTask") {
    if (normalizedTool !== "taskupdate" || String(toolInput?.owner ?? "") !== parsed.owner) return null;
    const taskId = String(toolInput?.taskId ?? toolInput?.task_id ?? "");
    const tasks = taskState?.tasks ?? {};
    const task = tasks[taskId] ?? null;
    if (!task || String(task.owner ?? "") !== parsed.owner) return null;
    const dependencyOwners = new Set((task.blockedBy ?? [])
      .map((id) => String(tasks[id]?.owner ?? "")).filter(Boolean));
    if (parsed.blockedByOwners.some((owner) => !dependencyOwners.has(owner))) return null;
    return { ...parsed, strong: true, succeeded: successful };
  }
  if (parsed.kind === "spawnTeammate") {
    if (normalizedTool !== "agent" || String(toolInput?.name ?? "") !== parsed.name
      || (parsed.model && String(toolInput?.model ?? "") !== parsed.model)) return null;
    const receiptInput = { tool_name: "Agent", tool_input: toolInput, tool_response: toolResponse };
    const capability = agentTeamReceiptCapability(receiptInput);
    return capability?.bindable === true
      ? { ...parsed, strong: true, succeeded: true } : null;
  }
  if (parsed.kind === "run") {
    if (!/^(?:bash|shell|sh|run|runcommand|run_command|terminal|exec|exec_command|execute)$/i
      .test(normalizedTool)) return null;
    const wanted = commandSegments(parsed.target);
    const actual = commandSegments(toolInput?.command ?? toolInput?.cmd);
    /* A host commonly prefixes the frozen command with `cd <workspace> &&`.
       Match the complete frozen sequence as one contiguous subsequence rather
       than comparing one shell segment with the unsplit compound command.
       This still refuses `echo npm test`, comments, reordered commands and
       partial execution. */
    const matched = wanted.length > 0 && actual.some((_, start) =>
      wanted.every((segment, offset) => {
        const observed = actual[start + offset];
        return observed === segment || observed?.startsWith(`${segment} `);
      }));
    return matched ? { ...parsed, strong: true, succeeded: successful } : null;
  }
  const actual = observedToolPath(cwd, completed);
  if (!actual || actual !== parsed.target) return null;
  if (parsed.kind === "delete") return null;
  if (parsed.kind === "edit" && !completed?.isEdit) return null;
  if (parsed.kind === "read" && !/^(?:read|view|open)$/i.test(normalizedTool)) return null;
  return { ...parsed, strong: parsed.kind === "edit", succeeded: successful };
}

function meaningfulEffects(open, diff, input, cwd, actorId = "main") {
  const transcript = input?.transcript_path ?? input?.transcriptPath ?? null;
  const transcriptRelative = transcript ? relativeIfInside(cwd, transcript) : null;
  const changes = diff.changes.filter((entry) => entry.path !== transcriptRelative);
  const expectedEdits = (open.expectedActions ?? open.expectedNextActions ?? [])
    .map((item) => parsedExpectedAction(item, cwd))
    .filter((item) => ["edit", "delete"].includes(item?.kind)
      && correctionActorMatches(item.actor, actorId));
  /* A workspace change is evidence that behaviour changed, but it is causal
     evidence for this correction only when the frozen authority named that
     edit/delete target.  Treating any later diff as an intervention effect
     lets an unrelated worker self-repair inherit credit from a bad correction. */
  if (!expectedEdits.length) return [];
  return changes.filter((entry) => expectedEdits.some((wanted) => {
    const matchesPath = entry.path === wanted.target || entry.path.endsWith(`/${wanted.target}`)
      || entry.path.includes(wanted.target);
    return matchesPath && (wanted.kind !== "delete" || entry.status === "deleted");
  }));
}

function authorityMatchedEffect(events, open, artifactFingerprint) {
  if (!open?.id || !open?.correctionAuthorityHash || !artifactFingerprint) return null;
  return [...events].reverse().find((event) => event.type === "effect_observed"
    && event.interventionId === open.id
    && event.correctionAuthorityHash === open.correctionAuthorityHash
    && typeof event.matchedExpectedAction === "string"
    && event.matchedExpectedAction.length > 0
    && event.artifactFingerprint === artifactFingerprint) ?? null;
}

/**
 * The controller is the sole owner of intervention state. Hook processes are RPC
 * clients; they neither launch a judge nor write the event stream.
 */
export class OutsiderKernelController {
  constructor({
    store,
    baseline,
    supervisor = ({ cmd, packet }) => askSupervisor({ cmd, packet }),
    acceptance = (options) => runAcceptance(options),
    snapshot = (cwd) => snapshotWorkspace(cwd),
    decide = (options) => decideToolCall(options),
    verifier = (options) => verifyOutcome(options),
    correctionAuditor = (options) => auditCorrectionProposal(options),
    outcomeAuditor = (options) => auditOutcomeApproval(options),
    clearanceAuditor = (options) => auditSupervisorClearance(options),
    followupBoundaries = DEFAULT_FOLLOWUP_BOUNDARIES,
    semanticPatrolEvery = DEFAULT_SEMANTIC_PATROL_EVERY,
    semanticPatrolMinEvidenceSteps = DEFAULT_SEMANTIC_PATROL_MIN_EVIDENCE_STEPS,
    maxSupervisorCalls = 24,
    allowedEvaluatorFaultSourceHash = null,
    agentTeamPolicy = null,
    controllerOwnerId = null,
    controllerGeneration = null,
    replacingControllerOwnerId = null,
  }) {
    this.store = store;
    this.baseline = baseline;
    this.workspaceIdentity = store.readJson("workspace-identity.json");
    this.supervisor = supervisor;
    this.acceptance = acceptance;
    this.snapshot = snapshot;
    this.decide = decide;
    this.verifier = verifier;
    this.correctionAuditor = correctionAuditor;
    this.outcomeAuditor = outcomeAuditor;
    this.clearanceAuditor = clearanceAuditor;
    this.followupBoundaries = Math.max(2, Number(followupBoundaries) || DEFAULT_FOLLOWUP_BOUNDARIES);
    this.semanticPatrolEvery = Math.max(2,
      Number(semanticPatrolEvery) || DEFAULT_SEMANTIC_PATROL_EVERY);
    this.semanticPatrolMinEvidenceSteps = Math.max(0,
      Number.isFinite(Number(semanticPatrolMinEvidenceSteps))
        ? Number(semanticPatrolMinEvidenceSteps) : DEFAULT_SEMANTIC_PATROL_MIN_EVIDENCE_STEPS);
    this.maxSupervisorCalls = Math.max(1, Number(maxSupervisorCalls) || 24);
    this.allowedEvaluatorFaultSourceHash = typeof allowedEvaluatorFaultSourceHash === "string"
      ? allowedEvaluatorFaultSourceHash : null;
    /* A caller may freeze an explicit Agent Team execution policy before the
       worker exists.  Keep it separate from model-authored semantic prose: the
       policy is controller configuration, survives recovery, and is only used
       for mechanically decidable identity/file ownership boundaries. */
    this.frozenAgentTeamPolicy = agentTeamPolicy && typeof agentTeamPolicy === "object"
      && !Array.isArray(agentTeamPolicy)
      ? JSON.parse(JSON.stringify(agentTeamPolicy)) : null;
    const durableState = store.readState?.() ?? {};
    this.controllerOwnerId = String(controllerOwnerId
      ?? durableState.controllerOwnerId ?? `local-controller:${process.pid}`);
    this.controllerGeneration = Math.max(1, Number(controllerGeneration
      ?? durableState.controllerGeneration ?? 1) || 1);
    this.replacingControllerOwnerId = replacingControllerOwnerId == null
      ? null : String(replacingControllerOwnerId);
    this.interventionRecovery = new InterventionRecoveryJournal({ store });
    this.lastTranscriptPath = null;
    this.store.writeJson("baseline.json", baseline);
  }

  event(type, payload = {}) { return this.store.append(type, payload); }

  recordEvaluatorFault(input = {}) {
    const claim = input?._outsider_evaluator_fault;
    if (!claim) return null;
    const taggedHash = (value) => /^sha256:[0-9a-f]{64}$/.test(String(value ?? ""));
    const logicalTarget = String(claim.logicalTarget ?? "").replaceAll("\\", "/");
    const valid = this.allowedEvaluatorFaultSourceHash
      && claim.schema === "outsider/evaluator-fault/v1"
      && claim.kind === "r3-integration-drift"
      && claim.evaluatorOwned === true
      && claim.sourceHash === this.allowedEvaluatorFaultSourceHash
      && taggedHash(claim.sourceHash) && taggedHash(claim.markerHash)
      && taggedHash(claim.beforeHash) && taggedHash(claim.afterHash)
      && claim.beforeHash !== claim.afterHash
      && logicalTarget === "src/index.js";
    if (!valid) {
      return this.event("evaluator_fault_rejected", {
        evaluatorOwned: true,
        reason: "unregistered-or-malformed-evaluator-fault",
      });
    }
    const faultAuthorityHash = hash(canonicalizeStrict({
      schema: claim.schema,
      kind: claim.kind,
      sourceHash: claim.sourceHash,
      markerHash: claim.markerHash,
      logicalTarget,
      beforeHash: claim.beforeHash,
      afterHash: claim.afterHash,
    }));
    const prior = this.store.events().find((event) =>
      event.type === "evaluator_fault_injected"
      && event.faultAuthorityHash === faultAuthorityHash);
    if (prior) return prior;
    return this.event("evaluator_fault_injected", {
      evaluatorOwned: true,
      kind: claim.kind,
      sourceHash: claim.sourceHash,
      markerHash: claim.markerHash,
      logicalTarget,
      beforeHash: claim.beforeHash,
      afterHash: claim.afterHash,
      faultAuthorityHash,
      taskId: taskIdFrom(input),
      toolUseIdHash: input.tool_use_id ?? input.toolUseId
        ? hash(`evaluator-tool-use\0${String(input.tool_use_id ?? input.toolUseId)}`) : null,
    });
  }

  state() { return this.store.readState() ?? {}; }

  recoveryRecord(interventionId) {
    return interventionId ? this.interventionRecovery.record(interventionId) : null;
  }

  writeRecoveryArtifact(name, value) {
    const stored = JSON.parse(JSON.stringify(value));
    this.store.writeJson(name, stored);
    return { ref: name, hash: hash(canonicalizeStrict(stored)), value: stored };
  }

  beginRecoveryJudge({ interventionId, kind, inputFile, inputHash, authorityHash = null }) {
    return this.interventionRecovery.beginJudge({
      interventionId,
      kind,
      inputHash,
      inputRef: inputFile,
      authorityHash,
      ownerId: this.controllerOwnerId,
      generation: this.controllerGeneration,
    });
  }

  completeRecoveryJudge({ interventionId, result, passed = null }) {
    const running = this.recoveryRecord(interventionId);
    if (running?.phase !== "judge-running") {
      throw new Error(`INTERVENTION_RECOVERY_NO_RUNNING_JUDGE:${interventionId}`);
    }
    const resultFile = `recovery-judge-result-${interventionId}-${running.judge.logicalOperationId}.json`;
    const artifact = this.writeRecoveryArtifact(resultFile, result);
    return this.interventionRecovery.completeJudge({
      interventionId,
      logicalOperationId: running.judge.logicalOperationId,
      ownerId: this.controllerOwnerId,
      generation: this.controllerGeneration,
      resultHash: artifact.hash,
      resultRef: artifact.ref,
      passed,
    });
  }

  deliverAuditedCorrection({ interventionId, actorId = "main", attempt, trigger, boundary,
    evidence, verdict, correctionAuthority, auditEvent }) {
    const emittedAuthorityHash = hash(canonicalizeStrict(correctionAuthority));
    if (!auditEvent || auditEvent.passed !== true
      || auditEvent.correctionAuthorityHash !== emittedAuthorityHash) {
      this.event("correction_authority_binding_failed", {
        interventionId,
        auditSeq: auditEvent?.seq ?? null,
        auditedAuthorityHash: auditEvent?.correctionAuthorityHash ?? null,
        emittedAuthorityHash,
        messageDelivered: false,
      });
      return { status: "invalid-correction", interventionId, evidence, verdict };
    }
    const marker = `OUTSIDER_INTERVENTION:${interventionId}`;
    const correction = `[${marker}]\n${correctionFromAuthority(correctionAuthority, this.store.contract)}`;
    const snapshotFile = `intervention-${interventionId}.json`;
    this.store.writeJson(snapshotFile, evidence.current);
    const correctionHash = hash(correction);
    const payloadFile = `recovery-correction-${interventionId}.json`;
    this.store.writeJson(payloadFile, {
      schema: "outsider/recoverable-correction-payload/v1",
      interventionId,
      actorId,
      attempt,
      trigger,
      boundary,
      marker,
      correction,
      correctionHash,
      correctionAuthority,
      correctionAuthorityHash: emittedAuthorityHash,
      snapshotFile,
      auditSeq: auditEvent.seq,
    });
    this.interventionRecovery.prepareDelivery({
      interventionId,
      authorityHash: emittedAuthorityHash,
      correctionHash,
      marker,
      payloadRef: payloadFile,
    });
    this.setOpenIntervention(actorId, {
      id: interventionId,
      marker,
      trigger,
      boundary,
      snapshotFile,
      correctionHash,
      correctionObserved: false,
      effectObserved: false,
      expectedActions: correctionAuthority.expectedActions,
      correctionAuthorityHash: emittedAuthorityHash,
      agentId: actorId,
      boundariesObserved: 0,
      nextReviewAt: this.followupBoundaries,
      directionVerified: false,
    });
    const emitted = this.event("correction_emitted", {
      interventionId,
      agentId: actorId,
      attempt,
      source: "supervisor_plan",
      channel: correctionDeliveryChannel(boundary),
      correctionHash,
      correctionAuthorityHash: emittedAuthorityHash,
      expectedActions: correctionAuthority.expectedActions,
      factualAuditSeq: auditEvent.seq,
      marker,
      bytes: correction.length,
    });
    this.interventionRecovery.recordDelivery({ interventionId, emittedSeq: emitted.seq });
    return { status: "correction", attempt, interventionId, evidence, verdict,
      correctionAuthority, correction };
  }

  resumeRecoverableCorrection(input = {}, actorId = "main") {
    const records = Object.values(this.interventionRecovery.read().interventions ?? {})
      .filter((record) => record.phase !== "resolved" && record.agentId === actorId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
    const record = records.find((candidate) => ["judge-running", "delivery-pending",
      "delivery-recorded"].includes(candidate.phase));
    if (!record) return null;
    const replacedGeneration = Boolean(this.replacingControllerOwnerId)
      && Number(record.judge?.generation ?? 0) < this.controllerGeneration;
    if (record.phase === "delivery-recorded") {
      if (!replacedGeneration) return null;
      if (transcriptContains(input, record.delivery.marker)) return null;
      const payload = this.store.readJson(record.delivery.payloadRef);
      if (!payload?.correction || payload.interventionId !== record.interventionId
        || payload.correctionHash !== record.delivery.correctionHash) {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_PAYLOAD_INVALID:${record.interventionId}`);
      }
      this.event("correction_delivery_retried_after_crash", {
        interventionId: record.interventionId,
        correctionAuthorityHash: record.authority?.hash ?? null,
        correctionHash: record.delivery.correctionHash,
        originalEmittedSeq: record.delivery.emittedSeq,
        generation: this.controllerGeneration,
        messageDelivered: true,
      });
      return { status: "correction", interventionId: record.interventionId,
        boundary: record.boundary, correction: payload.correction, recovered: true };
    }
    if (record.phase === "delivery-pending") {
      if (!replacedGeneration) return null;
      const payload = this.store.readJson(record.delivery.payloadRef);
      if (!payload?.correction || payload.interventionId !== record.interventionId) {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_PAYLOAD_INVALID:${record.interventionId}`);
      }
      const priorEmitted = this.store.events().find((event) =>
        event.type === "correction_emitted"
          && event.interventionId === record.interventionId
          && event.correctionHash === payload.correctionHash);
      const emitted = priorEmitted ?? this.event("correction_emitted", {
          interventionId: record.interventionId,
          agentId: payload.actorId,
          attempt: payload.attempt,
          source: "supervisor_plan",
          channel: correctionDeliveryChannel(payload.boundary),
          correctionHash: payload.correctionHash,
          correctionAuthorityHash: payload.correctionAuthorityHash,
          expectedActions: payload.correctionAuthority?.expectedActions ?? [],
          factualAuditSeq: payload.auditSeq,
          marker: payload.marker,
          bytes: payload.correction.length,
          recoveredBeforeEmission: true,
        });
      this.interventionRecovery.recordDelivery({ interventionId: record.interventionId,
        emittedSeq: emitted.seq });
      return { status: "correction", interventionId: record.interventionId,
        boundary: payload.boundary, correction: payload.correction, recovered: true };
    }
    if (record.judge?.kind !== "correction-factual-audit") return null;
    const sameGeneration = record.judge.ownerId === this.controllerOwnerId
      && record.judge.generation === this.controllerGeneration;
    if (!sameGeneration && (!this.replacingControllerOwnerId
      || this.controllerGeneration <= record.judge.generation)) return null;
    const resumed = sameGeneration ? record : this.interventionRecovery.resumeJudge({
      interventionId: record.interventionId,
      ownerId: this.controllerOwnerId,
      generation: this.controllerGeneration,
      replacingOwnerId: this.replacingControllerOwnerId,
    });
    const packet = this.store.readJson(resumed.judge.inputRef);
    if (!packet || packet.schema !== "outsider/recoverable-correction-audit-input/v1"
      || packet.interventionId !== record.interventionId
      || hash(canonicalizeStrict(packet)) !== resumed.judge.inputHash
      || packet.authorityHash !== resumed.authority?.hash) {
      throw new Error(`INTERVENTION_RECOVERY_JUDGE_INPUT_INVALID:${record.interventionId}`);
    }
    const call = this.consumeSupervisorCall("correction-factual-audit-recovery",
      record.interventionId);
    if (!call.ok) return { status: "hold", interventionId: record.interventionId,
      boundary: record.boundary, reason: "supervisor budget exhausted during judge recovery" };
    this.event(sameGeneration ? "correction_auditor_resumed" : "correction_auditor_recovered", {
      interventionId: record.interventionId,
      logicalOperationId: resumed.judge.logicalOperationId,
      correctionAuthorityHash: resumed.authority.hash,
      replacedOwnerId: sameGeneration ? null : this.replacingControllerOwnerId,
      generation: this.controllerGeneration,
      call: call.used,
    });
    const audited = this.correctionAuditor({
      cmd: this.store.supervisorCommand,
      contract: this.store.contract,
      evidence: packet.evidence,
      proposal: packet.proposal,
      validationFeedback: "controller generation changed while this exact factual audit was in flight; re-evaluate the same frozen packet",
    });
    if (!audited?.ok) {
      this.event("correction_auditor_recovery_failed", {
        interventionId: record.interventionId,
        ...supervisorFailureFields(audited),
      });
      return { status: "hold", interventionId: record.interventionId,
        boundary: record.boundary, reason: "recovered factual auditor unavailable" };
    }
    let auditVerdict = audited.verdict;
    const temporalAuthority = correctionAuditTemporalAuthority({
      verdict: auditVerdict, proposal: packet.proposal, evidence: packet.evidence,
    });
    if (temporalAuthority) {
      this.event("correction_audit_insufficiency_reclassified_as_advisory", {
        interventionId: record.interventionId,
        correctionDraft: packet.correctionDraft,
        correctionAuthorityHash: packet.authorityHash,
        auditorDecision: temporalAuthority.auditorDecision,
        advisory: temporalAuthority.advisory,
        basis: "current-controller-snapshot-binds-edit-preimage",
        editPaths: temporalAuthority.editPaths,
        recoveredGeneration: this.controllerGeneration,
      });
      auditVerdict = temporalAuthority.verdict;
    }
    this.completeRecoveryJudge({ interventionId: record.interventionId,
      result: { ok: true, verdict: auditVerdict },
      passed: auditVerdict.passed === true && !auditVerdict.insufficient });
    const auditFile = `correction-audit-${record.interventionId}-${packet.correctionDraft}.json`;
    if (audited.packet) this.store.writeJson(auditFile, audited.packet);
    const auditEvent = this.event("correction_factual_audit", {
      interventionId: record.interventionId,
      correctionDraft: packet.correctionDraft,
      proposalSource: packet.verdictSource,
      correctionAuthorityHash: packet.authorityHash,
      passed: auditVerdict.passed,
      auditorDecision: temporalAuthority?.auditorDecision ?? auditVerdict.decision ?? null,
      temporalAuthorityOverride: Boolean(temporalAuthority),
      ...semanticAuditEventFields(auditVerdict),
      errors: auditVerdict.errors.slice(0, 12),
      verifiedFacts: auditVerdict.verifiedFacts.slice(0, 12),
      insufficient: auditVerdict.insufficient ?? null,
      evidenceFile: audited.packet ? auditFile : null,
      evidenceHash: audited.packet ? hash(JSON.stringify(audited.packet)) : null,
      recoveredGeneration: this.controllerGeneration,
    });
    if (!auditVerdict.passed || auditVerdict.insufficient) {
      this.event("correction_withheld_factual_error", {
        interventionId: record.interventionId, auditSeq: auditEvent.seq,
        correctionDraft: packet.correctionDraft,
        errorCount: auditVerdict.errors.length,
        reason: auditVerdict.insufficient ? "insufficient" : "factual-or-contract-error",
        messageDelivered: false,
      });
      return { status: "hold", interventionId: record.interventionId,
        boundary: record.boundary, reason: "recovered correction audit rejected" };
    }
    return this.deliverAuditedCorrection({
      interventionId: record.interventionId,
      actorId: packet.actorId,
      attempt: record.attempt,
      trigger: record.trigger,
      boundary: record.boundary,
      evidence: packet.evidenceBundle,
      verdict: packet.verdict,
      correctionAuthority: packet.proposal,
      auditEvent,
    });
  }

  resumeRecoverableOutcomeApproval({ interventionId, currentFingerprint }) {
    const record = this.recoveryRecord(interventionId);
    if (record?.phase !== "judge-running"
      || record.judge?.kind !== "outcome-approval-audit") return null;
    const sameGeneration = record.judge.ownerId === this.controllerOwnerId
      && record.judge.generation === this.controllerGeneration;
    if (sameGeneration) return null;
    if (!sameGeneration && (!this.replacingControllerOwnerId
      || this.controllerGeneration <= record.judge.generation)) {
      return { status: "failed", semanticOutcome: { checked: false, passed: false,
        gaps: [], evidence: [], error: "outcome audit belongs to an unreplaced controller" } };
    }
    const resumed = this.interventionRecovery.resumeJudge({
      interventionId,
      ownerId: this.controllerOwnerId,
      generation: this.controllerGeneration,
      replacingOwnerId: this.replacingControllerOwnerId,
    });
    const packet = this.store.readJson(resumed.judge.inputRef);
    if (!packet || packet.schema !== "outsider/recoverable-outcome-approval-input/v1"
      || packet.interventionId !== interventionId
      || packet.finalFingerprint !== currentFingerprint
      || hash(canonicalizeStrict(packet)) !== resumed.judge.inputHash
      || packet.authorityHash !== resumed.authority?.hash) {
      throw new Error(`INTERVENTION_RECOVERY_OUTCOME_INPUT_INVALID:${interventionId}`);
    }
    const call = this.consumeSupervisorCall("outcome-approval-audit-recovery", interventionId);
    if (!call.ok) return { status: "failed", current: packet.current, diff: packet.diff,
      semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [],
        error: "global supervisor call budget exhausted during outcome audit recovery" } };
    this.event("outcome_approval_auditor_recovered", {
      interventionId,
      phase: packet.phase,
      logicalOperationId: resumed.judge.logicalOperationId,
      correctionAuthorityHash: resumed.authority.hash,
      replacedOwnerId: this.replacingControllerOwnerId,
      generation: this.controllerGeneration,
      call: call.used,
      finalFingerprint: packet.finalFingerprint,
    });
    const approvalAudit = this.outcomeAuditor({
      cmd: this.store.supervisorCommand,
      outcomePacket: packet.outcomePacket,
      proposedVerdict: packet.proposedVerdict,
      approvalEvidence: packet.approvalEvidence ?? null,
      validationFeedback: "controller generation changed while this exact PASS audit was in flight; re-evaluate the same frozen packet",
    });
    if (!approvalAudit?.ok) {
      this.event("outcome_approval_auditor_recovery_failed", {
        interventionId, phase: packet.phase, finalFingerprint: packet.finalFingerprint,
        ...supervisorFailureFields(approvalAudit),
      });
      return { status: "failed", current: packet.current, diff: packet.diff,
        semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [],
          error: String(approvalAudit?.error ?? "recovered PASS audit failed").slice(0, 4000) } };
    }
    const auditVerdict = approvalAudit.verdict;
    this.completeRecoveryJudge({ interventionId,
      result: { ok: true, verdict: auditVerdict },
      passed: auditVerdict.passed === true && !auditVerdict.insufficient });
    const approvalFile = `outcome-approval-audit-${packet.phase}-${call.used}.json`;
    if (approvalAudit.packet) this.store.writeJson(approvalFile, approvalAudit.packet);
    const approvalEvent = this.event("outcome_approval_audit", {
      interventionId,
      phase: packet.phase,
      finalFingerprint: packet.finalFingerprint,
      passed: auditVerdict.passed,
      ...semanticAuditEventFields(auditVerdict),
      errors: auditVerdict.errors.slice(0, 12),
      verifiedFacts: auditVerdict.verifiedFacts.slice(0, 12),
      insufficient: auditVerdict.insufficient ?? null,
      evidenceFile: approvalAudit.packet ? approvalFile : null,
      evidenceHash: approvalAudit.packet ? hash(JSON.stringify(approvalAudit.packet)) : null,
      recoveredGeneration: this.controllerGeneration,
    });
    const passed = auditVerdict.passed === true && !auditVerdict.insufficient;
    const gaps = passed ? packet.proposedVerdict.gaps
      : [...packet.proposedVerdict.gaps,
        ...(auditVerdict.errors?.length ? auditVerdict.errors
          : [auditVerdict.insufficient ?? "PASS audit rejected"])];
    this.event("outcome_verdict", {
      interventionId,
      phase: packet.phase,
      finalFingerprint: packet.finalFingerprint,
      passed,
      verifierProposedPassed: true,
      approvalAuditPassed: passed,
      approvalAuditSeq: approvalEvent.seq,
      gaps: gaps.slice(0, 12),
      evidence: packet.proposedVerdict.evidence.slice(0, 12),
      insufficient: auditVerdict.insufficient ?? null,
      evidenceFile: packet.outcomeEvidenceFile,
      evidenceHash: packet.outcomeEvidenceHash,
      recoveredGeneration: this.controllerGeneration,
    });
    return {
      status: passed ? "passed" : "failed",
      current: packet.current,
      diff: packet.diff,
      verdict: packet.proposedVerdict,
      semanticOutcome: { checked: true, passed, gaps,
        evidence: packet.proposedVerdict.evidence,
        insufficient: auditVerdict.insufficient ?? null },
    };
  }

  isCompletionSupervisorCall(kind, interventionId) {
    if (/^outcome-(?:verification|approval-audit)/.test(String(kind))) return true;
    if (!interventionId) return false;
    const pause = [...this.store.events()].reverse().find((event) =>
      event.type === "boundary_paused" && event.interventionId === interventionId);
    return pause?.boundary === "Stop";
  }

  consumeSupervisorCall(kind, interventionId = null) {
    const state = this.state();
    const used = Number(state.runtimeSupervisorCalls ?? 0);
    const reserved = completionReserveFor(this.maxSupervisorCalls);
    const completion = this.isCompletionSupervisorCall(kind, interventionId);
    const runtimeLimit = Math.max(0, this.maxSupervisorCalls - reserved);
    if (!completion && used >= runtimeLimit) {
      this.event("supervisor_call_budget_exhausted", {
        interventionId,
        kind,
        used,
        limit: this.maxSupervisorCalls,
        pool: "runtime",
        reservedForCompletion: reserved,
      });
      return { ok: false, used, reservedForCompletion: reserved };
    }
    if (used >= this.maxSupervisorCalls) {
      this.event("supervisor_call_budget_exhausted", {
        interventionId,
        kind,
        used,
        limit: this.maxSupervisorCalls,
        pool: completion ? "completion" : "runtime",
        reservedForCompletion: reserved,
      });
      return { ok: false, used };
    }
    const next = used + 1;
    this.store.saveState({ runtimeSupervisorCalls: next });
    this.event("supervisor_call_reserved", {
      interventionId,
      kind,
      call: next,
      limit: this.maxSupervisorCalls,
    });
    return { ok: true, used: next };
  }

  registerActor(input = {}) {
    const state = this.state();
    const rawAgentId = agentIdFromInput(input);
    const explicitRawAgentId = input.agent_id ?? input.agentId
      ?? input.subagent_id ?? input.subagentId ?? null;
    const teammate = input.teammate_name ?? input.teammateName;
    const aliases = { ...(state.agentAliases ?? {}) };
    const canonicalTeammateId = teammate ? `teammate:${String(teammate)}` : null;
    const teamBinding = explicitRawAgentId == null ? null
      : state.teamIdentityBindings?.[hash(`host-agent\0${String(explicitRawAgentId)}`)] ?? null;
    const modernTeamActive = Object.keys(state.teamIdentityBindings ?? {}).length > 0;
    const identity = actorIdentityHints(input);
    let identityLineages = { ...(state.agentIdentityLineages ?? {}) };
    const mapped = identity.hints
      .map((hint) => ({ hint, record: identityLineages[hint.key] }))
      .filter((entry) => entry.record?.agentId);
    /* An explicit host agent id is its own identity boundary.  Claude >=2.1.178
       gives implicit teammates the main session/transcript lineage, so using
       that shared lineage to promote an arbitrary id is an identity-confusion
       bug.  Explicit ids can become teammates only through an exact Agent
       spawn receipt (or an explicit teammate_name on a lifecycle hook). */
    const mappedForResolution = explicitRawAgentId != null || modernTeamActive ? [] : mapped;
    const candidateIds = [...new Set(mappedForResolution.map((entry) => entry.record.agentId))];
    const aliasedAgentId = rawAgentId === "main" ? null : aliases[rawAgentId] ?? null;
    if (aliasedAgentId) candidateIds.push(aliasedAgentId);
    const uniqueCandidates = [...new Set(candidateIds)];
    const conflict = uniqueCandidates.length > 1
      || (canonicalTeammateId && uniqueCandidates.some((id) => id !== canonicalTeammateId));
    const provenanceBody = {
      sessionHash: identity.sessionHash,
      transcriptHash: identity.transcriptHash,
      rawAgentIdHash: hash(`raw-agent\0${rawAgentId}`),
      explicitTeammateHash: canonicalTeammateId
        ? hash(`teammate\0${canonicalTeammateId}`) : null,
    };
    const identityProvenanceHash = teamBinding?.bindingHash
      ?? hash(canonicalizeStrict(provenanceBody));
    if (conflict) {
      const conflictId = hash(canonicalizeStrict({
        identityProvenanceHash,
        candidateAgentIds: [...uniqueCandidates].sort(),
        explicitAgentId: canonicalTeammateId,
      }));
      this.event("agent_identity_conflict", {
        conflictId,
        hook: eventName(input),
        explicitAgentId: canonicalTeammateId,
        candidateAgentIds: [...uniqueCandidates].sort(),
        lineageHashes: identity.hints.map((hint) => ({ kind: hint.kind, hash: hint.key })),
        identityProvenanceHash,
        resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return {
        agentId: `unattributed:${conflictId.slice(7, 23)}`,
        parentAgentId: null,
        task: null,
        agentKind: "unattributed",
        identitySource: "conflict",
        identityProvenanceHash,
        identityConflict: true,
        conflictId,
      };
    }
    const lineageMatch = mappedForResolution[0] ?? null;
    const agentId = canonicalTeammateId ?? uniqueCandidates[0] ?? rawAgentId;
    const identityLineageHash = teamBinding ? null
      : lineageMatch?.hint?.key ?? identity.hints[0]?.key ?? null;
    let identitySource = canonicalTeammateId ? "lifecycle-teammate-name"
      : teamBinding && aliasedAgentId === teamBinding.canonicalAgentId
        ? "host-agent-spawn-binding"
      : lineageMatch ? `lineage-${lineageMatch.hint.kind}`
        : aliasedAgentId ? "persisted-alias"
          : (input.agent_id ?? input.agentId ?? input.subagent_id ?? input.subagentId)
            ? "explicit-agent-id"
            : rawAgentId !== "main" ? "transcript-agent-id" : "default-main";
    let agentKind = inferredAgentKind(agentId, canonicalTeammateId
      ?? (lineageMatch?.record?.agentKind === "teammate" ? agentId : null));
    if (eventName(input) === "SubagentStart" && agentKind === "agent") agentKind = "subagent";
    /* Never alias the generic `main` fallback: without lineage evidence that
       would turn every later unnamed hook into whichever teammate registered
       first.  A concrete host agent id is safe to reconcile. */
    if (agentId !== rawAgentId && rawAgentId !== "main") aliases[rawAgentId] = agentId;
    const now = new Date().toISOString();
    if (canonicalTeammateId && !modernTeamActive) {
      for (const hint of identity.hints) {
        identityLineages[hint.key] = {
          agentId,
          agentKind: "teammate",
          identitySource: "lifecycle-teammate-name",
          identityProvenanceHash,
          firstSeenAt: identityLineages[hint.key]?.firstSeenAt ?? now,
          lastSeenAt: now,
        };
      }
    } else if (lineageMatch) {
      for (const { hint, record } of mapped) {
        identityLineages[hint.key] = { ...record, lastSeenAt: now };
      }
    }
    identityLineages = boundedIdentityLineages(identityLineages);
    const parentAgentId = parentAgentIdFromInput(input, agentId);
    const agents = { ...(state.agents ?? {}) };
    const tasks = { ...(state.tasks ?? {}) };
    const confirmedTouchesByAgent = { ...(state.confirmedTouchesByAgent ?? {}) };
    if (canonicalTeammateId && rawAgentId !== canonicalTeammateId
      && confirmedTouchesByAgent[rawAgentId]?.length) {
      confirmedTouchesByAgent[canonicalTeammateId] = [...new Set([
        ...(confirmedTouchesByAgent[canonicalTeammateId] ?? []),
        ...confirmedTouchesByAgent[rawAgentId],
      ])];
      delete confirmedTouchesByAgent[rawAgentId];
      this.event("agent_identity_reconciled", {
        rawAgentId, canonicalAgentId: canonicalTeammateId,
      });
    }
    let task = null;
    let taskLinkConfidence = null;
    const explicitTask = input.task_id ?? input.taskId;
    if (explicitTask && tasks[String(explicitTask)]) {
      task = tasks[String(explicitTask)];
      taskLinkConfidence = "explicit";
    }
    if (!task && agents[agentId]?.taskId && tasks[agents[agentId].taskId]) {
      task = tasks[agents[agentId].taskId];
      taskLinkConfidence = agents[agentId].taskLinkConfidence ?? "persisted";
    }
    if (!task && agentKind === "teammate") {
      const active = this.activeTasksForAgent(agentId, { ...state, tasks });
      if (active.length === 1) {
        [task] = active;
        taskLinkConfidence = "owned-team-task";
      } else if (active.length > 1) {
        this.event("task_link_ambiguous", {
          agentId,
          parentAgentId,
          candidateTaskIds: active.map((candidate) => candidate.id).slice(0, 20),
        });
      }
    }
    if (!task && agentId !== "main") {
      const candidates = Object.values(tasks).filter((candidate) => !candidate.assigneeAgentId
        && candidate.parentAgentId === parentAgentId);
      if (candidates.length === 1) {
        [task] = candidates;
        taskLinkConfidence = "single-pending-task";
      } else if (candidates.length > 1) {
        this.event("task_link_ambiguous", {
          agentId,
          parentAgentId,
          candidateTaskIds: candidates.map((candidate) => candidate.id).slice(0, 20),
        });
      }
    }
    const firstSeen = !agents[agentId];
    agents[agentId] = {
      ...(agents[agentId] ?? {}),
      id: agentId,
      parentAgentId,
      taskId: task?.id ?? agents[agentId]?.taskId ?? null,
      taskLinkConfidence: taskLinkConfidence ?? agents[agentId]?.taskLinkConfidence ?? null,
      transcriptPath: actorTranscriptPath(input) ?? agents[agentId]?.transcriptPath ?? null,
      agentKind,
      identitySource,
      identityProvenanceHash,
      identityLineageHash,
      status: "running",
      lastSeenAt: now,
    };
    if (task && !task.assigneeAgentId && task.kind !== "team") {
      task = { ...task, assigneeAgentId: agentId, status: "running", taskLinkConfidence };
      tasks[task.id] = task;
    }
    this.store.saveState({ agents, tasks, agentAliases: aliases, confirmedTouchesByAgent,
      agentIdentityLineages: identityLineages });
    if (firstSeen) this.event("agent_registered", {
      agentId,
      parentAgentId,
      taskId: task?.id ?? null,
      taskLinkConfidence,
      agentKind,
      identitySource,
      identityProvenanceHash,
      identityLineageHash,
      lineageHashes: identity.hints.map((hint) => ({ kind: hint.kind, hash: hint.key })),
    });
    return { agentId, parentAgentId, task, agentKind, identitySource,
      identityProvenanceHash, identityLineageHash, identityConflict: false };
  }

  agentTeamPolicy() {
    if (this.frozenAgentTeamPolicy) return this.frozenAgentTeamPolicy;
    const endurance = this.store.readJson("endurance-preregistration.json")
      ?.agentTeamPolicy ?? null;
    const probe = this.store.readJson("agent-team-probe-preregistration.json") ?? null;
    return endurance ?? (probe ? {
      requireDelegationBinding: probe.requireTeammateSpawnBinding === true,
      enforceExclusiveSliceOwnership: probe.enforceExclusiveSliceOwnership === true,
      requiredTeammates: probe.requiredTeammates ?? [],
      expectedFilesByTeammate: probe.expectedFilesByTeammate ?? {},
    } : {});
  }

  enforceTeamSliceOwnership(input, actor) {
    const policy = this.agentTeamPolicy();
    if (policy.enforceExclusiveSliceOwnership !== true) return { applies: false };
    const toolName = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^(?:Edit|Write|NotebookEdit)$/iu.test(toolName)) return { applies: false };
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};
    const target = normalizedWorkspacePath(this.store.cwd,
      toolInput.file_path ?? toolInput.filePath ?? toolInput.notebook_path
      ?? toolInput.notebookPath ?? toolInput.path);
    if (!target) return { applies: false };
    const ownership = Object.entries(policy.expectedFilesByTeammate ?? {})
      .map(([name, file]) => ({ name: String(name),
        file: normalizedWorkspacePath(this.store.cwd, file) }))
      .filter((entry) => entry.name && entry.file === target);
    if (!ownership.length) return { applies: false };
    if (ownership.length !== 1) {
      const reason = `冻结的 Agent Team 策略为 ${target} 给出了多个 owner；为避免错误归因，本次写入已暂停。`;
      this.event("team_slice_ownership_conflict", {
        agentId: actor.agentId,
        file: target,
        ownerCount: ownership.length,
        resolution: "deny-no-guess",
        modelCallUsed: false,
      });
      return { applies: true, ok: false, reason };
    }
    const [{ name }] = ownership;
    const expectedAgentId = `teammate:${name}`;
    if (actor.agentId === expectedAgentId && actor.agentKind === "teammate"
      && !actor.identityConflict) return { applies: true, ok: true };
    const required = [...new Set((policy.requiredTeammates
      ?? Object.keys(policy.expectedFilesByTeammate ?? {})).map(String).filter(Boolean))];
    const reason = [
      `冻结的 Agent Team 策略把 ${target} 独占分配给 ${name}；当前 ${actor.agentId} 不能代写。`,
      `先由 lead 创建共享任务图并把该切片 owner 设为 ${name}，再通过具名 Agent(name=${name}) 启动成员。`,
      "只有宿主确认的 teammate 身份可以使用 Edit/Write 完成这个文件；不要由 main 先写完再让 teammate 只跑测试。",
      ...(required.length ? [`本轮冻结成员：${required.join(", ")}`] : []),
    ].join("\n");
    this.event("team_slice_ownership_blocked", {
      agentId: actor.agentId,
      expectedAgentId,
      file: target,
      tool: toolName,
      toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
      policyHash: hash(canonicalizeStrict(policy)),
      resolution: "delegate-to-frozen-owner",
      messageDelivered: true,
      modelCallUsed: false,
    });
    return { applies: true, ok: false, reason };
  }

  enforceLeadIntegrationOrdering(input, actor) {
    const policy = this.agentTeamPolicy();
    if (policy.enforceExclusiveSliceOwnership !== true) return { applies: false };
    const toolName = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^(?:Edit|Write|NotebookEdit)$/iu.test(toolName)) return { applies: false };
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};
    const target = normalizedWorkspacePath(this.store.cwd,
      toolInput.file_path ?? toolInput.filePath ?? toolInput.notebook_path
      ?? toolInput.notebookPath ?? toolInput.path);
    const leadFiles = new Set((policy.expectedFilesByLead ?? [])
      .map((file) => normalizedWorkspacePath(this.store.cwd, file)).filter(Boolean));
    if (!target || !leadFiles.has(target)) return { applies: false };
    const leadIds = new Set(["main", "lead", "teammate:lead"]);
    const tasks = Object.values(this.state().tasks ?? {}).filter((task) => task.kind === "team");
    const required = [...new Set((policy.requiredTeammates
      ?? Object.keys(policy.expectedFilesByTeammate ?? {}))
      .map((name) => String(name).replace(/^teammate:/, "")).filter(Boolean))];
    const owned = new Map();
    for (const name of required) {
      const candidates = tasks.filter((task) =>
        String(task.owner ?? "").replace(/^teammate:/, "") === name);
      if (candidates.length === 1) owned.set(name, candidates[0]);
    }
    const leadTasks = tasks.filter((task) => leadIds.has(String(task.owner ?? "")));
    const leadTask = leadTasks.length === 1 ? leadTasks[0] : null;
    const dependencyIds = new Set((leadTask?.blockedBy ?? []).map(String));
    const incomplete = required.filter((name) => owned.get(name)?.status !== "completed");
    const missingDependencies = required.filter((name) => {
      const task = owned.get(name);
      return !task || !dependencyIds.has(String(task.id));
    });
    const graphReady = owned.size === required.length && leadTask
      && missingDependencies.length === 0 && incomplete.length === 0;
    if (leadIds.has(String(actor.agentId ?? "")) && graphReady) {
      return { applies: true, ok: true, leadTaskId: leadTask.id };
    }
    const reason = !leadIds.has(String(actor.agentId ?? ""))
      ? `冻结的 Agent Team 策略把 ${target} 分配给 lead/main；当前 ${actor.agentId} 无权代写。`
      : `lead 不能在共享任务图成立且所有 teammate 切片独立完成前编辑 ${target}。`
        + ` 当前缺失/未完成成员：${[...new Set([...required.filter((name) => !owned.has(name)),
          ...incomplete])].join(", ") || "none"}；依赖缺口：${missingDependencies.join(", ") || "none"}。`;
    this.event("lead_integration_ordering_blocked", {
      agentId: actor.agentId,
      file: target,
      requiredTeammates: required,
      establishedOwners: [...owned.keys()],
      incompleteOwners: incomplete,
      missingDependencyOwners: missingDependencies,
      leadTaskCount: leadTasks.length,
      resolution: "deny-until-team-slices-complete",
      modelCallUsed: false,
    });
    return { applies: true, ok: false, reason };
  }

  enforceCorrectionActorAuthority(input, actor) {
    const toolName = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^(?:Edit|Write|NotebookEdit)$/iu.test(toolName)) return { applies: false };
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};
    const target = normalizedWorkspacePath(this.store.cwd,
      toolInput.file_path ?? toolInput.filePath ?? toolInput.notebook_path
      ?? toolInput.notebookPath ?? toolInput.path);
    if (!target) return { applies: false };
    const direct = this.openInterventionFor(actor.agentId);
    const lead = this.openInterventionFor("main");
    const open = direct ?? lead;
    if (!open?.correctionObserved) return { applies: false };
    const parsed = (open.expectedActions ?? open.expectedNextActions ?? [])
      .map((action) => parsedExpectedAction(action, this.store.cwd, this.store.contract))
      .filter(Boolean);
    const expected = parsed.find((action) => ["edit", "delete"].includes(action.kind)
      && action.target === target);
    if (!expected?.actor) return { applies: false };
    if (!correctionActorMatches(expected.actor, actor.agentId)) {
      const reason = `已审计纠正把 ${target} 授权给 ${expected.actor}；当前 ${actor.agentId} 无权代写。请按冻结任务图把动作送达指定 actor。`;
      this.event("correction_actor_authority_blocked", {
        interventionId: open.id,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null,
        expectedActor: expected.actor,
        observedActor: actor.agentId,
        file: target,
        tool: toolName,
        toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
        resolution: "deny-delegate-to-authorized-actor",
        modelCallUsed: false,
      });
      return { applies: true, ok: false, reason };
    }
    if (["main", "lead"].includes(String(expected.actor))) {
      const coordination = parsed.filter((action) => ["ensureTask", "spawnTeammate"]
        .includes(action.kind));
      const matched = open.matchedExpectedActions ?? {};
      const missing = coordination.filter((action) => !matched[action.raw]);
      if (missing.length) {
        const reason = `已审计纠正规定先完成任务图与具名 teammate 启动；在 ${missing.length} 个结构化协调动作尚未得到宿主成功回执前，lead 不能开始编辑 ${target}。`;
        this.event("correction_coordination_prerequisite_blocked", {
          interventionId: open.id,
          correctionAuthorityHash: open.correctionAuthorityHash ?? null,
          agentId: actor.agentId,
          file: target,
          missingExpectedActions: missing.map((action) => action.raw).slice(0, 12),
          resolution: "deny-until-host-observed-coordination",
          modelCallUsed: false,
        });
        return { applies: true, ok: false, reason };
      }
    }
    return { applies: true, ok: true };
  }

  teamDelegationDescriptor(input) {
    const spawn = agentTeamSpawnFromInput(input);
    if (!spawn) return { applies: false };
    const canonicalAgentId = `teammate:${spawn.name}`;
    const state = this.state();
    const ownedTeamTasks = Object.values(state.tasks ?? {}).filter((candidate) =>
      candidate.kind === "team"
      && [spawn.name, canonicalAgentId].includes(String(candidate.owner ?? ""))
      && !["completed", "cancelled", "deleted"].includes(String(candidate.status ?? "")));
    const required = this.agentTeamPolicy().requireDelegationBinding === true
      || ownedTeamTasks.length > 0;
    if (!required) return { applies: false, spawn, ownedTeamTasks };
    if (ownedTeamTasks.length !== 1) {
      return {
        applies: true,
        ok: false,
        spawn,
        ownedTeamTasks,
        reason: ownedTeamTasks.length === 0
          ? `named Agent ${spawn.name} has no unique controller-frozen shared task`
          : `named Agent ${spawn.name} has ${ownedTeamTasks.length} active owned shared tasks`,
      };
    }
    const [task] = ownedTeamTasks;
    const envelope = teamDelegationEnvelope({
      task, contractSeal: this.store.contract.seal, teammateName: spawn.name,
    });
    const storedDefinitionHash = task.taskDefinitionHash
      ?? hash(canonicalizeStrict(teamTaskDefinition({
        task, contractSeal: this.store.contract.seal,
      })));
    if (storedDefinitionHash !== envelope.taskDefinitionHash) {
      return {
        applies: true, ok: false, spawn, ownedTeamTasks, task, envelope,
        reason: `shared task ${task.id} changed after its definition was frozen`,
      };
    }
    if (Buffer.byteLength(envelope.prompt) > 48_000) {
      return {
        applies: true, ok: false, spawn, ownedTeamTasks, task, envelope,
        reason: `shared task ${task.id} is too large for one lossless delegation envelope`,
      };
    }
    return {
      applies: true,
      ok: spawn.prompt === envelope.prompt,
      spawn,
      ownedTeamTasks,
      task,
      envelope,
      reason: spawn.prompt === envelope.prompt ? null
        : `named Agent ${spawn.name} prompt is not byte-identical to shared task ${task.id}`,
    };
  }

  enforceTeamDelegationBinding(input, parentAgentId) {
    const descriptor = this.teamDelegationDescriptor(input);
    if (!descriptor.applies || descriptor.ok) return descriptor;
    const toolUseIdHash = descriptor.spawn?.toolUseId
      ? hash(`agent-tool-use\0${descriptor.spawn.toolUseId}`) : null;
    const teammateNameHash = descriptor.spawn?.name
      ? hash(`teammate-name\0${descriptor.spawn.name}`) : null;
    this.event("team_delegation_binding_required", {
      parentAgentId,
      toolUseIdHash,
      teammateNameHash,
      teamTaskIdHash: descriptor.task?.id ? hash(`task\0${descriptor.task.id}`) : null,
      taskDefinitionHash: descriptor.envelope?.taskDefinitionHash ?? null,
      delegationBindingHash: descriptor.envelope?.delegationBindingHash ?? null,
      candidateTeamTaskIdHashes: (descriptor.ownedTeamTasks ?? [])
        .map((task) => hash(`task\0${task.id}`)).sort(),
      reason: descriptor.reason,
      resolution: "deny-before-agent-spawn",
      modelCallUsed: false,
    });
    const exactPrompt = descriptor.envelope?.prompt;
    const corrective = exactPrompt
      ? `Outsider stopped this Agent before launch because its direct prompt diverges from the already-frozen shared task. Retry the same named Agent with tool_input.prompt byte-for-byte equal to the content between NEXT_PROMPT_BEGIN and NEXT_PROMPT_END; do not add text before or after it.\nNEXT_PROMPT_BEGIN\n${exactPrompt}\nNEXT_PROMPT_END`
      : `Outsider stopped this Agent before launch: ${descriptor.reason}. Create and uniquely assign the shared team task first, then retry the named Agent.`;
    return { ...descriptor, corrective };
  }

  recordTeamDelegationBinding(input, parentAgentId) {
    const descriptor = this.teamDelegationDescriptor(input);
    if (!descriptor.applies) return null;
    if (!descriptor.ok) return null;
    const key = hash(`agent-tool-use\0${descriptor.spawn.toolUseId}`);
    const state = this.state();
    const bindings = { ...(state.teamDelegationBindings ?? {}) };
    const binding = {
      schema: TEAM_DELEGATION_SCHEMA,
      toolUseIdHash: key,
      teammateName: descriptor.spawn.name,
      teammateNameHash: hash(`teammate-name\0${descriptor.spawn.name}`),
      teamTaskId: descriptor.task.id,
      teamTaskIdHash: hash(`task\0${descriptor.task.id}`),
      taskDefinitionHash: descriptor.envelope.taskDefinitionHash,
      delegationBindingHash: descriptor.envelope.delegationBindingHash,
      promptHash: hash(descriptor.spawn.prompt),
      parentAgentId,
      boundAt: new Date().toISOString(),
    };
    const prior = bindings[key];
    if (prior && canonicalizeStrict(prior) !== canonicalizeStrict(binding)) {
      const conflictId = hash(canonicalizeStrict({ prior, binding }));
      this.event("team_delegation_binding_conflict", {
        conflictId,
        toolUseIdHash: key,
        priorDelegationBindingHash: prior.delegationBindingHash,
        proposedDelegationBindingHash: binding.delegationBindingHash,
        resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    if (!prior) {
      bindings[key] = binding;
      this.store.saveState({ teamDelegationBindings: bindings });
      this.event("team_delegation_bound", {
        toolUseIdHash: key,
        teammateNameHash: binding.teammateNameHash,
        teamTaskIdHash: binding.teamTaskIdHash,
        taskDefinitionHash: binding.taskDefinitionHash,
        delegationBindingHash: binding.delegationBindingHash,
        promptHash: binding.promptHash,
        parentAgentIdHash: hash(`parent-agent\0${parentAgentId}`),
        deliveryBoundary: "Agent.PreToolUse",
        directPromptBound: true,
        modelCallUsed: false,
      });
    }
    return prior ?? binding;
  }

  recordTeamSpawnIntent(input, parentAgentId, taskId = null) {
    const spawn = agentTeamSpawnFromInput(input);
    if (!spawn) return null;
    const key = hash(`agent-tool-use\0${spawn.toolUseId}`);
    const teammateNameHash = hash(`teammate-name\0${spawn.name}`);
    const promptHash = hash(spawn.prompt);
    const canonicalAgentId = `teammate:${spawn.name}`;
    const state = this.state();
    const delegationBinding = state.teamDelegationBindings?.[key] ?? null;
    const ownedTeamTasks = Object.values(state.tasks ?? {}).filter((candidate) =>
      candidate.kind === "team"
      && [spawn.name, canonicalAgentId].includes(String(candidate.owner ?? ""))
      && !["completed", "cancelled", "deleted"].includes(String(candidate.status ?? "")));
    const teamTaskId = ownedTeamTasks.length === 1 ? ownedTeamTasks[0].id : null;
    const taskLinkStatus = ownedTeamTasks.length === 1 ? "unique-owned-team-task"
      : ownedTeamTasks.length === 0 ? "missing-owned-team-task" : "ambiguous-owned-team-task";
    const intentHash = hash(canonicalizeStrict({
      key, teammateNameHash, promptHash,
      parentAgentIdHash: hash(`parent-agent\0${parentAgentId}`),
      spawnDelegationIdHash: taskId ? hash(`task\0${taskId}`) : null,
      teamTaskIdHash: teamTaskId ? hash(`task\0${teamTaskId}`) : null,
      taskLinkStatus,
      delegationBindingHash: delegationBinding?.delegationBindingHash ?? null,
      taskDefinitionHash: delegationBinding?.taskDefinitionHash ?? null,
    }));
    const intents = { ...(state.teamSpawnIntents ?? {}) };
    const prior = intents[key];
    if (prior) {
      if (prior.intentHash === intentHash) return prior;
      const conflictId = hash(canonicalizeStrict({ prior: prior.intentHash, next: intentHash }));
      this.event("team_spawn_intent_conflict", {
        conflictId, toolUseIdHash: key, priorIntentHash: prior.intentHash,
        proposedIntentHash: intentHash, resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    const intent = {
      intentHash, toolUseIdHash: key, teammateName: spawn.name, teammateNameHash,
      canonicalAgentId, promptHash, parentAgentId,
      spawnDelegationId: taskId, teamTaskId, taskLinkStatus,
      delegationBindingHash: delegationBinding?.delegationBindingHash ?? null,
      taskDefinitionHash: delegationBinding?.taskDefinitionHash ?? null,
      requestedAt: new Date().toISOString(),
    };
    intents[key] = intent;
    this.store.saveState({ teamSpawnIntents: intents });
    this.event("team_spawn_requested", {
      spawnIntentHash: intentHash,
      toolUseIdHash: key,
      teammateNameHash,
      promptHash,
      parentAgentIdHash: hash(`parent-agent\0${parentAgentId}`),
      spawnDelegationIdHash: taskId ? hash(`task\0${taskId}`) : null,
      teamTaskIdHash: teamTaskId ? hash(`task\0${teamTaskId}`) : null,
      taskLinkStatus,
      delegationBindingHash: delegationBinding?.delegationBindingHash ?? null,
      taskDefinitionHash: delegationBinding?.taskDefinitionHash ?? null,
    });
    if (ownedTeamTasks.length !== 1) {
      this.event("team_spawn_task_link_unresolved", {
        spawnIntentHash: intentHash,
        teammateNameHash,
        taskLinkStatus,
        candidateTeamTaskIdHashes: ownedTeamTasks
          .map((candidate) => hash(`task\0${candidate.id}`)).sort(),
        resolution: "fail-visible-no-guess",
      });
    }
    return intent;
  }

  bindTeamSpawnIdentity(input) {
    const spawn = agentTeamSpawnFromInput(input);
    if (!spawn) return null;
    const capability = agentTeamReceiptCapability(input);
    if (capability?.status === "teammate_spawned" && capability.bindable !== true) {
      const conflictId = hash(canonicalizeStrict({
        toolUseIdHash: hash(`agent-tool-use\0${spawn.toolUseId}`),
        teammateNameHash: hash(`teammate-name\0${spawn.name}`),
        isAsync: capability.isAsync,
        receiptNameMatches: capability.receiptNameMatches,
      }));
      this.event("team_identity_binding_conflict", {
        conflictId,
        toolUseIdHash: hash(`agent-tool-use\0${spawn.toolUseId}`),
        teammateNameHash: hash(`teammate-name\0${spawn.name}`),
        reason: capability.isAsync ? "teammate-receipt-marked-async"
          : capability.receiptNameMatches === false ? "receipt-pin-name-mismatch"
            : "teammate-receipt-agent-id-ambiguous",
        resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    const ids = agentTeamResponseIds(input);
    if (ids.length === 0) return null;
    const toolUseIdHash = hash(`agent-tool-use\0${spawn.toolUseId}`);
    const state = this.state();
    const intent = state.teamSpawnIntents?.[toolUseIdHash];
    if (!intent || intent.teammateNameHash !== hash(`teammate-name\0${spawn.name}`)) return null;
    if (ids.length !== 1) {
      const conflictId = hash(canonicalizeStrict({
        toolUseIdHash, candidateAgentIdHashes: ids.map((id) => hash(`host-agent\0${id}`)).sort(),
      }));
      this.event("team_identity_binding_conflict", {
        conflictId, toolUseIdHash,
        candidateAgentIdHashes: ids.map((id) => hash(`host-agent\0${id}`)).sort(),
        resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    const [receiptAgentId] = ids;
    const receiptAgentIdHash = hash(`host-agent\0${receiptAgentId}`);
    const receiptHash = hash(canonicalizeStrict({
      spawnIntentHash: intent.intentHash,
      teammateNameHash: intent.teammateNameHash,
      receiptAgentIdHash,
      delegationBindingHash: intent.delegationBindingHash ?? null,
      taskDefinitionHash: intent.taskDefinitionHash ?? null,
    }));
    const receipts = { ...(state.teamSpawnReceipts ?? {}) };
    const priorReceipt = receipts[receiptAgentIdHash];
    if (priorReceipt && priorReceipt.receiptHash !== receiptHash) {
      const conflictId = hash(canonicalizeStrict({
        priorReceiptHash: priorReceipt.receiptHash, proposedReceiptHash: receiptHash,
      }));
      this.event("team_identity_binding_conflict", {
        conflictId, toolUseIdHash, priorReceiptHash: priorReceipt.receiptHash,
        proposedReceiptHash: receiptHash, resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    if (!priorReceipt) {
      receipts[receiptAgentIdHash] = {
        receiptHash, receiptAgentIdHash, receiptAgentId,
        spawnIntentHash: intent.intentHash, toolUseIdHash,
        lineageHash: agentTeamHostLineageHash(input),
        receivedAt: new Date().toISOString(),
      };
      this.store.saveState({ teamSpawnReceipts: receipts });
      const receiptEvent = this.event("team_spawn_receipt_recorded", {
        receiptHash,
        spawnIntentHash: intent.intentHash,
        toolUseIdHash,
        teammateNameHash: intent.teammateNameHash,
        receiptAgentIdHash,
        lineageHash: agentTeamHostLineageHash(input),
      });
      receipts[receiptAgentIdHash] = { ...receipts[receiptAgentIdHash],
        receiptSeq: receiptEvent.seq, receiptEventHash: receiptEvent.eventHash ?? null };
      this.store.saveState({ teamSpawnReceipts: receipts });
    }
    return this.reconcileTeamSpawnIdentity();
  }

  reconcileTeamSpawnIdentity() {
    const state = this.state();
    const receipts = Object.entries(state.teamSpawnReceipts ?? {})
      .filter(([receiptAgentIdHash]) => !Object.values(state.teamIdentityBindings ?? {})
        .some((binding) => binding.receiptAgentIdHash === receiptAgentIdHash));
    const starts = Object.entries(state.teamSubagentStarts ?? {})
      .filter(([agentIdHash]) => !state.teamIdentityBindings?.[agentIdHash]);
    let completed = null;
    for (const [receiptAgentIdHash, receipt] of receipts) {
      const intent = Object.values(state.teamSpawnIntents ?? {}).find((candidate) =>
        candidate.intentHash === receipt.spawnIntentHash);
      const compatible = starts.filter(([agentIdHash, start]) => {
        if (agentIdHash === receiptAgentIdHash) return true;
        /* A Claude Agent Team receipt carries a logical member id while the
           SubagentStart hook carries a distinct execution id.  Shared session
           lineage cannot join those identities: concurrent teammates share it.
           The generic delegated task created by the exact Agent toolUseId is
           the host-derived rendezvous key in both observed orders. */
        const exactDelegation = Boolean(intent?.spawnDelegationId)
          && start.spawnDelegationId === intent.spawnDelegationId
          && receipt.lineageHash != null
          && start.lineageHash === receipt.lineageHash;
        const exactHostExecutionName = teammateNameFromExecutionId(start.rawAgentId)
          === intent?.teammateName
          && receipt.lineageHash != null
          && start.lineageHash === receipt.lineageHash;
        return exactDelegation || exactHostExecutionName;
      });
      const exact = compatible.filter(([agentIdHash]) => agentIdHash === receiptAgentIdHash);
      const candidates = exact.length === 1 ? exact : compatible;
      if (candidates.length !== 1) {
        this.event("team_identity_binding_pending", {
          receiptHash: receipt.receiptHash,
          spawnIntentHash: receipt.spawnIntentHash,
          toolUseIdHash: receipt.toolUseIdHash,
          receiptAgentIdHash,
          candidateStartCount: candidates.length,
          reason: candidates.length === 0
            ? "matching-subagent-start-not-yet-observed"
            : "multiple-subagent-starts-share-host-lineage",
          resolution: "fail-visible-no-guess",
        });
        continue;
      }
      const [startAgentIdHash] = candidates[0];
      completed = this.completeTeamSpawnIdentity(receiptAgentIdHash, startAgentIdHash) ?? completed;
    }
    return completed;
  }

  completeTeamSpawnIdentity(receiptAgentIdHash, agentIdHash = receiptAgentIdHash) {
    const state = this.state();
    const receipt = state.teamSpawnReceipts?.[receiptAgentIdHash];
    if (!receipt) return null;
    const intent = Object.values(state.teamSpawnIntents ?? {}).find((candidate) =>
      candidate.intentHash === receipt.spawnIntentHash);
    if (!intent) return null;
    const startEvidence = state.teamSubagentStarts?.[agentIdHash] ?? null;
    if (!startEvidence?.registrationEventHash || !startEvidence?.contextEventHash) {
      this.event("team_identity_binding_pending", {
        receiptHash: receipt.receiptHash,
        spawnIntentHash: intent.intentHash,
        toolUseIdHash: receipt.toolUseIdHash,
        teammateNameHash: intent.teammateNameHash,
        agentIdHash,
        reason: "matching-subagent-start-not-yet-observed",
      });
      return null;
    }
    const { rawAgentId } = startEvidence;
    if (!rawAgentId) return null;
    const bindingHash = hash(canonicalizeStrict({
      spawnIntentHash: intent.intentHash,
      teammateNameHash: intent.teammateNameHash,
      agentIdHash,
      canonicalAgentIdHash: hash(`canonical-agent\0${intent.canonicalAgentId}`),
    }));
    const { toolUseIdHash } = receipt;
    const bindings = { ...(state.teamIdentityBindings ?? {}) };
    const prior = bindings[agentIdHash];
    const nameCollision = Object.values(bindings).find((binding) =>
      binding.canonicalAgentId === intent.canonicalAgentId && binding.agentIdHash !== agentIdHash);
    if ((prior && prior.bindingHash !== bindingHash) || nameCollision) {
      const conflictId = hash(canonicalizeStrict({
        proposedBindingHash: bindingHash,
        priorBindingHash: prior?.bindingHash ?? nameCollision?.bindingHash ?? null,
      }));
      this.event("team_identity_binding_conflict", {
        conflictId, toolUseIdHash, proposedBindingHash: bindingHash,
        priorBindingHash: prior?.bindingHash ?? nameCollision?.bindingHash ?? null,
        resolution: "fail-visible-no-overwrite",
      });
      this.store.saveState({
        agentIdentityIntegrityCompromised: true,
        lastAgentIdentityConflictHash: conflictId,
      });
      return null;
    }
    if (prior) return prior;
    const binding = {
      bindingHash, spawnIntentHash: intent.intentHash, toolUseIdHash,
      agentIdHash, rawAgentId, receiptAgentIdHash,
      receiptHash: receipt.receiptHash,
      canonicalAgentId: intent.canonicalAgentId,
      teammateNameHash: intent.teammateNameHash,
      spawnDelegationId: intent.spawnDelegationId ?? null,
      teamTaskId: intent.teamTaskId ?? null,
      taskLinkStatus: intent.taskLinkStatus,
      identityJoin: agentIdHash === receiptAgentIdHash ? "exact-host-agent-id"
        : startEvidence.spawnDelegationId === intent.spawnDelegationId
          ? "exact-agent-tool-delegation"
          : "claude-2.1.219-execution-id-name",
      boundAt: new Date().toISOString(),
    };
    bindings[agentIdHash] = binding;

    const aliases = { ...(state.agentAliases ?? {}), [rawAgentId]: intent.canonicalAgentId };
    const agents = { ...(state.agents ?? {}) };
    const rawAgent = agents[rawAgentId] ?? null;
    const canonicalAgent = agents[intent.canonicalAgentId] ?? null;
    /* The Agent tool's generic delegation record proves a spawn happened; it
       is not the shared Agent Team task.  Only a unique, already-created team
       task whose latest owner equals `name` may be assigned. */
    const taskId = intent.teamTaskId ?? null;
    agents[intent.canonicalAgentId] = {
      ...(rawAgent ?? {}), ...(canonicalAgent ?? {}),
      id: intent.canonicalAgentId,
      agentKind: "teammate",
      identitySource: "host-agent-spawn-binding",
      identityProvenanceHash: bindingHash,
      identityLineageHash: null,
      taskId,
      taskLinkConfidence: taskId ? "unique-owned-team-task" : null,
      status: "running",
      lastSeenAt: binding.boundAt,
    };
    if (rawAgentId !== intent.canonicalAgentId) delete agents[rawAgentId];

    const tasks = { ...(state.tasks ?? {}) };
    const rawTouches = this.store.events().filter((event) =>
      event.type === "confirmed_file_touch" && event.agentId === rawAgentId
      && event.executed === true && event.changed === true
      && Number(event.seq) > Number(startEvidence.contextSeq));
    if (intent.spawnDelegationId && tasks[intent.spawnDelegationId]
      && tasks[intent.spawnDelegationId].assigneeAgentId === rawAgentId) {
      tasks[intent.spawnDelegationId] = { ...tasks[intent.spawnDelegationId],
        assigneeAgentId: null, taskLinkConfidence: null };
    }
    if (taskId && tasks[taskId]
      && (!tasks[taskId].assigneeAgentId || tasks[taskId].assigneeAgentId === rawAgentId)) {
      tasks[taskId] = { ...tasks[taskId], assigneeAgentId: intent.canonicalAgentId,
        status: "running", taskLinkConfidence: "unique-owned-team-task",
        touchedFiles: [...new Set([...(tasks[taskId].touchedFiles ?? []),
          ...rawTouches.map((event) => event.file).filter(Boolean)])] };
    }
    const confirmedTouchesByAgent = { ...(state.confirmedTouchesByAgent ?? {}) };
    if (confirmedTouchesByAgent[rawAgentId]?.length) {
      confirmedTouchesByAgent[intent.canonicalAgentId] = [...new Set([
        ...(confirmedTouchesByAgent[intent.canonicalAgentId] ?? []),
        ...confirmedTouchesByAgent[rawAgentId],
      ])];
      delete confirmedTouchesByAgent[rawAgentId];
    }
    const openInterventions = { ...(state.openInterventions ?? {}) };
    if (openInterventions[rawAgentId] && !openInterventions[intent.canonicalAgentId]) {
      openInterventions[intent.canonicalAgentId] = openInterventions[rawAgentId];
      delete openInterventions[rawAgentId];
    }
    const semanticPatrols = { ...(state.semanticPatrols ?? {}) };
    if (semanticPatrols[rawAgentId] && !semanticPatrols[intent.canonicalAgentId]) {
      semanticPatrols[intent.canonicalAgentId] = semanticPatrols[rawAgentId];
      delete semanticPatrols[rawAgentId];
    }
    this.store.saveState({ teamIdentityBindings: bindings, agentAliases: aliases,
      agents, tasks, confirmedTouchesByAgent, openInterventions, semanticPatrols });
    const bindingEvent = this.event("team_identity_bound", {
      identityBindingHash: bindingHash,
      status: "teammate_spawned",
      spawnIntentHash: intent.intentHash,
      toolUseIdHash,
      teammateNameHash: intent.teammateNameHash,
      agentIdHash,
      receiptAgentIdHash,
      receiptHash: receipt.receiptHash,
      canonicalAgentIdHash: hash(`canonical-agent\0${intent.canonicalAgentId}`),
      spawnDelegationIdHash: intent.spawnDelegationId
        ? hash(`task\0${intent.spawnDelegationId}`) : null,
      teamTaskIdHash: intent.teamTaskId ? hash(`task\0${intent.teamTaskId}`) : null,
      taskLinkStatus: intent.taskLinkStatus,
      delegationBindingHash: intent.delegationBindingHash ?? null,
      taskDefinitionHash: intent.taskDefinitionHash ?? null,
      identityJoin: binding.identityJoin,
      rawRegistrationSeq: startEvidence?.registrationSeq ?? null,
      rawRegistrationEventHash: startEvidence?.registrationEventHash ?? null,
      rawContextSeq: startEvidence?.contextSeq ?? null,
      rawContextEventHash: startEvidence?.contextEventHash ?? null,
    });
    this.observeTeamSpawnBindingEffect(intent, bindingEvent);
    if (taskId) {
      for (const rawTouch of rawTouches) {
        this.event("team_prebinding_effect_reconciled", {
          identityBindingHash: bindingHash,
          bindingSeq: bindingEvent.seq,
          bindingEventHash: bindingEvent.eventHash ?? null,
          rawTouchSeq: rawTouch.seq,
          rawTouchEventHash: rawTouch.eventHash ?? null,
          rawAgentIdHash: agentIdHash,
          canonicalAgentIdHash: hash(`canonical-agent\0${intent.canonicalAgentId}`),
          teamTaskIdHash: hash(`task\0${taskId}`),
          agentId: intent.canonicalAgentId,
          file: rawTouch.file,
          toolUseId: rawTouch.toolUseId,
          beforeHash: rawTouch.beforeHash,
          afterHash: rawTouch.afterHash,
          changed: true,
          executed: true,
        });
      }
    }
    return binding;
  }

  observeTeamSpawnBindingEffect(intent, bindingEvent) {
    const actorId = "main";
    const mainOpen = this.openInterventionFor(actorId);
    const openActorId = mainOpen ? actorId : "lead";
    const open = mainOpen ?? this.openInterventionFor(openActorId);
    if (!open?.correctionObserved || !open.correctionObservedSeq
      || Number(bindingEvent?.seq) <= Number(open.correctionObservedSeq)) return null;
    const expected = (open.expectedActions ?? open.expectedNextActions ?? [])
      .map((action) => parsedExpectedAction(action, this.store.cwd, this.store.contract))
      .find((action) => action?.kind === "spawnTeammate"
        && action.name === String(intent?.canonicalAgentId ?? "").replace(/^teammate:/, "")
        && correctionActorMatches(action.actor, actorId));
    if (!expected) return null;
    const matched = { ...(open.matchedExpectedActions ?? {}) };
    if (matched[expected.raw]) return null;
    const observed = this.event("expected_action_observed", {
      interventionId: open.id,
      agentId: actorId,
      expectedAction: expected.raw,
      effectKind: "spawnTeammate",
      strong: true,
      succeeded: true,
      toolUseId: null,
      exit: 0,
      eventSeq: bindingEvent.seq,
      afterCorrectionSeq: open.correctionObservedSeq,
      correctionAuthorityHash: open.correctionAuthorityHash ?? null,
      identityBindingHash: bindingEvent.identityBindingHash ?? null,
    });
    matched[expected.raw] = observed.seq;
    const snapshot = this.snapshot(this.store.cwd);
    const effect = this.event("effect_observed", {
      interventionId: open.id,
      agentId: actorId,
      effectKind: "spawnTeammate",
      matchedExpectedAction: expected.raw,
      toolUseId: null,
      exit: 0,
      eventSeq: bindingEvent.seq,
      afterCorrectionSeq: open.correctionObservedSeq,
      correctionAuthorityHash: open.correctionAuthorityHash ?? null,
      identityBindingHash: bindingEvent.identityBindingHash ?? null,
      changedFiles: [],
      artifactFingerprint: snapshot.fingerprint,
    });
    open.matchedExpectedActions = matched;
    open.effectObserved = true;
    const recovery = this.recoveryRecord(open.id);
    if (recovery?.phase === "delivery-observed") {
      this.interventionRecovery.observeEffect({ interventionId: open.id,
        effectSeq: effect.seq });
    }
    this.setOpenIntervention(openActorId, open);
    return effect;
  }

  recordDelegation(input, parentAgentId) {
    const delegated = delegationFromInput(input);
    if (!delegated) return null;
    const teamDescriptor = this.teamDelegationDescriptor(input);
    const delegationBinding = this.recordTeamDelegationBinding(input, parentAgentId);
    if (teamDescriptor.applies && (!teamDescriptor.ok || !delegationBinding)) {
      return null;
    }
    const state = this.state();
    const tasks = { ...(state.tasks ?? {}) };
    const snapshotFile = `task-${delegated.id.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)}.json`;
    this.store.writeJson(snapshotFile, this.snapshot(this.store.cwd));
    const task = {
      ...delegated,
      parentAgentId,
      assigneeAgentId: null,
      status: "delegated",
      snapshotFile,
      delegatedAt: new Date().toISOString(),
    };
    tasks[task.id] = task;
    this.store.saveState({ tasks });
    this.event("task_delegated", {
      taskId: task.id,
      parentAgentId,
      description: task.description.slice(0, 400),
      promptHash: task.promptHash ?? hash(task.prompt),
      promptVisibility: task.promptVisibility ?? "plaintext",
    });
    this.recordTeamSpawnIntent(input, parentAgentId, task.id);
    return task;
  }

  coordinationSnapshot() {
    const state = this.state();
    const tasks = Object.values(state.tasks ?? {}).map((task) => ({
      id: task.id,
      kind: task.kind ?? "delegated",
      subject: String(task.subject ?? task.description ?? "").slice(0, 600),
      description: String(task.description ?? "").slice(0, 1200),
      owner: task.owner ?? task.assigneeAgentId ?? null,
      parentAgentId: task.parentAgentId ?? null,
      status: task.status ?? null,
      blockedBy: task.blockedBy ?? [],
      independentlyVerified: Boolean(task.independentlyVerified),
      touchedFiles: task.touchedFiles ?? [],
      promptBinding: delegatedPromptBinding(task),
      completionReport: boundedTaskCompletionReport(task.completionReport),
    }));
    const conflicts = Object.values(state.fileConflicts ?? {}).map((conflict) => ({
      id: conflict.id,
      file: conflict.file,
      taskIds: conflict.taskIds,
      agentIds: conflict.agentIds,
      status: conflict.status,
    }));
    return { tasks: tasks.slice(0, 120), conflicts: conflicts.slice(0, 80) };
  }

  decisionScope(trigger, actor = null) {
    const triggerText = String(trigger ?? "");
    const subagentMatch = /^subagent-delivery:(.+)$/.exec(triggerText);
    if (subagentMatch && actor?.agentId && actor?.task) {
      const taskId = String(subagentMatch[1]);
      if (String(actor.task.id ?? "") !== taskId) return null;
      const state = this.state();
      const task = state.tasks?.[taskId] ?? actor.task;
      const persistedAgent = state.agents?.[actor.agentId] ?? null;
      const events = this.store.events();
      const registration = [...events].reverse().find((event) =>
        event.type === "agent_registered" && event.agentId === actor.agentId
        && event.taskId === taskId) ?? null;
      const contextInjection = [...events].reverse().find((event) =>
        event.type === "subagent_context_injected" && event.agentId === actor.agentId
        && event.taskId === taskId) ?? null;
      const reportBinding = [...events].reverse().find((event) =>
        event.type === "subagent_report_bound" && event.agentId === actor.agentId
        && event.taskId === taskId) ?? null;
      const firstBoundSeq = Math.max(Number(registration?.seq ?? 0),
        Number(contextInjection?.seq ?? 0));
      const durableActions = events.filter((event) => event.type === "boundary_reached"
        && event.boundary === "PostToolUse" && event.agentId === actor.agentId
        && Number(event.seq) > firstBoundSeq
        && (!reportBinding || Number(event.seq) < Number(reportBinding.seq)))
        .map((event) => ({
          seq: event.seq,
          tool: event.tool ?? null,
          toolUseId: event.toolUseId ?? null,
          action: event.action ?? null,
          file: event.file ?? event.confirmedFile ?? null,
          exit: event.exit ?? null,
          isEdit: Boolean(event.isEdit),
          isTest: Boolean(event.isTest),
          executed: event.executed ?? true,
        }));
      const ambiguousLinks = events.filter((event) => event.type === "task_link_ambiguous"
        && event.agentId === actor.agentId
        && (!registration || Number(event.seq) >= Number(registration.seq)));
      const completionReport = task?.completionReport ?? actor.task.completionReport ?? null;
      const exactTaskBinding = task?.id === taskId && task?.assigneeAgentId === actor.agentId
        && persistedAgent?.taskId === taskId
        && ["explicit", "persisted", "single-pending-task"].includes(String(
          task?.taskLinkConfidence ?? persistedAgent?.taskLinkConfidence ?? ""));
      const exactReportBinding = completionReport?.observed === true
        && completionReport?.transcriptBound === true
        && Boolean(completionReport?.textHash)
        && reportBinding?.reportHash === completionReport.textHash;
      /* This does not prove the child task semantically complete. It proves
         only that a fresh clearance auditor has an exact lineage, a frozen
         context receipt, durable child actions and a transcript-bound report
         to grade.  The auditor still owns the pass/reject decision. */
      const clearanceEvidenceReady = Boolean(registration && contextInjection
        && reportBinding && exactTaskBinding && exactReportBinding
        && durableActions.length > 0 && ambiguousLinks.length === 0
        && actor.identityConflict !== true
        && state.agentIdentityIntegrityCompromised !== true);
      return {
        kind: "intermediate-subagent-task-delivery",
        gatePhase: "before-subagent-completion-commit",
        taskId,
        agentId: actor.agentId,
        taskStatus: task?.status ?? null,
        question: "Is this exact child agent's frozen delegated slice independently ready to complete?",
        globalIncompletenessExpected: true,
        futureParentWorkflowIsOutsideThisDecision: true,
        taskStatusMustRemainUncommittedUntilThisGatePasses: true,
        clearanceEvidenceReady,
        actorEvidence: {
          assigneeAgentId: task?.assigneeAgentId ?? null,
          persistedAgentTaskId: persistedAgent?.taskId ?? null,
          taskLinkConfidence: task?.taskLinkConfidence
            ?? persistedAgent?.taskLinkConfidence ?? null,
          registration: registration ? { seq: registration.seq,
            identityProvenanceHash: registration.identityProvenanceHash ?? null } : null,
          contextInjection: contextInjection ? { seq: contextInjection.seq,
            taskLinkConfidence: contextInjection.taskLinkConfidence ?? null } : null,
          completionReportBinding: reportBinding ? { seq: reportBinding.seq,
            reportHash: reportBinding.reportHash ?? null,
            transcriptBound: reportBinding.transcriptBound === true } : null,
          durableActions: durableActions.slice(-40),
          ambiguousTaskLinkCount: ambiguousLinks.length,
        },
      };
    }
    const match = /^team-task-delivery:(.+)$/.exec(triggerText);
    if (!match || !actor?.agentId) return null;
    const taskId = String(actor.task?.id ?? match[1]);
    const events = this.store.events();
    const effects = events.filter((event) =>
      ["confirmed_file_touch", "team_prebinding_effect_reconciled"].includes(event.type)
      && event.agentId === actor.agentId
      && event.executed === true && event.changed === true
      && (event.type === "team_prebinding_effect_reconciled"
        || stringList(event.taskIds).includes(taskId)))
      .map((event) => ({
        seq: event.seq,
        type: event.type,
        file: event.file ?? null,
        toolUseId: event.toolUseId ?? null,
        beforeHash: event.beforeHash ?? null,
        afterHash: event.afterHash ?? null,
        identityBindingHash: event.identityBindingHash ?? null,
      }));
    const firstEffectSeq = Math.min(...effects.map((event) => Number(event.seq)), Infinity);
    const checks = events.filter((event) => event.type === "boundary_reached"
      && event.boundary === "PostToolUse"
      && event.agentId === actor.agentId
      && event.isTest === true && Number(event.exit) === 0
      && Number(event.seq) > (Number.isFinite(firstEffectSeq) ? firstEffectSeq : 0))
      .map((event) => ({
        seq: event.seq,
        toolUseId: event.toolUseId ?? null,
        action: event.action ?? null,
        exit: event.exit,
      }));
    const task = this.state().tasks?.[taskId] ?? actor.task ?? null;
    const completionIntents = this.openTaskCompletionIntents(taskId)
      .filter((intent) => intent.agentId === actor.agentId);
    const completionIntent = completionIntents.length === 1 ? completionIntents[0] : null;
    return {
      kind: "intermediate-team-task-delivery",
      gatePhase: "before-host-task-update-commit",
      taskId,
      agentId: actor.agentId,
      taskStatus: task?.status ?? null,
      question: "Is this owner's frozen task slice independently ready to complete so downstream team work can continue?",
      globalIncompletenessExpected: true,
      siblingTasksAndIntegrationAreNotBlockingEvidenceByThemselves: true,
      taskStatusMustRemainUncommittedUntilThisGatePasses: true,
      completionIntent: completionIntent ? {
        recorded: true,
        completionIntentHash: completionIntent.intentHash,
        toolUseIdHash: completionIntent.toolUseIdHash,
        taskId: completionIntent.taskId,
        agentId: completionIntent.agentId,
        identityBindingHash: completionIntent.identityBindingHash,
        taskGeneration: completionIntent.taskGeneration,
        preBoundarySeq: completionIntent.preBoundarySeq,
        intentEventSeq: completionIntent.intentEventSeq,
      } : {
        recorded: false,
        candidateCount: completionIntents.length,
      },
      actorEvidence: {
        latestOwner: task?.owner ?? null,
        taskStatus: task?.status ?? null,
        blockedBy: task?.blockedBy ?? [],
        confirmedEffects: effects.slice(-20),
        successfulChecks: checks.slice(-20),
      },
    };
  }

  noteMeaningfulBoundary(agentId, toolName) {
    if (!String(toolName ?? "").trim()) return { counted: false, due: false };
    const state = this.state();
    const patrols = { ...(state.semanticPatrols ?? {}) };
    const prior = patrols[agentId] ?? { toolBoundaries: 0, lastPatrolAt: 0 };
    /* Migration from the first patrol implementation is explicit. Its
       `meaningfulActions` omitted Read and was therefore not a stable clock. */
    const previousCount = Number(prior.toolBoundaries ?? prior.meaningfulActions ?? 0);
    const current = { ...prior, toolBoundaries: previousCount + 1 };
    delete current.meaningfulActions;
    patrols[agentId] = current;
    this.store.saveState({ semanticPatrols: patrols });
    const due = current.toolBoundaries - Number(current.lastPatrolAt ?? 0)
      >= this.semanticPatrolEvery
      && current.toolBoundaries >= Number(current.nextEvidenceCheckAt ?? 0);
    return { counted: true, due, count: current.toolBoundaries,
      lastPatrolAt: Number(current.lastPatrolAt ?? 0) };
  }

  markSemanticPatrol(agentId, count, status, interventionId = null) {
    const state = this.state();
    const patrols = { ...(state.semanticPatrols ?? {}) };
    patrols[agentId] = {
      ...(patrols[agentId] ?? {}),
      lastPatrolAt: count,
      lastStatus: status,
      lastInterventionId: interventionId,
      checkedAt: new Date().toISOString(),
      nextEvidenceCheckAt: null,
    };
    this.store.saveState({ semanticPatrols: patrols });
    this.event(status === "on-track" ? "semantic_patrol_passed" : "semantic_patrol_finished", {
      agentId, toolBoundaries: count, status, interventionId,
    });
  }

  semanticPatrolAtBoundary({ input, agent, actor, toolName, toolInput, patrol, open }) {
    if (!patrol?.due) return null;
    this.event("semantic_patrol_due", {
      agentId: actor.agentId,
      toolBoundaries: patrol.count,
      cadence: this.semanticPatrolEvery,
      proposedTool: toolName,
      whileInterventionOpen: Boolean(open),
      openInterventionId: open?.id ?? null,
    });
    /* Once an audited correction has reached the worker, the first proposed
       post-correction actions are the evidence needed to decide whether it
       worked. A periodic patrol used to run before that action and could
       replace the intervention with a duplicate diagnosis. That destroyed the
       original delivery channel/authority attribution even when the worker
       immediately followed the correction. Keep the patrol clock live, but
       give the already-observed correction its normal follow-up window. The
       existing reviewIntervention path still takes over if no effect appears
       within the bounded number of observed boundaries. */
    if (open?.correctionObserved === true) {
      const state = this.state();
      const patrols = { ...(state.semanticPatrols ?? {}) };
      patrols[actor.agentId] = {
        ...(patrols[actor.agentId] ?? {}),
        nextEvidenceCheckAt: patrol.count + 1,
        lastDeferredAt: patrol.count,
        lastDeferredInterventionId: open.id,
      };
      this.store.saveState({ semanticPatrols: patrols });
      const pendingStage = open.effectObserved === true ? "resolution" : "effect";
      this.event(pendingStage === "effect"
        ? "semantic_patrol_deferred_pending_correction_effect"
        : "semantic_patrol_deferred_pending_correction_resolution", {
        agentId: actor.agentId,
        interventionId: open.id,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null,
        toolBoundaries: patrol.count,
        proposedTool: toolName,
        correctionObservedSeq: open.correctionObservedSeq ?? null,
        effectObserved: open.effectObserved === true,
        nextEvidenceCheckAt: patrol.count + 1,
      });
      return { status: `deferred-pending-correction-${pendingStage}`,
        interventionId: open.id };
    }
    const steps = stepsFromInput(input, agent, this.store.cwd);
    const current = this.snapshot(this.store.cwd);
    const diff = diffSnapshots(this.baseline, current);
    const enoughEvidence = this.semanticPatrolMinEvidenceSteps === 0
      || steps.length >= this.semanticPatrolMinEvidenceSteps
      || (diff.changes.length > 0 && steps.length >= Math.min(3, this.semanticPatrolMinEvidenceSteps));
    if (!enoughEvidence) {
      const state = this.state();
      const patrols = { ...(state.semanticPatrols ?? {}) };
      const missing = Math.max(1, this.semanticPatrolMinEvidenceSteps - steps.length);
      patrols[actor.agentId] = {
        ...(patrols[actor.agentId] ?? {}),
        nextEvidenceCheckAt: patrol.count + missing,
        lastDeferredAt: patrol.count,
      };
      this.store.saveState({ semanticPatrols: patrols });
      this.event("semantic_patrol_deferred_insufficient_evidence", {
        agentId: actor.agentId,
        toolBoundaries: patrol.count,
        observedSteps: steps.length,
        changedFiles: diff.changes.map((entry) => entry.path),
        nextEvidenceCheckAt: patrol.count + missing,
      });
      return { status: "deferred-insufficient-evidence" };
    }
    const used = Number(this.state().runtimeSupervisorCalls ?? 0);
    const reserved = completionReserveFor(this.maxSupervisorCalls);
    if (used >= Math.max(0, this.maxSupervisorCalls - reserved)) {
      this.event("semantic_patrol_skipped_for_completion_reserve", {
        agentId: actor.agentId,
        toolBoundaries: patrol.count,
        used,
        limit: this.maxSupervisorCalls,
        reserved,
      });
      this.markSemanticPatrol(actor.agentId, patrol.count, "completion-budget-reserved");
      return { status: "completion-budget-reserved" };
    }
    const inspected = this.supervise({
      input,
      agent,
      boundary: "PreToolUse",
      trigger: `periodic-semantic-patrol:${patrol.count}`,
      proposedTool: { name: toolName, input: toolInput },
      actor,
    });
    if (inspected.status === "correction" && open) {
      this.event("intervention_superseded_by_semantic_patrol", {
        interventionId: open.id,
        replacementInterventionId: inspected.interventionId,
        agentId: actor.agentId,
        priorTrigger: open.trigger,
        toolBoundaries: patrol.count,
      });
    }
    this.markSemanticPatrol(actor.agentId, patrol.count, inspected.status,
      inspected.interventionId ?? null);
    return inspected;
  }

  taskUpdatePreview(input, actor = null) {
    const name = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^TaskUpdate$/i.test(name)) return { applies: false };
    const update = input?.tool_input ?? input?.toolInput ?? {};
    const id = String(update.taskId ?? update.task_id ?? "");
    if (!id) return { applies: true, ok: false, reason: "TaskUpdate 缺少 taskId" };
    const state = this.state();
    const tasks = structuredClone(state.tasks ?? {});
    const current = tasks[id] ?? { id, kind: "team", status: "pending", blockedBy: [] };
    const next = { ...current };
    if (update.owner != null) next.owner = String(update.owner);
    const blockedBy = new Set(stringList(current.blockedBy));
    for (const dependency of stringList(update.addBlockedBy ?? update.add_blocked_by)) {
      blockedBy.add(dependency);
    }
    next.blockedBy = [...blockedBy];
    tasks[id] = next;
    for (const blocked of stringList(update.addBlocks ?? update.add_blocks)) {
      const downstream = tasks[blocked] ?? { id: blocked, kind: "team", status: "pending", blockedBy: [] };
      tasks[blocked] = { ...downstream,
        blockedBy: [...new Set([...stringList(downstream.blockedBy), id])] };
    }
    const cycle = taskGraphCycle(tasks);
    if (cycle) return { applies: true, ok: false,
      reason: `任务依赖会形成环：${cycle.join(" -> ")}` };
    const desired = String(update.status ?? "");
    const reopening = current.status === "completed"
      && ["in_progress", "running"].includes(desired);
    if (reopening && !["main", "lead", "teammate:lead"].includes(String(actor?.agentId ?? ""))) {
      return { applies: true, ok: false,
        reason: `任务 ${id} 已完成；只有 lead/main 能显式重开一个新的返工代际` };
    }
    const unresolved = next.blockedBy.filter((dependency) => tasks[dependency]?.status !== "completed");
    if (["in_progress", "in-progress", "running", "completed"].includes(desired)
      && unresolved.length) {
      return { applies: true, ok: false,
        reason: `任务 ${id} 仍被未完成依赖阻塞，不能进入 ${desired}：${unresolved.join(", ")}` };
    }
    return { applies: true, ok: true, id, update, tasks, reopening };
  }

  commitTaskUpdate(input, { preview: suppliedPreview = null, actor = null,
    postBoundary = null } = {}) {
    const preview = suppliedPreview ?? this.taskUpdatePreview(input, actor);
    if (!preview.applies || !preview.ok) return preview;
    /* TaskCompleted is the independent completion gate. PostToolUse may record
       ownership/dependencies/status-in-progress, but never trusts the worker's
       requested `completed` as the controller's verified completion. */
    const current = preview.tasks[preview.id];
    if (preview.reopening) {
      current.status = String(preview.update.status);
      current.taskGeneration = Math.max(1, Number(current.taskGeneration ?? 1)) + 1;
      current.independentlyVerified = false;
      current.workerRequestedCompletion = false;
      current.completionCandidate = false;
      current.completedAt = null;
      current.completionEventSeq = null;
      current.completionEventHash = null;
      current.taskDefinitionHash = hash(canonicalizeStrict(teamTaskDefinition({
        task: current, contractSeal: this.store.contract.seal,
      })));
    } else if (String(preview.update.status ?? "") === "completed") {
      current.workerRequestedCompletion = true;
      if (current.status !== "completed") current.status = "awaiting-verification";
    } else if (preview.update.status != null) {
      current.status = String(preview.update.status);
    }
    this.store.saveState({ tasks: preview.tasks });
    const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim() || null;
    const preBoundary = toolUseId ? [...this.store.events()].reverse().find((event) =>
      event.type === "boundary_reached" && event.boundary === "PreToolUse"
      && event.toolUseId === toolUseId
      && (!actor?.agentId || event.agentId === actor.agentId)) : null;
    const updateEvent = this.event("task_graph_updated", {
      taskId: preview.id,
      agentId: actor?.agentId ?? null,
      owner: current.owner ?? null,
      status: current.status,
      blockedBy: current.blockedBy ?? [],
      toolUseId,
      hostSucceeded: true,
      preBoundarySeq: preBoundary?.seq ?? null,
      preBoundaryEventHash: preBoundary?.eventHash ?? null,
      postBoundarySeq: postBoundary?.seq ?? null,
      postBoundaryEventHash: postBoundary?.eventHash ?? null,
    });
    if (preview.reopening) {
      this.event("team_task_reopened", {
        taskId: preview.id,
        agentId: actor?.agentId ?? null,
        owner: current.owner ?? null,
        taskGeneration: current.taskGeneration,
        taskUpdateSeq: updateEvent.seq,
        taskUpdateEventHash: updateEvent.eventHash ?? null,
        toolUseId,
        hostSucceeded: true,
      });
    }
    return preview;
  }

  recordTaskCompletionIntent(input, actor) {
    const name = String(input?.tool_name ?? input?.toolName ?? "");
    const update = input?.tool_input ?? input?.toolInput ?? {};
    if (!/^TaskUpdate$/i.test(name) || String(update.status ?? "") !== "completed") return null;
    const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim();
    const taskId = String(update.taskId ?? update.task_id ?? "").trim();
    if (!toolUseId || !taskId || !actor?.agentId) return null;
    const state = this.state();
    const task = state.tasks?.[taskId];
    if (!task) return null;
    const key = hash(`task-completion-tool-use\0${toolUseId}`);
    const pending = { ...(state.pendingTaskCompletionIntents ?? {}) };
    if (pending[key]) return pending[key];
    const preBoundary = [...this.store.events()].reverse().find((event) =>
      event.type === "boundary_reached" && event.boundary === "PreToolUse"
      && event.toolUseId === toolUseId && event.agentId === actor.agentId);
    if (!preBoundary?.eventHash) return null;
    const identityBindingHash = actor.identitySource === "host-agent-spawn-binding"
      ? actor.identityProvenanceHash : null;
    const intentHash = hash(canonicalizeStrict({
      toolUseIdHash: key,
      taskIdHash: hash(`task\0${taskId}`),
      agentIdHash: hash(`completion-agent\0${actor.agentId}`),
      identityBindingHash,
      taskGeneration: Math.max(1, Number(task.taskGeneration ?? 1)),
      preBoundarySeq: preBoundary.seq,
      preBoundaryEventHash: preBoundary.eventHash,
    }));
    const intent = {
      intentHash, toolUseId, toolUseIdHash: key, taskId, agentId: actor.agentId,
      identityBindingHash,
      taskGeneration: Math.max(1, Number(task.taskGeneration ?? 1)),
      preBoundarySeq: preBoundary.seq,
      preBoundaryEventHash: preBoundary.eventHash,
      recordedAt: new Date().toISOString(),
    };
    pending[key] = intent;
    const intentEvent = this.event("task_completion_intent_recorded", {
      completionIntentHash: intentHash,
      toolUseId,
      toolUseIdHash: key,
      taskId,
      agentId: actor.agentId,
      identityBindingHash,
      taskGeneration: intent.taskGeneration,
      preBoundarySeq: preBoundary.seq,
      preBoundaryEventHash: preBoundary.eventHash,
    });
    pending[key] = { ...intent, intentEventSeq: intentEvent.seq,
      intentEventHash: intentEvent.eventHash ?? null };
    this.store.saveState({ pendingTaskCompletionIntents: pending });
    return pending[key];
  }

  openTaskCompletionIntents(taskId) {
    const state = this.state();
    const outcomes = state.taskCompletionIntentOutcomes ?? {};
    return Object.values(state.pendingTaskCompletionIntents ?? {}).filter((intent) =>
      intent.taskId === taskId && !outcomes[intent.toolUseIdHash]);
  }

  rejectTaskCompletionIntent(intent, reason) {
    if (!intent) return;
    const state = this.state();
    const outcomes = { ...(state.taskCompletionIntentOutcomes ?? {}) };
    if (outcomes[intent.toolUseIdHash]) return;
    outcomes[intent.toolUseIdHash] = { completed: false, reason,
      taskId: intent.taskId, agentId: intent.agentId, at: new Date().toISOString() };
    this.store.saveState({ taskCompletionIntentOutcomes: outcomes });
    this.event("task_completion_intent_rejected", {
      completionIntentHash: intent.intentHash,
      taskId: intent.taskId,
      agentId: intent.agentId,
      identityBindingHash: intent.identityBindingHash,
      reason,
    });
  }

  actorForTaskCompletion(input, taskId) {
    const hasExplicitIdentity = [input?.teammate_name, input?.teammateName,
      input?.agent_id, input?.agentId, input?.subagent_id, input?.subagentId]
      .some((value) => value != null && String(value).trim());
    const intents = this.openTaskCompletionIntents(taskId);
    if (intents.length > 1) {
      return { actor: null, intent: null, reason: "multiple-pending-completion-intents",
        candidateIntentHashes: intents.map((intent) => intent.intentHash).sort() };
    }
    const intent = intents[0] ?? null;
    if (intent && (!intent.intentEventHash || !Number.isFinite(Number(intent.intentEventSeq)))) {
      return { actor: null, intent, reason: "completion-intent-not-durably-journaled",
        candidateIntentHashes: [intent.intentHash] };
    }
    /* Claude Agent Teams emit TaskCompleted with an explicit teammate_name,
       while every teammate still shares the lead session/transcript lineage.
       Once the preceding TaskUpdate intent is durably bound to an exact spawn
       receipt, that intent is the actor authority for this otherwise
       identity-poor lifecycle hook.  Re-running generic lineage resolution
       here can (and did in the live canary) mistake another teammate's shared
       transcript mapping for the completing actor. */
    const explicitTeammateName = input?.teammate_name ?? input?.teammateName ?? null;
    const explicitCanonicalTeammate = explicitTeammateName == null ? null
      : `teammate:${String(explicitTeammateName)}`;
    if (intent?.identityBindingHash && explicitCanonicalTeammate) {
      if (explicitCanonicalTeammate !== intent.agentId) {
        return { actor: null, intent, reason: "completion-intent-actor-mismatch",
          candidateIntentHashes: [intent.intentHash] };
      }
      const state = this.state();
      const binding = Object.values(state.teamIdentityBindings ?? {}).find((candidate) =>
        candidate.bindingHash === intent.identityBindingHash
        && candidate.canonicalAgentId === intent.agentId);
      const agent = state.agents?.[intent.agentId];
      if (!binding || !agent) {
        return { actor: null, intent, reason: "completion-intent-binding-mismatch",
          candidateIntentHashes: [intent.intentHash] };
      }
      return { actor: { ...agent, agentId: intent.agentId,
        task: state.tasks?.[taskId] ?? null, identityConflict: false },
      intent, reason: null, candidateIntentHashes: [] };
    }
    if (hasExplicitIdentity) {
      const actor = this.registerActor(input);
      if (intent && actor.agentId !== intent.agentId) {
        return { actor: null, intent, reason: "completion-intent-actor-mismatch",
          candidateIntentHashes: [intent.intentHash] };
      }
      return { actor, intent, reason: null, candidateIntentHashes: [] };
    }
    if (!intent) {
      return { actor: null, intent: null, reason: "missing-completion-intent",
        candidateIntentHashes: [] };
    }
    const state = this.state();
    const agent = state.agents?.[intent.agentId];
    if (!agent) {
      return { actor: null, intent, reason: "completion-intent-agent-missing",
        candidateIntentHashes: [intent.intentHash] };
    }
    if (intent.identityBindingHash) {
      const binding = Object.values(state.teamIdentityBindings ?? {}).find((candidate) =>
        candidate.bindingHash === intent.identityBindingHash
        && candidate.canonicalAgentId === intent.agentId);
      if (!binding) {
        return { actor: null, intent, reason: "completion-intent-binding-mismatch",
          candidateIntentHashes: [intent.intentHash] };
      }
    }
    return { actor: { ...agent, agentId: intent.agentId,
      task: state.tasks?.[taskId] ?? null, identityConflict: false },
    intent, reason: null, candidateIntentHashes: [] };
  }

  finalizeTaskCompletionFromPost(input, actor, response, postBoundary) {
    const name = String(input?.tool_name ?? input?.toolName ?? "");
    const update = input?.tool_input ?? input?.toolInput ?? {};
    if (!/^TaskUpdate$/i.test(name) || String(update.status ?? "") !== "completed") return null;
    const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim();
    if (!toolUseId) return null;
    const key = hash(`task-completion-tool-use\0${toolUseId}`);
    const state = this.state();
    const intent = state.pendingTaskCompletionIntents?.[key];
    const verification = state.pendingTaskCompletionVerifications?.[key];
    if (!intent) return null;
    if (state.taskCompletionIntentOutcomes?.[key]) return null;
    if (!verification) {
      const outcomes = { ...(state.taskCompletionIntentOutcomes ?? {}) };
      const reason = "task-completion-gate-not-confirmed";
      outcomes[key] = { completed: false, reason, taskId: intent.taskId,
        agentId: intent.agentId, at: new Date().toISOString() };
      this.store.saveState({ taskCompletionIntentOutcomes: outcomes });
      this.event("task_completion_post_rejected", {
        completionIntentHash: intent.intentHash,
        taskId: intent.taskId,
        agentId: actor?.agentId ?? null,
        identityBindingHash: intent.identityBindingHash,
        toolUseId,
        postBoundarySeq: postBoundary?.seq ?? null,
        postBoundaryEventHash: postBoundary?.eventHash ?? null,
        reason,
      });
      return { completed: false, reason };
    }
    const exit = response?.exit_code ?? response?.exitCode ?? response?.code ?? null;
    const hostSucceeded = response?.is_error !== true && response?.isError !== true
      && response?.success !== false
      && (!Number.isFinite(Number(exit)) || Number(exit) === 0);
    const identityMatches = actor?.agentId === intent.agentId
      && verification.agentId === intent.agentId
      && verification.completionIntentHash === intent.intentHash;
    const bindingMatches = !intent.identityBindingHash
      || actor.identityProvenanceHash === intent.identityBindingHash;
    const outcomes = { ...(state.taskCompletionIntentOutcomes ?? {}) };
    const generationMatches = Number(intent.taskGeneration ?? 1)
      === Math.max(1, Number(state.tasks?.[intent.taskId]?.taskGeneration ?? 1))
      && Number(verification.taskGeneration ?? 1) === Number(intent.taskGeneration ?? 1);
    if (!hostSucceeded || !identityMatches || !bindingMatches || !generationMatches) {
      const reason = !hostSucceeded ? "host-reported-task-update-failure"
        : !identityMatches ? "task-completion-post-actor-mismatch"
          : !bindingMatches ? "task-completion-post-binding-mismatch"
            : "task-completion-generation-superseded";
      outcomes[key] = { completed: false, reason, at: new Date().toISOString() };
      this.store.saveState({ taskCompletionIntentOutcomes: outcomes });
      this.event("task_completion_post_rejected", {
        completionIntentHash: intent.intentHash,
        taskId: intent.taskId,
        agentId: actor?.agentId ?? null,
        identityBindingHash: intent.identityBindingHash,
        toolUseId,
        postBoundarySeq: postBoundary?.seq ?? null,
        postBoundaryEventHash: postBoundary?.eventHash ?? null,
        reason,
      });
      return { completed: false, reason };
    }
    const tasks = { ...(state.tasks ?? {}) };
    const current = tasks[intent.taskId];
    if (!current) return null;
    tasks[intent.taskId] = { ...current, status: "completed",
      independentlyVerified: true, completedAt: new Date().toISOString(),
      completionGeneration: Math.max(1, Number(intent.taskGeneration ?? 1)) };
    const fileConflicts = { ...(state.fileConflicts ?? {}) };
    for (const conflictId of verification.integrationConflictIds ?? []) {
      if (fileConflicts[conflictId]) fileConflicts[conflictId] = {
        ...fileConflicts[conflictId], status: "resolved-by-integration",
        resolvedAt: new Date().toISOString(),
      };
    }
    outcomes[key] = { completed: true, taskId: intent.taskId,
      agentId: intent.agentId, at: new Date().toISOString() };
    this.store.saveState({ tasks, fileConflicts, taskCompletionIntentOutcomes: outcomes });
    if (verification.integrationVerified) {
      this.event("multi_agent_integration_verified", {
        taskId: intent.taskId,
        agentId: actor.agentId,
        conflictIds: verification.integrationConflictIds ?? [],
        conflictFree: (verification.integrationConflictIds ?? []).length === 0,
        dependencyTaskIds: verification.integrationProof?.dependencyTaskIds ?? [],
        acceptanceSeq: verification.integrationProof?.acceptanceSeq ?? null,
        acceptanceExit: verification.integrationProof?.acceptanceExit ?? null,
        finalFingerprint: verification.integrationProof?.finalFingerprint ?? null,
        outcomeVerdictSeq: verification.integrationProof?.outcomeVerdictSeq ?? null,
        approvalAuditSeq: verification.integrationProof?.approvalAuditSeq ?? null,
        interventionId: verification.integrationProof?.interventionId ?? null,
        correctionAuthorityHash: verification.integrationProof?.correctionAuthorityHash ?? null,
        completionIntentHash: intent.intentHash,
        postBoundarySeq: postBoundary?.seq ?? null,
        postBoundaryEventHash: postBoundary?.eventHash ?? null,
      });
    }
    const completionEvent = this.event("team_task_completed", {
      taskId: intent.taskId,
      agentId: actor.agentId,
      independentlyVerified: true,
      identityBindingHash: intent.identityBindingHash,
      completionIntentHash: intent.intentHash,
      completionIntentEventSeq: intent.intentEventSeq,
      completionIntentEventHash: intent.intentEventHash,
      preBoundarySeq: intent.preBoundarySeq,
      preBoundaryEventHash: intent.preBoundaryEventHash,
      postBoundarySeq: postBoundary?.seq ?? null,
      postBoundaryEventHash: postBoundary?.eventHash ?? null,
      postHostSucceeded: true,
      taskGeneration: Math.max(1, Number(intent.taskGeneration ?? 1)),
      toolUseId,
    });
    return { completed: true, completionEvent };
  }

  activeTasksForAgent(agentId, state = this.state()) {
    const teammate = agentId.startsWith("teammate:") ? agentId.slice("teammate:".length) : agentId;
    return Object.values(state.tasks ?? {}).filter((task) => {
      const owner = task.owner ?? task.assigneeAgentId;
      return (owner === teammate || owner === agentId)
        && !["completed", "cancelled", "deleted"].includes(String(task.status));
    });
  }

  reconcileAgentTouches(agentId, newFile = null) {
    const state = this.state();
    const confirmedTouchesByAgent = { ...(state.confirmedTouchesByAgent ?? {}) };
    const files = [...new Set([...(confirmedTouchesByAgent[agentId] ?? []),
      ...(newFile ? [newFile] : [])])];
    confirmedTouchesByAgent[agentId] = files;
    const tasks = { ...(state.tasks ?? {}) };
    const active = this.activeTasksForAgent(agentId, { ...state, tasks });
    for (const task of active) {
      tasks[task.id] = { ...task,
        touchedFiles: [...new Set([...(task.touchedFiles ?? []), ...files])] };
    }
    const fileConflicts = { ...(state.fileConflicts ?? {}) };
    for (const file of files) {
      const involved = Object.values(tasks).filter((task) => (task.touchedFiles ?? []).includes(file)
        && !["cancelled", "deleted"].includes(String(task.status)));
      const distinctAgents = [...new Set(involved.map((task) => task.owner ?? task.assigneeAgentId)
        .filter(Boolean))];
      if (involved.length > 1 && distinctAgents.length > 1) {
        const id = hash(`file-conflict:${file}`).slice(7, 23);
        const firstDetection = !fileConflicts[id];
        fileConflicts[id] = {
          id, file,
          taskIds: involved.map((task) => task.id),
          agentIds: distinctAgents,
          status: fileConflicts[id]?.status ?? "open",
          detectedAt: fileConflicts[id]?.detectedAt ?? new Date().toISOString(),
        };
        if (firstDetection) this.event("cross_agent_file_conflict", fileConflicts[id]);
      }
    }
    this.store.saveState({ tasks, fileConflicts, confirmedTouchesByAgent });
    return { agentId, files, taskIds: active.map((task) => task.id) };
  }

  workspaceFileHash(file) {
    try { return hashBytes(readFileSync(path.join(this.store.cwd, file))); }
    catch { return MISSING_FILE_HASH; }
  }

  recordFileEffectIntent(input, actor) {
    const name = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^(?:Edit|Write)$/i.test(name)) return null;
    const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim();
    if (!toolUseId) return null;
    const tool = input?.tool_input ?? input?.toolInput ?? {};
    const file = normalizedWorkspacePath(this.store.cwd, tool.file_path ?? tool.filePath);
    if (!file) return null;
    const key = hash(`tool-use\0${toolUseId}`);
    const state = this.state();
    const pending = { ...(state.pendingFileEffects ?? {}) };
    const prior = pending[key];
    if (prior) return prior;
    const preBoundary = [...this.store.events()].reverse().find((event) =>
      event.type === "boundary_reached" && event.boundary === "PreToolUse"
      && event.toolUseId === toolUseId && event.agentId === actor.agentId);
    const intent = {
      toolUseId, toolUseIdHash: key, agentId: actor.agentId,
      agentIdHash: hash(`effect-agent\0${actor.agentId}`),
      file, beforeHash: this.workspaceFileHash(file),
      preBoundarySeq: preBoundary?.seq ?? null,
      preBoundaryEventHash: preBoundary?.eventHash ?? null,
      recordedAt: new Date().toISOString(),
    };
    pending[key] = intent;
    this.store.saveState({ pendingFileEffects: pending });
    this.event("file_effect_prepared", {
      toolUseId,
      toolUseIdHash: key,
      agentId: actor.agentId,
      file,
      beforeHash: intent.beforeHash,
      preBoundarySeq: intent.preBoundarySeq,
      preBoundaryEventHash: intent.preBoundaryEventHash,
    });
    return intent;
  }

  confirmFileTouch(input, actor = null, response = {}, postBoundary = null) {
    const name = String(input?.tool_name ?? input?.toolName ?? "");
    if (!/^(?:Edit|Write)$/i.test(name)) return null;
    const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim();
    if (!toolUseId) return null;
    const tool = input?.tool_input ?? input?.toolInput ?? {};
    const file = normalizedWorkspacePath(this.store.cwd, tool.file_path ?? tool.filePath);
    if (!file) return null;
    const agentId = actor?.agentId ?? teamAgentId(input);
    const key = hash(`tool-use\0${toolUseId}`);
    const state = this.state();
    const priorOutcome = state.fileEffectOutcomes?.[key];
    if (priorOutcome) return priorOutcome.confirmed ? priorOutcome : null;
    const prepared = state.pendingFileEffects?.[key] ?? null;
    const reconciledBinding = prepared && prepared.agentId !== agentId
      ? state.teamIdentityBindings?.[hash(`host-agent\0${prepared.agentId}`)] ?? null : null;
    /* A canonical teammate remains bound after the Agent spawn rendezvous and
       across controller recovery.  The old code only carried the binding hash
       on the rarer raw-id -> canonical-id race, so an ordinary
       canonical->canonical edit produced a real changed-file effect whose
       identityBindingHash was null.  Resolve only an exact persisted binding;
       never infer identity from a teammate name or shared transcript. */
    const canonicalBinding = actor?.identitySource === "host-agent-spawn-binding"
      && actor?.identityProvenanceHash
      ? Object.values(state.teamIdentityBindings ?? {}).find((binding) =>
        binding?.canonicalAgentId === agentId
        && binding?.bindingHash === actor.identityProvenanceHash) ?? null
      : null;
    const identityMatches = prepared?.agentId === agentId
      || (reconciledBinding?.canonicalAgentId === agentId
        && state.agentAliases?.[prepared.agentId] === agentId);
    const exit = response?.exit_code ?? response?.exitCode ?? response?.code ?? null;
    const hostSucceeded = response?.is_error !== true && response?.isError !== true
      && response?.success !== false
      && (!Number.isFinite(Number(exit)) || Number(exit) === 0);
    const afterHash = this.workspaceFileHash(file);
    let reason = null;
    if (!prepared) reason = "missing-pre-effect-snapshot";
    else if (!identityMatches || prepared.file !== file) reason = "pre-post-identity-mismatch";
    else if (!hostSucceeded) reason = "host-reported-failure";
    else if (prepared.beforeHash === afterHash) reason = "no-content-change";
    const outcomes = { ...(state.fileEffectOutcomes ?? {}) };
    if (reason) {
      const outcome = { confirmed: false, reason, toolUseId, agentId, file,
        beforeHash: prepared?.beforeHash ?? null, afterHash,
        postBoundarySeq: postBoundary?.seq ?? null,
        postBoundaryEventHash: postBoundary?.eventHash ?? null };
      outcomes[key] = outcome;
      this.store.saveState({ fileEffectOutcomes: outcomes });
      this.event("file_touch_unconfirmed", { ...outcome, executed: hostSucceeded, changed: false });
      return null;
    }
    const reconciled = this.reconcileAgentTouches(agentId, file);
    const outcome = { confirmed: true, agentId, file, taskIds: reconciled.taskIds,
      toolUseId, beforeHash: prepared.beforeHash, afterHash,
      identityBindingHash: reconciledBinding?.bindingHash
        ?? canonicalBinding?.bindingHash ?? null,
      preparedAgentIdHash: hash(`effect-agent\0${prepared.agentId}`),
      changed: true, executed: true,
      preBoundarySeq: prepared.preBoundarySeq,
      preBoundaryEventHash: prepared.preBoundaryEventHash,
      postBoundarySeq: postBoundary?.seq ?? null,
      postBoundaryEventHash: postBoundary?.eventHash ?? null };
    outcomes[key] = outcome;
    this.store.saveState({ fileEffectOutcomes: outcomes });
    this.event("confirmed_file_touch", {
      ...outcome,
    });
    return outcome;
  }

  openInterventionFor(agentId = "main") {
    const state = this.state();
    return state.openInterventions?.[agentId]
      ?? (agentId === "main" ? state.openIntervention ?? null : null);
  }

  setOpenIntervention(agentId, openIntervention) {
    const state = this.state();
    const openInterventions = { ...(state.openInterventions ?? {}) };
    if (openIntervention) openInterventions[agentId] = openIntervention;
    else delete openInterventions[agentId];
    this.store.saveState({ openInterventions, openIntervention: null });
  }

  deliveredInterventionAttempts(agentId, trigger) {
    const events = this.store.events();
    const pauses = new Map(events.filter((event) => event.type === "boundary_paused")
      .map((event) => [event.interventionId, event]));
    return events.filter((event) => {
      if (event.type !== "correction_emitted" || event.source !== "supervisor_plan") return false;
      const pause = pauses.get(event.interventionId);
      return (event.agentId ?? pause?.agentId ?? "main") === agentId
        && pause?.trigger === trigger;
    }).length;
  }

  recordSemanticJudgeFailure(actor, open, semantic) {
    const state = this.state();
    const identity = open?.id ?? `unattributed:${actor.agentId}`;
    const failures = { ...(state.semanticJudgeFailures ?? {}) };
    const count = Number(failures[identity] ?? 0) + 1;
    failures[identity] = count;
    this.store.saveState({ semanticJudgeFailures: failures });
    const budgetUsed = Number(this.state().runtimeSupervisorCalls ?? 0);
    const failure = semantic?.semanticOutcome?.failure ?? null;
    const evaluationBudgetExhausted = failure?.category === "evaluation-budget"
      && failure?.retryable === false;
    const budgetExhausted = budgetUsed >= this.maxSupervisorCalls
      || evaluationBudgetExhausted;
    const payload = {
      interventionId: open?.id ?? null,
      agentId: actor.agentId,
      correctionAuthorityHash: open?.correctionAuthorityHash ?? null,
      failureCycle: count,
      supervisorCallsUsed: budgetUsed,
      supervisorCallLimit: this.maxSupervisorCalls,
      supervisorBudgetExhausted: budgetExhausted,
      failureCategory: failure?.category ?? null,
      failureRetryable: failure?.retryable ?? null,
      semanticError: String(semantic?.semanticOutcome?.error ?? "semantic judge unavailable")
        .slice(0, 1000),
      interventionPreserved: Boolean(open),
      messageDelivered: false,
    };
    if (!budgetExhausted) {
      this.event("semantic_judge_retry_deferred", payload);
      return { terminate: false, count, identity };
    }
    this.event("semantic_judge_conservative_terminal", payload);
    this.event("run_cannot_recover", {
      interventionId: open?.id ?? null,
      agentId: actor.agentId,
      trigger: "semantic-judge-unavailable",
      reason: evaluationBudgetExhausted
        ? "evaluation model-process budget exhausted; ending incomplete without further model calls"
        : "semantic verifier/auditor failed repeatedly; ending incomplete without clearing intervention identity",
    });
    return { terminate: true, count, identity };
  }

  clearSemanticJudgeFailures(interventionId, agentId = "main") {
    const state = this.state();
    const failures = { ...(state.semanticJudgeFailures ?? {}) };
    let changed = false;
    for (const identity of [interventionId, `unattributed:${agentId}`].filter(Boolean)) {
      if (Object.hasOwn(failures, identity)) {
        delete failures[identity];
        changed = true;
      }
    }
    if (changed) this.store.saveState({ semanticJudgeFailures: failures });
  }

  observeIntervention({ input, actor = null }) {
    const resolvedActor = actor ?? this.registerActor(input);
    const open = this.openInterventionFor(resolvedActor.agentId);
    if (!open) return null;
    let changed = false;
    if (!open.correctionObserved && transcriptContains(input, open.marker)) {
      const observed = this.event("correction_observed", { interventionId: open.id,
        agentId: resolvedActor.agentId, marker: open.marker,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null });
      open.correctionObserved = true;
      open.correctionObservedSeq = observed.seq;
      open.matchedExpectedActions = {};
      const recovery = this.recoveryRecord(open.id);
      if (recovery?.phase === "delivery-recorded") {
        this.interventionRecovery.observeDelivery({ interventionId: open.id,
          observedSeq: observed.seq });
      }
      changed = true;
    }
    if (open.correctionObserved) {
      open.boundariesObserved = Number(open.boundariesObserved ?? 0) + 1;
      changed = true;
    }
    if (open.correctionObserved) {
      const before = this.store.readJson(open.snapshotFile);
      const after = this.snapshot(this.store.cwd);
      const diff = diffSnapshots(before, after);
      const effects = meaningfulEffects(open, diff, input, this.store.cwd,
        resolvedActor.agentId);
      const transcript = input?.transcript_path ?? input?.transcriptPath ?? null;
      const transcriptRelative = transcript ? relativeIfInside(this.store.cwd, transcript) : null;
      const allWorkspaceChanges = diff.changes.filter((entry) => entry.path !== transcriptRelative);
      if (effects.length > 0) {
        const matchedExpectedActions = { ...(open.matchedExpectedActions ?? {}) };
        const expectedEdits = (open.expectedActions ?? open.expectedNextActions ?? [])
          .map((action) => parsedExpectedAction(action, this.store.cwd, this.store.contract))
          .filter((action) => ["edit", "delete"].includes(action?.kind)
            && correctionActorMatches(action.actor, resolvedActor.agentId)
            && effects.some((entry) => entry.path === action.target));
        for (const expectedEdit of expectedEdits) {
          if (matchedExpectedActions[expectedEdit.raw]) continue;
          const changedFiles = effects.filter((entry) => entry.path === expectedEdit.target)
            .map((entry) => entry.path);
          const effectEvent = this.event("effect_observed", {
            interventionId: open.id,
            agentId: resolvedActor.agentId,
            effectKind: "workspace-diff",
            matchedExpectedAction: expectedEdit.raw,
            toolUseId: null,
            exit: null,
            eventSeq: null,
            afterCorrectionSeq: open.correctionObservedSeq ?? null,
            correctionAuthorityHash: open.correctionAuthorityHash ?? null,
            changedFiles,
            beforeFingerprint: diff.beforeFingerprint,
            afterFingerprint: diff.afterFingerprint,
            artifactFingerprint: diff.afterFingerprint,
          });
          matchedExpectedActions[expectedEdit.raw] = effectEvent.seq;
          const recovery = this.recoveryRecord(open.id);
          if (recovery?.phase === "delivery-observed") {
            this.interventionRecovery.observeEffect({ interventionId: open.id,
              effectSeq: effectEvent.seq });
          }
          open.effectObserved = true;
        }
        open.matchedExpectedActions = matchedExpectedActions;
        changed = true;
      } else if (allWorkspaceChanges.length > 0
        && open.lastUnattributedFingerprint !== diff.afterFingerprint) {
        this.event("unattributed_workspace_change_observed", {
          interventionId: open.id,
          agentId: resolvedActor.agentId,
          afterCorrectionSeq: open.correctionObservedSeq ?? null,
          correctionAuthorityHash: open.correctionAuthorityHash ?? null,
          changedFiles: allWorkspaceChanges.map((entry) => entry.path),
          beforeFingerprint: diff.beforeFingerprint,
          artifactFingerprint: diff.afterFingerprint,
          reason: "workspace change did not match a frozen correction action",
        });
        open.lastUnattributedFingerprint = diff.afterFingerprint;
        changed = true;
      }
    }
    if (changed) this.setOpenIntervention(resolvedActor.agentId, open);
    return open;
  }

  observeInterventionAction({ input, actor, completed, exit, boundaryEvent }) {
    const open = this.openInterventionFor(actor.agentId);
    if (!open?.correctionObserved) return open;
    if (!open.correctionObservedSeq || boundaryEvent.seq <= open.correctionObservedSeq) return open;
    const matches = (open.expectedActions ?? open.expectedNextActions ?? []).map((expectedAction) => ({
      expectedAction: typeof expectedAction === "string"
        ? expectedAction : canonicalizeStrict(expectedAction),
      match: expectedActionMatch(expectedAction, {
        cwd: this.store.cwd, contract: this.store.contract,
        actorId: actor.agentId,
        toolName: input?.tool_name ?? input?.toolName,
        toolInput: input?.tool_input ?? input?.toolInput ?? {},
        toolResponse: input?.tool_response ?? input?.toolResponse ?? input?.result ?? {},
        taskState: this.state(),
        completed,
        exit,
      }),
    })).filter((entry) => entry.match);
    if (!matches.length) return open;
    const matchedExpectedActions = { ...(open.matchedExpectedActions ?? {}) };
    let effect = null;
    for (const entry of matches) {
      if (matchedExpectedActions[entry.expectedAction]) continue;
      if (entry.match.succeeded) matchedExpectedActions[entry.expectedAction] = boundaryEvent.seq;
      this.event("expected_action_observed", {
        interventionId: open.id,
        agentId: actor.agentId,
        expectedAction: entry.expectedAction,
        effectKind: entry.match.kind,
        strong: entry.match.strong,
        succeeded: entry.match.succeeded,
        toolUseId: boundaryEvent.toolUseId ?? null,
        exit,
        eventSeq: boundaryEvent.seq,
        afterCorrectionSeq: open.correctionObservedSeq,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null,
      });
      if (!effect && entry.match.strong && entry.match.succeeded) effect = entry;
    }
    open.matchedExpectedActions = matchedExpectedActions;
    if (effect) {
      const effectSnapshot = this.snapshot(this.store.cwd);
      const effectEvent = this.event("effect_observed", {
        interventionId: open.id,
        agentId: actor.agentId,
        effectKind: effect.match.kind,
        matchedExpectedAction: effect.expectedAction,
        toolUseId: boundaryEvent.toolUseId ?? null,
        exit,
        eventSeq: boundaryEvent.seq,
        afterCorrectionSeq: open.correctionObservedSeq,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null,
        changedFiles: effect.match.kind === "edit" && completed.file
          ? [observedToolPath(this.store.cwd, completed)] : [],
        artifactFingerprint: effectSnapshot.fingerprint,
      });
      const recovery = this.recoveryRecord(open.id);
      if (recovery?.phase === "delivery-observed") {
        this.interventionRecovery.observeEffect({ interventionId: open.id,
          effectSeq: effectEvent.seq });
      }
      open.effectObserved = true;
    }
    this.setOpenIntervention(actor.agentId, open);
    return open;
  }

  reviewIntervention({ input, agent, actor, open }) {
    if (!open || open.directionVerified || !open.correctionObserved || !open.effectObserved) return null;
    if (Number(open.boundariesObserved ?? 0) < Number(open.nextReviewAt ?? this.followupBoundaries)) return null;
    const pause = [...this.store.events()].reverse().find((event) =>
      event.type === "boundary_paused" && event.interventionId === open.id);
    if (["Stop", "TaskCompleted"].includes(pause?.boundary)) {
      /* Stop and TaskCompleted interventions already own a stronger native
         follow-up: frozen acceptance plus an independently audited semantic
         outcome when the worker retries that lifecycle boundary. Re-diagnosing
         them on an ordinary tool boundary duplicates the judge, spends the
         completion reserve, and can replace the very intervention whose causal
         effect we need to prove. Keep observing effects, but settle the
         intervention at its native lifecycle boundary. */
      open.nextReviewAt = Number(open.boundariesObserved) + this.followupBoundaries;
      this.setOpenIntervention(actor.agentId, open);
      this.event(pause.boundary === "Stop" ? "intervention_followup_deferred_to_stop"
        : "intervention_followup_deferred_to_task_completion", {
        interventionId: open.id,
        agentId: actor.agentId,
        nativeBoundary: pause.boundary,
        boundariesObserved: open.boundariesObserved,
        nextReviewAt: open.nextReviewAt,
        correctionAuthorityHash: open.correctionAuthorityHash ?? null,
      });
      return { status: "deferred-to-stop" };
    }
    const acceptanceResult = this.acceptance({
      cwd: this.store.cwd,
      command: this.store.contract.acceptance,
    });
    this.event("intervention_followup_due", {
      interventionId: open.id,
      agentId: actor.agentId,
      boundariesObserved: open.boundariesObserved,
      acceptancePassed: acceptanceResult.passed,
      acceptanceExit: acceptanceResult.exit,
    });
    const reviewed = this.supervise({
      input,
      agent,
      boundary: "PreToolUse",
      trigger: `followup:${open.trigger}`,
      acceptanceResult,
      actor,
    });
    if (reviewed.status === "correction") {
      this.event("intervention_replanned", {
        interventionId: open.id,
        replacementInterventionId: reviewed.interventionId,
        agentId: actor.agentId,
        reason: "independent follow-up still found drift",
      });
      return reviewed;
    }
    if (reviewed.status === "on-track") {
      open.directionVerified = true;
      open.directionVerifiedAtBoundary = open.boundariesObserved;
      this.setOpenIntervention(actor.agentId, open);
      this.event("intervention_direction_verified", {
        interventionId: open.id,
        agentId: actor.agentId,
        boundariesObserved: open.boundariesObserved,
      });
      return reviewed;
    }
    open.nextReviewAt = Number(open.boundariesObserved) + this.followupBoundaries;
    this.setOpenIntervention(actor.agentId, open);
    this.event("intervention_followup_deferred", {
      interventionId: open.id,
      agentId: actor.agentId,
      reason: reviewed.status,
      nextReviewAt: open.nextReviewAt,
    });
    return reviewed;
  }

  evidence({ input, agent, trigger, acceptanceResult = null, semanticOutcome = null,
    proposedTool = null, actor = null, reference = null }) {
    const current = this.snapshot(this.store.cwd);
    const diff = diffSnapshots(reference ?? this.baseline, current);
    /* The host transcript can represent a Codex custom `exec` wrapper without
       its underlying Bash semantics.  The controller has already sealed the
       exact Pre/Post pair, including actor, command, result and exit.  Use that
       durable ledger for semantic supervision and only use the transcript to
       enrich it, otherwise a real child Read disappears at SubagentStop. */
    const durableSteps = durableExecutionSteps(this.store, input, agent, this.store.cwd);
    const steps = actor?.agentId ? durableSteps.filter((step) =>
      step.agentId == null || step.agentId === actor.agentId) : durableSteps;
    const interventionHistory = this.store.events().filter((event) => {
      if (event.agentId && event.agentId !== (actor?.agentId ?? "main")) return false;
      return ["supervisor_verdict", "correction_emitted", "correction_observed",
        "effect_observed", "intervention_unresolved"].includes(event.type);
    }).map((event) => ({
      type: event.type,
      interventionId: event.interventionId ?? null,
      onTrack: event.onTrack ?? null,
      drift: event.drift ?? null,
      planSteps: event.planSteps ?? null,
      correctionObserved: event.correctionObserved ?? null,
      effectObserved: event.effectObserved ?? null,
    }));
    const baselineAcceptance = this.store.events()
      .find((event) => event.type === "baseline_acceptance") ?? null;
    let proposedToolSemantics = null;
    const proposedName = String(proposedTool?.name ?? proposedTool?.toolName ?? "");
    const proposedInput = proposedTool?.input ?? proposedTool?.toolInput ?? {};
    if (/^TaskUpdate$/i.test(proposedName)) {
      const preview = this.taskUpdatePreview({
        tool_name: "TaskUpdate",
        tool_input: proposedInput,
      }, actor);
      proposedToolSemantics = {
        authority: "deterministic-controller-preview",
        tool: "TaskUpdate",
        applies: preview.applies === true,
        ok: preview.ok === true,
        reason: preview.reason ?? null,
        taskId: preview.id ?? (String(proposedInput.taskId ?? proposedInput.task_id ?? "") || null),
        addBlockedByMeaning: "each listed task becomes a dependency of the current task",
        addBlocksMeaning: "each listed task becomes downstream and depends on the current task",
        resultingTasks: Object.values(preview.tasks ?? {}).slice(0, 24).map((task) => ({
          id: task.id ?? null,
          owner: task.owner ?? null,
          status: task.status ?? null,
          blockedBy: stringList(task.blockedBy),
        })),
      };
    }
    const packet = supervisorPacket({
      contract: this.store.contract,
      steps,
      diff,
      acceptance: acceptanceResult,
      semanticOutcome,
      proposedTool,
      trigger,
      actor,
      interventionHistory,
      coordination: this.coordinationSnapshot(),
      baselineAcceptance,
      baselineSnapshot: this.baseline,
      currentSnapshot: current,
      workspaceIdentity: this.workspaceIdentity,
      decisionScope: this.decisionScope(trigger, actor),
      proposedToolSemantics,
    });
    const controllerProcessTypes = new Set([
      "endurance_shift_dispatched", "endurance_shift_input_submitted",
      "endurance_shift_completed", "endurance_recovery_drill_armed",
      "endurance_recovery_drill_injected", "endurance_crash_injection_due",
      "endurance_crash_recovery_confirmed", "endurance_patrol_warmup_dispatched",
      "controller_recovered", "evaluator_fault_injected",
      "team_spawn_requested", "team_spawn_capability_observed", "team_identity_bound",
      "teammate_context_injected", "team_task_created", "task_graph_updated",
      "confirmed_file_touch", "teammate_verification_confirmed", "team_task_completed",
      "multi_agent_integration_verified", "coordination_ready_at_stop",
      "task_delegated", "agent_registered", "subagent_context_injected",
      "subagent_report_bound", "task_completed",
    ]);
    packet.controllerProcessEvidence = this.store.events()
      .filter((event) => controllerProcessTypes.has(event.type))
      .map((event) => ({
        seq: event.seq, at: event.at, type: event.type,
        kind: event.kind ?? null, ordinal: event.ordinal ?? null,
        afterApprovedStopSeq: event.afterApprovedStopSeq ?? null,
        dispatchedAtSeq: event.dispatchedAtSeq ?? null,
        armedEventSeq: event.armedEventSeq ?? null,
        path: event.path ?? null,
        contentHash: event.contentHash ?? null,
        evaluatorOwned: event.evaluatorOwned ?? null,
        controllerPreparedBeforeHook: event.controllerPreparedBeforeHook ?? null,
        logicalTarget: event.logicalTarget ?? null,
        sourceHash: event.sourceHash ?? null,
        markerHash: event.markerHash ?? null,
        beforeHash: event.beforeHash ?? null,
        afterHash: event.afterHash ?? null,
        faultAuthorityHash: event.faultAuthorityHash ?? null,
        taskId: event.taskId ?? null,
        generation: event.generation ?? null,
        agentId: event.agentId ?? null,
        owner: event.owner ?? null,
        status: event.status ?? null,
        blockedBy: Array.isArray(event.blockedBy) ? event.blockedBy : null,
        file: event.file ?? null,
        changed: event.changed ?? null,
        executed: event.executed ?? null,
        taskIds: Array.isArray(event.taskIds) ? event.taskIds : null,
        toolUseId: event.toolUseId ?? null,
        identityBindingHash: event.identityBindingHash ?? null,
        parentAgentId: event.parentAgentId ?? null,
        description: event.description ?? null,
        promptHash: event.promptHash ?? null,
        promptVisibility: event.promptVisibility ?? null,
        reportHash: event.reportHash ?? event.completionReportHash ?? null,
        reportBytes: event.reportBytes ?? null,
        transcriptBound: event.transcriptBound
          ?? event.completionReportTranscriptBound ?? null,
        independentlyVerified: event.independentlyVerified ?? null,
      })).slice(-120);
    packet.activeEvaluatorShift = activeControllerShiftEvidence(this.store.events(), {
      toolName: proposedTool?.name ?? proposedTool?.toolName ?? null,
      toolInput: proposedTool?.input ?? proposedTool?.toolInput ?? null,
      cwd: this.store.cwd,
      preregistration: this.store.readJson("endurance-preregistration.json"),
    });
    return { packet, current, diff, steps };
  }

  supervise({ input, agent, boundary, trigger, acceptanceResult = null, semanticOutcome = null,
    proposedTool = null, actor = null, reference = null }) {
    const agentId = actor?.agentId ?? "main";
    /* The intervention ceiling measures actuator doses delivered to the worker,
       not failed/insufficient judges.  The event stream is the crash-safe source
       of truth: a proposal that never reached correction_emitted spent zero
       attempts. */
    const attempt = this.deliveredInterventionAttempts(agentId, trigger) + 1;
    if (attempt > MAX_INTERVENTIONS_PER_TRIGGER) {
      this.event("intervention_budget_exhausted", {
        agentId,
        trigger,
        attempts: attempt - 1,
      });
      return { status: "exhausted", attempt: attempt - 1 };
    }
    const interventionId = randomUUID();
    this.interventionRecovery.beginIntervention({
      interventionId,
      agentId,
      trigger,
      boundary,
      attempt,
    });
    this.event("boundary_paused", {
      interventionId,
      boundary,
      trigger,
      agentId: actor?.agentId ?? "main",
      attempt,
      tool: input?.tool_name ?? input?.toolName ?? null,
    });
    const evidence = this.evidence({ input, agent, trigger, acceptanceResult, semanticOutcome,
      proposedTool, actor, reference });
    const evidenceFile = `evidence-${interventionId}.json`;
    this.store.writeJson(evidenceFile, evidence.packet);
    this.event("evidence_captured", {
      interventionId,
      bytes: JSON.stringify(evidence.packet).length,
      evidenceFile,
      evidenceHash: hash(JSON.stringify(evidence.packet)),
      containsWorkerNarration: evidence.packet.actor?.delegatedTask
        ?.completionReport?.observed === true,
      changedFiles: evidence.diff.changes.map((entry) => entry.path),
      acceptanceExit: acceptanceResult?.exit ?? null,
    });
    const call = this.consumeSupervisorCall("diagnosis", interventionId);
    if (!call.ok) return { status: "exhausted", interventionId, evidence,
      attempt, reason: "global supervisor call budget exhausted" };
    this.event("supervisor_requested", { interventionId, freshContext: true, call: call.used });
    let activeCall = call;
    let result = this.supervisor({
      cmd: this.store.supervisorCommand,
      packet: evidence.packet,
      interventionId,
    });
    if (!result?.ok && result?.failure?.retryable === true) {
      this.event("supervisor_retrying", {
        interventionId,
        failedCall: activeCall.used,
        ...supervisorFailureFields(result),
      });
      const retry = this.consumeSupervisorCall("diagnosis-retry", interventionId);
      if (retry.ok) {
        activeCall = retry;
        this.event("supervisor_requested", {
          interventionId, freshContext: true, call: retry.used, retryAttempt: 2,
        });
        result = this.supervisor({
          cmd: this.store.supervisorCommand,
          packet: evidence.packet,
          interventionId,
        });
      }
    }
    if (!result?.ok) {
      this.event("supervisor_failed", { interventionId, ...supervisorFailureFields(result) });
      return { status: "failed", interventionId, evidence, result };
    }
    let verdict = result.verdict;
    if (!validSupervisorVerdict(verdict)) {
      this.event("supervisor_failed", { interventionId, error: "INVALID_SUPERVISOR_VERDICT" });
      return { status: "failed", interventionId, evidence,
        result: { ok: false, error: "INVALID_SUPERVISOR_VERDICT" } };
    }
    const actionableOffTrackVerdict = verdict.onTrack === false
      && Boolean(String(verdict.drift ?? "").trim())
      && Array.isArray(verdict.plan) && verdict.plan.some((item) => String(item).trim())
      && Array.isArray(verdict.expectedNextActions)
      && verdict.expectedNextActions.some((item) => String(item).trim());
    const controllerOwnedSemanticGap = semanticOutcome?.passed === false
      && Array.isArray(semanticOutcome?.gaps) && semanticOutcome.gaps.length > 0;
    /* `insufficient` means the missing fact prevents a decision. In a real R1
       run the supervisor produced a complete repair from controller-owned
       source/gap evidence, then also used `insufficient` to note that it could
       not attribute an evaluator-injected mutation to a visible worker step.
       Treat that non-decisive provenance uncertainty as telemetry and let the
       already-required factual audit grade the typed correction authority. A
       genuinely incomplete verdict, or one without an independent semantic
       red finding, remains fail-closed and spends no actuator dose. */
    if (verdict.insufficient && actionableOffTrackVerdict && controllerOwnedSemanticGap) {
      this.event("supervisor_insufficiency_reclassified_as_advisory", {
        interventionId,
        agentId,
        advisory: String(verdict.insufficient).slice(0, 500),
        basis: "controller-owned-semantic-gap-and-complete-actionable-verdict",
        semanticGapCount: semanticOutcome.gaps.length,
      });
      verdict = { ...verdict, insufficientAdvisory: String(verdict.insufficient),
        insufficient: null };
    }
    if (verdict.insufficient) {
      this.event("supervisor_insufficient", {
        interventionId,
        missing: String(verdict.insufficient).slice(0, 500),
      });
      return { status: "insufficient", interventionId, evidence, verdict };
    }
    let plan = Array.isArray(verdict.plan) ? verdict.plan.filter((item) => String(item).trim()) : [];
    let verdictSource = "diagnosis";
    /* The factual auditor must grade the proposal against the evidence that
       actually produced it. After a re-diagnosis that includes a rejected
       proposal and audit errors, reverting to the original packet makes true
       references to that history look fabricated. */
    let correctionAuditEvidence = evidence.packet;
    if (verdict.onTrack) {
      /* A clearance is an assertion that this boundary needs no intervention.
         It cannot be true while controller-owned evidence at the same boundary
         is objectively red.  An LLM clearance auditor is useful for factual
         review, but it must not be allowed to override this deterministic
         contradiction (the R5 recovery drill reproduced exactly that failure:
         acceptance exit 1, an empty onTrack proposal, and an auditor PASS).
         Transient/infra failures may still end conservatively or be re-diagnosed;
         they simply cannot be recorded as a successful clearance. */
      const objectiveClearanceErrors = [];
      /* A frozen acceptance is controller-owned at every boundary where it is
         actually run.  TaskCompleted integration gates use the same command
         and must receive the same deterministic contradiction protection as
         Stop; otherwise an onTrack answer can be rejected locally without
         entering the already-existing clearance re-diagnosis path. */
      const terminalAcceptanceBoundary = boundary === "Stop" || boundary === "TaskCompleted";
      if (terminalAcceptanceBoundary && acceptanceResult?.ran === true
        && acceptanceResult?.passed === false) {
        objectiveClearanceErrors.push("onTrack=true contradicts controller-owned red acceptance");
      }
      if (terminalAcceptanceBoundary && semanticOutcome?.passed === false) {
        objectiveClearanceErrors.push("onTrack=true contradicts controller-owned red semantic outcome");
      }
      const internallyConsistent = !String(verdict.drift ?? "").trim()
        && plan.length === 0 && objectiveClearanceErrors.length === 0;
      this.event("supervisor_clearance_proposed", {
        interventionId,
        agentId: actor?.agentId ?? "main",
        attempt,
        planSteps: plan.length,
        internallyConsistent,
        acceptancePassed: acceptanceResult?.passed ?? null,
        semanticOutcomePassed: semanticOutcome?.passed ?? null,
      });
      let clearanceCall = null;
      let clearanceAuditorInvoked = false;
      let clearance = null;
      if (objectiveClearanceErrors.length > 0) {
        /* Spending a second LLM call cannot make exit=1 or a sealed semantic
           RED become green.  The 1.3.61 endurance run paid for two clearance
           audits that both rediscovered this exact deterministic fact before
           re-diagnosis could begin.  Reject the proposed clearance locally,
           preserve the same append-only audit shape, and spend the next model
           call only on an actionable diagnosis. */
        const deterministicErrors = [...objectiveClearanceErrors];
        this.event("supervisor_clearance_deterministically_rejected", {
          interventionId,
          reason: "controller-owned-objective-contradiction",
          errors: deterministicErrors.slice(0, 12),
          auditorFailure: null,
        });
        clearance = {
          ok: true,
          packet: null,
          verdict: {
            decision: "reject",
            passed: false,
            errors: deterministicErrors,
            blockingErrors: deterministicErrors,
            notes: ["controller-owned red evidence deterministically rejects clearance"],
            verifiedFacts: ["controller-owned evidence contradicts the proposed clearance"],
            insufficient: null,
          },
        };
      } else {
        clearanceCall = this.consumeSupervisorCall("supervisor-clearance-audit", interventionId);
        if (!clearanceCall.ok) return { status: "exhausted", interventionId, evidence,
          attempt, reason: "global supervisor call budget exhausted before clearance audit" };
        clearanceAuditorInvoked = true;
        this.event("supervisor_clearance_auditor_requested", {
          interventionId, freshContext: true, call: clearanceCall.used,
        });
        clearance = this.clearanceAuditor({
          cmd: this.store.supervisorCommand,
          contract: this.store.contract,
          evidence: evidence.packet,
          proposal: verdict,
        });
        if (!clearance?.ok && clearance?.failure?.retryable === true) {
          this.event("supervisor_clearance_auditor_retrying", {
            interventionId, failedCall: clearanceCall.used, ...supervisorFailureFields(clearance),
          });
          const retry = this.consumeSupervisorCall("supervisor-clearance-audit-retry", interventionId);
          if (retry.ok) {
            clearanceCall = retry;
            this.event("supervisor_clearance_auditor_requested", {
              interventionId, freshContext: true, call: retry.used, retryAttempt: 2,
            });
            clearance = this.clearanceAuditor({
              cmd: this.store.supervisorCommand,
              contract: this.store.contract,
              evidence: evidence.packet,
              proposal: verdict,
              validationFeedback: clearance?.failure?.retryInstruction ?? clearance?.error ?? null,
            });
          }
        }
        if (!clearance?.ok) {
          this.event("supervisor_clearance_auditor_failed", {
            interventionId, ...supervisorFailureFields(clearance),
          });
          /* An unavailable prose auditor cannot make an already-proven
             controller contradiction disappear. A prose-inconsistent
             clearance can still be rejected locally; a consistent clearance
             fails closed when its auditor is unavailable. */
          if (internallyConsistent) {
            return { status: "failed", interventionId, evidence, verdict, clearance };
          }
          const deterministicErrors = [
            ...(String(verdict.drift ?? "").trim() || plan.length > 0
              ? ["onTrack=true is internally inconsistent with non-empty drift or plan"] : []),
          ];
          this.event("supervisor_clearance_deterministically_rejected", {
            interventionId,
            reason: "auditor-unavailable-over-controller-owned-contradiction",
            errors: deterministicErrors.slice(0, 12),
            auditorFailure: supervisorFailureFields(clearance),
          });
          clearance = {
            ok: true,
            packet: null,
            verdict: {
              decision: "reject",
              passed: false,
              errors: deterministicErrors,
              blockingErrors: deterministicErrors,
              notes: ["clearance auditor unavailable; deterministic contradiction controls"],
              verifiedFacts: [],
              insufficient: null,
            },
          };
        }
      }
      const clearanceFile = `clearance-audit-${interventionId}.json`;
      if (clearance.packet) this.store.writeJson(clearanceFile, clearance.packet);
      const proseConsistencyErrors = !String(verdict.drift ?? "").trim() && plan.length === 0
        ? [] : ["onTrack=true is internally inconsistent with non-empty drift or plan"];
      const consistencyErrors = [...proseConsistencyErrors, ...objectiveClearanceErrors];
      const clearancePassed = clearance.verdict.passed === true
        && !clearance.verdict.insufficient && internallyConsistent;
      const clearanceAuditEvent = this.event("supervisor_clearance_audit", {
        interventionId,
        passed: clearancePassed,
        auditorPassed: clearanceAuditorInvoked ? clearance.verdict.passed : null,
        auditSource: clearanceAuditorInvoked ? "independent-clearance-auditor"
          : "deterministic-controller-contradiction",
        ...semanticAuditEventFields(clearance.verdict),
        internallyConsistent,
        errors: [...consistencyErrors, ...clearance.verdict.errors].slice(0, 12),
        verifiedFacts: clearance.verdict.verifiedFacts.slice(0, 12),
        insufficient: clearance.verdict.insufficient ?? null,
        evidenceFile: clearance.packet ? clearanceFile : null,
        evidenceHash: clearance.packet ? hash(JSON.stringify(clearance.packet)) : null,
      });
      if (clearancePassed) {
        this.event("supervisor_verdict", {
          interventionId,
          agentId: actor?.agentId ?? "main",
          attempt,
          onTrack: true,
          drift: "",
          planSteps: 0,
          expectedNextActions: Array.isArray(verdict.expectedNextActions)
            ? verdict.expectedNextActions.slice(0, 8) : [],
          clearanceAuditSeq: clearanceAuditEvent.seq,
        });
        return { status: "on-track", interventionId, evidence, verdict, clearance };
      }
      this.event("supervisor_clearance_rejected", {
        interventionId,
        auditSeq: clearanceAuditEvent.seq,
        reason: clearance.verdict.insufficient ? "insufficient"
          : objectiveClearanceErrors.length > 0 ? "objective-contradiction"
            : internallyConsistent ? "objective-contradiction" : "internally-inconsistent",
        messageDelivered: false,
      });
      const rediagnosisCall = this.consumeSupervisorCall("clearance-rediagnosis", interventionId);
      if (!rediagnosisCall.ok) return { status: "exhausted", interventionId, evidence,
        attempt, reason: "global supervisor call budget exhausted after clearance rejection" };
      const rediagnosisPacket = {
        ...evidence.packet,
        trigger: `clearance-rejected:${trigger}`,
        rejectedClearance: {
          priorProposal: verdict,
          auditErrors: [...consistencyErrors, ...clearance.verdict.errors].slice(0, 12),
          insufficient: clearance.verdict.insufficient ?? null,
          instruction: "重新诊断；不得再次返回与这些客观矛盾相同的 onTrack clearance",
        },
      };
      const rediagnosisFile = `clearance-rediagnosis-${interventionId}.json`;
      this.store.writeJson(rediagnosisFile, rediagnosisPacket);
      this.event("supervisor_requested", {
        interventionId, freshContext: true, call: rediagnosisCall.used,
        reason: "clearance-rejected", evidenceFile: rediagnosisFile,
        evidenceHash: hash(JSON.stringify(rediagnosisPacket)),
      });
      let rediagnosed = this.supervisor({
        cmd: this.store.supervisorCommand,
        packet: rediagnosisPacket,
        interventionId,
      });
      if (!rediagnosed?.ok && rediagnosed?.failure?.retryable === true) {
        this.event("supervisor_retrying", {
          interventionId, failedCall: rediagnosisCall.used,
          reason: "clearance-rediagnosis", ...supervisorFailureFields(rediagnosed),
        });
        const retry = this.consumeSupervisorCall("clearance-rediagnosis-retry", interventionId);
        if (retry.ok) {
          this.event("supervisor_requested", {
            interventionId, freshContext: true, call: retry.used,
            retryAttempt: 2, reason: "clearance-rejected", evidenceFile: rediagnosisFile,
            evidenceHash: hash(JSON.stringify(rediagnosisPacket)),
          });
          rediagnosed = this.supervisor({
            cmd: this.store.supervisorCommand,
            packet: rediagnosisPacket,
            interventionId,
          });
        }
      }
      if (!rediagnosed?.ok || !validSupervisorVerdict(rediagnosed.verdict)
        || rediagnosed.verdict.insufficient) {
        this.event("supervisor_clearance_rediagnosis_failed", {
          interventionId,
          error: !rediagnosed?.ok ? String(rediagnosed?.error ?? "rediagnosis failed").slice(0, 500)
            : rediagnosed.verdict.insufficient
              ? String(rediagnosed.verdict.insufficient).slice(0, 500)
              : "INVALID_SUPERVISOR_VERDICT",
        });
        return { status: "invalid-clearance", interventionId, evidence, verdict,
          clearance, rediagnosed };
      }
      verdict = rediagnosed.verdict;
      plan = Array.isArray(verdict.plan) ? verdict.plan.filter((item) => String(item).trim()) : [];
      if (verdict.onTrack || !plan.length) {
        this.event("supervisor_clearance_rediagnosis_failed", {
          interventionId,
          error: "rediagnosis repeated onTrack or returned no corrective plan",
        });
        return { status: "invalid-clearance", interventionId, evidence, verdict,
          clearance, rediagnosed };
      }
      verdictSource = "clearance-rediagnosis";
      correctionAuditEvidence = rediagnosisPacket;
    }
    let audited = null;
    let auditEvent = null;
    let correctionAuthority = null;
    for (let correctionDraft = 1; correctionDraft <= 2; correctionDraft += 1) {
      correctionAuthority = correctionAuthorityFrom({ verdict, evidence: correctionAuditEvidence,
        contract: this.store.contract, cwd: this.store.cwd,
        actorId: actor?.agentId ?? "main", agentTeamPolicy: this.agentTeamPolicy() });
      if (!validCorrectionAuthority(correctionAuthority)) {
        this.event("supervisor_failed", {
          interventionId, error: "INVALID_CORRECTION_AUTHORITY_PROJECTION",
        });
        return { status: "failed", interventionId, evidence, verdict };
      }
      const authorityHash = hash(canonicalizeStrict(correctionAuthority));
      const authorityFile = `correction-authority-${interventionId}-${correctionDraft}.json`;
      this.store.writeJson(authorityFile, correctionAuthority);
      const priorRecovery = this.recoveryRecord(interventionId);
      if (!priorRecovery?.authority) {
        this.interventionRecovery.bindAuthority({ interventionId, authorityHash,
          authorityRef: authorityFile });
      } else if (priorRecovery.authority.hash !== authorityHash) {
        this.interventionRecovery.supersedeRejectedAuthority({
          interventionId,
          previousAuthorityHash: priorRecovery.authority.hash,
          rejectionResultHash: priorRecovery.judge?.resultHash,
          rejectionResultRef: priorRecovery.judge?.resultRef,
          nextAuthorityHash: authorityHash,
          nextAuthorityRef: authorityFile,
        });
      }
      this.event("supervisor_verdict", {
        interventionId,
        agentId: actor?.agentId ?? "main",
        attempt,
        source: verdictSource,
        correctionDraft,
        onTrack: false,
        drift: String(verdict.drift ?? "").slice(0, 800),
        planSteps: plan.length,
        expectedNextActions: Array.isArray(verdict.expectedNextActions)
          ? verdict.expectedNextActions.slice(0, 8) : [],
        correctionAuthoritySchema: correctionAuthority.schema,
        correctionAuthorityHash: authorityHash,
        defectSource: correctionAuthority.defect.source,
        defectClaims: correctionAuthority.defect.claims.length,
      });
      let auditCall = this.consumeSupervisorCall("correction-factual-audit", interventionId);
      if (!auditCall.ok) return { status: "exhausted", interventionId, evidence,
        attempt, reason: "global supervisor call budget exhausted before correction audit" };
      this.event("correction_auditor_requested", {
        interventionId, freshContext: true, call: auditCall.used, correctionDraft,
      });
      const recoveryAuditInput = {
        schema: "outsider/recoverable-correction-audit-input/v1",
        interventionId,
        actorId: agentId,
        correctionDraft,
        verdictSource,
        authorityHash,
        evidence: correctionAuditEvidence,
        proposal: correctionAuthority,
        verdict,
        evidenceBundle: evidence,
      };
      const recoveryAuditFile = `recovery-correction-audit-${interventionId}-${correctionDraft}.json`;
      const recoveryAuditArtifact = this.writeRecoveryArtifact(recoveryAuditFile,
        recoveryAuditInput);
      this.beginRecoveryJudge({
        interventionId,
        kind: "correction-factual-audit",
        inputFile: recoveryAuditFile,
        inputHash: recoveryAuditArtifact.hash,
        authorityHash,
      });
      audited = this.correctionAuditor({
        cmd: this.store.supervisorCommand,
        contract: this.store.contract,
        evidence: correctionAuditEvidence,
        proposal: correctionAuthority,
      });
      if (!audited?.ok && audited?.failure?.retryable === true) {
        this.event("correction_auditor_retrying", {
          interventionId, failedCall: auditCall.used, correctionDraft,
          ...supervisorFailureFields(audited),
        });
        const retry = this.consumeSupervisorCall("correction-factual-audit-retry", interventionId);
        if (retry.ok) {
          auditCall = retry;
          this.event("correction_auditor_requested", {
            interventionId, freshContext: true, call: retry.used, retryAttempt: 2,
            correctionDraft,
          });
          audited = this.correctionAuditor({
            cmd: this.store.supervisorCommand,
            contract: this.store.contract,
            evidence: correctionAuditEvidence,
            proposal: correctionAuthority,
            validationFeedback: audited?.failure?.retryInstruction ?? audited?.error ?? null,
          });
        }
      }
      if (!audited?.ok) {
        this.event("correction_auditor_failed", {
          interventionId, correctionDraft, ...supervisorFailureFields(audited),
        });
        return { status: "failed", interventionId, evidence, verdict, audit: audited };
      }
      const correctionAuditFile = `correction-audit-${interventionId}-${correctionDraft}.json`;
      if (audited.packet) this.store.writeJson(correctionAuditFile, audited.packet);
      let auditVerdict = audited.verdict;
      const actionabilityError = correctionAuditActionabilityError({
        proposal: correctionAuthority,
        evidence: correctionAuditEvidence,
      });
      if (actionabilityError) {
        this.event("correction_audit_deterministically_rejected", {
          interventionId,
          correctionDraft,
          correctionAuthorityHash: authorityHash,
          reason: "red-acceptance-without-artifact-mutation",
          error: actionabilityError,
          auditorDecision: auditVerdict.decision ?? null,
          auditorPassed: auditVerdict.passed === true,
        });
        auditVerdict = {
          ...auditVerdict,
          decision: "reject",
          passed: false,
          blockingErrors: [actionabilityError],
          errors: [actionabilityError],
          notes: [
            ...(Array.isArray(auditVerdict.notes) ? auditVerdict.notes : []),
            ...(auditVerdict.passed === true
              ? ["the model auditor's PASS was overridden by the deterministic actionability floor"]
              : []),
          ].slice(0, 12),
          insufficient: null,
          insufficientReason: null,
        };
      }
      const temporalAuthority = correctionAuditTemporalAuthority({
        verdict: auditVerdict, proposal: correctionAuthority, evidence: correctionAuditEvidence,
      });
      if (temporalAuthority) {
        this.event("correction_audit_insufficiency_reclassified_as_advisory", {
          interventionId,
          correctionDraft,
          correctionAuthorityHash: authorityHash,
          auditorDecision: temporalAuthority.auditorDecision,
          advisory: temporalAuthority.advisory,
          basis: "current-controller-snapshot-binds-edit-preimage",
          editPaths: temporalAuthority.editPaths,
        });
        auditVerdict = temporalAuthority.verdict;
      }
      this.completeRecoveryJudge({
        interventionId,
        result: { ok: true, verdict: auditVerdict },
        passed: auditVerdict.passed === true && !auditVerdict.insufficient,
      });
      auditEvent = this.event("correction_factual_audit", {
        interventionId,
        correctionDraft,
        proposalSource: verdictSource,
        correctionAuthorityHash: authorityHash,
        passed: auditVerdict.passed,
        auditorDecision: temporalAuthority?.auditorDecision ?? auditVerdict.decision ?? null,
        temporalAuthorityOverride: Boolean(temporalAuthority),
        ...semanticAuditEventFields(auditVerdict),
        errors: auditVerdict.errors.slice(0, 12),
        verifiedFacts: auditVerdict.verifiedFacts.slice(0, 12),
        insufficient: auditVerdict.insufficient ?? null,
        evidenceFile: audited.packet ? correctionAuditFile : null,
        evidenceHash: audited.packet ? hash(JSON.stringify(audited.packet)) : null,
      });
      if (auditVerdict.passed && !auditVerdict.insufficient) break;
      this.event("correction_withheld_factual_error", {
        interventionId,
        auditSeq: auditEvent.seq,
        correctionDraft,
        errorCount: auditVerdict.errors.length,
        reason: auditVerdict.insufficient ? "insufficient" : "factual-or-contract-error",
        messageDelivered: false,
      });
      if (correctionDraft >= 2) {
        return { status: "invalid-correction", interventionId, evidence, verdict,
          audit: audited };
      }

      const rediagnosisCall = this.consumeSupervisorCall("correction-rediagnosis", interventionId);
      if (!rediagnosisCall.ok) return { status: "exhausted", interventionId, evidence,
        attempt, reason: "global supervisor call budget exhausted after correction rejection" };
      const rediagnosisPacket = {
        ...evidence.packet,
        trigger: `correction-rejected:${trigger}`,
        rejectedCorrection: {
          priorProposal: correctionAuthority,
          auditErrors: auditVerdict.errors.slice(0, 12),
          auditVerifiedFacts: auditVerdict.verifiedFacts.slice(0, 12),
          auditInsufficient: auditVerdict.insufficient ?? null,
          instruction: "重新诊断并重写纠正；保留被证据支持的核心机制，但删除或修正所有被审计否决的事实主张",
        },
      };
      const rediagnosisFile = `correction-rediagnosis-${interventionId}.json`;
      this.store.writeJson(rediagnosisFile, rediagnosisPacket);
      this.event("supervisor_requested", {
        interventionId, freshContext: true, call: rediagnosisCall.used,
        reason: "correction-rejected", evidenceFile: rediagnosisFile,
        evidenceHash: hash(JSON.stringify(rediagnosisPacket)),
      });
      let rediagnosed = this.supervisor({
        cmd: this.store.supervisorCommand,
        packet: rediagnosisPacket,
        interventionId,
      });
      let rediagnosisRetried = false;
      if (!rediagnosed?.ok && rediagnosed?.failure?.retryable === true) {
        this.event("supervisor_retrying", {
          interventionId, failedCall: rediagnosisCall.used,
          reason: "correction-rediagnosis", ...supervisorFailureFields(rediagnosed),
        });
        const retry = this.consumeSupervisorCall("correction-rediagnosis-retry", interventionId);
        if (retry.ok) {
          rediagnosisRetried = true;
          this.event("supervisor_requested", {
            interventionId, freshContext: true, call: retry.used,
            retryAttempt: 2, reason: "correction-rejected", evidenceFile: rediagnosisFile,
            evidenceHash: hash(JSON.stringify(rediagnosisPacket)),
          });
          rediagnosed = this.supervisor({
            cmd: this.store.supervisorCommand,
            packet: rediagnosisPacket,
            interventionId,
          });
        }
      }
      const firstRediagnosisPlan = Array.isArray(rediagnosed?.verdict?.plan)
        ? rediagnosed.verdict.plan.filter((item) => String(item).trim()) : [];
      const semanticallyInvalidRediagnosis = rediagnosed?.ok
        && validSupervisorVerdict(rediagnosed.verdict)
        && !rediagnosed.verdict.insufficient
        && (rediagnosed.verdict.onTrack || firstRediagnosisPlan.length === 0);
      /* A schema-valid but semantically impossible re-diagnosis is the same
         bounded protocol failure as malformed JSON: it cannot overturn the
         controller-owned red evidence or the factual audit that requested a
         repair. Give the same node one repair attempt with the exact reason;
         do not add another judge and do not leak the rejected text to the
         worker. The formal endurance run exposed this as onTrack/no-plan after
         a correct factual rejection. */
      if (semanticallyInvalidRediagnosis && !rediagnosisRetried) {
        const retry = this.consumeSupervisorCall("correction-rediagnosis-semantic-retry",
          interventionId);
        if (retry.ok) {
          rediagnosisRetried = true;
          const semanticRetryPacket = {
            ...rediagnosisPacket,
            trigger: `correction-rediagnosis-invalid:${trigger}`,
            validationFeedback: {
              kind: "semantic-contradiction",
              errors: ["re-diagnosis returned onTrack or no corrective plan while controller-owned acceptance/semantic evidence remains red"],
              instruction: "Return onTrack=false with a concrete typed repair plan grounded only in the frozen evidence and the rejected-audit facts.",
            },
          };
          const semanticRetryFile = `correction-rediagnosis-retry-${interventionId}.json`;
          this.store.writeJson(semanticRetryFile, semanticRetryPacket);
          this.event("supervisor_retrying", {
            interventionId,
            failedCall: rediagnosisCall.used,
            reason: "correction-rediagnosis-semantic-invalid",
            failureKind: "semantic-contradiction",
          });
          this.event("supervisor_requested", {
            interventionId, freshContext: true, call: retry.used,
            retryAttempt: 2, reason: "correction-rediagnosis-semantic-invalid",
            evidenceFile: semanticRetryFile,
            evidenceHash: hash(JSON.stringify(semanticRetryPacket)),
          });
          rediagnosed = this.supervisor({
            cmd: this.store.supervisorCommand,
            packet: semanticRetryPacket,
            interventionId,
          });
        }
      }
      if (!rediagnosed?.ok || !validSupervisorVerdict(rediagnosed.verdict)
        || rediagnosed.verdict.insufficient) {
        this.event("correction_rediagnosis_failed", {
          interventionId,
          error: !rediagnosed?.ok ? String(rediagnosed?.error ?? "rediagnosis failed").slice(0, 500)
            : rediagnosed.verdict.insufficient
              ? String(rediagnosed.verdict.insufficient).slice(0, 500)
              : "INVALID_SUPERVISOR_VERDICT",
        });
        return { status: "invalid-correction", interventionId, evidence, verdict,
          audit: audited, rediagnosed };
      }
      verdict = rediagnosed.verdict;
      plan = Array.isArray(verdict.plan) ? verdict.plan.filter((item) => String(item).trim()) : [];
      if (verdict.onTrack || !plan.length) {
        this.event("correction_rediagnosis_failed", {
          interventionId,
          error: "re-diagnosis returned onTrack or no corrective plan; it cannot silently overturn a rejected correction",
        });
        return { status: "invalid-correction", interventionId, evidence, verdict,
          audit: audited, rediagnosed };
      }
      verdictSource = "correction-rediagnosis";
      correctionAuditEvidence = rediagnosisPacket;
    }
    return this.deliverAuditedCorrection({
      interventionId,
      actorId: agentId,
      attempt,
      trigger,
      boundary,
      evidence,
      verdict,
      correctionAuthority,
      auditEvent,
    });
  }

  verifySemanticOutcome({ acceptanceResult, interventionId = null, phase = "stop",
    input = null, agent = "claude-code" }) {
    const current = this.snapshot(this.store.cwd);
    const diff = diffSnapshots(this.baseline, current);
    const recoverableOutcome = this.resumeRecoverableOutcomeApproval({
      interventionId,
      currentFingerprint: current.fingerprint,
    });
    if (recoverableOutcome) return recoverableOutcome;
    const executionInput = input ?? (this.lastTranscriptPath
      ? { transcript_path: this.lastTranscriptPath } : {});
    const executionSteps = durableExecutionSteps(this.store, executionInput, agent, this.store.cwd);
    /* These are controller/evaluator-owned process facts, not worker
       narration. They let long-run adjudication distinguish bounded external
       wakes from worker-side polling instead of guessing from tool gaps. */
    const controllerProcessTypes = new Set([
      "endurance_shift_dispatched", "endurance_shift_input_submitted",
      "endurance_shift_completed", "endurance_recovery_drill_armed",
      "endurance_recovery_drill_injected", "endurance_crash_injection_due",
      "endurance_crash_recovery_confirmed", "endurance_patrol_warmup_dispatched",
      "controller_recovered", "evaluator_fault_injected",
      /* A final outcome auditor must be able to distinguish an audited repair
         from a worker-authored shortcut.  These are bounded controller facts,
         not supervisor prose: the failed sealed acceptance, the authority
         hash that survived factual audit, delivery/observation/effect, and the
         later green acceptance.  Omitting this chain made a real R5 repair
         look self-authorized even though every link was already in the sealed
         event stream. */
      "acceptance_finished", "boundary_paused", "supervisor_verdict",
      "correction_factual_audit", "correction_emitted", "correction_observed",
      "effect_observed", "intervention_resolved",
      "team_spawn_requested", "team_spawn_capability_observed", "team_identity_bound",
      "teammate_context_injected", "team_task_created", "task_graph_updated",
      "confirmed_file_touch", "teammate_verification_confirmed", "team_task_completed",
      "multi_agent_integration_verified", "coordination_ready_at_stop",
      "task_delegated", "agent_registered", "subagent_context_injected",
      "subagent_report_bound", "task_completed",
    ]);
    const controllerProcessEvidence = this.store.events()
      .filter((event) => controllerProcessTypes.has(event.type))
      .map((event) => ({
        seq: event.seq, at: event.at, type: event.type,
        eventHash: event.eventHash ?? null,
        kind: event.kind ?? null, ordinal: event.ordinal ?? null,
        afterApprovedStopSeq: event.afterApprovedStopSeq ?? null,
        dispatchedAtSeq: event.dispatchedAtSeq ?? null,
        approvedStopSeq: event.approvedStopSeq ?? null,
        outcomeVerdictSeq: event.outcomeVerdictSeq ?? null,
        interventionId: event.interventionId ?? null,
        evaluatorOwned: event.evaluatorOwned ?? null,
        controllerPreparedBeforeHook: event.controllerPreparedBeforeHook ?? null,
        logicalTarget: event.logicalTarget ?? null,
        sourceHash: event.sourceHash ?? null,
        markerHash: event.markerHash ?? null,
        beforeHash: event.beforeHash ?? null,
        afterHash: event.afterHash ?? null,
        faultAuthorityHash: event.faultAuthorityHash ?? null,
        taskId: event.taskId ?? null,
        generation: event.generation ?? null,
        agentId: event.agentId ?? null,
        owner: event.owner ?? null,
        status: event.status ?? null,
        blockedBy: Array.isArray(event.blockedBy) ? event.blockedBy : null,
        file: event.file ?? null,
        changed: event.changed ?? null,
        executed: event.executed ?? null,
        taskIds: Array.isArray(event.taskIds) ? event.taskIds : null,
        toolUseId: event.toolUseId ?? null,
        identityBindingHash: event.identityBindingHash ?? null,
        parentAgentId: event.parentAgentId ?? null,
        description: event.description ?? null,
        promptHash: event.promptHash ?? null,
        promptVisibility: event.promptVisibility ?? null,
        reportHash: event.reportHash ?? event.completionReportHash ?? null,
        reportBytes: event.reportBytes ?? null,
        transcriptBound: event.transcriptBound
          ?? event.completionReportTranscriptBound ?? null,
        independentlyVerified: event.independentlyVerified ?? null,
        phase: event.phase ?? null,
        ran: event.ran ?? null,
        passed: event.passed ?? null,
        exit: event.exit ?? null,
        finalFingerprint: event.finalFingerprint ?? null,
        acceptanceCommandHash: event.command ? hash(String(event.command)) : null,
        acceptanceMatchesCurrentCommand: event.type === "acceptance_finished"
          ? event.command === acceptanceResult?.command : null,
        outputHash: event.outputHash ?? null,
        /* The bounded tail lets an independent auditor identify the actual
           sealed assertion that failed.  Full raw logs and arbitrary model
           narration remain outside this packet. */
        outputTail: event.type === "acceptance_finished"
          ? String(event.outputTail ?? "").slice(-1600) : null,
        boundary: event.boundary ?? null,
        trigger: event.trigger ?? null,
        attempt: event.attempt ?? null,
        onTrack: event.onTrack ?? null,
        source: event.source ?? null,
        proposalSource: event.proposalSource ?? null,
        decision: event.decision ?? null,
        insufficient: event.insufficient ?? null,
        correctionAuthorityHash: event.correctionAuthorityHash ?? null,
        factualAuditSeq: event.factualAuditSeq ?? null,
        correctionObserved: event.type === "correction_observed" ? true : null,
        effectKind: event.effectKind ?? null,
        matchedExpectedAction: event.matchedExpectedAction ?? null,
        afterCorrectionSeq: event.afterCorrectionSeq ?? null,
        changedFiles: Array.isArray(event.changedFiles) ? event.changedFiles.slice(0, 24) : null,
        expectedActions: event.type === "correction_emitted" && Array.isArray(event.expectedActions)
          ? event.expectedActions.slice(0, 12).map((action) => ({
            kind: action?.kind ?? null,
            ...(action?.actor ? { actor: action.actor } : {}),
            path: action?.path ?? null,
            preSha256: action?.preSha256 ?? null,
            ref: action?.ref ?? null,
            expectExit: action?.expectExit ?? null,
            ...(action?.owner ? { owner: action.owner } : {}),
            ...(Array.isArray(action?.paths) ? { paths: action.paths.slice(0, 8) } : {}),
            ...(Array.isArray(action?.blockedByOwners)
              ? { blockedByOwners: action.blockedByOwners.slice(0, 8) } : {}),
            ...(action?.name ? { name: action.name } : {}),
            ...(action?.model ? { model: action.model } : {}),
          })) : null,
      }));
    const activeEvaluatorShift = activeControllerShiftEvidence(this.store.events(), {
      cwd: this.store.cwd,
      preregistration: this.store.readJson("endurance-preregistration.json"),
    });
    if (activeEvaluatorShift) controllerProcessEvidence.push({
      type: "active_evaluator_shift_state",
      ...activeEvaluatorShift,
    });
    const baselineAcceptance = this.store.events()
      .find((event) => event.type === "baseline_acceptance") ?? null;
    const baselineOutcome = this.store.events()
      .find((event) => event.type === "baseline_outcome_verdict") ?? null;
    if (phase === "stop" && acceptanceResult?.passed === true
      && baselineAcceptance?.passed === true && baselineOutcome?.passed === true
      && baselineOutcome?.baselineFingerprint === current.fingerprint
      && current.fingerprint === this.baseline.fingerprint) {
      /* Idempotent task: t=0 was independently proven mechanically and
         semantically complete, and the worker left that exact tree intact.
         Requiring an edit here manufactures work and creates an impossible
         correction loop. Reuse the sealed baseline attestation as a Stop-time
         verdict; a baseline green command alone is never sufficient. */
      this.event("outcome_verdict", {
        interventionId,
        phase,
        finalFingerprint: current.fingerprint,
        passed: true,
        gaps: [],
        evidence: ["unchanged tree reuses independently verified baseline outcome",
          ...(baselineOutcome.evidence ?? []).slice(0, 10)],
        insufficient: null,
        source: "baseline-outcome-attestation",
        baselineOutcomeSeq: baselineOutcome.seq,
      });
      return {
        status: "passed",
        current,
        diff,
        verdict: { passed: true, gaps: [], evidence: baselineOutcome.evidence ?? [] },
        semanticOutcome: { checked: true, passed: true, gaps: [],
          evidence: baselineOutcome.evidence ?? [], insufficient: null },
      };
    }
    /* Semantic judgments are non-deterministic.  Once an independently
       evaluated tree has a substantive RED verdict, another sample must not
       wash it out while the content-addressed tree is unchanged.  Only a new
       workspace fingerprint can clear the rejection.  This is intentionally
       conservative: a false negative costs another edit/review; a RED->PASS
       flip on identical bytes can ship the exact defect already identified. */
    const stickyRejection = this.store.events().find((event) =>
      event.type === "outcome_verdict"
      && event.passed === false && !event.insufficient
      && event.finalFingerprint === current.fingerprint
      && event.source !== "same-fingerprint-rejection-lock"
      && Array.isArray(event.gaps) && event.gaps.length > 0);
    if (stickyRejection) {
      const gaps = [
        "unchanged content was previously rejected by independent semantic verification",
        ...(stickyRejection.gaps ?? []).slice(0, 11),
      ];
      const evidence = [
        `sticky semantic rejection from outcome_verdict seq ${stickyRejection.seq}`,
        ...(stickyRejection.evidence ?? []).slice(0, 10),
      ];
      this.event("outcome_conflict_sticky_red", {
        interventionId,
        phase,
        finalFingerprint: current.fingerprint,
        sourceOutcomeVerdictSeq: stickyRejection.seq,
        sourcePhase: stickyRejection.phase ?? null,
        reason: "same fingerprint cannot overturn a substantive semantic rejection",
      });
      this.event("outcome_verdict", {
        interventionId,
        phase,
        finalFingerprint: current.fingerprint,
        passed: false,
        verifierProposedPassed: null,
        approvalAuditPassed: null,
        approvalAuditSeq: null,
        gaps,
        evidence,
        insufficient: null,
        source: "same-fingerprint-rejection-lock",
        sourceOutcomeVerdictSeq: stickyRejection.seq,
      });
      return {
        status: "rejected",
        current,
        diff,
        verdict: { passed: false, gaps, evidence },
        semanticOutcome: { checked: true, passed: false, gaps, evidence,
          insufficient: null },
      };
    }
    if (phase === "stop" && acceptanceResult?.passed === true) {
      /* TaskCompleted integration verification and Stop can observe the exact
         same immutable tree a few milliseconds apart.  Re-buying a verifier
         and PASS audit after the controller-owned integration gate has already
         approved that content wastes the finite judge budget and can turn a
         proven delivery into a conservative stop.  Reuse is authority-safe
         only when the prior PASS, its exact approval audit, and a green
         controller-owned acceptance are all bound to this intervention and
         fingerprint.  We still append a new Stop verdict so the delivery and
         causal proof retain their strict phase ordering. */
      const priorOutcome = [...this.store.events()].reverse().find((event) =>
        event.type === "outcome_verdict"
        && event.phase !== "stop"
        && event.passed === true && !event.insufficient
        && event.interventionId === interventionId
        && event.finalFingerprint === current.fingerprint
        && Number.isInteger(event.approvalAuditSeq));
      const priorAudit = priorOutcome ? this.store.events().find((event) =>
        event.type === "outcome_approval_audit"
        && event.seq === priorOutcome.approvalAuditSeq
        && event.seq < priorOutcome.seq
        && event.passed === true && !event.insufficient
        && event.interventionId === interventionId
        && event.finalFingerprint === current.fingerprint) : null;
      const priorAcceptance = priorOutcome ? this.store.events().find((event) =>
        event.type === "acceptance_finished"
        && event.seq < priorOutcome.seq
        && event.phase === priorOutcome.phase
        && event.ran === true && event.passed === true
        && event.interventionId === interventionId
        && event.finalFingerprint === current.fingerprint) : null;
      if (priorOutcome && priorAudit && priorAcceptance) {
        this.event("outcome_verification_reused", {
          interventionId,
          sourceSeq: priorOutcome.seq,
          sourcePhase: priorOutcome.phase,
          approvalAuditSeq: priorAudit.seq,
          finalFingerprint: current.fingerprint,
          reason: "same content already passed controller-owned acceptance and independent PASS audit",
        });
        this.event("outcome_verdict", {
          interventionId,
          phase,
          finalFingerprint: current.fingerprint,
          passed: true,
          verifierProposedPassed: true,
          approvalAuditPassed: true,
          approvalAuditSeq: priorAudit.seq,
          gaps: [],
          evidence: [
            `content-addressed ${priorOutcome.phase} outcome reused at Stop`,
            ...(priorOutcome.evidence ?? []).slice(0, 10),
          ],
          insufficient: null,
          source: "content-addressed-audited-outcome",
          sourceOutcomeVerdictSeq: priorOutcome.seq,
          sourceAcceptanceSeq: priorAcceptance.seq,
        });
        return {
          status: "passed",
          current,
          diff,
          verdict: { passed: true, gaps: [], evidence: priorOutcome.evidence ?? [] },
          semanticOutcome: { checked: true, passed: true, gaps: [],
            evidence: priorOutcome.evidence ?? [], insufficient: null },
        };
      }
    }
    if (phase === "stop" && acceptanceResult?.passed === true
      && ["checkpoint", "recovery-checkpoint-continuation"].includes(activeEvaluatorShift?.kind)
      && activeEvaluatorShift.allExpectedCompleted === true
      && activeEvaluatorShift.allCompletedSuccessfully === true
      && activeEvaluatorShift.unexpectedCompletedActionCount === 0) {
      /* A long endurance run must not buy a fresh pair of model opinions for
         every controller-owned heartbeat.  Reuse is deliberately narrower
         than ordinary same-tree reuse: the previous Stop must have a green
         acceptance and an exact PASS audit for the same intervention and
         fingerprint; the new shift must be a preregistered checkpoint whose
         complete PostToolUse sequence is exact, successful and contains no
         unclassified action; and no worker tool boundary may sit between the
         prior verdict and the controller dispatch.  Recovery drills, edits,
         failed commands and arbitrary repeated Stops still require a judge. */
      const ordered = this.store.events();
      const priorOutcome = [...ordered].reverse().find((event) =>
        event.type === "outcome_verdict"
        && event.phase === "stop" && event.passed === true && !event.insufficient
        && (event.interventionId ?? null) === (interventionId ?? null)
        && event.finalFingerprint === current.fingerprint
        && Number.isInteger(event.approvalAuditSeq)
        && Number(event.seq) < Number(activeEvaluatorShift.dispatchSeq));
      const priorAudit = priorOutcome ? ordered.find((event) =>
        event.type === "outcome_approval_audit"
        && event.seq === priorOutcome.approvalAuditSeq
        && event.seq < priorOutcome.seq
        && event.passed === true && !event.insufficient
        && (event.interventionId ?? null) === (interventionId ?? null)
        && event.finalFingerprint === current.fingerprint) : null;
      const priorAcceptance = priorOutcome ? [...ordered].reverse().find((event) =>
        event.type === "acceptance_finished"
        && event.seq < priorOutcome.seq && event.phase === "stop"
        && event.ran === true && event.passed === true
        && (event.interventionId ?? null) === (interventionId ?? null)
        && event.finalFingerprint === current.fingerprint) : null;
      const undisclosedBoundary = priorOutcome ? ordered.find((event) =>
        event.type === "boundary_reached" && event.boundary === "PostToolUse"
        && Number(event.seq) > Number(priorOutcome.seq)
        && Number(event.seq) < Number(activeEvaluatorShift.submittedSeq)) : null;
      if (priorOutcome && priorAudit && priorAcceptance && !undisclosedBoundary) {
        const shiftEvidence = {
          kind: activeEvaluatorShift.kind,
          dispatchSeq: activeEvaluatorShift.dispatchSeq,
          submittedSeq: activeEvaluatorShift.submittedSeq,
          expectedSteps: activeEvaluatorShift.expectedSteps,
          completedSteps: activeEvaluatorShift.completedSteps,
          allExpectedCompleted: activeEvaluatorShift.allExpectedCompleted,
          allCompletedSuccessfully: activeEvaluatorShift.allCompletedSuccessfully,
          unexpectedCompletedActionCount: activeEvaluatorShift.unexpectedCompletedActionCount,
        };
        const shiftEvidenceHash = hash(canonicalizeStrict(shiftEvidence));
        this.event("outcome_verification_reused", {
          interventionId,
          sourceSeq: priorOutcome.seq,
          sourcePhase: priorOutcome.phase,
          approvalAuditSeq: priorAudit.seq,
          finalFingerprint: current.fingerprint,
          shiftDispatchSeq: activeEvaluatorShift.dispatchSeq,
          shiftEvidenceHash,
          reason: "same content plus exact successful controller-owned checkpoint shift",
        });
        this.event("outcome_verdict", {
          interventionId,
          phase,
          finalFingerprint: current.fingerprint,
          passed: true,
          verifierProposedPassed: true,
          approvalAuditPassed: true,
          approvalAuditSeq: priorAudit.seq,
          gaps: [],
          evidence: [
            "content-addressed audited Stop outcome reused after exact successful controller checkpoint",
            `checkpoint shift evidence ${shiftEvidenceHash}`,
            ...(priorOutcome.evidence ?? []).slice(0, 8),
          ],
          insufficient: null,
          source: "controller-checkpoint-content-addressed-outcome",
          sourceOutcomeVerdictSeq: priorOutcome.seq,
          sourceAcceptanceSeq: priorAcceptance.seq,
          shiftDispatchSeq: activeEvaluatorShift.dispatchSeq,
          shiftEvidenceHash,
        });
        return {
          status: "passed",
          current,
          diff,
          verdict: { passed: true, gaps: [], evidence: priorOutcome.evidence ?? [] },
          semanticOutcome: { checked: true, passed: true, gaps: [],
            evidence: priorOutcome.evidence ?? [], insufficient: null },
        };
      }
    }
    let call = this.consumeSupervisorCall("outcome-verification", interventionId);
    if (!call.ok) {
      return {
        status: "failed",
        current: null,
        diff: null,
        semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [],
          error: "global supervisor call budget exhausted" },
      };
    }
    this.event("outcome_verifier_requested", {
      interventionId,
      phase,
      freshContext: true,
      call: call.used,
      finalFingerprint: current.fingerprint,
      changedFiles: diff.changes.map((entry) => entry.path),
    });
    const terminationEvidence = {
      schema: "outsider/outcome-termination-evidence/v1",
      workerFinalReport: finalReportApprovalEvidence(input ?? {}),
      delegatedTaskEvidence: {
        authority: "controller-task-graph-plus-transcript-bound-subagent-report",
        tasks: this.coordinationSnapshot().tasks.filter((task) =>
          task.kind === "delegated" || task.completionReport != null),
        workerAssertionsAcceptedAsOutcomeEvidence: false,
      },
      authorityBoundary: {
        workerReportMayProveOutcomeFacts: false,
        permittedUse: "contract-required termination/report shape only",
      },
    };
    let verified = this.verifier({
      cmd: this.store.supervisorCommand,
      contract: this.store.contract,
      baseline: this.baseline,
      current,
      diff,
      acceptance: acceptanceResult,
      baselineAcceptance,
      phase,
      executionSteps,
      controllerProcessEvidence,
      terminationEvidence,
    });
    if (!verified?.ok && verified?.failure?.retryable === true) {
      this.event("outcome_verifier_retrying", {
        interventionId,
        phase,
        failedCall: call.used,
        ...supervisorFailureFields(verified),
      });
      const retry = this.consumeSupervisorCall("outcome-verification-retry", interventionId);
      if (retry.ok) {
        call = retry;
        this.event("outcome_verifier_requested", {
          interventionId,
          phase,
          freshContext: true,
          call: retry.used,
          retryAttempt: 2,
          finalFingerprint: current.fingerprint,
          changedFiles: diff.changes.map((entry) => entry.path),
        });
        verified = this.verifier({
          cmd: this.store.supervisorCommand,
          contract: this.store.contract,
          baseline: this.baseline,
          current,
          diff,
          acceptance: acceptanceResult,
          baselineAcceptance,
          phase,
          executionSteps,
          controllerProcessEvidence,
          terminationEvidence,
          validationFeedback: verified?.failure?.retryInstruction ?? verified?.error ?? null,
        });
      }
    }
    const outcomeEvidenceFile = verified?.packet ? `outcome-evidence-${phase}-${call.used}.json` : null;
    const outcomeEvidenceHash = verified?.packet ? hash(JSON.stringify(verified.packet)) : null;
    if (verified?.packet) this.store.writeJson(outcomeEvidenceFile, verified.packet);
    if (!verified?.ok) {
      const error = String(verified?.error ?? "unknown").slice(0, 4000);
      this.event("outcome_verifier_failed", {
        interventionId,
        phase,
        finalFingerprint: current.fingerprint,
        evidenceFile: outcomeEvidenceFile,
        evidenceHash: outcomeEvidenceHash,
        ...supervisorFailureFields(verified),
      });
      return {
        status: "failed",
        current,
        diff,
        semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [], error,
          failure: verified?.failure ?? null },
      };
    }
    const verdict = verified.verdict;
    this.event("outcome_verifier_proposal", {
      interventionId,
      phase,
      finalFingerprint: current.fingerprint,
      proposedPassed: verdict.passed,
      gaps: verdict.gaps.slice(0, 12),
      insufficient: verdict.insufficient ?? null,
      evidenceFile: outcomeEvidenceFile,
      evidenceHash: outcomeEvidenceHash,
    });
    let approvalAudit = null;
    let approvalAuditEvent = null;
    if (verdict.passed === true && !verdict.insufficient) {
      const approvalEvidence = {
        schema: "outsider/outcome-approval-evidence/v1",
        formalCorrection: formalCorrectionApprovalEvidence(this.store,
          this.recoveryRecord(interventionId), interventionId),
        workerFinalReport: terminationEvidence.workerFinalReport,
        authorityBoundary: {
          workerReportMayProveOutcomeFacts: false,
          controllerCorrectionMayProveWorkerResult: false,
          finalReportUse: "contract-required output shape only",
        },
      };
      let auditCall = this.consumeSupervisorCall("outcome-approval-audit", interventionId);
      if (!auditCall.ok) {
        return {
          status: "failed", current, diff,
          semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [],
            error: "global supervisor call budget exhausted before PASS audit" },
        };
      }
      this.event("outcome_approval_auditor_requested", {
        interventionId, phase, freshContext: true, call: auditCall.used,
        finalFingerprint: current.fingerprint,
      });
      if (interventionId) {
        const recovery = this.recoveryRecord(interventionId);
        if (recovery?.phase === "effect-observed" && recovery.authority?.hash) {
          const approvalInput = {
            schema: "outsider/recoverable-outcome-approval-input/v1",
            interventionId,
            authorityHash: recovery.authority.hash,
            phase,
            finalFingerprint: current.fingerprint,
            current,
            diff,
            outcomePacket: verified.packet ?? {
              contract: this.store.contract, current, diff, acceptance: acceptanceResult,
            },
            proposedVerdict: verdict,
            approvalEvidence,
            outcomeEvidenceFile,
            outcomeEvidenceHash,
          };
          const approvalInputFile = `recovery-outcome-approval-${interventionId}-${call.used}.json`;
          const approvalInputArtifact = this.writeRecoveryArtifact(approvalInputFile,
            approvalInput);
          this.beginRecoveryJudge({
            interventionId,
            kind: "outcome-approval-audit",
            inputFile: approvalInputFile,
            inputHash: approvalInputArtifact.hash,
            authorityHash: recovery.authority.hash,
          });
        }
      }
      approvalAudit = this.outcomeAuditor({
        cmd: this.store.supervisorCommand,
        outcomePacket: verified.packet ?? {
          contract: this.store.contract, current, diff, acceptance: acceptanceResult,
        },
        proposedVerdict: verdict,
        approvalEvidence,
      });
      if (!approvalAudit?.ok && approvalAudit?.failure?.retryable === true) {
        this.event("outcome_approval_auditor_retrying", {
          interventionId, phase, failedCall: auditCall.used,
          ...supervisorFailureFields(approvalAudit),
        });
        const retry = this.consumeSupervisorCall("outcome-approval-audit-retry", interventionId);
        if (retry.ok) {
          auditCall = retry;
          this.event("outcome_approval_auditor_requested", {
            interventionId, phase, freshContext: true, call: retry.used, retryAttempt: 2,
            finalFingerprint: current.fingerprint,
          });
          approvalAudit = this.outcomeAuditor({
            cmd: this.store.supervisorCommand,
            outcomePacket: verified.packet ?? {
              contract: this.store.contract, current, diff, acceptance: acceptanceResult,
            },
            proposedVerdict: verdict,
            approvalEvidence,
            validationFeedback: approvalAudit?.failure?.retryInstruction
              ?? approvalAudit?.error ?? null,
          });
        }
      }
      if (!approvalAudit?.ok) {
        this.event("outcome_approval_auditor_failed", {
          interventionId, phase, finalFingerprint: current.fingerprint,
          ...supervisorFailureFields(approvalAudit),
        });
        return {
          status: "failed", current, diff,
          semanticOutcome: { checked: false, passed: false, gaps: [], evidence: [],
            error: String(approvalAudit?.error ?? "PASS factual audit failed").slice(0, 4000),
            failure: approvalAudit?.failure ?? null },
        };
      }
      if (interventionId && this.recoveryRecord(interventionId)?.phase === "judge-running") {
        this.completeRecoveryJudge({ interventionId,
          result: { ok: true, verdict: approvalAudit.verdict },
          passed: approvalAudit.verdict.passed === true
            && !approvalAudit.verdict.insufficient });
      }
      const approvalFile = `outcome-approval-audit-${phase}-${auditCall.used}.json`;
      if (approvalAudit.packet) this.store.writeJson(approvalFile, approvalAudit.packet);
      approvalAuditEvent = this.event("outcome_approval_audit", {
        interventionId,
        phase,
        finalFingerprint: current.fingerprint,
        passed: approvalAudit.verdict.passed,
        ...semanticAuditEventFields(approvalAudit.verdict),
        errors: approvalAudit.verdict.errors.slice(0, 12),
        verifiedFacts: approvalAudit.verdict.verifiedFacts.slice(0, 12),
        insufficient: approvalAudit.verdict.insufficient ?? null,
        evidenceFile: approvalAudit.packet ? approvalFile : null,
        evidenceHash: approvalAudit.packet ? hash(JSON.stringify(approvalAudit.packet)) : null,
      });
    }
    const approvalPassed = verdict.passed !== true || Boolean(approvalAudit?.verdict?.passed
      && !approvalAudit.verdict.insufficient);
    const effectivePassed = verdict.passed === true && !verdict.insufficient && approvalPassed;
    const auditErrors = verdict.passed === true && !approvalPassed
      ? (approvalAudit?.verdict?.errors?.length
        ? approvalAudit.verdict.errors : [approvalAudit?.verdict?.insufficient ?? "PASS audit rejected"])
      : [];
    this.event("outcome_verdict", {
      interventionId,
      phase,
      finalFingerprint: current.fingerprint,
      passed: effectivePassed,
      verifierProposedPassed: verdict.passed,
      approvalAuditPassed: verdict.passed === true ? approvalPassed : null,
      approvalAuditSeq: approvalAuditEvent?.seq ?? null,
      gaps: [...verdict.gaps, ...auditErrors].slice(0, 12),
      evidence: verdict.evidence.slice(0, 12),
      insufficient: verdict.insufficient ?? approvalAudit?.verdict?.insufficient ?? null,
      evidenceFile: outcomeEvidenceFile,
      evidenceHash: outcomeEvidenceHash,
    });
    return {
      status: effectivePassed ? "passed" : "rejected",
      current,
      diff,
      verdict,
      semanticOutcome: {
        checked: true,
        passed: effectivePassed,
        gaps: [...verdict.gaps, ...auditErrors],
        evidence: verdict.evidence,
        insufficient: verdict.insufficient ?? approvalAudit?.verdict?.insufficient ?? null,
      },
    };
  }

  frozenActorContext(actor, { kind = "teammate" } = {}) {
    const semantic = this.store.contract.semantic ?? {};
    const role = kind === "subagent" ? "被委派的子 agent" : "Agent Team teammate";
    const promptBinding = actor.task ? delegatedPromptBinding(actor.task) : null;
    const delegatedContext = !actor.task ? [] : promptBinding.visibility === "plaintext"
      ? [`你的委派任务：${String(promptBinding.readableText ?? actor.task.description
        ?? actor.task.subject ?? "").slice(0, 3000)}`]
      : [`你的委派任务标签：${String(actor.task.description ?? actor.task.subject
        ?? "").slice(0, 500)}`,
      `委派 message 由 Codex 宿主加密后投影给 hook；Outsider 已绑定 payload hash ${promptBinding.payloadHash}，`
        + "但不会把密文冒充可读任务正文。原生委派消息与下方冻结操作方合同共同约束你。"];
    return [
      `【Outsider · 冻结工作合同】你是 ${role}。局部任务不能覆盖操作方的全局要求。`,
      `操作方原话：${String(this.store.contract.ask).slice(0, 3000)}`,
      ...delegatedContext,
      ...(semantic.successCriteria?.length ? ["全局成功标准：",
        ...semantic.successCriteria.slice(0, 8).map((item) => `- ${String(item).slice(0, 500)}`)] : []),
      ...(semantic.architecturalConstraints?.length ? ["架构约束：",
        ...semantic.architecturalConstraints.slice(0, 8).map((item) => `- ${String(item).slice(0, 500)}`)] : []),
      ...(semantic.forbiddenShortcuts?.length ? ["禁止的表面捷径：",
        ...semantic.forbiddenShortcuts.slice(0, 8).map((item) => `- ${String(item).slice(0, 500)}`)] : []),
    ].join("\n").slice(0, 9500);
  }

  injectTeammateContractContext(result, actor) {
    if (actor.identityConflict || actor.agentKind !== "teammate") return result;
    const state = this.state();
    const prior = state.agents?.[actor.agentId];
    if (!prior || prior.contractContextInjected === true) return result;
    const context = this.frozenActorContext(actor, { kind: "teammate" });
    const output = { ...(result.output ?? {}) };
    const hookSpecificOutput = { ...(output.hookSpecificOutput ?? {}),
      hookEventName: output.hookSpecificOutput?.hookEventName ?? "PreToolUse" };
    const existing = hookSpecificOutput.additionalContext;
    hookSpecificOutput.additionalContext = existing
      ? `${context}\n\n${String(existing)}`.slice(0, 12_000) : context;
    output.hookSpecificOutput = hookSpecificOutput;
    const agents = { ...(state.agents ?? {}),
      [actor.agentId]: { ...prior,
        contractContextInjected: true,
        contractContextInjectedAt: new Date().toISOString(),
        contractContextHash: hash(context) } };
    this.store.saveState({ agents });
    this.event("teammate_context_injected", {
      agentId: actor.agentId,
      taskId: actor.task?.id ?? null,
      taskLinkConfidence: actor.task?.taskLinkConfidence
        ?? prior.taskLinkConfidence ?? null,
      identitySource: actor.identitySource,
      identityProvenanceHash: actor.identityProvenanceHash,
      identityLineageHash: actor.identityLineageHash,
      contextHash: hash(context),
      bytes: Buffer.byteLength(context),
      deliveryBoundary: "PreToolUse",
      oncePerAgent: true,
    });
    return { ...result, output };
  }

  preTool({ input, agent = "claude-code", strict = false }) {
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      const reason = "Outsider 检测到 teammate 身份 lineage 冲突；为避免把一个成员的动作记到另一个成员名下，本次工具调用已暂停。";
      return {
        decision: { verdict: "deny", reason },
        output: preToolCorrection(reason, `${reason}\n冲突编号：${actor.conflictId}`),
      };
    }
    const recovered = this.resumeRecoverableCorrection(input, actor.agentId);
    if (recovered?.status === "correction") {
      const reason = recovered.recovered
        ? "Outsider controller 恢复后续送同一份已审计纠正；没有生成新的干预"
        : "Outsider 已恢复未完成的审计纠正";
      return { decision: { verdict: "deny", reason, corrective: recovered.correction,
        interventionId: recovered.interventionId },
      output: preToolCorrection(reason, recovered.correction) };
    }
    if (recovered?.status === "hold") {
      const reason = `Outsider 正在恢复同一干预 ${recovered.interventionId}：${recovered.reason}`;
      return { decision: { verdict: "deny", reason },
        output: preToolCorrection(reason, reason) };
    }
    const result = this.preToolForActor({ input, agent, strict, actor });
    if (result?.decision?.verdict === "allow") {
      this.recordFileEffectIntent(input, actor);
      this.recordTaskCompletionIntent(input, actor);
    }
    return this.injectTeammateContractContext(result, actor);
  }

  preToolForActor({ input, agent = "claude-code", strict = false, actor }) {
    const toolName = input?.tool_name ?? input?.toolName ?? "";
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};
    if (actor.agentKind === "teammate" && actor.task?.kind === "team"
      && actor.task.status === "completed"
      && !["SendMessage", "TaskList", "TaskGet"].includes(String(toolName))) {
      const reason = `团队任务 ${actor.task.id} 已通过独立完成门。若确需返工，必须由 lead/main 先通过成功的 TaskUpdate 将该任务显式重开；已完成成员不能因排队消息自行继续修改。`;
      this.event("completed_teammate_action_blocked", {
        agentId: actor.agentId,
        taskId: actor.task.id,
        tool: toolName || null,
        toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
        resolution: "lead-must-explicitly-reopen-task",
      });
      return { decision: { verdict: "deny", reason, corrective: reason },
        output: preToolCorrection(reason, reason) };
    }
    /* The marker is host-delivered before the worker proposes its first
       corrective tool. Observe it before authority gates; otherwise that
       first post-correction write could escape actor/ordering enforcement. */
    const observedOpen = this.observeIntervention({ input, actor });
    const correctionAuthority = this.enforceCorrectionActorAuthority(input, actor);
    if (correctionAuthority.applies && !correctionAuthority.ok) {
      return { decision: { verdict: "deny", reason: correctionAuthority.reason,
        corrective: correctionAuthority.reason },
      output: preToolCorrection(correctionAuthority.reason, correctionAuthority.reason) };
    }
    const sliceOwnership = this.enforceTeamSliceOwnership(input, actor);
    if (sliceOwnership.applies && !sliceOwnership.ok) {
      return { decision: { verdict: "deny", reason: sliceOwnership.reason,
        corrective: sliceOwnership.reason },
      output: preToolCorrection(sliceOwnership.reason, sliceOwnership.reason) };
    }
    const leadOrdering = this.enforceLeadIntegrationOrdering(input, actor);
    if (leadOrdering.applies && !leadOrdering.ok) {
      return { decision: { verdict: "deny", reason: leadOrdering.reason,
        corrective: leadOrdering.reason },
      output: preToolCorrection(leadOrdering.reason, leadOrdering.reason) };
    }
    const delegationGate = this.enforceTeamDelegationBinding(input, actor.agentId);
    if (delegationGate.applies && !delegationGate.ok) {
      const reason = "Outsider 要求在 teammate 出生前，把其直接 Agent prompt 绑定到唯一、已冻结的共享任务；本次未启动 Agent。";
      return {
        decision: {
          verdict: "deny",
          reason,
          corrective: delegationGate.corrective,
          delegationBindingHash: delegationGate.envelope?.delegationBindingHash ?? null,
        },
        output: preToolCorrection(reason, delegationGate.corrective),
      };
    }
    /* Count before every possible return. The first implementation counted at
       the bottom of this method, so safety/interaction/pending paths vanished
       from the patrol clock and real sessions recorded only half their calls. */
    const patrol = this.noteMeaningfulBoundary(actor.agentId, toolName);
    const completionIntentBoundary = /^TaskUpdate$/i.test(String(toolName))
      && String(toolInput.status ?? "") === "completed";
    /* TaskUpdate(completed) immediately enters the synchronous, actor-bound
       TaskCompleted gate. Letting a periodic patrol buy a semantic opinion on
       the PreTool boundary races that dedicated gate, changes the correction
       delivery channel, and duplicates judgment of the same tree. Preserve
       the patrol clock but defer its authority to the completion gate. */
    if (completionIntentBoundary && patrol?.due) {
      this.event("semantic_patrol_deferred_to_task_completion", {
        agentId: actor.agentId,
        toolBoundaries: patrol.count,
        taskId: String(toolInput.taskId ?? toolInput.task_id ?? "") || null,
        toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
      });
    }
    const patrolled = completionIntentBoundary ? null : this.semanticPatrolAtBoundary({
      input, agent, actor, toolName, toolInput, patrol, open: observedOpen,
    });
    if (patrolled?.status === "correction") {
      const reason = observedOpen
        ? "主动周期性语义巡检发现现有纠正不足，已用新的独立计划替换"
        : "主动周期性语义巡检发现轨迹偏离冻结合同";
      return {
        decision: { verdict: "deny", reason, corrective: patrolled.correction,
          interventionId: patrolled.interventionId },
        output: preToolCorrection(reason, patrolled.correction),
      };
    }
    const openIntervention = this.openInterventionFor(actor.agentId);
    const reviewed = this.reviewIntervention({ input, agent, actor, open: openIntervention });
    if (reviewed?.status === "correction") {
      const reason = `独立监工复验后确认上一份纠正仍未把轨迹带回正轨（${openIntervention.trigger}）`;
      return {
        decision: { verdict: "deny", reason, corrective: reviewed.correction,
          interventionId: reviewed.interventionId },
        output: preToolCorrection(reason, reviewed.correction),
      };
    }
    if (/^(?:AskUserQuestion|ExitPlanMode)$/i.test(toolName)) {
      this.event("unattended_interaction_intercepted", {
        agentId: actor.agentId,
        tool: toolName,
        reason: "host cannot complete this tool without human interaction in print mode",
      });
      const supervised = this.supervise({
        input,
        agent,
        boundary: "PreToolUse",
        trigger: `unattended-interaction:${toolName}`,
        proposedTool: { name: toolName, input: toolInput },
        actor,
      });
      if (supervised.status === "correction") {
        const reason = `无人值守运行不能等待 ${toolName}；独立监工已依据冻结合同给出继续方案`;
        return {
          decision: { verdict: "deny", reason, corrective: supervised.correction,
            interventionId: supervised.interventionId },
          output: preToolCorrection(reason, supervised.correction),
        };
      }
      const reason = `无人值守运行不能执行 ${toolName}，且独立监工没有得到足够证据替操作方作答。`
        + "只使用冻结合同中已经明确的信息继续；如果合同确实缺少必要决定，停止并让本次运行明确失败，不要猜。";
      this.event("unattended_interaction_unresolved", {
        agentId: actor.agentId,
        tool: toolName,
        supervisorStatus: supervised.status,
      });
      return {
        decision: { verdict: "deny", reason, corrective: reason },
        output: preToolCorrection(reason, reason),
      };
    }
    const taskUpdate = this.taskUpdatePreview(input, actor);
    if (taskUpdate.applies && !taskUpdate.ok) {
      const reason = `Outsider 拒绝破坏全局任务图：${taskUpdate.reason}`;
      this.event("task_graph_update_rejected", {
        agentId: actor.agentId,
        taskId: taskIdFrom(input),
        reason: taskUpdate.reason,
      });
      return {
        decision: { verdict: "deny", reason, corrective: reason },
        output: preToolCorrection(reason, reason),
      };
    }
    const transcriptPath = input?.transcript_path ?? input?.transcriptPath ?? null;
    const decision = this.decide({
      toolName, toolInput, transcriptPath, cwd: this.store.cwd,
      agent,
      controlled: false,
      control: false,
      faultCards: false,
      archBench: false,
      rewrite: false,
      judgeCmd: null,
    });
    const boundaryEvent = this.event("boundary_reached", {
      boundary: "PreToolUse",
      tool: toolName,
      toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
      verdict: decision.verdict,
      agentId: actor.agentId,
      action: String(decision.proposed?.action ?? "").slice(0, 240),
      file: decision.proposed?.file ?? null,
      isEdit: Boolean(decision.proposed?.isEdit),
      isTest: Boolean(decision.proposed?.isTest),
    });
    if (decision.verdict !== "allow" && decision.proposed?.irreversible) {
      const controlledSafety = {
        ...decision,
        verdict: "deny",
        reason: `无人值守运行不能替操作方批准不可逆动作。${decision.reason ?? ""}`,
      };
      this.event("safety_gate_emitted", { reason: String(controlledSafety.reason).slice(0, 400) });
      return { decision: controlledSafety, output: hookOutputFor(agent, controlledSafety, { strict }) };
    }
    const trigger = decisionTrigger(decision);
    const completionClaimTrigger = /^detector:(?:claims-done-but-no-change|claims-pass-but-test-failed|said-vs-did)\b/
      .test(String(trigger ?? ""));
    /* A PreToolUse boundary proves the worker is still acting. Completion
       sensors remain useful at Stop, but granting them control here turns a
       finished Team slice followed by legitimate checkpoint/evidence work
       into a false whole-run completion accusation. That exact mistake made
       the endurance worker create replacement shared tasks merely to prove it
       had not stopped. Keep telemetry; reserve completion authority for Stop,
       where frozen mechanical and semantic acceptance always run. */
    if (trigger && completionClaimTrigger) {
      this.event("mechanical_signal_withheld", {
        agentId: actor.agentId,
        trigger,
        sensorVerdict: decision.verdict,
        sensorReason: String(decision.reason ?? "").slice(0, 500),
        semanticStatus: "not-requested",
        semanticInterventionId: null,
        resolution: "pretool-boundary-is-not-completion-boundary",
        messageDelivered: false,
      });
      this.recordDelegation(input, actor.agentId);
      return { decision: { verdict: "allow",
        reason: "completion claims are adjudicated only at the Stop gate" },
      output: explicitAllow() };
    }
    const tokenWasteTrigger = /^detector:(?:repeated-action|redundant-reread|no-progress-test-loop)\b/
      .test(String(trigger ?? ""));
    const proposedLoopReset = tokenWasteTrigger && decision.proposed?.isEdit === true;
    const actorSeparable = Object.keys(this.state().teamIdentityBindings ?? {}).length === 0;
    const dispatchedShiftAction = tokenWasteTrigger ? controllerDispatchedShiftAction(
      this.store.events(), { toolName, toolInput, cwd: this.store.cwd,
        preregistration: this.store.readJson("endurance-preregistration.json") }) : null;
    /* Token-waste evidence reconstructed from Claude's shared Team transcript
       is a pooled trace: it cannot tell which teammate issued each repeated
       read/test.  It may remain telemetry, but it must not acquire control over
       a particular actor.  Also, an Edit/Write proposed at this very boundary
       is the reset condition used by the detector itself; judging only the
       historical prefix would block the action that ends the loop. */
    if (tokenWasteTrigger && (dispatchedShiftAction || proposedLoopReset || !actorSeparable)) {
      this.event("mechanical_signal_withheld", {
        agentId: actor.agentId,
        trigger,
        sensorVerdict: decision.verdict,
        sensorReason: String(decision.reason ?? "").slice(0, 500),
        semanticStatus: "not-requested",
        semanticInterventionId: null,
        resolution: dispatchedShiftAction
          ? "controller-dispatched-bounded-shift"
          : proposedLoopReset
            ? "proposed-edit-resets-token-waste-loop"
            : "multi-agent-trajectory-not-actor-separable",
        shiftKind: dispatchedShiftAction?.kind ?? null,
        shiftDispatchSeq: dispatchedShiftAction?.dispatch?.seq ?? null,
        shiftActionKind: dispatchedShiftAction?.actionKind ?? null,
        messageDelivered: false,
      });
      this.recordDelegation(input, actor.agentId);
      return { decision: { verdict: "allow",
        reason: dispatchedShiftAction
          ? "the repeated action was explicitly dispatched as one bounded evaluator shift"
          : proposedLoopReset
            ? "the proposed edit is the detector's loop-reset action"
            : "pooled multi-agent token-waste evidence cannot control one actor" },
      output: explicitAllow() };
    }
    if (trigger && openIntervention) {
      this.event("intervention_pending", {
        interventionId: openIntervention.id,
        trigger,
        effectObserved: Boolean(openIntervention.effectObserved),
      });
      /* Do not overwrite a plan before the worker has had room to execute it. */
      this.recordDelegation(input, actor.agentId);
      return { decision: { verdict: "allow", reason: "existing intervention pending" }, output: explicitAllow() };
    }
    /* A semantic patrol on THIS SAME boundary has already judged the complete
       trajectory plus the proposed tool.  Re-running a lower-confidence sensor
       diagnosis wastes a second model call; worse, the old implementation then
       leaked the mechanical warning even when that semantic verdict was
       onTrack=true.  Sensors may request an investigation.  They do not retain
       speaking rights after the independent judge clears the action. */
    if (trigger && patrolled?.status === "on-track") {
      this.event("mechanical_signal_withheld", {
        agentId: actor.agentId,
        trigger,
        sensorVerdict: decision.verdict,
        sensorReason: String(decision.reason ?? "").slice(0, 500),
        semanticStatus: "on-track",
        semanticInterventionId: patrolled.interventionId ?? null,
        resolution: "same-boundary-semantic-clearance",
        messageDelivered: false,
      });
      this.recordDelegation(input, actor.agentId);
      return { decision: { verdict: "allow", reason: "independent semantic patrol cleared the mechanical signal" },
        output: explicitAllow() };
    }
    if (trigger) {
      const acceptanceResult = this.acceptance({
        cwd: this.store.cwd,
        command: this.store.contract.acceptance,
      });
      this.event("diagnostic_acceptance", {
        ran: acceptanceResult.ran,
        passed: acceptanceResult.passed,
        exit: acceptanceResult.exit,
        trigger,
        outputTail: String(acceptanceResult.output ?? "").slice(-2000),
        outputHash: hash(String(acceptanceResult.output ?? "")),
      });
      const supervised = this.supervise({
        input, agent, boundary: "PreToolUse", trigger, acceptanceResult, actor,
      });
      if (supervised.status === "correction") {
        const controlledDecision = {
          verdict: "deny",
          reason: `独立监工确认轨迹偏航（${trigger}）`,
          corrective: supervised.correction,
          proposed: decision.proposed,
          interventionId: supervised.interventionId,
        };
        return {
          decision: controlledDecision,
          output: preToolCorrection(controlledDecision.reason, controlledDecision.corrective),
        };
      }
      /* In controlled mode a detector's text is evidence for the independent
         supervisor, never an instruction to the worker.  on-track explicitly
         overrules it; insufficient/failed/exhausted leaves it unconfirmed.  In
         both cases the reversible tool continues silently and Stop remains the
         final fail-closed gate.  Irreversible actions were already denied by the
         safety branch above and never reach here. */
      this.event("mechanical_signal_withheld", {
        agentId: actor.agentId,
        trigger,
        sensorVerdict: decision.verdict,
        sensorReason: String(decision.reason ?? "").slice(0, 500),
        semanticStatus: supervised.status,
        semanticInterventionId: supervised.interventionId ?? null,
        resolution: supervised.status === "on-track" ? "semantic-clearance" : "unconfirmed",
        messageDelivered: false,
      });
      this.recordDelegation(input, actor.agentId);
      return { decision: { verdict: "allow", reason: "mechanical signal was not confirmed as drift" },
        output: explicitAllow() };
    }
    if (decision.verdict === "ask") {
      const unattended = {
        ...decision,
        verdict: "deny",
        reason: `无人值守运行不能等待权限确认。${decision.reason ?? ""}`,
      };
      return { decision: unattended, output: hookOutputFor(agent, unattended, { strict }) };
    }
    this.recordDelegation(input, actor.agentId);
    if (decision.verdict === "allow") return { decision, output: explicitAllow() };
    return { decision, output: hookOutputFor(agent, decision, { strict }) };
  }

  subagentStart({ input }) {
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      const reason = "Outsider 检测到 agent 身份 lineage 冲突，不能安全注入委派合同。";
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    if (!actor.task) {
      this.event("task_tree_gap", {
        agentId: actor.agentId,
        reason: "SubagentStart could not be uniquely attributed to a delegated Agent task",
      });
    }
    const teammate = actor.agentKind === "teammate";
    const context = this.frozenActorContext(actor, { kind: teammate ? "teammate" : "subagent" });
    const contextEvent = this.event(teammate ? "teammate_context_injected" : "subagent_context_injected", {
      agentId: actor.agentId,
      taskId: actor.task?.id ?? null,
      taskLinkConfidence: actor.task?.taskLinkConfidence ?? null,
      ...(teammate ? {
        identitySource: actor.identitySource,
        identityProvenanceHash: actor.identityProvenanceHash,
        identityLineageHash: actor.identityLineageHash,
        contextHash: hash(context),
        deliveryBoundary: "SubagentStart",
        oncePerAgent: true,
      } : {}),
      bytes: Buffer.byteLength(context),
    });
    const state = this.state();
    const statePatch = {};
    if (teammate) {
      statePatch.agents = { ...(state.agents ?? {}),
        [actor.agentId]: { ...state.agents?.[actor.agentId],
          contractContextInjected: true,
          contractContextInjectedAt: new Date().toISOString(),
          contractContextHash: hash(context) } };
    }
    const explicitRawAgentId = input.agent_id ?? input.agentId
      ?? input.subagent_id ?? input.subagentId ?? null;
    if (explicitRawAgentId != null) {
      const rawAgentId = String(explicitRawAgentId);
      const agentIdHash = hash(`host-agent\0${rawAgentId}`);
      const starts = { ...(state.teamSubagentStarts ?? {}) };
      if (!starts[agentIdHash]) {
        const registrationEvent = [...this.store.events()].reverse().find((event) =>
          event.type === "agent_registered" && event.agentId === actor.agentId);
        starts[agentIdHash] = {
          agentIdHash,
          rawAgentId,
          lineageHash: agentTeamHostLineageHash(input),
          spawnDelegationId: actor.task?.kind === "team" ? null : actor.task?.id ?? null,
          spawnDelegationIdHash: actor.task?.kind === "team" || !actor.task?.id
            ? null : hash(`task\0${actor.task.id}`),
          registrationSeq: registrationEvent?.seq ?? null,
          registrationEventHash: registrationEvent?.eventHash ?? null,
          contextSeq: contextEvent.seq,
          contextEventHash: contextEvent.eventHash ?? null,
        };
        statePatch.teamSubagentStarts = starts;
      }
    }
    if (Object.keys(statePatch).length) this.store.saveState(statePatch);
    if (explicitRawAgentId != null) {
      this.reconcileTeamSpawnIdentity();
    }
    return {
      decision: { verdict: "allow", reason: "frozen contract injected at SubagentStart" },
      output: { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: context } },
    };
  }

  postTool({ input }) {
    const teamCapability = agentTeamReceiptCapability(input);
    if (teamCapability) this.event("team_spawn_capability_observed", teamCapability);
    this.bindTeamSpawnIdentity(input);
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      this.event("post_tool_identity_unattributed", {
        conflictId: actor.conflictId,
        tool: input?.tool_name ?? input?.toolName ?? null,
        toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
        actionAttributed: false,
        effectCredited: false,
      });
      return { decision: { verdict: "deny",
        reason: "post-tool evidence was not attributed because teammate identity conflicted" }, output: {} };
    }
    const toolName = input?.tool_name ?? input?.toolName ?? "";
    const toolInput = input?.tool_input ?? input?.toolInput ?? {};
    const completed = classifyToolCall(toolName, toolInput);
    const response = input?.tool_response ?? input?.toolResponse ?? input?.result ?? {};
    const exit = response?.exit_code ?? response?.exitCode ?? response?.code
      ?? (response?.is_error === true || response?.isError === true ? 1 : null);
    const hostSucceeded = response?.is_error !== true && response?.isError !== true
      && response?.success !== false
      && (!Number.isFinite(Number(exit)) || Number(exit) === 0);
    const taskUpdate = this.taskUpdatePreview(input, actor);
    /* The release probe freezes its policy through controllerOptions before the
       worker starts.  Reading only the endurance preregistration here made the
       policy effective at PreToolUse but disappear at PostToolUse, so exact
       teammate/integration checks were executed yet could not be certified. */
    const teamPolicy = this.agentTeamPolicy();
    const teammateName = String(actor.agentId ?? "").startsWith("teammate:")
      ? String(actor.agentId).slice("teammate:".length) : null;
    const expectedCheck = teammateName
      ? teamPolicy.expectedChecksByTeammate?.[teammateName] ?? null
      : ["main", "lead"].includes(String(actor.agentId ?? ""))
        ? teamPolicy.expectedIntegrationCheck ?? null : null;
    const preregisteredPrefix = teammateName ? []
      : Object.values(teamPolicy.expectedChecksByTeammate ?? {});
    const expectedCheckMatchResult = expectedCheckMatch(completed.action, expectedCheck,
      this.store.cwd, preregisteredPrefix);
    const boundaryEvent = this.event("boundary_reached", {
      boundary: "PostToolUse",
      agentId: actor.agentId,
      tool: toolName || null,
      toolUseId: input?.tool_use_id ?? input?.toolUseId ?? null,
      action: String(completed.action ?? "").slice(0, 240),
      file: completed.file ?? null,
      isEdit: Boolean(completed.isEdit),
      isTest: Boolean(completed.isTest),
      exit: Number.isFinite(Number(exit)) ? Number(exit) : null,
      expectedCheckMatch: expectedCheckMatchResult?.kind ?? null,
      expectedCheckHash: expectedCheckMatchResult
        ? expectedCheckBindingHash(actor.agentId, expectedCheckMatchResult.commands) : null,
      taskGraphChanged: Boolean(taskUpdate.applies && taskUpdate.ok && hostSucceeded),
      confirmedFile: null,
    });
    if (taskUpdate.applies && taskUpdate.ok && hostSucceeded) {
      this.commitTaskUpdate(input, { preview: taskUpdate, actor, postBoundary: boundaryEvent });
    } else if (taskUpdate.applies && !hostSucceeded) {
      const toolUseId = String(input?.tool_use_id ?? input?.toolUseId ?? "").trim() || null;
      const preBoundary = toolUseId ? [...this.store.events()].reverse().find((event) =>
        event.type === "boundary_reached" && event.boundary === "PreToolUse"
        && event.toolUseId === toolUseId && event.agentId === actor.agentId) : null;
      this.event("task_update_unconfirmed", {
        taskId: taskUpdate.id ?? taskIdFrom(input),
        agentId: actor.agentId,
        toolUseId,
        hostSucceeded: false,
        preBoundarySeq: preBoundary?.seq ?? null,
        preBoundaryEventHash: preBoundary?.eventHash ?? null,
        postBoundarySeq: boundaryEvent.seq,
        postBoundaryEventHash: boundaryEvent.eventHash ?? null,
        reason: "host-reported-failure",
      });
    }
    this.confirmFileTouch(input, actor, response, boundaryEvent);
    this.finalizeTaskCompletionFromPost(input, actor, response, boundaryEvent);
    this.observeInterventionAction({ input, actor, completed,
      exit: Number.isFinite(Number(exit)) ? Number(exit) : null, boundaryEvent });
    return { decision: { verdict: "allow", reason: "post-tool evidence recorded" }, output: {} };
  }

  taskCreated({ input }) {
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      const reason = "Outsider 检测到 TaskCreated 的 teammate 身份与既有 lineage 冲突；未改写任务图。";
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    const id = taskIdFrom(input);
    if (!id) {
      this.event("task_tree_gap", { reason: "TaskCreated did not include task_id" });
      return { decision: { verdict: "allow", reason: "task id unavailable" }, output: {} };
    }
    const state = this.state();
    const tasks = { ...(state.tasks ?? {}) };
    const prior = tasks[id] ?? {};
    const snapshotFile = prior.snapshotFile
      ?? `task-${id.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80)}.json`;
    if (!prior.snapshotFile) this.store.writeJson(snapshotFile, this.snapshot(this.store.cwd));
    const proposed = {
      ...prior,
      id,
      kind: "team",
      subject: String(input.task_subject ?? input.taskSubject ?? prior.subject ?? ""),
      description: String(input.task_description ?? input.taskDescription ?? prior.description ?? ""),
      prompt: String(input.task_description ?? input.taskDescription
        ?? input.task_subject ?? input.taskSubject ?? prior.prompt ?? ""),
      createdByAgentId: actor.agentId,
      teamName: input.team_name ?? input.teamName ?? prior.teamName ?? null,
      status: prior.status ?? "pending",
      taskGeneration: Math.max(1, Number(prior.taskGeneration ?? 1)),
      blockedBy: prior.blockedBy ?? [],
      touchedFiles: prior.touchedFiles ?? [],
      snapshotFile,
      createdAt: prior.createdAt ?? new Date().toISOString(),
    };
    const taskDefinitionHash = hash(canonicalizeStrict(teamTaskDefinition({
      task: proposed, contractSeal: this.store.contract.seal,
    })));
    if (prior.taskDefinitionHash && prior.taskDefinitionHash !== taskDefinitionHash) {
      this.event("team_task_definition_conflict", {
        taskIdHash: hash(`task\0${id}`),
        priorTaskDefinitionHash: prior.taskDefinitionHash,
        proposedTaskDefinitionHash: taskDefinitionHash,
        resolution: "deny-no-overwrite",
        modelCallUsed: false,
      });
      const reason = `共享任务 ${id} 的 subject/description 已冻结；拒绝静默改写。若需返工，应由 lead 显式重开同一定义的新 generation。`;
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    tasks[id] = { ...proposed, taskDefinitionHash };
    this.store.saveState({ tasks });
    this.event("team_task_created", {
      taskId: id,
      agentId: actor.agentId,
      subject: tasks[id].subject.slice(0, 500),
      teamName: tasks[id].teamName,
      taskDefinitionHash,
    });
    return { decision: { verdict: "allow", reason: "team task registered" }, output: {} };
  }

  taskCompleted({ input, agent = "claude-code" }) {
    const id = taskIdFrom(input);
    const resolved = this.actorForTaskCompletion(input, id);
    if (!resolved.actor) {
      const reason = `Outsider 无法把 TaskCompleted 绑定到唯一、已持久化的完成意图（${resolved.reason}）。`;
      this.event("task_completion_identity_unresolved", {
        taskId: id,
        reason: resolved.reason,
        candidateIntentHashes: resolved.candidateIntentHashes ?? [],
        resolution: "fail-visible-no-session-guess",
      });
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    const actorBase = resolved.actor;
    const completionIntent = resolved.intent;
    if (actorBase.identityConflict) {
      const reason = "Outsider 检测到 TaskCompleted 的 teammate 身份与既有 lineage 冲突；不能把完成归给错误成员。";
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    this.reconcileAgentTouches(actorBase.agentId);
    const state = this.state();
    const task = id ? state.tasks?.[id] : null;
    if (!id || !task) {
      const reason = `Outsider 无法把 TaskCompleted 归入冻结任务图（task=${id ?? "missing"}）。`;
      this.event("task_completion_unattributed", { taskId: id, agentId: actorBase.agentId,
        completionIntentHash: completionIntent?.intentHash ?? null });
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    if (completionIntent
      && Number(completionIntent.taskGeneration ?? 1)
        !== Math.max(1, Number(task.taskGeneration ?? 1))) {
      this.rejectTaskCompletionIntent(completionIntent, "task-completion-generation-superseded");
      const reason = `任务 ${id} 的完成意图属于旧返工代际，不能完成当前 generation ${Math.max(1, Number(task.taskGeneration ?? 1))}。`;
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    const unresolved = stringList(task.blockedBy)
      .filter((dependency) => state.tasks?.[dependency]?.status !== "completed");
    if (unresolved.length) {
      const reason = `任务 ${id} 不能完成：依赖仍未通过独立完成门（${unresolved.join(", ")}）。`;
      this.event("task_completion_blocked_by_dependency", {
        taskId: id, agentId: actorBase.agentId, unresolved,
      });
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    const actor = { ...actorBase, task };
    const leadIdentities = new Set(["main", "lead", "teammate:lead"]);
    const previewTasks = { ...(this.state().tasks ?? {}) };
    previewTasks[id] = { ...previewTasks[id], status: "completed",
      independentlyVerified: true, completedAt: new Date().toISOString() };
    const previewRemaining = Object.values(previewTasks).filter((candidate) =>
      candidate.kind === "team"
      && !["completed", "cancelled", "deleted"].includes(String(candidate.status)));
    const integrationCandidate = previewRemaining.length === 0
      && stringList(previewTasks[id].blockedBy).length > 0
      && leadIdentities.has(String(previewTasks[id].owner ?? ""))
      && leadIdentities.has(actor.agentId);
    /* The last lead-owned dependency task is itself the integration boundary.
       Buying a generic team-task semantic verdict before the controller-owned
       integration acceptance both duplicates cost and attributes an injected
       composition failure to the wrong gate. */
    let verified = (task.independentlyVerified || integrationCandidate)
      ? { status: "on-track" } : this.supervise({
      input,
      agent,
      boundary: "TaskCompleted",
      trigger: `team-task-delivery:${id}`,
      actor,
      reference: this.store.readJson(task.snapshotFile) ?? this.baseline,
    });
    if (verified.status === "correction") {
      this.rejectTaskCompletionIntent(completionIntent, "independent-task-verification-rejected");
      this.event("team_task_completion_blocked", {
        taskId: id, agentId: actor.agentId, interventionId: verified.interventionId,
      });
      return { decision: { verdict: "deny", corrective: verified.correction,
        interventionId: verified.interventionId }, output: lifecycleBlock(verified.correction) };
    }
    if (verified.status !== "on-track") {
      this.rejectTaskCompletionIntent(completionIntent,
        `independent-task-verification-${verified.status}`);
      this.event("team_task_unverified", { taskId: id, agentId: actor.agentId,
        reason: verified.status });
      if (verified.status === "exhausted") {
        /* Do not deadlock the whole team forever. The global Stop gate remains
           red because this task is deliberately not marked completed/verified. */
        return { decision: { verdict: "allow", reason: "task verification exhausted; global Stop remains accountable" },
          output: {} };
      }
      const reason = `任务 ${id} 的独立检验暂时不可用；不能把“说完成了”当作完成。请继续保留现场并重试。`;
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }

    const proposedTasks = previewTasks;
    const remaining = Object.values(proposedTasks).filter((candidate) => candidate.kind === "team"
      && !["completed", "cancelled", "deleted"].includes(String(candidate.status)));
    const openConflicts = Object.values(this.state().fileConflicts ?? {})
      .filter((conflict) => conflict.status === "open");
    let integrationVerified = false;
    let integrationProof = null;
    if (!remaining.length) {
      const integrationOwner = String(proposedTasks[id].owner ?? "");
      if (!leadIdentities.has(integrationOwner) || !leadIdentities.has(actor.agentId)) {
        this.rejectTaskCompletionIntent(completionIntent, "integration-authority-rejected");
        const reason = "多 agent 的最终集成必须由任务图中最新 owner 为 lead/main 的集成任务提交，并由 lead/main 身份触发。";
        this.event("multi_agent_integration_authority_rejected", {
          taskId: id,
          agentId: actor.agentId,
          latestOwner: integrationOwner || null,
          requiredAuthority: "lead-or-main",
        });
        return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
      }
      /* Last teammate through the gate also owns integration consistency. A
         conflict is useful evidence, not a prerequisite: independently owned
         files can still compose into a globally wrong system. The supervisor
         therefore verifies every completed team graph and additionally sees
         any confirmed same-file conflicts. */
      const priorTasks = this.state().tasks;
      /* A real TaskCompleted hook fires before the spawning TaskUpdate's
         PostToolUse.  Never persist `completed` merely to give the integration
         judge a convenient snapshot: a controller crash in that window would
         manufacture completion without host execution evidence. */
      const judgeTasks = completionIntent ? {
        ...priorTasks,
        [id]: { ...priorTasks[id], status: "awaiting-host-completion-post",
          completionCandidate: true, independentlyVerified: false },
      } : proposedTasks;
      this.store.saveState({ tasks: judgeTasks });
      /* Local teammate checks are not integration evidence.  Run the frozen,
         controller-owned acceptance at the integration TaskCompleted boundary
         and bind its exact artifact fingerprint to an independent semantic
         PASS audit before the host is allowed to commit the task.  This turns
         composition from supervisor prose into a reproducible release gate. */
      const integrationOpen = this.openInterventionFor(actor.agentId);
      const integrationInterventionId = integrationOpen?.id ?? null;
      const integrationAcceptance = this.acceptance({
        cwd: this.store.cwd,
        command: this.store.contract.acceptance,
      });
      const integrationSnapshot = this.snapshot(this.store.cwd);
      const integrationAcceptanceEvent = this.event("acceptance_finished", {
        interventionId: integrationInterventionId,
        phase: "integration",
        ran: integrationAcceptance.ran,
        passed: integrationAcceptance.passed,
        exit: integrationAcceptance.exit,
        command: integrationAcceptance.command,
        finalFingerprint: integrationSnapshot.fingerprint,
        outputTail: String(integrationAcceptance.output ?? "").slice(-3000),
        outputHash: hash(String(integrationAcceptance.output ?? "")),
        taskId: id,
        dependencyTaskIds: stringList(proposedTasks[id].blockedBy),
      });
      let integrationSemantic = null;
      if (integrationAcceptance.passed === true) {
        integrationSemantic = this.verifySemanticOutcome({
          acceptanceResult: integrationAcceptance,
          interventionId: integrationInterventionId,
          phase: "integration",
          input,
          agent,
        });
      }
      if (integrationAcceptance.passed === true && integrationSemantic?.status === "failed") {
        this.rejectTaskCompletionIntent(completionIntent,
          "integration-semantic-judge-unavailable");
        this.store.saveState({ tasks: priorTasks });
        const reason = "多 agent 集成验收已运行，但独立语义裁判暂时不可用；保持同一任务与证据，不能把局部绿灯当作全局完成。";
        this.event("multi_agent_integration_unverified", {
          taskId: id,
          reason: "semantic-judge-unavailable",
          acceptanceSeq: integrationAcceptanceEvent.seq,
          finalFingerprint: integrationSnapshot.fingerprint,
        });
        return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
      }
      let integrated = { status: "on-track" };
      if (integrationAcceptance.passed !== true
        || integrationSemantic?.status !== "passed") {
        integrated = this.supervise({
          input,
          agent,
          boundary: "TaskCompleted",
          trigger: `multi-agent-integration:${openConflicts.length
            ? openConflicts.map((item) => item.id).sort().join(",") : "conflict-free"}`,
          acceptanceResult: integrationAcceptance,
          semanticOutcome: integrationSemantic?.semanticOutcome ?? null,
          actor: { ...actor, task: proposedTasks[id] },
        });
      }
      if (integrated.status === "correction") {
        this.rejectTaskCompletionIntent(completionIntent, "integration-verification-rejected");
        proposedTasks[id] = { ...proposedTasks[id], status: "integration-blocked",
          independentlyVerified: false, completionCandidate: false,
          completedAt: null, completionEventSeq: null, completionEventHash: null };
        this.store.saveState({ tasks: proposedTasks });
        this.event("multi_agent_integration_blocked", {
          taskId: id,
          interventionId: integrated.interventionId,
          conflictIds: openConflicts.map((item) => item.id),
        });
        return { decision: { verdict: "deny", corrective: integrated.correction,
          interventionId: integrated.interventionId }, output: lifecycleBlock(integrated.correction) };
      }
      if ((integrationAcceptance.passed !== true
        || integrationSemantic?.status === "rejected")
        && integrated.status === "on-track") {
        this.rejectTaskCompletionIntent(completionIntent,
          "integration-red-clearance-contradiction");
        this.store.saveState({ tasks: priorTasks });
        const reason = "controller-owned 集成验收仍为红灯，onTrack clearance 不能覆盖可执行失败；必须给出经事实审计的纠正后再重试。";
        this.event("multi_agent_integration_clearance_rejected", {
          taskId: id,
          acceptanceSeq: integrationAcceptanceEvent.seq,
          acceptanceExit: integrationAcceptance.exit,
          finalFingerprint: integrationSnapshot.fingerprint,
          reason: "controller-owned-integration-evidence-red",
          messageDelivered: false,
        });
        return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
      }
      if (integrated.status !== "on-track") {
        this.rejectTaskCompletionIntent(completionIntent,
          `integration-verification-${integrated.status}`);
        this.store.saveState({ tasks: priorTasks });
        const reason = "多 agent 合并一致性尚未获得独立结论；不能把局部绿灯拼成全局完成。";
        this.event("multi_agent_integration_unverified", {
          taskId: id, reason: integrated.status,
        });
        return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
      }
      integrationVerified = true;
      const integrationCausalEffect = integrationOpen
        ? authorityMatchedEffect(this.store.events(), integrationOpen,
          integrationSnapshot.fingerprint) : null;
      const integrationOutcome = [...this.store.events()].reverse().find((event) =>
        event.type === "outcome_verdict"
        && event.phase === "integration"
        && event.interventionId === integrationInterventionId
        && event.finalFingerprint === integrationSnapshot.fingerprint
        && event.passed === true);
      integrationProof = {
        dependencyTaskIds: stringList(proposedTasks[id].blockedBy),
        acceptanceSeq: integrationAcceptanceEvent.seq,
        acceptanceExit: integrationAcceptance.exit,
        finalFingerprint: integrationSnapshot.fingerprint,
        outcomeVerdictSeq: integrationOutcome?.seq ?? null,
        approvalAuditSeq: integrationOutcome?.approvalAuditSeq ?? null,
        interventionId: integrationOpen
          ? (integrationCausalEffect ? integrationOpen.id : null)
          : (this.state().lastResolvedInterventionId ?? null),
        correctionAuthorityHash: integrationOpen
          ? (integrationCausalEffect?.correctionAuthorityHash ?? null)
          : (this.state().lastResolvedInterventionAuthorityHash ?? null),
        causalEffectSeq: integrationCausalEffect?.seq ?? null,
      };
      if (integrationOpen && integrationSemantic?.status === "passed") {
        if (integrationCausalEffect) {
          this.event("intervention_resolved", {
            interventionId: integrationOpen.id,
            correctionObserved: Boolean(integrationOpen.correctionObserved),
            effectObserved: true,
            causalEffectSeq: integrationCausalEffect.seq,
            matchedExpectedAction: integrationCausalEffect.matchedExpectedAction,
            correctionAuthorityHash: integrationOpen.correctionAuthorityHash ?? null,
            scope: "multi-agent-integration",
            finalFingerprint: integrationSnapshot.fingerprint,
          });
          const recovery = this.recoveryRecord(integrationOpen.id);
          if (recovery?.effect?.observed === true
            && recovery?.delivery?.status === "observed"
            && ["effect-observed", "judge-complete"].includes(recovery.phase)) {
            this.interventionRecovery.resolve({ interventionId: integrationOpen.id });
          }
          this.store.saveState({
            lastResolvedInterventionId: integrationOpen.id,
            lastResolvedInterventionAuthorityHash: integrationOpen.correctionAuthorityHash ?? null,
            lastResolvedInterventionObserved: Boolean(integrationOpen.correctionObserved),
            lastResolvedInterventionEffectObserved: true,
            lastResolvedInterventionArtifactFingerprint: integrationSnapshot.fingerprint,
          });
        } else {
          this.event("intervention_unresolved", {
            interventionId: integrationOpen.id,
            correctionObserved: Boolean(integrationOpen.correctionObserved),
            effectObserved: Boolean(integrationOpen.effectObserved),
            correctionAuthorityHash: integrationOpen.correctionAuthorityHash ?? null,
            scope: "multi-agent-integration",
            finalFingerprint: integrationSnapshot.fingerprint,
            reason: "no authority-matched effect exists on the delivered fingerprint",
          });
          this.store.saveState({
            lastUnattributedInterventionId: integrationOpen.id,
            lastUnattributedInterventionAuthorityHash:
              integrationOpen.correctionAuthorityHash ?? null,
            lastUnattributedDeliveryFingerprint: integrationSnapshot.fingerprint,
          });
        }
        this.setOpenIntervention(actor.agentId, null);
      }
      if (completionIntent) {
        /* Conflict resolution and the integration proof event are deferred to
           the matching successful TaskUpdate PostToolUse below. */
      } else {
      const fileConflicts = { ...(this.state().fileConflicts ?? {}) };
      for (const conflict of openConflicts) {
        fileConflicts[conflict.id] = { ...fileConflicts[conflict.id], status: "resolved-by-integration",
          resolvedAt: new Date().toISOString() };
      }
      this.store.saveState({ fileConflicts });
      this.event("multi_agent_integration_verified", {
        taskId: id, agentId: actor.agentId,
        conflictIds: openConflicts.map((item) => item.id),
        conflictFree: openConflicts.length === 0,
        dependencyTaskIds: integrationProof?.dependencyTaskIds ?? [],
        acceptanceSeq: integrationProof?.acceptanceSeq ?? null,
        acceptanceExit: integrationProof?.acceptanceExit ?? null,
        finalFingerprint: integrationProof?.finalFingerprint ?? null,
        outcomeVerdictSeq: integrationProof?.outcomeVerdictSeq ?? null,
        approvalAuditSeq: integrationProof?.approvalAuditSeq ?? null,
        interventionId: integrationProof?.interventionId ?? null,
        correctionAuthorityHash: integrationProof?.correctionAuthorityHash ?? null,
      });
      }
    }
    if (completionIntent) {
      const currentState = this.state();
      const pending = { ...(currentState.pendingTaskCompletionVerifications ?? {}) };
      const tasks = { ...(currentState.tasks ?? {}) };
      tasks[id] = { ...tasks[id], status: "awaiting-host-completion-post",
        independentlyVerified: false, completionCandidate: true,
        completionIntentHash: completionIntent.intentHash };
      pending[completionIntent.toolUseIdHash] = {
        completionIntentHash: completionIntent.intentHash,
        taskId: id,
        agentId: actor.agentId,
        identityBindingHash: completionIntent.identityBindingHash,
        taskGeneration: Math.max(1, Number(completionIntent.taskGeneration ?? 1)),
        integrationVerified,
        integrationConflictIds: integrationVerified
          ? openConflicts.map((item) => item.id) : [],
        integrationProof,
        verifiedAt: new Date().toISOString(),
      };
      this.store.saveState({ tasks, pendingTaskCompletionVerifications: pending });
      this.event("task_completion_verified_pending_host", {
        completionIntentHash: completionIntent.intentHash,
        completionIntentEventSeq: completionIntent.intentEventSeq,
        completionIntentEventHash: completionIntent.intentEventHash,
        toolUseId: completionIntent.toolUseId,
        toolUseIdHash: completionIntent.toolUseIdHash,
        taskId: id,
        agentId: actor.agentId,
        identityBindingHash: completionIntent.identityBindingHash,
        taskGeneration: Math.max(1, Number(completionIntent.taskGeneration ?? 1)),
        preBoundarySeq: completionIntent.preBoundarySeq,
        preBoundaryEventHash: completionIntent.preBoundaryEventHash,
        independentlyVerified: true,
        integrationVerified,
        integrationAcceptanceSeq: integrationProof?.acceptanceSeq ?? null,
        integrationFinalFingerprint: integrationProof?.finalFingerprint ?? null,
        integrationOutcomeVerdictSeq: integrationProof?.outcomeVerdictSeq ?? null,
      });
      return { decision: { verdict: "allow",
        reason: "task independently verified; awaiting matching successful TaskUpdate PostToolUse" },
      output: {} };
    }
    this.store.saveState({ tasks: proposedTasks });
    this.event("team_task_completed", {
      taskId: id,
      agentId: actor.agentId,
      independentlyVerified: true,
      taskGeneration: Math.max(1, Number(task.taskGeneration ?? 1)),
    });
    return { decision: { verdict: "allow", reason: "team task independently verified" }, output: {} };
  }

  teammateIdle({ input, agent = "claude-code" }) {
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      const reason = "Outsider 检测到 TeammateIdle 的成员身份 lineage 冲突；不能安全重派任务。";
      return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
    }
    const active = this.activeTasksForAgent(actor.agentId);
    if (!active.length) {
      this.event("teammate_idle_allowed", { agentId: actor.agentId, activeTasks: 0 });
      return { decision: { verdict: "allow", reason: "no unfinished owned task" }, output: {} };
    }
    const task = active[0];
    const inspected = this.supervise({
      input,
      agent,
      boundary: "TeammateIdle",
      trigger: `teammate-idle:${task.id}`,
      actor: { ...actor, task },
      reference: this.store.readJson(task.snapshotFile) ?? this.baseline,
    });
    if (inspected.status === "correction") {
      this.event("teammate_idle_redirected", {
        agentId: actor.agentId, taskId: task.id, interventionId: inspected.interventionId,
      });
      return { decision: { verdict: "deny", corrective: inspected.correction,
        interventionId: inspected.interventionId }, output: lifecycleBlock(inspected.correction) };
    }
    if (inspected.status === "exhausted") {
      this.event("teammate_idle_verification_exhausted", { agentId: actor.agentId, taskId: task.id });
      return { decision: { verdict: "allow", reason: "idle verification exhausted; main Stop remains accountable" }, output: {} };
    }
    const reason = inspected.status === "on-track"
      ? `你仍拥有未完成任务 ${task.id}（${task.subject ?? task.description ?? ""}）。轨迹尚未偏航；请完成并通过 TaskCompleted 门，不要空转。`
      : `你仍拥有未完成任务 ${task.id}，但独立巡检暂时无法判断。请保留证据、继续完成，不要空转。`;
    this.event("teammate_idle_blocked", { agentId: actor.agentId, taskId: task.id,
      supervisorStatus: inspected.status });
    return { decision: { verdict: "deny", reason }, output: lifecycleBlock(reason) };
  }

  stop({ input, agent = "claude-code" }) {
    const actor = this.registerActor(input);
    if (actor.identityConflict || this.state().agentIdentityIntegrityCompromised === true) {
      const reason = "Outsider 的 teammate 身份连续性曾发生冲突；在冲突被显式清理前不能生成可信的多 Agent 完成证明。";
      this.event("completion_blocked_by_agent_identity_conflict", {
        conflictId: actor.conflictId ?? this.state().lastAgentIdentityConflictHash ?? null,
      });
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    const recovered = this.resumeRecoverableCorrection(input, actor.agentId);
    if (recovered?.status === "correction") {
      const reason = recovered.recovered
        ? "Outsider controller 恢复后续送同一份已审计纠正；没有生成新的干预"
        : "Outsider 已恢复未完成的审计纠正";
      return { decision: { verdict: "warn", corrective: recovered.correction,
        interventionId: recovered.interventionId }, output: stopBlock(recovered.correction) };
    }
    if (recovered?.status === "hold") {
      const reason = `Outsider 正在恢复同一干预 ${recovered.interventionId}：${recovered.reason}`;
      return { decision: { verdict: "warn", interventionId: recovered.interventionId },
        output: stopHoldForJudge(reason) };
    }
    this.observeIntervention({ input, actor });
    this.event("boundary_reached", {
      boundary: "Stop",
      agentId: actor.agentId,
      continuation: Boolean(input?.stop_hook_active ?? input?.stopHookActive),
    });
    const coordination = this.coordinationSnapshot();
    const unfinishedTeamTasks = coordination.tasks.filter((task) => task.kind === "team"
      && !["completed", "cancelled", "deleted"].includes(String(task.status)));
    const openTeamConflicts = coordination.conflicts.filter((conflict) => conflict.status === "open");
    if (unfinishedTeamTasks.length || openTeamConflicts.length) {
      this.event("coordination_incomplete_at_stop", {
        unfinishedTaskIds: unfinishedTeamTasks.map((task) => task.id),
        openConflictIds: openTeamConflicts.map((conflict) => conflict.id),
      });
      const unfinished = unfinishedTeamTasks.map((task) => ({
        id: task.id,
        owner: task.owner ?? task.assigneeAgentId ?? null,
        status: task.status ?? "pending",
        blockedBy: stringList(task.blockedBy),
      }));
      const conflicts = openTeamConflicts.map((conflict) => ({
        id: conflict.id,
        file: conflict.file ?? null,
        taskIds: stringList(conflict.taskIds),
      }));
      /* An unfinished durable task graph is already executable, objective
         evidence. Asking a semantic model whether known-pending work is done
         adds cost and a new failure rate without adding information. Emit one
         deterministic continuation; semantic authority begins only when a
         claimed task/delivery must be judged. */
      const reason = `多 agent 工作尚未形成可交付整体：未完成任务 ${unfinished
        .map((task) => `${task.id}[owner=${task.owner ?? "unassigned"},status=${task.status}]`)
        .join(", ") || "无"}；未解决冲突 ${conflicts
        .map((conflict) => conflict.file ?? conflict.id).join(", ") || "无"}。`
        + "继续等待或催办现有 owner；每个成员必须通过自己的 TaskCompleted 门，lead 再完成集成任务。不要新建替代任务，也不要收工。";
      this.event("coordination_continuation_emitted", {
        agentId: actor.agentId,
        unfinished,
        conflicts,
        authority: "deterministic-task-graph",
        modelCallUsed: false,
        messageDelivered: true,
      });
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    if (coordination.tasks.some((task) => task.kind === "team")) {
      this.event("coordination_ready_at_stop", {
        completedTaskIds: coordination.tasks.filter((task) => task.kind === "team")
          .map((task) => task.id),
        resolvedConflictIds: coordination.conflicts.map((conflict) => conflict.id),
      });
    }
    const endurancePreregistration = this.store.readJson("endurance-preregistration.json");
    const activeEvaluatorShift = activeControllerShiftEvidence(this.store.events(), {
      cwd: this.store.cwd,
      preregistration: endurancePreregistration,
    });
    /* A controller-dispatched shift is measurement work, not a worker repair.
       If Stop arrives before its exact frozen steps are complete, do not run
       acceptance and ask a semantic model to diagnose the expected temporary
       red state.  Re-deliver only the next preregistered step.  This prevents a
       recovery marker from being "fixed" before the evidence-gathering shift
       that gives the later correction its factual basis. */
    if (activeEvaluatorShift?.phase === "in-progress"
      && activeEvaluatorShift.expectedNextStep) {
      const reason = `controller 派发的有限 ${activeEvaluatorShift.kind} 班次尚未完成。`
        + `下一条冻结测量步骤是 ${activeEvaluatorShift.expectedNextStep}；只执行这一条后继续班次。`
        + "这不是修复授权，不得修改或删除任何 artifact，也不得自行等待、轮询或收工。";
      this.event("endurance_shift_continuation_emitted", {
        agentId: actor.agentId,
        kind: activeEvaluatorShift.kind,
        dispatchSeq: activeEvaluatorShift.dispatchSeq,
        submittedSeq: activeEvaluatorShift.submittedSeq,
        completedStepCount: activeEvaluatorShift.completedStepCount,
        totalStepCount: activeEvaluatorShift.totalStepCount,
        expectedNextStep: activeEvaluatorShift.expectedNextStep,
        authority: activeEvaluatorShift.authority,
        modelCallUsed: false,
        messageDelivered: true,
      });
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    const acceptanceResult = this.acceptance({
      cwd: this.store.cwd,
      command: this.store.contract.acceptance,
    });
    const acceptanceSnapshot = this.snapshot(this.store.cwd);
    const open = this.openInterventionFor(actor.agentId);
    const acceptanceInterventionId = open?.id ?? this.state().lastResolvedInterventionId ?? null;
    this.event("acceptance_finished", {
      interventionId: acceptanceInterventionId,
      phase: "stop",
      ran: acceptanceResult.ran,
      passed: acceptanceResult.passed,
      exit: acceptanceResult.exit,
      command: acceptanceResult.command,
      finalFingerprint: acceptanceSnapshot.fingerprint,
      outputTail: String(acceptanceResult.output ?? "").slice(-3000),
      outputHash: hash(String(acceptanceResult.output ?? "")),
    });
    let semantic = null;
    if (acceptanceResult.passed === true) {
      /* This is the control point the previous architecture missed. Semantic
         verification happens while Claude is still blocked at Stop. A green
         command cannot release the worker if the product outcome is shallow. */
      semantic = this.verifySemanticOutcome({
        acceptanceResult,
        interventionId: acceptanceInterventionId,
        phase: "stop",
        input,
        agent,
      });
    }
    if (acceptanceResult.passed === true && semantic?.status === "failed") {
      /* A verifier/auditor transport or schema failure says nothing about the
         artifact and must never be converted into a new worker correction.
         Keep the same intervention ID/authority hash so a later Stop can retry
         the judge and, if it passes, complete the original causal chain. */
      const judgeFailure = this.recordSemanticJudgeFailure(actor, open, semantic);
      if (judgeFailure.terminate) {
        return { decision: { verdict: "allow",
          reason: "semantic judge unavailable after bounded retries; ending conservatively incomplete" },
        output: stopApprove() };
      }
      const reason = "独立语义验收无法完成：裁判的传输或结构校验失败；原纠正及其因果身份仍被保留。"
        + "这不是新的实现缺陷，也不会向 worker 下发第二份纠正；下一次 Stop 将对同一交付重试裁判。";
      return { decision: { verdict: "warn", corrective: null,
        interventionId: open?.id ?? null }, output: stopHoldForJudge(reason) };
    }
    if (acceptanceResult.passed === true && semantic) {
      this.clearSemanticJudgeFailures(acceptanceInterventionId, actor.agentId);
    }
    if (acceptanceResult.passed === true && semantic?.status === "passed") {
      if (open) {
        const causalEffect = authorityMatchedEffect(this.store.events(), open,
          acceptanceSnapshot.fingerprint);
        if (causalEffect) {
          this.event("intervention_resolved", {
            interventionId: open.id,
            correctionObserved: Boolean(open.correctionObserved),
            effectObserved: true,
            causalEffectSeq: causalEffect.seq,
            matchedExpectedAction: causalEffect.matchedExpectedAction,
            correctionAuthorityHash: open.correctionAuthorityHash ?? null,
            finalFingerprint: acceptanceSnapshot.fingerprint,
          });
          const recovery = this.recoveryRecord(open.id);
          if (recovery?.effect?.observed === true
            && recovery?.delivery?.status === "observed"
            && ["effect-observed", "judge-complete"].includes(recovery.phase)) {
            this.interventionRecovery.resolve({ interventionId: open.id });
          }
          this.store.saveState({ lastResolvedInterventionId: open.id,
            lastResolvedInterventionAuthorityHash: open.correctionAuthorityHash ?? null,
            lastResolvedInterventionObserved: Boolean(open.correctionObserved),
            lastResolvedInterventionEffectObserved: true,
            lastResolvedInterventionArtifactFingerprint: acceptanceSnapshot.fingerprint });
        } else {
          this.event("intervention_unresolved", {
            interventionId: open.id,
            correctionObserved: Boolean(open.correctionObserved),
            effectObserved: Boolean(open.effectObserved),
            correctionAuthorityHash: open.correctionAuthorityHash ?? null,
            finalFingerprint: acceptanceSnapshot.fingerprint,
            reason: "no authority-matched effect exists on the delivered fingerprint",
          });
          this.store.saveState({
            lastUnattributedInterventionId: open.id,
            lastUnattributedInterventionAuthorityHash: open.correctionAuthorityHash ?? null,
            lastUnattributedDeliveryFingerprint: acceptanceSnapshot.fingerprint,
          });
        }
        this.setOpenIntervention(actor.agentId, null);
      } else {
        const resolvedState = this.state();
        if (resolvedState.lastResolvedInterventionId
          && resolvedState.lastResolvedInterventionAuthorityHash
          && resolvedState.lastResolvedInterventionArtifactFingerprint
            === acceptanceSnapshot.fingerprint) {
          this.event("intervention_resolved", {
            interventionId: resolvedState.lastResolvedInterventionId,
            correctionObserved: resolvedState.lastResolvedInterventionObserved === true,
            effectObserved: resolvedState.lastResolvedInterventionEffectObserved === true,
            correctionAuthorityHash: resolvedState.lastResolvedInterventionAuthorityHash,
            scope: "integrated-delivery",
            finalFingerprint: acceptanceSnapshot.fingerprint,
          });
        }
      }
      return { decision: { verdict: "allow", reason: "mechanical and semantic acceptance passed" }, output: stopApprove() };
    }
    if (open) {
      this.event("intervention_unresolved", {
        interventionId: open.id,
        correctionObserved: Boolean(open.correctionObserved),
        effectObserved: Boolean(open.effectObserved),
        acceptanceExit: acceptanceResult.exit,
      });
      this.setOpenIntervention(actor.agentId, null);
    }
    const supervised = this.supervise({
      input,
      agent,
      boundary: "Stop",
      trigger: acceptanceResult.passed === true
        ? "semantic-outcome-red-at-stop" : "acceptance-red-at-stop",
      acceptanceResult,
      semanticOutcome: semantic?.semanticOutcome ?? null,
      actor,
    });
    if (supervised.status === "exhausted") {
      this.event("run_cannot_recover", {
        agentId: actor.agentId,
        trigger: acceptanceResult.passed === true
          ? "semantic-outcome-red-at-stop" : "acceptance-red-at-stop",
        reason: "intervention budget exhausted; ending red instead of blocking forever",
      });
      return { decision: { verdict: "allow", reason: "intervention budget exhausted" }, output: stopApprove() };
    }
    if (supervised.status === "correction") {
      return {
        decision: { verdict: "warn", corrective: supervised.correction, interventionId: supervised.interventionId },
        output: stopBlock(supervised.correction),
      };
    }
    const frozenControlText = [this.store.contract.ask,
      ...(this.store.contract.semantic?.architecturalConstraints ?? []),
      ...(this.store.contract.semantic?.successCriteria ?? [])]
      .map((value) => String(value ?? "")).join("\n");
    const auditedRepairRequired = endurancePreregistration?.recoveryDrill
      ?.mustProduceAuditedCausalIntervention === true
      || /repair\s+must\s+arrive\s+through\s+a\s+live\s+audited\s+Outsider\s+correction/iu
        .test(frozenControlText)
      || /修复.{0,24}(?:必须|只能).{0,24}(?:经|通过).{0,24}审计.{0,24}Outsider/iu
        .test(frozenControlText)
      /* The live Codex contract phrases the same authority condition as
         "only after Outsider delivers a formal correction may you repair".
         A rejected factual audit must not fall through to an acceptance-output
         hint that the worker can reasonably interpret as edit authority. */
      || /只有在.{0,160}Outsider.{0,160}送达.{0,32}正式纠正.{0,80}(?:后|才).{0,80}(?:修复|修改)/isu
        .test(frozenControlText)
      || /only\s+after.{0,160}Outsider.{0,160}(?:formal|audited)\s+correction.{0,160}(?:repair|edit|modify)/isu
        .test(frozenControlText);
    if (auditedRepairRequired) {
      const hold = "本轮没有产生通过事实审计的 Outsider correction，因此没有任何 artifact 修复权限。"
        + "不要根据验收输出、语义缺口或本消息自行编辑/删除文件；直接再次提交 Stop，controller 将用同一冻结证据重新诊断。";
      this.event("audited_correction_hold_emitted", {
        agentId: actor.agentId,
        acceptancePassed: acceptanceResult.passed,
        supervisorStatus: supervised.status,
        authority: "frozen-audited-repair-requirement",
        modelCallUsed: false,
        messageDelivered: true,
      });
      return { decision: { verdict: "warn", corrective: null }, output: stopHoldForJudge(hold) };
    }
    const fallback = acceptanceResult.passed === true
      ? `【独立语义验收未放行；不是纠正计划】机械验收已通过，但语义验收${semantic?.status === "failed" ? "无法完成" : "发现缺口"}。\n`
        + `${semantic?.semanticOutcome?.error
          ?? semantic?.semanticOutcome?.insufficient
          ?? ((semantic?.semanticOutcome?.gaps ?? []).join("；") || "缺少可执行的独立诊断")}\n`
        + "不要收工；等待下一次独立诊断。"
      : `【独立验收返工；不是独立诊断】冻结的验收命令 ${this.store.contract.acceptance ?? "（未配置）"}`
        + ` 未通过（exit ${acceptanceResult.exit ?? "unknown"}）。\n${acceptanceResult.output.slice(-1600)}\n继续修复后再收工。`;
    this.event("acceptance_rework_emitted", {
      source: "acceptance_output_fallback",
      reason: supervised.status,
      bytes: fallback.length,
    });
    return { decision: { verdict: "warn", corrective: fallback }, output: stopBlock(fallback) };
  }

  subagentStop({ input, agent = "claude-code" }) {
    const explicitSubagentId = input?.agent_id ?? input?.agentId
      ?? input?.subagent_id ?? input?.subagentId ?? null;
    if (agent === "codex" && explicitSubagentId == null) {
      const reason = "Codex SubagentStop 缺少可绑定的子 Agent 身份；不能把匿名交付归到 main 或任一待办任务。";
      this.event("task_tree_gap", {
        agentId: null,
        reason: "Codex SubagentStop carried no explicit agent_id/subagent_id",
      });
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    const actor = this.registerActor(input);
    if (actor.identityConflict) {
      const reason = "Outsider 检测到 SubagentStop 身份 lineage 冲突；不能错误归属交付。";
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    const open = this.observeIntervention({ input, actor });
    this.event("boundary_reached", {
      boundary: "SubagentStop",
      agentId: actor.agentId,
      taskId: actor.task?.id ?? null,
      continuation: Boolean(input?.stop_hook_active ?? input?.stopHookActive),
    });
    if (!actor.task) {
      this.event("task_tree_gap", {
        agentId: actor.agentId,
        reason: "subagent has no attributable delegated task",
      });
      if (agent === "codex") {
        const reason = "Codex 子 Agent 的完成事件无法唯一绑定到已委派任务；为避免错误归因，本次退出保持阻断。";
        return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
      }
      return { decision: { verdict: "allow", reason: "subagent task could not be attributed" }, output: stopApprove() };
    }
    const durableTask = actor.task?.id ? this.state().tasks?.[actor.task.id] : null;
    if (durableTask?.status === "completed" && durableTask.independentlyVerified === true) {
      /* TaskCompleted already bound the exact completion intent to a successful
         host PostToolUse and an independent semantic clearance. SubagentStop is
         a later lifecycle echo, not a second delivery. Re-buying the same pair
         of LLM judgements here consumed four calls per two-person team and
         starved the lead integration gate in the live canary. */
      this.event("task_delivery_already_verified", {
        taskId: durableTask.id,
        agentId: actor.agentId,
        lifecycleBoundary: "SubagentStop",
      });
      return { decision: { verdict: "allow", reason: "delegated task was already independently verified" },
        output: stopApprove() };
    }
    if (actor.agentId.startsWith("teammate:")) {
      /* A true Agent Team member is not allowed to turn SubagentStop into an
         unbound completion shortcut.  TaskCompleted carries no actor identity
         in Claude 2.1.219, so strict attribution requires the member's own
         TaskUpdate(completed) Pre/Post transaction to be persisted first.
         R2 proved that host path exists; R3 showed that allowing the generic
         SubagentStop fallback lets the lead later reconcile someone else's
         work and destroys teammate-level causality.  This is deterministic
         protocol enforcement, not another semantic judge. */
      const reason = `Agent Team 成员 ${actor.agentId.slice("teammate:".length)} 尚未通过可归因的完成事务。`
        + `请由该成员调用 TaskUpdate(taskId=${actor.task.id}, status=completed)，`
        + "让 TaskCompleted 独立门和匹配的成功 PostToolUse 完成后再退出。";
      this.event("teammate_completion_protocol_required", {
        taskId: actor.task.id,
        agentId: actor.agentId,
        requiredTransaction: "TaskUpdate(completed)->TaskCompleted->PostToolUse(success)",
        messageDelivered: true,
        channel: "SubagentStop.exit2",
      });
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    const completionReport = finalReportApprovalEvidence(input);
    if (completionReport.observed !== true || completionReport.transcriptBound !== true) {
      this.event("subagent_report_unbound", {
        taskId: actor.task.id,
        agentId: actor.agentId,
        observed: completionReport.observed === true,
        transcriptBound: completionReport.transcriptBound === true,
        reason: completionReport.reason ?? "SUBAGENT_REPORT_NOT_BOUND",
      });
      if (agent === "codex") {
        const reason = "Codex SubagentStop 的 last_assistant_message 未能与该子 Agent rollout 的最新 assistant report 逐字绑定；任务仍保持未完成。";
        return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
      }
    }
    let reviewActor = actor;
    if (completionReport.observed === true && completionReport.transcriptBound === true) {
      const currentState = this.state();
      const tasks = { ...(currentState.tasks ?? {}) };
      const currentTask = tasks[actor.task.id] ?? actor.task;
      tasks[actor.task.id] = {
        ...currentTask,
        status: currentTask.status === "completed" ? "completed" : "awaiting-verification",
        completionReport,
        completionReportBoundAt: new Date().toISOString(),
      };
      this.store.saveState({ tasks });
      this.event("subagent_report_bound", {
        taskId: actor.task.id,
        agentId: actor.agentId,
        reportHash: completionReport.textHash,
        reportBytes: completionReport.textBytes,
        source: completionReport.source,
        transcriptBound: true,
        workerAssertionsAcceptedAsOutcomeEvidence: false,
      });
      reviewActor = { ...actor, task: tasks[actor.task.id] };
    }
    const reference = this.store.readJson(reviewActor.task.snapshotFile) ?? this.baseline;
    const supervised = this.supervise({
      input,
      agent,
      boundary: "SubagentStop",
      trigger: `subagent-delivery:${reviewActor.task.id}`,
      actor: reviewActor,
      reference,
    });
    if (supervised.status === "correction") {
      return {
        decision: { verdict: "warn", corrective: supervised.correction,
          interventionId: supervised.interventionId },
        output: stopBlock(supervised.correction),
      };
    }
    if (supervised.status === "on-track") {
      const state = this.state();
      const tasks = { ...(state.tasks ?? {}) };
      const agents = { ...(state.agents ?? {}) };
      tasks[reviewActor.task.id] = { ...tasks[reviewActor.task.id], status: "completed",
        independentlyVerified: true, completedAt: new Date().toISOString() };
      agents[actor.agentId] = { ...agents[actor.agentId], status: "completed" };
      this.store.saveState({ tasks, agents });
      this.event("task_completed", {
        taskId: reviewActor.task.id,
        agentId: actor.agentId,
        independentlyVerified: true,
        completionReportHash: completionReport.textHash ?? null,
        completionReportTranscriptBound: completionReport.transcriptBound === true,
      });
      if (open) {
        const subagentSnapshot = this.snapshot(this.store.cwd);
        const causalEffect = authorityMatchedEffect(this.store.events(), open,
          subagentSnapshot.fingerprint);
        if (causalEffect) {
          this.event("subagent_intervention_resolved", {
            interventionId: open.id,
            agentId: actor.agentId,
            correctionObserved: Boolean(open.correctionObserved),
            effectObserved: true,
            causalEffectSeq: causalEffect.seq,
            matchedExpectedAction: causalEffect.matchedExpectedAction,
            correctionAuthorityHash: open.correctionAuthorityHash ?? null,
            finalFingerprint: subagentSnapshot.fingerprint,
          });
          const recovery = this.recoveryRecord(open.id);
          if (recovery?.effect?.observed === true
            && recovery?.delivery?.status === "observed"
            && ["effect-observed", "judge-complete"].includes(recovery.phase)) {
            this.interventionRecovery.resolve({ interventionId: open.id });
          }
          this.store.saveState({ lastResolvedInterventionId: open.id,
            lastResolvedInterventionAuthorityHash: open.correctionAuthorityHash ?? null,
            lastResolvedInterventionObserved: Boolean(open.correctionObserved),
            lastResolvedInterventionEffectObserved: true,
            lastResolvedInterventionArtifactFingerprint: subagentSnapshot.fingerprint });
        } else {
          this.event("subagent_intervention_unresolved", {
            interventionId: open.id,
            agentId: actor.agentId,
            correctionObserved: Boolean(open.correctionObserved),
            effectObserved: Boolean(open.effectObserved),
            correctionAuthorityHash: open.correctionAuthorityHash ?? null,
            finalFingerprint: subagentSnapshot.fingerprint,
            reason: "no authority-matched effect exists on the delivered fingerprint",
          });
        }
        this.setOpenIntervention(actor.agentId, null);
      }
      return { decision: { verdict: "allow", reason: "delegated task independently verified" }, output: stopApprove() };
    }
    this.event("task_unverified", {
      taskId: reviewActor.task.id,
      agentId: actor.agentId,
      reason: supervised.status,
    });
    if (agent === "codex") {
      const reason = `Codex 子 Agent 交付尚未通过独立任务门（${supervised.status}）；任务保持 awaiting-verification。`;
      return { decision: { verdict: "warn", corrective: reason }, output: stopBlock(reason) };
    }
    return { decision: { verdict: "allow", reason: "subagent verification unavailable; parent remains accountable" }, output: stopApprove() };
  }

  handleHook({ input = {}, agent = "claude-code", strict = false } = {}) {
    if (!["claude-code", "codex"].includes(agent)) {
      throw new Error(`UNSUPPORTED_HOST: Stage 0.5 controller supports claude-code/codex, got ${agent}`);
    }
    const event = eventName(input);
    if (agent === "codex" && !CODEX_HOOK_EVENTS.has(event)) {
      throw new Error(`UNSUPPORTED_HOOK_EVENT:${event || "missing"}`);
    }
    this.lastTranscriptPath = actorTranscriptPath(input) ?? this.lastTranscriptPath;
    this.recordEvaluatorFault(input);
    if (event === "TaskCreated") {
      return this.taskCreated({ input });
    }
    if (event === "TaskCompleted") {
      return this.taskCompleted({ input, agent });
    }
    if (event === "TeammateIdle") {
      return this.teammateIdle({ input, agent });
    }
    if (event === "PostToolUse") {
      return this.postTool({ input });
    }
    if (event === "SubagentStart") {
      return this.subagentStart({ input });
    }
    if (event === "SubagentStop") {
      return this.subagentStop({ input, agent });
    }
    if (event === "Stop") return this.stop({ input, agent });
    if (PASSIVE_LIFECYCLE_EVENTS.has(event)) {
      return { decision: { verdict: "defer", reason: event === "PermissionRequest"
        ? "native permission decision remains with the host and operator"
        : "lifecycle observation only" }, output: {} };
    }
    if (event === "PreToolUse") return this.preTool({ input, agent, strict });
    /* Codex was exhaustively rejected above. Retain the historical fallback
       only for other provider-specific tool event names. */
    return this.preTool({ input, agent, strict });
  }

  finish({ requireIntervention = false } = {}) {
    const result = this.acceptance({ cwd: this.store.cwd, command: this.store.contract.acceptance });
    const finalSnapshot = this.snapshot(this.store.cwd);
    const state = this.state();
    const open = state.openInterventions?.main
      ?? Object.values(state.openInterventions ?? {})[0]
      ?? state.openIntervention
      ?? null;
    const outcomeInterventionId = open?.id ?? state.lastResolvedInterventionId ?? null;
    this.event("acceptance_finished", {
      interventionId: outcomeInterventionId,
      phase: "final",
      ran: result.ran,
      passed: result.passed,
      exit: result.exit,
      command: result.command,
      finalFingerprint: finalSnapshot.fingerprint,
      outputTail: String(result.output ?? "").slice(-3000),
      outputHash: hash(String(result.output ?? "")),
    });
    if (result.passed === true) {
      const current = finalSnapshot;
      const prior = [...this.store.events()].reverse().find((event) => event.type === "outcome_verdict"
        && event.phase === "stop" && event.finalFingerprint === current.fingerprint);
      if (prior?.passed === true && !prior.insufficient) {
        /* Stop already held the worker until this exact tree passed semantic
           review. Reusing the content-addressed verdict avoids a second model
           opinion changing the answer after the worker can no longer repair it. */
        this.event("outcome_verification_reused", {
          interventionId: outcomeInterventionId,
          sourceSeq: prior.seq,
          finalFingerprint: current.fingerprint,
        });
      } else {
        this.verifySemanticOutcome({
          acceptanceResult: result,
          interventionId: outcomeInterventionId,
          phase: "final-fallback",
          input: this.lastTranscriptPath ? { transcript_path: this.lastTranscriptPath } : null,
        });
      }
    }
    const preliminaryProof = validateCausalProof(this.store.events(), { requireIntervention });
    const reliability = supervisorReliability(this.store.events());
    this.event("run_finalized", {
      proofComplete: preliminaryProof.complete,
      deliveryComplete: preliminaryProof.deliveryComplete,
      interventionRequired: preliminaryProof.interventionRequired,
      interventionComplete: preliminaryProof.interventionComplete,
      acceptancePassed: result.passed,
      finalFingerprint: finalSnapshot.fingerprint,
      errors: preliminaryProof.errors.slice(0, 12),
      supervisorReliability: reliability,
    });
    const proof = validateCausalProof(this.store.events(), { requireIntervention });
    const runStatus = proof.complete ? "complete"
      : proof.deliveryComplete ? "delivered-unattributed" : "incomplete";
    const agentStatus = proof.complete ? "completed"
      : proof.deliveryComplete ? "delivered-unattributed" : "run-ended-incomplete";
    const agents = Object.fromEntries(Object.entries(this.state().agents ?? {})
      .map(([id, value]) => [id, { ...value,
        status: agentStatus }]));
    this.store.saveState({ status: runStatus, proof, agents,
      supervisorReliability: reliability });
    return { acceptance: result, proof };
  }
}
