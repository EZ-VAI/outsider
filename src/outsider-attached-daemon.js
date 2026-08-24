import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { discoverAcceptance } from "./outsider-acceptance-discovery.js";
import { AttachedLedger, attachedPrompt, attachedSessionKey } from "./outsider-attached-ledger.js";
import { startKernelRun, workerMandate } from "./outsider-kernel-runner.js";
import { requestController } from "./outsider-controller-rpc.js";
import { startControllerWatchdog, reconcileTerminalControllerRun } from "./outsider-controller-watchdog.js";
import { finalizeStage05Evidence } from "./outsider-stage05-evidence.js";
import { defaultStateRoot } from "./outsider-kernel-store.js";
import { CodexLiveReceiptStore } from "./outsider-codex-live-receipts.js";

const eventName = (input) => String(input?.hook_event_name ?? input?.hookEventName ?? "");
const CODEX_HOOK_EVENTS = new Set([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PermissionRequest",
  "PostToolUse", "PreCompact", "PostCompact", "SubagentStart", "SubagentStop", "Stop",
]);
const ACTUAL_CONTROLLER_ROUTE = Symbol("outsider.actual-controller-route");
const MAX_CODEX_TERMINAL_REPAIR_GENERATIONS = 3;
const MAX_CODEX_REPAIR_REARM_ATTEMPTS = 3;
const stopBlock = (reason) => ({ decision: { verdict: "deny", corrective: reason },
  output: { decision: "block", reason } });
const terminalStop = (status, message) => ({
  decision: { verdict: "allow", reason: status },
  output: { decision: "approve", systemMessage: `outsider: ${message}` },
});
const preToolBlock = (reason) => ({ decision: { verdict: "deny", corrective: reason },
  output: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: reason } } });
const preToolAllow = (reason) => ({ decision: { verdict: "allow", reason },
  output: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } } });
const allow = (reason = "attached lifecycle event recorded") => ({
  decision: { verdict: "allow", reason }, output: {},
});
const promptContext = (text) => ({ decision: { verdict: "allow", reason: "contract frozen" },
  output: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } } });
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const BOOTSTRAP_RETRY_BASE_MS = 30_000;
const BOOTSTRAP_RETRY_MAX_MS = 5 * 60_000;
const DIAGNOSTIC_READ_TOOLS = new Set(["read", "glob", "grep", "notebookread"]);
const OBSERVER_ONLY_CONTEXT = "OUTSIDER_OBSERVER_ONLY: Outsider 没有发现 repository-owned acceptance，"
  + "本轮未进入 Stage 0.5 controlled mode。工具会继续执行，但 Claude 的完成声明"
  + "不是 Outsider 的独立验收证明。可在 .outsider.json 配置 acceptance，"
  + "或从包含仓库验收入口的目录发起任务。";
const OBSERVER_ONLY_TERMINAL = "本轮仅以 observer-only 运行：Outsider 没有发现"
  + " repository-owned acceptance，因此没有建立受控闭环或独立交付证明。"
  + "Claude 的完成声明仅来自 worker，不得解释为 Outsider Stage 0.5 验证。";
const BOOTSTRAP_FAILED_READ_ONLY_TERMINAL = "仓库验收预检不可用，本轮只能完成只读分析。"
  + "Outsider 没有允许任何写入，也没有建立受控闭环、独立验收或 Stage 0.5 交付证明；"
  + "本次回答只能作为未受控的只读建议。修复项目验收环境后，新任务会自动重新尝试受控模式。";
const LOCAL_ONLY_CONTEXT = "OUTSIDER_LOCAL_ONLY: 未同时配置 external supervisor 命令与明确同意，"
  + "Outsider 没有启动任何外部 supervisor。当前仅允许本地只读诊断；写入、执行和其他"
  + "潜在世界变更会 fail-closed，且本轮不能声称 Stage 0.5 受控交付。";
const LOCAL_ONLY_TERMINAL = "本轮以 local-only/no-external 模式结束：没有向外部 supervisor"
  + " 发送 workspace、prompt、tool 或 output；仅允许了只读诊断，所有潜在世界变更均被拒绝。"
  + "本轮没有形成独立验收、因果证明或 Stage 0.5 交付。";

/* Claude Desktop/Cowork emits Claude-shaped trajectories even though its
   transport label is different.  Only Codex selects the Codex rollout parser;
   passing `claude-desktop` into the kernel would reject the public Claude
   product while fixing the new adapter. */
export function kernelAgentForAttachedHost(agent) {
  if (agent === "codex") return "codex";
  if (["claude-code", "claude-desktop"].includes(agent)) return "claude-code";
  throw new Error(`UNSUPPORTED_ATTACHED_HOST:${agent}`);
}

function isDiagnosticRead(input = {}) {
  return DIAGNOSTIC_READ_TOOLS.has(String(input.tool_name ?? input.toolName ?? "").toLowerCase());
}

function processExists(pid) {
  if (!(Number(pid) > 0)) return false;
  try { process.kill(Number(pid), 0); return true; } catch (error) {
    return error?.code === "EPERM";
  }
}

/* Claude Desktop/Cowork deliberately runs the Agent SDK from an isolated
   `.../local_<id>/outputs` directory.  The repository the operator selected is
   recorded next to that directory in `local_<id>.json#userSelectedFolders`.
   Treating the SDK cwd as the workspace makes every real Cowork task look like
   an empty repository and silently demotes the controller to observer-only.

   This resolver is intentionally narrow: it accepts one host-owned folder only
   when the metadata identity and directory layout match.  Multiple selected
   folders remain unresolved rather than being merged or guessed. */
