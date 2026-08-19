import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OutsiderKernelController } from "./outsider-kernel-controller.js";
import { RunStore } from "./outsider-kernel-store.js";
import { startControllerRpc } from "./outsider-controller-rpc.js";
import {
  acquireControllerLease, heartbeatControllerLease, releaseControllerLease,
} from "./outsider-controller-lease.js";
import { judgeOwnershipDirectory } from "./outsider-judge-process-ownership.js";

function evaluationFinalizationFailpoint(name) {
  if (process.env.OUTSIDER_EVALUATION_ALLOW_FAILPOINTS !== "1"
    || process.env.OUTSIDER_EVALUATION_FINALIZATION_FAILPOINT !== name) return;
  const marker = process.env.OUTSIDER_EVALUATION_FAILPOINT_MARKER;
  if (!marker) throw new Error("EVALUATION_FAILPOINT_MARKER_REQUIRED");
  try {
    const expected = JSON.parse(readFileSync(marker, "utf8"));
    if (expected?.schema !== "outsider/evaluation-finalization-failpoint/v1"
      || expected.name !== name) throw new Error("marker mismatch");
  } catch (error) {
    throw new Error(`EVALUATION_FAILPOINT_MARKER_INVALID:${error?.message ?? error}`);
  }
  process.kill(process.pid, "SIGKILL");
}

function hookEvent(payload) {
  return payload?.input?.hook_event_name ?? payload?.input?.hookEventName
    ?? payload?.hook_event_name ?? payload?.hookEventName ?? null;
}

/* This response is deliberately computed without opening RunStore.  Once the
   finalization barrier is raised, a late host callback may be acknowledged or
   stopped, but it can never extend the causal stream after run_finalized. */
export function terminalControllerResponse(payload, { phase, result, error } = {}) {
  const event = hookEvent(payload);
  const terminal = phase === "terminal";
  const reason = terminal
    ? "Outsider run 已终态；这个迟到的 hook 不会改写已完成的证据链。"
    : `Outsider controller 正在终态化；这个新 hook 没有进入控制器${error ? `（${error}）` : ""}。`;
  let output = {};
  if (event === "PreToolUse") {
    output = { hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    } };
  } else if (!terminal && (event === "Stop" || event === "SubagentStop")) {
    output = { decision: "block", reason };
  } else if (!terminal && ["TaskCreated", "TaskCompleted", "TeammateIdle"].includes(event)) {
    output = { _outsiderExitCode: 2, _outsiderStderr: reason };
  }
  return {
    terminal,
    finalizing: !terminal,
    runId: result?.runId ?? null,
    decision: { verdict: terminal ? "allow" : "deny", reason },
    output,
  };
}

/**
 * Reconstitute the controller exclusively from sealed run state plus the same
 * supervisor identity. Open interventions, patrol cadence, task dependencies,
 * file conflicts and call budgets are all replayed from run.json/events.jsonl;
 * none live only in the crashed process.
 */
