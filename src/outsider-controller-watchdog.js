import { randomUUID } from "node:crypto";
import { fork } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { RunStore, validateCausalProof } from "./outsider-kernel-store.js";
import { requestController } from "./outsider-controller-rpc.js";
import {
  cleanupOwnedJudgeProcesses, judgeOwnershipDirectory,
} from "./outsider-judge-process-ownership.js";

function terminalProof(event) {
  return {
    complete: event.proofComplete === true,
    deliveryComplete: event.deliveryComplete === true,
    interventionRequired: event.interventionRequired === true,
    interventionComplete: event.interventionComplete === true,
    errors: Array.isArray(event.errors) ? event.errors : [],
  };
}

/** Reconcile the narrow crash window after the immutable terminal event was
 * appended but before run.json and the controller lease were committed.  This
 * function never appends an event and never re-runs a judge.  It accepts only a
 * single, final run_finalized event whose proof recomputes exactly from the
 * already durable event stream. */
export function reconcileTerminalControllerRun({ configPath, now = Date.now() } = {}) {
  if (!configPath) throw new Error("TERMINAL_RECONCILIATION_CONFIG_REQUIRED");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const store = RunStore.open({ directory: config.runDirectory,
    supervisorCommand: config.supervisorCommand });
  const events = store.events();
  const terminals = events.filter((event) => event.type === "run_finalized");
  if (terminals.length === 0) return null;
  const terminal = terminals[0];
  if (terminals.length !== 1 || terminal.seq !== events.at(-1)?.seq) {
    throw new Error("TERMINAL_RECONCILIATION_EVENT_NOT_UNIQUE_FINAL");
  }
  const declared = terminalProof(terminal);
  const recomputed = validateCausalProof(events, {
    requireIntervention: declared.interventionRequired,
  });
  if (declared.complete !== recomputed.complete
    || declared.deliveryComplete !== recomputed.deliveryComplete
    || declared.interventionRequired !== recomputed.interventionRequired
    || declared.interventionComplete !== recomputed.interventionComplete
    || JSON.stringify(declared.errors) !== JSON.stringify(recomputed.errors)) {
    throw new Error("TERMINAL_RECONCILIATION_PROOF_MISMATCH");
  }
  if (existsSync(path.join(store.directory, "stage05-evidence-manifest.json"))) {
    const state = store.readState();
    const lease = store.readJson("controller-lease.json");
    if (lease?.status === "active" || state?.proof?.complete !== declared.complete) {
      throw new Error("TERMINAL_RECONCILIATION_SEALED_STATE_MISMATCH");
    }
    return { terminal, proof: declared, runId: store.runId, alreadySealed: true };
  }
  const status = declared.complete ? "complete"
    : declared.deliveryComplete ? "delivered-unattributed" : "incomplete";
  const agentStatus = declared.complete ? "completed"
    : declared.deliveryComplete ? "delivered-unattributed" : "run-ended-incomplete";
  const prior = store.readState() ?? {};
  const agents = Object.fromEntries(Object.entries(prior.agents ?? {})
    .map(([id, value]) => [id, { ...value, status: agentStatus }]));
  const stateMatches = prior.status === status && prior.controllerStatus === "stopped"
    && prior.proof?.complete === declared.complete
    && prior.proof?.deliveryComplete === declared.deliveryComplete
    && prior.proof?.interventionRequired === declared.interventionRequired
    && prior.proof?.interventionComplete === declared.interventionComplete;
  if (!stateMatches) {
    store.saveState({ status, proof: declared, agents,
      supervisorReliability: terminal.supervisorReliability ?? null,
      controllerStatus: "stopped", terminalReconciled: true,
      terminalReconciledAt: new Date(now).toISOString(), terminalEventSeq: terminal.seq });
  }
  const lease = store.readJson("controller-lease.json");
  if (lease?.status === "active") {
    if (lease.runId !== store.runId || lease.contractSeal !== store.contract.seal) {
      throw new Error("TERMINAL_RECONCILIATION_LEASE_IDENTITY_MISMATCH");
    }
    store.writeJson("controller-lease.json", { ...lease, status: "released",
      releasedAt: new Date(now).toISOString(), expiresAtMs: now,
      expiresAt: new Date(now).toISOString(), releaseReason: "terminal-reconciliation" });
  }
  return {
    terminal, proof: declared, runId: store.runId, alreadySealed: false,
    acceptance: { passed: terminal.acceptancePassed === true },
  };
}

function waitForMessage(child, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label}_TIMEOUT:${timeoutMs}`));
    }, timeoutMs);
    const onMessage = (message) => {
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`${label}_HOST_EXIT:${code ?? "null"}:${signal ?? "null"}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