export function resolveAttachedWorkspace(agent, input = {}) {
  const hostCwd = path.resolve(input.cwd || process.cwd());
  if (agent !== "claude-desktop" || path.basename(hostCwd) !== "outputs") {
    return { cwd: hostCwd, hostCwd, source: "hook-cwd", metadataFile: null };
  }
  const localDirectory = path.dirname(hostCwd);
  const localId = path.basename(localDirectory);
  if (!/^local_[a-z0-9-]+$/i.test(localId)) {
    return { cwd: hostCwd, hostCwd, source: "hook-cwd", metadataFile: null };
  }
  const metadataFile = path.join(path.dirname(localDirectory), `${localId}.json`);
  try {
    const metadata = JSON.parse(readFileSync(metadataFile, "utf8"));
    if (metadata?.sessionId !== localId || path.resolve(metadata?.cwd ?? "") !== hostCwd) {
      return { cwd: hostCwd, hostCwd, source: "hook-cwd", metadataFile };
    }
    const folders = [...new Set((metadata.userSelectedFolders ?? [])
      .filter((folder) => typeof folder === "string" && folder.trim())
      .map((folder) => path.resolve(folder))
      .filter((folder) => existsSync(folder)))];
    if (folders.length !== 1) {
      return { cwd: hostCwd, hostCwd,
        source: folders.length ? "claude-desktop:ambiguous-user-selected-folders"
          : "claude-desktop:no-user-selected-folder",
        metadataFile, candidates: folders };
    }
    return { cwd: folders[0], hostCwd,
      source: "claude-desktop:userSelectedFolders", metadataFile, candidates: folders };
  } catch {
    return { cwd: hostCwd, hostCwd, source: "hook-cwd", metadataFile };
  }
}

const inside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/* A Cowork user may select a broad local folder and name one nested repository
   in the prompt.  Narrowing is allowed only when the operator supplied a path,
   that path stays inside the selected folder, and exactly one ancestor has a
   repository-owned acceptance command.  No model or directory-wide search is
   involved, so unrelated sibling data cannot silently enter the contract. */