export async function startRecoverableControllerHost({
  runDirectory,
  supervisorCommand,
  socketPath,
  token,
  controllerOptions = {},
  ownerId = randomUUID(),
  replacingOwnerId = null,
  leaseMs = 12_000,
  heartbeatMs = 3_000,
  drainTimeoutMs = 15 * 60_000,
  hookPreparer = null,
  controllerFactory = (options) => new OutsiderKernelController(options),
} = {}) {
  const store = RunStore.open({ directory: runDirectory, supervisorCommand });
  const terminalEvent = [...store.events()].reverse().find((event) =>
    event.type === "run_finalized" || event.type === "gate_containment_finalized");
  if (terminalEvent) {
    throw new Error(`CONTROLLER_RUN_TERMINAL:${terminalEvent.type}:${terminalEvent.seq}`);
  }
  const baseline = store.readJson("baseline.json");
  if (!baseline?.fingerprint) throw new Error("RECOVERY_BASELINE_MISSING");
  const sealedBudget = store.contract.budget ?? {};
  const sealedControllerOptions = {
    ...controllerOptions,
    ...(sealedBudget.runtimeSupervisorCalls != null
      ? { maxSupervisorCalls: sealedBudget.runtimeSupervisorCalls } : {}),
    ...(sealedBudget.semanticPatrolEvery != null
      ? { semanticPatrolEvery: sealedBudget.semanticPatrolEvery } : {}),
    ...(sealedBudget.semanticPatrolMinEvidenceSteps != null
      ? { semanticPatrolMinEvidenceSteps: sealedBudget.semanticPatrolMinEvidenceSteps } : {}),
    ...(sealedBudget.followupBoundaries != null
      ? { followupBoundaries: sealedBudget.followupBoundaries } : {}),
  };
  const lease = acquireControllerLease({
    store, ownerId, ttlMs: leaseMs, replacingOwnerId,
  });
  /* This host is one disposable controller generation. Runtime semantic
     judges persist an exact process-group ownership record so the watchdog can
     reap them before a replacement generation starts. */
  const judgeEnvironmentKeys = ["OUTSIDER_CONTROLLER_OWNER_ID",
    "OUTSIDER_CONTROLLER_GENERATION", "OUTSIDER_JUDGE_OWNERSHIP_DIRECTORY"];
  const priorJudgeEnvironment = Object.fromEntries(judgeEnvironmentKeys
    .map((key) => [key, process.env[key]]));
  const restoreJudgeEnvironment = () => {
    for (const key of judgeEnvironmentKeys) {
      if (priorJudgeEnvironment[key] == null) delete process.env[key];
      else process.env[key] = priorJudgeEnvironment[key];
    }
  };
  process.env.OUTSIDER_CONTROLLER_OWNER_ID = ownerId;
  process.env.OUTSIDER_CONTROLLER_GENERATION = String(lease.generation);
  process.env.OUTSIDER_JUDGE_OWNERSHIP_DIRECTORY = judgeOwnershipDirectory(runDirectory);
  const controller = controllerFactory({
    store,
    baseline,
    ...sealedControllerOptions,
    controllerOwnerId: ownerId,
    controllerGeneration: lease.generation,
    replacingControllerOwnerId: replacingOwnerId,
  });
  let rpc;
  let heartbeat = null;
  let finalized = false;
  let leaseReleased = false;
  const finalizeRun = async (payload = {}) => {
    const result = await controller.finish({
      requireIntervention: Boolean(payload?.requireIntervention),
    });
    evaluationFinalizationFailpoint("after-run-finalized-before-state");
    if (!finalized) {
      /* controller.finish has now written the sole terminal event and RPC has
         fenced every later hook.  Persist the quiescent runtime state and
         release the lease before returning to the runner that seals evidence. */
      clearInterval(heartbeat);
      store.saveState({ controllerStatus: "stopped" });
      evaluationFinalizationFailpoint("after-state-before-lease-release");
      leaseReleased = releaseControllerLease({ store, ownerId });
      if (!leaseReleased) throw new Error("CONTROLLER_LEASE_RELEASE_FAILED");
      finalized = true;
      restoreJudgeEnvironment();
    }
    return result;
  };
  const rpcController = {
    prepareHook(payload) {
      return typeof hookPreparer === "function" ? hookPreparer({ payload, store }) : null;
    },
    handleHook(payload, prepared = null) {
      if (payload?._outsiderControl === "ping") return { ready: true, runId: store.runId };
      if (payload?._outsiderControl === "supersede") {
        store.append("attached_run_superseded", {
          reason: String(payload.reason ?? "operator-contract-amended").slice(0, 500),
        });
        store.saveState({ status: "superseded" });
        return { superseded: true };
      }
      return controller.handleHook(payload, prepared);
    },
  };
  try {
    rpc = await startControllerRpc({
      controller: rpcController,
      socketPath,
      token,
      drainTimeoutMs,
      terminalResponse: terminalControllerResponse,
      finalizeController: finalizeRun,
    });
  } catch (error) {
    releaseControllerLease({ store, ownerId });
    restoreJudgeEnvironment();
    throw error;
  }
  let judgeCleanup = null;
  if (lease.generation > 1 && process.env.OUTSIDER_RECOVERED_JUDGE_CLEANUP) {
    try { judgeCleanup = JSON.parse(process.env.OUTSIDER_RECOVERED_JUDGE_CLEANUP); }
    catch { throw new Error("CONTROLLER_RECOVERED_JUDGE_CLEANUP_INVALID"); }
  }
  store.append(lease.generation > 1 ? "controller_recovered" : "controller_started", {
    generation: lease.generation,
    ownerId,
    replacingOwnerId,
    replayedEvents: store.sequence - 1,
    ...(judgeCleanup ? {
      orphanJudgeProcessesInspected: judgeCleanup.inspected,
      orphanJudgeProcessesTerminated: judgeCleanup.terminated,
      staleJudgeOwnershipRecordsRemoved: judgeCleanup.stale,
      orphanJudgeProcessesRemaining: judgeCleanup.remaining,
    } : {}),
  });
  store.saveState({
    controllerGeneration: lease.generation,
    controllerOwnerId: ownerId,
    controllerStatus: "running",
    socketPath,
  });
  heartbeat = setInterval(() => {
    try { heartbeatControllerLease({ store, ownerId }); } catch {
      /* Losing the lease means this process is no longer authoritative. Close
         the RPC boundary immediately; the worker fails closed until watchdog
         takeover completes. */
      rpc.close().catch(() => undefined);
      clearInterval(heartbeat);
    }
  }, Math.max(250, Number(heartbeatMs) || 3_000));
  heartbeat.unref?.();
  let closed = false;
  const finish = async ({ requireIntervention = false } = {}) =>
    rpc.finish({ requireIntervention });
  return {
    store,
    controller,
    rpc,
    lease,
    ownerId,
    get finalized() { return finalized; },
    get acceptingHooks() { return rpc.phase === "accepting"; },
    finish,
    record({ eventType = null, payload = {}, statePatch = null } = {}) {
      if (rpc.phase !== "accepting") {
        return { accepted: false, terminal: rpc.phase === "terminal", event: null };
      }
      const event = eventType ? store.append(String(eventType), payload) : null;
      if (statePatch && typeof statePatch === "object") store.saveState(statePatch);
      return { accepted: true, terminal: false, event };
    },
    async close({ release = true } = {}) {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      await rpc.close();
      /* A successful finish already persisted the final state and released the
         lease before evidence sealing.  Shutdown after that point must be
         byte-for-byte silent inside the run directory. */
      if (finalized) return;
      if (release && !leaseReleased) leaseReleased = releaseControllerLease({ store, ownerId });
      store.saveState({ controllerStatus: release ? "stopped" : "crashed" });
      restoreJudgeEnvironment();
    },
  };
}