/** A process-level watchdog. The worker talks to one stable socket/token while
 * controller generations are disposable. A dead generation cannot continue
 * grading because its lease owner is replaced atomically before the successor
 * opens the socket. */
export async function startControllerWatchdog({
  hostEntry,
  configPath,
  socketPath,
  token,
  maxRestarts = 3,
  readyTimeoutMs = 15_000,
  forkController = fork,
  hostEnvironment = null,
  initialReplacingOwnerId = null,
  onFatal = null,
  stderr = process.stderr,
} = {}) {
  if (!hostEntry || !configPath || !socketPath || !token) throw new Error("WATCHDOG_INCOMPLETE");
  const controllerConfig = JSON.parse(readFileSync(configPath, "utf8"));
  if (!controllerConfig?.runDirectory) throw new Error("WATCHDOG_RUN_DIRECTORY_REQUIRED");
  const judgeOwnershipPath = judgeOwnershipDirectory(controllerConfig.runDirectory);
  let child = null;
  let ownerId = null;
  let generation = 0;
  let restarts = 0;
  let stopping = false;
  let fatal = null;
  let recoveryPromise = null;
  let terminalResult = null;

  const killGenerationGroup = (pid) => {
    if (!Number.isInteger(pid) || pid <= 1) return false;
    try { process.kill(-pid, "SIGKILL"); return true; } catch { return false; }
  };

  const launch = async (replacingOwnerId = null, recoveredJudgeCleanup = null) => {
    const nextOwnerId = randomUUID();
    const next = forkController(hostEntry, [], {
      env: {
        ...(hostEnvironment ?? process.env),
        OUTSIDER_CONTROLLER_CONFIG: configPath,
        OUTSIDER_CONTROLLER_SOCKET: socketPath,
        OUTSIDER_CONTROLLER_TOKEN: token,
        OUTSIDER_CONTROLLER_OWNER: nextOwnerId,
        OUTSIDER_CONTROLLER_OWNER_ID: nextOwnerId,
        OUTSIDER_JUDGE_OWNERSHIP_DIRECTORY: judgeOwnershipPath,
        ...(replacingOwnerId ? { OUTSIDER_REPLACING_CONTROLLER_OWNER: replacingOwnerId } : {}),
        ...(recoveredJudgeCleanup ? {
          OUTSIDER_RECOVERED_JUDGE_CLEANUP: JSON.stringify(recoveredJudgeCleanup),
        } : {}),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      /* Each generation owns a process group. If the controller is SIGKILLed
         while a synchronous model CLI is running, that descendant otherwise
         outlives its authority and races the recovered generation. */
      detached: true,
    });
    next.stderr?.on("data", (chunk) => stderr?.write?.(chunk));
    const ready = await waitForMessage(next, (message) => message?.type === "ready",
      readyTimeoutMs, "CONTROLLER_READY");
    child = next;
    ownerId = ready.ownerId;
    generation = ready.generation;
    next.once("exit", (code, signal) => {
      if (stopping || child !== next) return;
      const crashedOwner = ownerId;
      const crashedPid = next.pid;
      child = null;
      recoveryPromise = (async () => {
        killGenerationGroup(crashedPid);
        const judgeCleanup = await cleanupOwnedJudgeProcesses({
          directory: judgeOwnershipPath,
          ownerId: crashedOwner,
        });
        if (judgeCleanup.failures.length > 0 || judgeCleanup.remaining > 0) {
          fatal = new Error(`CONTROLLER_ORPHAN_JUDGE_CLEANUP_FAILED:${JSON.stringify(judgeCleanup)}`);
          onFatal?.(fatal);
          return;
        }
        /* A terminal event is the final write in the controller's authority
           domain. Restarting after it used to append controller_recovered to
           an already sealed evidence stream. Terminal runs never recover; a
           missing caller reply fails closed and may be inspected/resealed, but
           the historical chain is not rewritten. */
        try {
          const reconciled = reconcileTerminalControllerRun({ configPath });
          if (reconciled) {
            terminalResult = reconciled;
            return;
          }
        } catch (error) {
          fatal = error;
          onFatal?.(error);
          return;
        }
        if (restarts >= maxRestarts) {
          fatal = new Error(`CONTROLLER_RECOVERY_EXHAUSTED:${code ?? "null"}:${signal ?? "null"}`);
          onFatal?.(fatal);
          return;
        }
        restarts += 1;
        try { await launch(crashedOwner, judgeCleanup); } catch (error) {
          fatal = error;
          onFatal?.(error);
        }
      })();
    });
    return ready;
  };

  await launch(initialReplacingOwnerId);

  const ensureReady = async () => {
    if (recoveryPromise) {
      await recoveryPromise;
      recoveryPromise = null;
    }
    if (fatal) throw fatal;
    if (terminalResult) return null;
    if (!child?.connected) throw new Error("CONTROLLER_NOT_CONNECTED");
    return child;
  };

  const waitUntilSocketReady = async (timeoutMs = readyTimeoutMs) => {
    const deadline = Date.now() + Math.max(250, Number(timeoutMs) || readyTimeoutMs);
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const active = await ensureReady();
        if (!active && terminalResult) return null;
        const ping = await requestController({ socketPath, token,
          payload: { _outsiderControl: "ping" }, timeoutMs: 500 });
        if (ping?.ready === true) return active;
        lastError = new Error("CONTROLLER_PING_NOT_READY");
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`CONTROLLER_SOCKET_NOT_READY:${lastError?.message ?? "timeout"}`);
  };

  return {
    get child() { return child; },
    get ownerId() { return ownerId; },
    get generation() { return generation; },
    get restarts() { return restarts; },
    get fatal() { return fatal; },
    get terminalResult() { return terminalResult; },
    async waitUntilReady(options = {}) {
      return waitUntilSocketReady(options.timeoutMs ?? readyTimeoutMs);
    },
    async record({ eventType = null, payload = {}, statePatch = null, timeoutMs = 10_000 } = {}) {
      const active = await ensureReady();
      if (!active) throw new Error("CONTROLLER_RUN_TERMINAL");
      const requestId = randomUUID();
      active.send({ type: "record", requestId, eventType, payload, statePatch });
      const message = await waitForMessage(active,
        (candidate) => candidate?.requestId === requestId
          && (candidate.type === "record-result" || candidate.type === "record-error"),
        timeoutMs, "CONTROLLER_RECORD");
      if (message.type === "record-error") throw new Error(message.error);
      return message.event;
    },
    async recordAndCrashForTest({ eventType, payload = {}, statePatch = null,
      signal = "SIGKILL", timeoutMs = 5 * 60_000 } = {}) {
      if (!eventType) throw new Error("CONTROLLER_CRASH_EVENT_REQUIRED");
      const active = await ensureReady();
      const priorGeneration = generation;
      const priorOwnerId = ownerId;
      const requestId = randomUUID();
      const exited = new Promise((resolve) => {
        if (active.exitCode !== null || active.signalCode) resolve();
        else active.once("exit", resolve);
      });
      active.send({ type: "record-and-crash-for-test", requestId, eventType,
        payload, statePatch, signal });
      const message = await waitForMessage(active,
        (candidate) => candidate?.requestId === requestId
          && (candidate.type === "record-and-crash-armed"
            || candidate.type === "record-and-crash-error"),
        timeoutMs, "CONTROLLER_RECORD_AND_CRASH");
      if (message.type === "record-and-crash-error") throw new Error(message.error);
      await exited;
      await ensureReady();
      if (generation <= priorGeneration || ownerId === priorOwnerId) {
        throw new Error("CONTROLLER_RECORD_AND_CRASH_DID_NOT_REPLACE_OWNER");
      }
      return { event: message.event, priorGeneration, priorOwnerId,
        generation, ownerId };
    },
    async finish({ requireIntervention = false, timeoutMs = 15 * 60_000 } = {}) {
      const active = await ensureReady();
      if (!active && terminalResult) return terminalResult;
      const requestId = randomUUID();
      let message;
      try {
        active.send({ type: "finish", requestId, requireIntervention });
        message = await waitForMessage(active,
          (candidate) => candidate?.requestId === requestId
            && (candidate.type === "finish-result" || candidate.type === "finish-error"),
          timeoutMs, "CONTROLLER_FINISH");
      } catch (error) {
        if (!recoveryPromise && !child) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        if (recoveryPromise) {
          await recoveryPromise;
          recoveryPromise = null;
        }
        if (terminalResult) return terminalResult;
        throw error;
      }
      if (message.type === "finish-error") throw new Error(message.error);
      return message.result;
    },
    async close({ timeoutMs = 5_000 } = {}) {
      stopping = true;
      if (recoveryPromise) await recoveryPromise.catch(() => undefined);
      if (!child) return;
      const active = child;
      const exited = new Promise((resolve) => active.once("exit", resolve));
      try { active.send({ type: "shutdown" }); } catch { /* already dead */ }
      const timer = setTimeout(() => {
        if (!killGenerationGroup(active.pid)) {
          try { active.kill("SIGKILL"); } catch { /* gone */ }
        }
      }, timeoutMs);
      timer.unref?.();
      await exited;
      clearTimeout(timer);
      child = null;
    },
    crashForTest(signal = "SIGKILL") {
      if (!child) throw new Error("CONTROLLER_NOT_RUNNING");
      return signal === "SIGKILL" ? (killGenerationGroup(child.pid) || child.kill(signal))
        : child.kill(signal);
    },
  };
}