export function resolvePromptWorkspace(workspaceRoot, prompt) {
  const root = path.resolve(workspaceRoot);
  const text = String(prompt ?? "");
  const tokens = text.match(/(?:[A-Za-z0-9._-]+[/\\])+[A-Za-z0-9._-]+/g) ?? [];
  /* A repository name is also a path when the operator explicitly calls it a
     directory, even if it is one segment with no slash.  Cowork commonly asks
     the user to select a broad folder, so prompts such as
     `只在 final-fixture 子目录中工作` must retain that exact narrowing intent.
     Keep this grammar narrow: an unqualified prose token is never treated as a
     path, and every extracted candidate still has to exist inside `root` and
     resolve to repository-owned acceptance below. */
  for (const match of text.matchAll(/([A-Za-z0-9._-]+)\s*(?:子目录|目录|文件夹|仓库)/giu)) {
    tokens.push(match[1]);
  }
  for (const match of text.matchAll(/(?:in|inside|under|within)\s+(?:the\s+)?[`'"]?([A-Za-z0-9._-]+)[`'"]?\s+(?:subdirectory|directory|folder|repo(?:sitory)?)/giu)) {
    tokens.push(match[1]);
  }
  const candidates = new Set();
  for (const token of tokens) {
    const target = path.resolve(root, token.replaceAll("\\", path.sep));
    if (!inside(root, target)) continue;
    let current = target;
    try { if (!statSync(current).isDirectory()) current = path.dirname(current); }
    catch { current = path.dirname(current); }
    while (inside(root, current)) {
      if (existsSync(current) && discoverAcceptance(current).discovered) {
        candidates.add(path.resolve(current));
        break;
      }
      if (current === root) break;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  const resolved = [...candidates].sort();
  return resolved.length === 1
    ? { cwd: resolved[0], source: "operator-path:repository-owned-acceptance", candidates: resolved }
    : { cwd: root, source: resolved.length ? "operator-path:ambiguous-repositories"
      : "selected-workspace-root", candidates: resolved };
}

export async function waitForControllerQuiescence(runDirectory, pid, { timeoutMs = 8_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let lease = null;
    try { lease = JSON.parse(readFileSync(path.join(runDirectory,
      "controller-lease.json"), "utf8")); } catch { /* an absent lease is quiescent */ }
    if (!processExists(pid) && lease?.status !== "active") return true;
    await wait(25);
  }
  throw new Error("CONTROLLER_DID_NOT_QUIESCE_BEFORE_EVIDENCE_SEAL");
}

function recoveredRun(active, { watchdog = null, terminalResult = null } = {}) {
  if (!active?.socketPath || !active?.token || !active?.runDirectory) return null;
  return {
    runId: active.runId,
    store: { directory: active.runDirectory },
    contract: active.contract ?? null,
    socketPath: active.socketPath,
    token: active.token,
    async handleHook(payload, timeoutMs = 890_000) {
      if (terminalResult) {
        const event = eventName(payload?.input ?? payload);
        return event === "Stop" ? { decision: { verdict: "allow", reason: "terminal-reconciled" },
          output: { decision: "approve" } } : allow("terminal-reconciled");
      }
      return requestController({ socketPath: active.socketPath, token: active.token,
        payload, timeoutMs });
    },
    async finish() {
      const result = terminalResult ?? (watchdog
        ? await watchdog.finish({ requireIntervention: false, timeoutMs: 15 * 60_000 })
        : await requestController({ socketPath: active.socketPath, token: active.token,
          payload: { _outsiderControl: "finish", requireIntervention: false }, timeoutMs: 15 * 60_000 }));
      let pid = null;
      if (!watchdog && !terminalResult) try {
        const lease = JSON.parse(readFileSync(path.join(active.runDirectory, "controller-lease.json"), "utf8"));
        if (lease?.runId !== active.runId) throw new Error("RECOVERED_CONTROLLER_LEASE_IDENTITY_MISMATCH");
        pid = lease?.pid ?? null;
        if (pid > 0) process.kill(pid, "SIGTERM");
      } catch { /* the recovered host may already have stopped */ }
      try {
        if (watchdog) await watchdog.close();
        await waitForControllerQuiescence(active.runDirectory, pid);
        const evidence = finalizeStage05Evidence({ directory: active.runDirectory });
        return { ...result, evidence: { ok: true, ...evidence } };
      } catch (error) {
        return { ...result, evidence: { ok: false, error: String(error?.message ?? error) } };
      }
    },
    async close() {
      if (watchdog) await watchdog.close();
    },
  };
}

async function restartRecoveredController(active, { hookEntry, supervisorCommand }) {
  const configPath = path.join(active.runDirectory, "controller-config.json");
  if (!existsSync(configPath)) throw new Error("RECOVERED_CONTROLLER_CONFIG_MISSING");
  const terminalResult = reconcileTerminalControllerRun({ configPath });
  if (terminalResult) return recoveredRun(active, { terminalResult });
  const lease = JSON.parse(readFileSync(path.join(active.runDirectory,
    "controller-lease.json"), "utf8"));
  if (lease?.status !== "active" || lease.runId !== active.runId) {
    throw new Error("RECOVERED_CONTROLLER_LEASE_INVALID");
  }
  if (processExists(lease.pid)) {
    throw new Error("RECOVERED_CONTROLLER_UNRESPONSIVE_PROCESS_STILL_ALIVE");
  }
  const watchdog = await startControllerWatchdog({
    hostEntry: path.join(path.dirname(hookEntry), "outsider-controller-host.mjs"),
    configPath,
    socketPath: active.socketPath,
    token: active.token,
    maxRestarts: 3,
    initialReplacingOwnerId: lease.ownerId,
  });
  return recoveredRun(active, { watchdog });
}

export function attachedSupervisorCommand({ explicit = null, consent = null,
  env = process.env } = {}) {
  let configured = explicit;
  if (configured == null && env.OUTSIDER_SUPERVISOR_ARGV) {
    let parsed;
    try { parsed = JSON.parse(env.OUTSIDER_SUPERVISOR_ARGV); } catch {
      throw new Error("OUTSIDER_SUPERVISOR_ARGV_INVALID_JSON");
    }
    if (!Array.isArray(parsed) || parsed.length === 0
      || parsed.some((item) => typeof item !== "string" || item.length === 0)) {
      throw new Error("OUTSIDER_SUPERVISOR_ARGV_INVALID");
    }
    configured = parsed;
  }
  if (configured == null && env.OUTSIDER_SUPERVISOR) configured = env.OUTSIDER_SUPERVISOR;
  if (configured == null) return null;
  const allowed = consent === true || (consent == null
    && env.OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR === "1");
  return allowed ? configured : null;
}

export class AttachedDaemonController {
  constructor({ root, hookEntry, supervisorCommand = null,
    allowExternalSupervisor = null, startRun = startKernelRun,
    runStateRoot = process.env.OUTSIDER_STATE_ROOT || defaultStateRoot() } = {}) {
    if (!root || !hookEntry) throw new Error("ATTACHED_DAEMON_CONFIG_REQUIRED");
    this.root = root;
    this.hookEntry = hookEntry;
    /* No external process is implicit.  A command and a distinct consent bit
       are both required; otherwise bootstrap enters a local read-only boundary
       and never sends workspace evidence outside the controller. */
    this.supervisorCommand = attachedSupervisorCommand({ explicit: supervisorCommand,
      consent: allowExternalSupervisor });
    this.startRun = startRun;
    this.runStateRoot = runStateRoot;
    this.sessions = new Map();
    this.codexReceiptStore = new CodexLiveReceiptStore({ root });
  }

  session(agent, input) {
    const sessionKey = attachedSessionKey(input);
    if (!sessionKey) return null;
    const workspace = resolveAttachedWorkspace(agent, input);
    const requestedCwd = workspace.cwd;
    let session = this.sessions.get(sessionKey);
    if (session) {
      /* Cowork creates the host-loop metadata asynchronously.  In a real
         desktop session UserPromptSubmit can therefore arrive while the only
         visible cwd is `local_<id>/outputs`; the first PreToolUse then carries
         the selected folder after `userSelectedFolders` has appeared.  That is
         a host-authenticated identity refinement before the first action, not
         an inherited-session collision.

         Re-resolve from the original host cwd (never from an arbitrary new
         cwd), require Claude's one-folder metadata, and allow the promotion
         only at a pre-action boundary while no controller exists. */
      const priorResolution = session.ledger.value.workspaceResolution?.source;
      const promotableResolution = priorResolution === "hook-cwd"
        || priorResolution === "claude-desktop:no-user-selected-folder";
      const preActionEvent = ["SessionStart", "UserPromptSubmit", "PreToolUse"]
        .includes(eventName(input));
      const authoritative = agent === "claude-desktop" && promotableResolution
        ? resolveAttachedWorkspace(agent, {
          cwd: session.ledger.value.hostCwd ?? session.cwd,
        }) : null;
      if (!session.run && preActionEvent
        && authoritative?.source === "claude-desktop:userSelectedFolders") {
        const promotedRoot = path.resolve(authoritative.cwd);
        const priorRoot = path.resolve(session.workspaceRoot ?? session.cwd);
        if (promotedRoot !== priorRoot) {
          session.workspaceRoot = promotedRoot;
          session.cwd = promotedRoot;
          const active = session.ledger.value.active;
          const refinement = active?.ask
            ? resolvePromptWorkspace(promotedRoot, active.ask)
            : { cwd: promotedRoot, source: "selected-workspace-root", candidates: [] };
          session.cwd = path.resolve(refinement.cwd);
          session.ledger.save({
            cwd: session.cwd,
            workspaceRoot: promotedRoot,
            hostCwd: authoritative.hostCwd,
            workspaceResolution: {
              source: authoritative.source,
              metadataFile: authoritative.metadataFile,
              candidates: authoritative.candidates,
              promotedFrom: priorRoot,
              promotedAt: new Date().toISOString(),
              refinementSource: refinement.source,
              operatorPathCandidates: refinement.candidates,
              resolvedCwd: session.cwd,
            },
          });
          if (active?.ask) {
            const acceptance = discoverAcceptance(session.cwd);
            if (!this.supervisorCommand) {
              session.ledger.setActive({ ...active, status: "local-only", acceptance,
                reason: "external-supervisor-not-configured-and-consented" });
            } else if (acceptance.discovered) {
              session.bootstrapEpoch = Math.max(1, Number(session.bootstrapEpoch ?? 0));
              session.ledger.setActive({ ...active, status: "pending-bootstrap", acceptance });
              session.pendingBootstrap = { epoch: session.bootstrapEpoch, ask: active.ask };
            } else {
              session.ledger.setActive({ ...active, status: "observer-only", acceptance });
            }
          }
        }
      }
      const expectedRoot = path.resolve(session.workspaceRoot ?? session.cwd);
      if (expectedRoot !== requestedCwd) {
        session.identityConflict = { sessionKey, originalCwd: session.cwd, requestedCwd,
          detectedAt: new Date().toISOString() };
        session.ledger.recordIdentityConflict(session.identityConflict);
      }
      return session;
    }
    const ledger = new AttachedLedger({ root: this.root, sessionKey, host: agent, cwd: requestedCwd });
    ledger.save({ hostCwd: workspace.hostCwd,
      workspaceRoot: ledger.value.workspaceRoot ?? requestedCwd,
      workspaceResolution: {
      source: workspace.source,
      metadataFile: workspace.metadataFile,
      candidates: workspace.candidates ?? [requestedCwd],
    } });
    const persistedCwd = path.resolve(ledger.value.cwd || requestedCwd);
    const persistedRoot = path.resolve(ledger.value.workspaceRoot || requestedCwd);
    const identityConflict = persistedRoot !== requestedCwd || !inside(persistedRoot, persistedCwd)
      ? { sessionKey, originalCwd: persistedCwd, requestedCwd,
        detectedAt: new Date().toISOString() } : null;
    if (identityConflict) ledger.recordIdentityConflict(identityConflict);
    session = { sessionKey, agent, cwd: persistedCwd, workspaceRoot: persistedRoot,
      ledger, identityConflict,
      /* A persisted socket is only a recovery candidate. Treating it as a live
         controller before an authenticated ping made the first post-crash hook
         fail without entering ensureRecovery when daemon and controller died
         together. */
      run: null,
      needsMandate: ledger.value.active?.status === "running"
        && ledger.value.active?.mandateDelivered !== true };
    this.sessions.set(sessionKey, session);
    return session;
  }

  async bootstrap(session, ask, epoch = session.bootstrapEpoch) {
    const acceptance = discoverAcceptance(session.cwd);
    /* Disclosure authority is checked before repository capability.  An empty
       repository must not fall through to permissive observer-only merely
       because no external supervisor was configured or consented. */
    if (!this.supervisorCommand) {
      session.ledger.setActive({ status: "local-only", ask, acceptance,
        reason: "external-supervisor-not-configured-and-consented",
        startedAt: new Date().toISOString() });
      return { controlled: false, localOnly: true, acceptance };
    }
    if (!acceptance.discovered) {
      session.ledger.setActive({ status: "observer-only", ask, acceptance,
        startedAt: new Date().toISOString() });
      return { controlled: false, acceptance };
    }
    const stateRoot = this.runStateRoot;
    const run = await this.startRun({
      cwd: session.cwd,
      ask,
      acceptance: acceptance.command,
      supervisorCommand: this.supervisorCommand,
      hookEntry: this.hookEntry,
      stateRoot,
      host: session.agent,
      attachedMode: true,
      workspaceIdentity: {
        hostCwd: session.ledger.value.hostCwd ?? session.cwd,
        workspaceRoot: session.workspaceRoot ?? session.cwd,
        resolutionSource: session.ledger.value.workspaceResolution?.source ?? "hook-cwd",
        refinementSource: session.ledger.value.workspaceResolution?.refinementSource ?? null,
        metadataFile: session.ledger.value.workspaceResolution?.metadataFile ?? null,
        /* Cowork metadata does not expose the sandbox mount. Keep the absence
           explicit so no model or adapter can promote a guessed alias. */
        sandboxPathAlias: { status: "not-asserted", aliases: [] },
      },
      maxBudgetUsd: null,
      controllerOptions: {
        maxSupervisorCalls: 24,
        semanticPatrolEvery: 96,
        semanticPatrolMinEvidenceSteps: 6,
        maxControllerRestarts: 3,
      },
    });
    if (epoch !== session.bootstrapEpoch) {
      try { await run.supersede?.("newer-operator-revision"); } catch { /* stale run is never used */ }
      return { controlled: false, stale: true, acceptance };
    }
    session.run = run;
    session.needsMandate = true;
    session.ledger.setActive({
      status: "running",
      runId: run.runId,
      runDirectory: run.store.directory,
      socketPath: run.socketPath,
      token: run.token,
      contract: run.contract,
      ask,
      acceptance,
      mandateDelivered: false,
      startedAt: new Date().toISOString(),
    });
    return { controlled: true, acceptance, run };
  }

  recordBootstrapFailure(session, ask, error) {
    const prior = session.ledger.value.active;
    const attempts = prior?.status === "bootstrap-failed" && prior.ask === ask
      ? Number(prior.bootstrapAttempts ?? 0) + 1 : 1;
    const retryDelayMs = Math.min(BOOTSTRAP_RETRY_MAX_MS,
      BOOTSTRAP_RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
    session.ledger.setActive({
      status: "bootstrap-failed",
      ask,
      acceptance: prior?.acceptance ?? discoverAcceptance(session.cwd),
      error: String(error?.message ?? error),
      bootstrapAttempts: attempts,
      retryAt: new Date(Date.now() + retryDelayMs).toISOString(),
      startedAt: prior?.startedAt ?? new Date().toISOString(),
    });
  }

  markCodexTerminalRepair(session, { reason, final = null } = {}) {
    const active = session.ledger.value.active ?? {};
    const previous = active.codexTerminalRepair ?? null;
    const repair = {
      generation: Number(previous?.generation ?? 0) + 1,
      maximumGenerations: MAX_CODEX_TERMINAL_REPAIR_GENERATIONS,
      priorRunId: session.run?.runId ?? active.runId ?? null,
      requiredAt: new Date().toISOString(),
      reason: String(reason ?? "Codex terminal verification was incomplete"),
      proofErrors: Array.isArray(final?.proof?.errors) ? final.proof.errors.slice(0, 12) : [],
      rearmed: false,
      rearmAttempts: 0,
      actionAuthorized: false,
      actionObserved: false,
    };
    /* `finish()` has terminalized the physical controller generation, but the
       operator contract remains active. Keep the logical run reference and
       durable active record until a replacement generation is armed at the
       first repair action. An unchanged Stop therefore cannot fall through an
       empty-run/idempotent branch and become falsely green. */
    session.ledger.setActive({ ...active, status: "running", codexTerminalRepair: repair });
    return repair;
  }

  updateCodexTerminalRepair(session, patch = {}) {
    const active = session.ledger.value.active;
    const repair = active?.codexTerminalRepair;
    if (!active || !repair) return null;
    const next = { ...repair, ...patch };
    session.ledger.setActive({ ...active, codexTerminalRepair: next });
    return next;
  }

  async rearmCodexTerminalRepair(session) {
    const active = session.ledger.value.active;
    const repair = active?.codexTerminalRepair;
    if (!active?.ask || !repair) return { ok: false, error: "REPAIR_CONTRACT_MISSING" };
    if (repair.rearmed === true) return { ok: true };
    if (Number(repair.generation) > MAX_CODEX_TERMINAL_REPAIR_GENERATIONS) {
      return { ok: false, error: "REPAIR_GENERATION_BUDGET_EXHAUSTED" };
    }
    const attempt = Number(repair.rearmAttempts ?? 0) + 1;
    if (attempt > MAX_CODEX_REPAIR_REARM_ATTEMPTS) {
      return { ok: false, error: "REPAIR_REARM_BUDGET_EXHAUSTED" };
    }
    const terminalRun = session.run;
    try {
      /* A thrown finish can leave its controller generation alive. Fence that
         physical authority before creating the replacement; retain the
         logical reference until bootstrap succeeds so no hook can observe an
         empty/open-loop state. */
      try {
        if (typeof terminalRun?.supersede === "function") {
          await terminalRun.supersede("codex-terminal-repair-rearm");
        } else await terminalRun?.rpc?.close?.();
      } catch {
        try { await terminalRun?.rpc?.close?.(); } catch { /* already terminal */ }
      }
      const started = await this.bootstrap(session, active.ask, session.bootstrapEpoch);
      if (!started?.controlled || !session.run || session.run === terminalRun) {
        throw new Error("REPAIR_CONTROLLER_NOT_REARMED");
      }
      const running = session.ledger.value.active;
      session.ledger.setActive({ ...running, codexTerminalRepair: {
        ...repair,
        rearmed: true,
        rearmAttempts: attempt,
        replacementRunId: session.run.runId ?? running?.runId ?? null,
        rearmedAt: new Date().toISOString(),
      } });
      return { ok: true };
    } catch (error) {
      /* Keep the terminal logical run and active contract visible. A failed
         rearm may be retried only at another explicit PreToolUse boundary and
         is itself bounded; it never authorizes the pending action. */
      session.run = terminalRun;
      session.ledger.setActive({ ...active, codexTerminalRepair: {
        ...repair,
        rearmAttempts: attempt,
        lastRearmError: String(error?.message ?? error),
        lastRearmFailedAt: new Date().toISOString(),
      } });
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  async onPrompt(session, input) {
    const prompt = attachedPrompt(input);
    if (!prompt) return promptContext("Outsider 没有收到可冻结的操作方原话；本轮不会声称受控交付。");
    if (!session.run && !session.ledger.value.active
      && session.ledger.value.revisions.length === 0) {
      const refinement = resolvePromptWorkspace(session.workspaceRoot ?? session.cwd, prompt);
      if (path.resolve(refinement.cwd) !== path.resolve(session.cwd)) {
        session.cwd = path.resolve(refinement.cwd);
        session.ledger.save({ cwd: session.cwd, workspaceResolution: {
          ...(session.ledger.value.workspaceResolution ?? {}),
          refinementSource: refinement.source,
          operatorPathCandidates: refinement.candidates,
          resolvedCwd: session.cwd,
        } });
      }
    }
    const revision = session.ledger.addPrompt(prompt);
    /* Disclosure is once per operator task, not once per daemon lifetime.  A
       later prompt in the same Cowork session must not inherit the silence of
       an earlier observer-only task. */
    session.observerNoticeDelivered = false;
    session.bootstrapEpoch = Number(session.bootstrapEpoch ?? 0) + 1;
    const epoch = session.bootstrapEpoch;
    if (revision.continuing && session.run) {
      try {
        if (typeof session.run.supersede === "function") await session.run.supersede();
        else await requestController({ socketPath: session.run.socketPath, token: session.run.token,
          payload: { _outsiderControl: "supersede", reason: "operator-contract-amended" },
          timeoutMs: 10_000 });
      } catch { /* the new sealed run is authoritative even if the old host died */ }
      session.ledger.completeActive("superseded", { supersededByRevision: revision.entry.revision });
      session.run = null;
    }
    if (!this.supervisorCommand) {
      const acceptance = discoverAcceptance(session.cwd);
      session.ledger.setActive({ status: "local-only", ask: revision.combinedPrompt,
        acceptance, reason: "external-supervisor-not-configured-and-consented",
        startedAt: new Date().toISOString() });
      return promptContext(LOCAL_ONLY_CONTEXT);
    }
    const acceptance = discoverAcceptance(session.cwd);
    if (!acceptance.discovered) {
      session.ledger.setActive({ status: "observer-only", ask: revision.combinedPrompt,
        acceptance, startedAt: new Date().toISOString() });
      return promptContext("Outsider 已附着，但仓库没有可冻结的验收命令；当前仅有安全观察，"
        + "不能声称 Stage 0.5 因果证明完成。可在 .outsider.json 配置 acceptance。");
    }
    session.ledger.setActive({ status: "pending-bootstrap", ask: revision.combinedPrompt,
      acceptance, startedAt: new Date().toISOString() });
    /* A read-only chat pays no acceptance/model cost.  The first actual tool
       boundary performs this bootstrap synchronously before the action, so the
       baseline and contract still precede every world mutation. */
    session.pendingBootstrap = { epoch, ask: revision.combinedPrompt };
    return allow("contract will freeze at the first tool boundary");
  }

  async ensureRecovery(session) {
    if (session.pendingBootstrap) {
      const pending = session.pendingBootstrap;
      session.pendingBootstrap = null;
      if (pending.epoch !== session.bootstrapEpoch) return;
      session.ledger.setActive({ ...session.ledger.value.active, status: "bootstrapping" });
      try { await this.bootstrap(session, pending.ask, pending.epoch); }
      catch (error) {
        this.recordBootstrapFailure(session, pending.ask, error);
        return;
      }
    }
    const active = session.ledger.value.active;
    if (session.run || !active?.ask
      || ["observer-only", "local-only"].includes(active.status)) return;
    if (active.status === "bootstrap-failed"
      && Date.now() < Date.parse(active.retryAt ?? 0)) return;
    /* A daemon may die while its controller host survives. Prefer reconnecting
       to the sealed run; if that boundary is gone, create a new run from the
       same operator ledger and current baseline, never silently run open-loop. */
    const recovered = recoveredRun(active);
    if (recovered) {
      try {
        await requestController({ socketPath: recovered.socketPath, token: recovered.token,
          payload: { _outsiderControl: "ping" }, timeoutMs: 2_000 });
        session.run = recovered;
        return;
      } catch {
        try {
          session.run = await restartRecoveredController(active, {
            hookEntry: this.hookEntry, supervisorCommand: this.supervisorCommand,
          });
          session.ledger.setActive({ ...active, status: "running",
            controllerRecoveredAfterDaemonRestart: true });
          return;
        } catch (error) {
          /* Never silently bootstrap a second run while the exact prior run
             still owns a live controller pid. That would fork one operator
             claim into two authorities. A dead, unrecoverable generation may
             rebootstrap only through the explicit failure path below. */
          if (/PROCESS_STILL_ALIVE/.test(String(error?.message ?? error))) {
            this.recordBootstrapFailure(session, active.ask, error);
            return;
          }
          this.recordBootstrapFailure(session, active.ask,
            new Error(`EXISTING_RUN_RECOVERY_FAILED:${error?.message ?? error}`));
          return;
        }
      }
    }
    try { await this.bootstrap(session, active.ask); }
    catch (error) { this.recordBootstrapFailure(session, active.ask, error); }
  }

  async handleHookCore({ agent = "claude-code", input = {}, strict = false,
    [ACTUAL_CONTROLLER_ROUTE]: actualRoute = null } = {}) {
    if (input?._outsiderAttachedPing) return allow("attached daemon ready");
    const event = eventName(input);
    if (agent === "codex" && !CODEX_HOOK_EVENTS.has(event)) {
      throw new Error(`UNSUPPORTED_HOOK_EVENT:${event || "missing"}`);
    }
    const session = this.session(agent, input);
    if (!session) {
      const reason = "宿主没有提供 session_id 或 transcript_path；Outsider 无法隔离并发会话。";
      return event === "Stop" || event === "SubagentStop" ? stopBlock(reason)
        : event === "PreToolUse" ? preToolBlock(reason) : allow(reason);
    }
    if (session.identityConflict) {
      const reason = "同一个宿主 session identity 出现在不同 cwd；Outsider 拒绝合并两条任务轨迹。"
        + ` 原 cwd=${session.identityConflict.originalCwd}，新 cwd=${session.identityConflict.requestedCwd}。`
        + " 请启动新的 Claude 会话，或清除被错误继承的 CLAUDE_CODE_SESSION_ID。";
      return event === "Stop" || event === "SubagentStop" ? stopBlock(reason)
        : event === "PreToolUse" ? preToolBlock(reason)
          : event === "UserPromptSubmit" ? promptContext(reason)
            : { decision: { verdict: "deny", corrective: reason },
              output: { _outsiderStderr: reason } };
    }
    if (event === "SessionStart") return allow("attached session registered");
    if (event === "UserPromptSubmit") return this.onPrompt(session, input);
    if (event === "PreCompact") {
      session.ledger.save({ lastCompactionAt: new Date().toISOString() });
      return allow("contract ledger persisted before compaction");
    }
    if (event === "PostCompact") {
      session.ledger.save({ lastCompactionCompletedAt: new Date().toISOString() });
      return allow("post-compaction lifecycle recorded");
    }
    if (event === "PermissionRequest") {
      session.ledger.save({ lastPermissionRequestAt: new Date().toISOString() });
      return { decision: { verdict: "defer",
        reason: "native permission decision remains with the host and operator" }, output: {} };
    }
    if (event === "SessionEnd") {
      if (session.run) {
        try { await session.run.supersede?.("host-session-ended-without-complete-stop"); }
        catch { try { await session.run.rpc?.close?.(); } catch { /* already gone */ } }
        session.ledger.completeActive("incomplete", {
          reason: "host-session-ended-without-complete-stop",
        });
        session.run = null;
      }
      session.ledger.save({ sessionEndedAt: new Date().toISOString() });
      return allow("session end recorded");
    }
    let terminalRepair = agent === "codex"
      ? session.ledger.value.active?.codexTerminalRepair ?? null : null;
    if (terminalRepair && event === "Stop"
      && (terminalRepair.rearmed !== true || terminalRepair.actionObserved !== true)) {
      return stopBlock("Codex 上一次最终验收仍为红；未观察到受控修复动作和结果，"
        + "原样重试 Stop 已拒绝。请先执行最小修复，再重新验收。");
    }
    if (terminalRepair && event === "PreToolUse" && terminalRepair.rearmed !== true) {
      const rearmed = await this.rearmCodexTerminalRepair(session);
      if (!rearmed.ok) {
        return preToolBlock(`Codex repair controller 未能安全重启：${rearmed.error}。`
          + "当前动作未执行；修复预算耗尽时必须提交新的操作方任务。");
      }
      terminalRepair = session.ledger.value.active?.codexTerminalRepair ?? terminalRepair;
    }
    await this.ensureRecovery(session);
    const active = session.ledger.value.active;
    if (!session.run) {
      if (event === "Stop" && !active) {
        const completed = session.ledger.value.completedRuns?.at(-1) ?? null;
        if (completed) {
          if (completed.status === "complete") {
            return terminalStop("idempotent-safe-delivery",
              "本轮已完成独立验收和因果证明；重复 Stop 已幂等放行。");
          }
          if (completed.status === "delivered-unattributed") {
            return terminalStop("idempotent-verified-delivery-unattributed",
              "交付物已独立验证为正确，但 Outsider 未证明自己导致了修复；重复 Stop 已幂等放行。");
          }
          if (completed.status === "read-only-unverified") {
            return terminalStop("idempotent-read-only-unverified",
              completed.terminalReason === "external-supervisor-not-configured-and-consented"
                ? LOCAL_ONLY_TERMINAL : BOOTSTRAP_FAILED_READ_ONLY_TERMINAL);
          }
          return terminalStop("idempotent-conservative-stop",
            "本轮已终止，但没有形成安全交付证明。请把它视为保守停机，而不是完成。");
        }
      }
      /* Observer-only must remain transparent.  Returning the legacy detector's
         `defer` here hands the decision back to a permission UI that has nobody
         to answer during an unattended Cowork run; the worker stops at its
         first tool call.  No controlled contract means no authority to block. */
      if (active?.status === "observer-only") {
        if (event === "PreToolUse") {
          const response = preToolAllow("observer-only: no repository-owned acceptance");
          /* UserPromptSubmit additionalContext is advisory model context, not a
             durable user-visible product state. Repeat the disclosure at the
             first real action so a hosted surface that drops prompt context
             cannot silently look controlled. Keep later calls transparent. */
          if (!session.observerNoticeDelivered) {
            response.output.hookSpecificOutput.additionalContext = OBSERVER_ONLY_CONTEXT;
            session.observerNoticeDelivered = true;
          }
          return response;
        }
        if (event === "Stop") {
          /* Approve rather than defer/block: observer-only has no control
             authority. systemMessage is the host's explicit terminal surface,
             so the user sees that this was not an Outsider-proven delivery. */
          return terminalStop("observer-only", OBSERVER_ONLY_TERMINAL);
        }
        return allow("observer-only: lifecycle recorded without control authority");
      }
      if (active?.status === "local-only") {
        if (event === "PreToolUse" && isDiagnosticRead(input)) {
          const response = preToolAllow("local-only: diagnostic read only");
          if (!session.degradedNoticeDelivered) {
            response.output.hookSpecificOutput.additionalContext = LOCAL_ONLY_CONTEXT;
            session.degradedNoticeDelivered = true;
          }
          return response;
        }
        if (event === "Stop") {
          session.ledger.completeActive("read-only-unverified", {
            proofComplete: false, deliveryComplete: false, evidenceComplete: false,
            terminalReason: "external-supervisor-not-configured-and-consented",
          });
          return terminalStop("local-only-no-external", LOCAL_ONLY_TERMINAL);
        }
        if (event === "PreToolUse") {
          return preToolBlock("Outsider local-only/no-external 模式仅允许只读诊断；"
            + "外部 supervisor 未同时配置并获得明确同意，潜在世界变更已 fail-closed。");
        }
        return allow("local-only: lifecycle recorded without external disclosure");
      }
      if (active?.status === "bootstrap-failed" && event === "PreToolUse"
        && isDiagnosticRead(input)) {
        const reason = `Outsider 启动预检暂时失败：${active.error}。`
          + ` 当前仅允许只读诊断工具；将在 ${active.retryAt ?? "下一边界"} 自动重试，`
          + "不会把本轮冒充成受控交付。";
        const response = preToolAllow("bootstrap-failed: diagnostic read only");
        if (!session.degradedNoticeDelivered) {
          response.output.hookSpecificOutput.additionalContext = reason;
          session.degradedNoticeDelivered = true;
        }
        return response;
      }
      /* A missing local test runner must not turn an otherwise harmless review
         into an unrecoverable Stop wall.  During bootstrap failure every
         mutating PreToolUse is denied above/below and only the explicit reader
         tool allow-list can execute, so releasing Stop cannot authorize a world
         change.  Keep the result outside every Stage 0.5 delivery bucket and
         disclose the exact boundary instead of pretending the review was
         independently accepted. */
      if (active?.status === "bootstrap-failed" && event === "Stop") {
        session.ledger.completeActive("read-only-unverified", {
          proofComplete: false,
          deliveryComplete: false,
          evidenceComplete: false,
          terminalReason: "acceptance-preflight-unavailable-read-only-fallback",
        });
        return terminalStop("read-only-unverified", BOOTSTRAP_FAILED_READ_ONLY_TERMINAL);
      }
      const reason = `Outsider attach 未进入受控模式：${active?.error ?? "没有冻结合同"}`;
      return event === "Stop" || event === "SubagentStop" ? stopBlock(reason)
        : event === "PreToolUse" ? preToolBlock(reason) : allow(reason);
    }
    let response;
    /* Codex uses the same native decision envelopes, but its trajectory is a
       different JSONL dialect. Select its measured parser without sending the
       Claude Desktop transport label into a kernel that correctly treats
       Cowork/Desktop trajectories as Claude-shaped. */
    try {
      if (actualRoute) actualRoute.kernelControllerInvoked = true;
      response = await session.run.handleHook({
      agent: kernelAgentForAttachedHost(session.agent), input, strict,
      });
    }
    catch (error) {
      if (/^UNSUPPORTED_HOOK_EVENT:/.test(String(error?.message ?? error))) throw error;
      const reason = `Outsider controller 不可用：${error?.message ?? error}`;
      return event === "Stop" || event === "SubagentStop" ? stopBlock(reason)
        : event === "PreToolUse" ? preToolBlock(reason) : allow(reason);
    }
    if (event === "PreToolUse" && session.needsMandate) {
      const baseline = session.run.store.readJson?.("baseline.json")
        ?? (() => { try { return JSON.parse(readFileSync(path.join(session.run.store.directory,
          "baseline.json"), "utf8")); } catch { return null; } })();
      const mandate = workerMandate({ contract: session.run.contract, baseline, attachedMode: true });
      response.output = response.output ?? {};
      const prior = response.output.hookSpecificOutput ?? {};
      response.output.hookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: prior.permissionDecision ?? "allow",
        ...prior,
        additionalContext: [mandate, prior.additionalContext].filter(Boolean).join("\n\n"),
      };
      session.needsMandate = false;
      session.ledger.setActive({ ...session.ledger.value.active, mandateDelivered: true });
    }
    if (session.agent === "codex" && session.ledger.value.active?.codexTerminalRepair) {
      if (event === "PreToolUse"
        && response?.output?.hookSpecificOutput?.permissionDecision === "allow") {
        this.updateCodexTerminalRepair(session, {
          actionAuthorized: true,
          actionAuthorizedAt: new Date().toISOString(),
        });
      } else if (event === "PostToolUse"
        && session.ledger.value.active.codexTerminalRepair.actionAuthorized === true) {
        this.updateCodexTerminalRepair(session, {
          actionObserved: true,
          actionObservedAt: new Date().toISOString(),
        });
      }
    }
    if (event === "Stop" && response?.output?.decision !== "block") {
      let final;
      try { final = await session.run.finish(); } catch (error) {
        if (session.agent === "codex") {
          this.markCodexTerminalRepair(session, {
            reason: `finalization-error:${error?.message ?? error}`,
          });
          return stopBlock(`最终证明失败：${error?.message ?? error}。本次 Codex Stop 已拒绝，`
            + "active contract 已保留，只有完成受控修复并重新验收转绿后才能结束。");
        }
        session.ledger.completeActive("incomplete", { error: String(error?.message ?? error) });
        session.run = null;
        return terminalStop("conservative-stop",
          `最终证明失败：${error?.message ?? error}。controller 已终态，本轮不会伪称交付，也不会形成永久 Stop 墙。`);
      }
      const evidenceComplete = session.agent === "codex"
        ? final?.evidence?.ok === true : final.evidence == null || final.evidence.ok === true;
      const complete = final?.proof?.complete === true && evidenceComplete;
      /* Outcome correctness and causal attribution are separate claims. When
         final mechanical acceptance, semantic verification and PASS audit all
         succeeded, validateCausalProof reports deliveryComplete even if an
         earlier unaudited rework means Outsider cannot claim it caused the
         repair. Release that correct result, but persist a distinct terminal
         status and never label it Stage 0.5 causal proof. */
      const deliveryComplete = complete || (final?.proof?.deliveryComplete === true
        && final?.acceptance?.passed === true && evidenceComplete);
      if (session.agent === "codex" && !deliveryComplete) {
        this.markCodexTerminalRepair(session, {
          reason: "acceptance-semantic-or-evidence-incomplete",
          final,
        });
        return stopBlock("Codex 最终机械验收、语义结果、因果证明或证据封存不完整；"
          + "本次 Stop 已拒绝，active contract 已保留。请执行受控修复后重新验收。");
      }
      const terminalStatus = complete ? "complete"
        : deliveryComplete ? "delivered-unattributed" : "incomplete";
      session.ledger.completeActive(terminalStatus, {
        proofComplete: Boolean(final?.proof?.complete),
        deliveryComplete,
        evidenceComplete: final?.evidence?.ok ?? null,
      });
      session.run = null;
      if (complete) return response;
      if (deliveryComplete) {
        return terminalStop("verified-delivery-unattributed",
          "交付物已独立验证为正确（冻结机械验收、独立语义验收和 PASS 审计均通过）；但本轮缺少完整 correction→observed→effect 因果链，不能计为 Stage 0.5 闭环成功。");
      }
      return terminalStop("conservative-stop",
        "独立验收或结果证明不完整。本轮已终止为红，不得视为交付；controller 已终态，因此不再无执行器地阻塞 Stop。");
    }
    return response;
  }

  async handleHook(payload = {}) {
    const { agent = "claude-code", input = {} } = payload;
    if (agent === "codex" && !input?._outsiderAttachedPing
      && !CODEX_HOOK_EVENTS.has(eventName(input))) {
      throw new Error(`UNSUPPORTED_HOOK_EVENT:${eventName(input) || "missing"}`);
    }
    if (agent !== "codex" || input?._outsiderAttachedPing) {
      return this.handleHookCore(payload);
    }
    const actualRoute = { kernelControllerInvoked: false };
    const controllerResult = await this.handleHookCore({
      ...payload,
      [ACTUAL_CONTROLLER_ROUTE]: actualRoute,
    });
    const event = eventName(input);
    let nativeResult = controllerResult;
    /* Codex's current command-hook runtime rejects `permissionDecision:allow`;
       an allowed PreToolUse is represented by no decision at all. Keep only
       additionalContext when the first controlled boundary carries the frozen
       mandate. Likewise, Stop/SubagentStop continues on an empty object;
       `approve` is the Claude envelope and is invalid on the Codex transport.
       Preserve the canonical controller result until after its signed receipt
       is recorded; only the returned native envelope is projected. */
    if (event === "PreToolUse"
      && controllerResult?.output?.hookSpecificOutput?.permissionDecision === "allow") {
      const additionalContext = controllerResult.output.hookSpecificOutput.additionalContext;
      const { hookSpecificOutput: _allow, ...output } = controllerResult.output;
      nativeResult = { ...controllerResult, output: {
        ...output,
        ...(typeof additionalContext === "string" && additionalContext
          ? { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext } } : {}),
      } };
    }
    if (["Stop", "SubagentStop"].includes(event)
      && controllerResult?.output?.decision === "approve") {
      const { decision: _approve, ...output } = controllerResult.output;
      nativeResult = { ...controllerResult, output };
    }
    const after = this.session(agent, input);
    const serialized = JSON.stringify(controllerResult);
    const controllerFailure = /controller 不可用|attach 未进入受控模式|启动预检暂时失败/.test(serialized);
    const failClosed = controllerFailure
      && (controllerResult?.output?.decision === "block"
        || controllerResult?.output?.hookSpecificOutput?.permissionDecision === "deny");
    const controllerPath = actualRoute.kernelControllerInvoked ? "KERNEL_CONTROLLER"
      : failClosed ? "ATTACHED_FAIL_CLOSED"
      : controllerFailure ? "ATTACHED_FAIL_VISIBLE"
        : "ATTACHED_POLICY";
    try {
      const persisted = this.codexReceiptStore.record({ input, result: controllerResult,
        runtime: { ...(payload.codexRuntime ?? {}) }, controllerPath,
        controllerAvailable: !controllerFailure });
      after?.ledger?.save({ codexControllerReceiptHead: {
        receiptHash: persisted.receipt.receiptHash,
        sourceHash: persisted.source.sourceHash,
        controllerKeyId: persisted.controllerKeyId,
        signingKeySource: persisted.signingKeySource,
        recordedAt: persisted.receipt.recordedAt,
      } });
      return nativeResult;
    } catch (error) {
      const reason = `Outsider Codex controller receipt 未能安全持久化：${error?.message ?? error}`;
      if (event === "PreToolUse") return preToolBlock(reason);
      if (event === "Stop" || event === "SubagentStop") return stopBlock(reason);
      throw new Error(`CODEX_CONTROLLER_RECEIPT_PERSIST_FAILED:${error?.message ?? error}`);
    }
  }

  async close() {
    await Promise.all([...this.sessions.values()].map(async (session) => {
      try {
        if (typeof session.run?.close === "function") await session.run.close();
        else await session.run?.rpc?.close?.();
      } catch { /* process may be gone */ }
    }));
  }
}
