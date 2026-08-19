import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { freezeContract } from "./outsider-work-contract.js";
import {
  auditSemanticContract, compileSemanticContract, losslessOperatorContract,
} from "./outsider-contract-compiler.js";
import { runAcceptance } from "./outsider-kernel-controller.js";
import { verifyOutcome } from "./outsider-outcome-verifier.js";
import { auditOutcomeApproval } from "./outsider-semantic-audit.js";
import { diffSnapshots, RunStore, snapshotWorkspace } from "./outsider-kernel-store.js";
import {
  controllerSocketPath, createControllerToken, requestController,
} from "./outsider-controller-rpc.js";
import { startControllerWatchdog } from "./outsider-controller-watchdog.js";
import {
  createStage05ControlledWayBinding, finalizeStage05Evidence,
} from "./outsider-stage05-evidence.js";

const DEFAULT_PTY_BRIDGE = fileURLToPath(
  new URL("../scripts/outsider-pty-worker.exp", import.meta.url));

export function controlledWorkerSettings(hookEntry) {
  const node = `"${String(process.execPath).replaceAll('"', '\\"')}"`;
  const command = `${node} "${hookEntry}" claude-code`;
  /* Acceptance (up to 10m) plus a fresh supervisor call (up to 4m) happens
     while the host is safely blocked at the hook boundary. Keep the host and
     RPC budgets longer than that combined bound. */
  /* Omitting matcher is the documented wildcard for every lifecycle event.
     An empty-string matcher is not a portable wildcard across Claude versions. */
  const hook = [{ hooks: [{ type: "command", command, timeout: 900 }] }];
  return { hooks: {
    PreToolUse: hook,
    PostToolUse: hook,
    SubagentStart: hook,
    Stop: hook,
    SubagentStop: hook,
    TaskCreated: hook,
    TaskCompleted: hook,
    TeammateIdle: hook,
  } };
}

export function resolveClaudeExecutable(explicit = null) {
  if (explicit) return explicit;
  if (process.env.OUTSIDER_WORKER) return process.env.OUTSIDER_WORKER;
  const root = path.join(homedir(), "Library", "Application Support", "Claude", "claude-code");
  try {
    const versions = readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(root, version, "claude.app", "Contents", "MacOS", "claude");
      if (existsSync(candidate)) return candidate;
    }
  } catch { /* terminal installs use PATH */ }
  return "claude";
}

export function resolveSupervisorCommand(command, claudeExecutable) {
  if (!command) return command;
  const isolationArgs = [
    "--setting-sources", "",
    "--tools", "",
    "--allowed-tools", "",
    "--permission-mode", "dontAsk",
    "--strict-mcp-config",
    "--mcp-config", '{"mcpServers":{}}',
    "--disable-slash-commands",
    "--no-chrome",
    "--no-session-persistence",
  ];
  if (Array.isArray(command)) {
    const executable = String(command[0] ?? "");
    if (!/(?:^|[/\\])claude(?:\.exe)?$/i.test(executable)) return command;
    return [...command, ...isolationArgs];
  }
  const value = String(command);
  const resolved = /^claude(?:\s|$)/.test(value)
    ? `"${String(claudeExecutable).replaceAll('"', '\\"')}"${value.slice("claude".length)}`
    : value;
  /* A diagnosing model needs only the bounded evidence packet. Loading memory,
     project hooks or tools reintroduces the worker's environment and lets a
     supposed judge mutate/read beyond the evidence boundary. */
  if (!/(?:^|[/"'])claude(?:["']|\s|$)/.test(resolved)) return resolved;
  return `${resolved} --setting-sources "" --tools "" --allowed-tools ""`
    + ` --permission-mode dontAsk --strict-mcp-config --mcp-config '{"mcpServers":{}}'`
    + " --disable-slash-commands --no-chrome --no-session-persistence";
}

export function workerMandate({ contract, baseline, attachedMode = false }) {
  const instructionPattern = /(^|[/\\])(?:CLAUDE(?:\.local)?\.md|AGENTS\.md|\.claude[/\\]rules[/\\][^/]+\.md)$/i;
  const projectInstructions = Object.entries(baseline?.files ?? {})
    .filter(([name, value]) => value.text != null && instructionPattern.test(name))
    .slice(0, 30)
    .map(([name, value]) => `\n### ${name}\n${String(value.text).slice(0, 8000)}`)
    .join("\n");
  return (`# Outsider controlled worker mandate\n\n`
    + (attachedMode
      ? `This mandate was frozen at the first synchronous tool boundary, before any tool action executed. The worker may not redefine it.\n\n`
      : `This mandate was frozen before the worker started. The worker may not redefine it.\n\n`)
    + `Contract seal: ${contract.seal}\n\n`
    + `Operator words (verbatim):\n${contract.ask}\n\n`
    + `Compiled semantic contract:\n${JSON.stringify(contract.semantic, null, 2)}\n\n`
    + `Frozen execution budget:\n${JSON.stringify(contract.budget, null, 2)}\n\n`
    + `Execution rules:\n`
    + `- Continue autonomously; do not wait for a human permission click.\n`
    + `- A green command is not enough: satisfy the semantic and architectural contract.\n`
    + `- When an Outsider hook blocks a step, follow the independent correction plan in the reason.\n`
    + `- Do not edit tests or weaken acceptance merely to manufacture a pass.\n`
    + (projectInstructions ? `\nFrozen project instructions:\n${projectInstructions}\n` : ""))
    .slice(0, 48_000);
}

export function preflightWorkerCli(executable, { run = spawnSync } = {}) {
  const result = run(executable, ["--help"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
  });
  if (result.error || result.status !== 0) {
    return { ok: false, error: result.error?.message ?? `help exited ${result.status}` };
  }
  const help = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const required = ["--print", "--settings", "--setting-sources", "--append-system-prompt",
    "--permission-mode", "--max-budget-usd", "--tools", "--allowed-tools", "--strict-mcp-config"];
  const missing = required.filter((flag) => !help.includes(flag));
  if (missing.length) return { ok: false, error: `missing CLI flags: ${missing.join(", ")}` };
  /* --help proves protocol shape, not that an overnight run can make its first
     model call. Authentication is a zero-model conformance check; discover a
     logged-out host before baseline work or contract compilation, never after
     the run has been presented as started. */
  const auth = run(executable, ["auth", "status"], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
  });
  let status = null;
  try {
    status = JSON.parse(`${auth.stdout ?? ""}${auth.stderr ?? ""}`.trim());
  } catch { /* handled as an unsupported/unreliable auth surface below */ }
  if (auth.error) return { ok: false, error: `auth status failed: ${auth.error.message}` };
  if (status?.loggedIn !== true) {
    const detail = status?.loggedIn === false ? "not logged in"
      : `unreadable auth status (exit ${auth.status ?? "unknown"})`;
    return { ok: false, error: `${detail}; run claude /login or claude setup-token` };
  }
  return { ok: true };
}

export function controlledWorkerLaunchPlan({
  executable,
  prompt,
  settingsPath,
  mandate,
  maxBudgetUsd = null,
  disallowedTools = [],
  workerTransport = "headless",
  ptyWrapperExecutable = "/usr/bin/expect",
  ptyWrapperScript = DEFAULT_PTY_BRIDGE,
} = {}) {
  if (!["headless", "interactive-pty"].includes(workerTransport)) {
    throw new Error(`KERNEL_WORKER_TRANSPORT_UNSUPPORTED:${workerTransport}`);
  }
  const commonArgs = [
    "--settings", settingsPath,
    "--setting-sources", "",
    "--append-system-prompt", mandate,
    "--disable-slash-commands",
    "--no-chrome",
    "--permission-mode", "acceptEdits",
  ];
  if (!Array.isArray(disallowedTools)
    || disallowedTools.some((tool) => typeof tool !== "string" || !tool.trim())) {
    throw new Error("KERNEL_WORKER_DISALLOWED_TOOLS_INVALID");
  }
  /* Claude's tools options are variadic.  Passing each denied tool as a
     separate argv and then placing the interactive positional prompt after
     them makes the CLI consume the whole prompt as more tool names.  Keep the
     option to one comma-delimited argv and put the positional prompt before
     all options so host parsing cannot swallow it. */
  if (disallowedTools.length) commonArgs.push("--disallowed-tools", disallowedTools.join(","));
  const args = workerTransport === "interactive-pty"
    ? [prompt, ...commonArgs]
    : ["-p", prompt, ...commonArgs];
  if (maxBudgetUsd != null && workerTransport === "headless") {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }
  return workerTransport === "interactive-pty"
    ? { executable: ptyWrapperExecutable,
      args: [ptyWrapperScript, executable, ...args],
      claudeExecutable: executable, claudeArgs: args, stdio: ["pipe", "pipe", "pipe"] }
    : { executable, args, claudeExecutable: executable, claudeArgs: args,
      stdio: ["ignore", "pipe", "pipe"] };
}

/* A controlled worker must start a new host identity. Nested launches from a
   Claude/Cowork session can otherwise inherit the parent's session or team
   identity and collapse unrelated workspaces into one Outsider run. Keep
   authentication and ordinary host configuration, but remove only identity
   and prompt lineage that belongs to the parent process. */
export function isolatedWorkerEnvironment(base = process.env) {
  const environment = { ...base };
  for (const name of [
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_PARENT_SESSION_ID",
    "CLAUDE_CODE_AGENT_ID",
    "CLAUDE_CODE_PARENT_AGENT_ID",
    "CLAUDE_CODE_TEAM_NAME",
    "CLAUDE_CODE_TEAMMATE_NAME",
    "CLAUDE_CODE_TASK_LIST_ID",
    "CLAUDE_CODE_INITIAL_PROMPT",
    "CLAUDE_CODE_PROMPT",
  ]) delete environment[name];
  return environment;
}

export async function startKernelRun({
  runId = null,
  cwd,
  ask,
  acceptance,
  supervisorCommand,
  hookEntry,
  stateRoot,
  workerPrompt = null,
  workerExecutable = null,
  workerTransport = "headless",
  workerDisallowedTools = [],
  ptyWrapperExecutable = "/usr/bin/expect",
  ptyWrapperScript = DEFAULT_PTY_BRIDGE,
  host = "claude-code",
  canonicalCase = null,
  workspaceIdentity = null,
  spawnWorker = spawn,
  budgetMs = 6 * 60 * 60 * 1000,
  maxBudgetUsd = null,
  attachedMode = false,
  losslessContract = false,
  requireInterventionProof = false,
  controllerOptions = {},
  contractCompiler = (options) => compileSemanticContract(options),
  contractAuditor = (options) => auditSemanticContract(options),
  baselineVerifier = (options) => verifyOutcome(options),
  baselineOutcomeAuditor = (options) => auditOutcomeApproval(options),
  workerPreflight = (executable) => preflightWorkerCli(executable),
  acceptancePreflight = (options) => runAcceptance(options),
} = {}) {
  if (!cwd || !ask || !acceptance || !supervisorCommand || !hookEntry) {
    throw new Error("KERNEL_RUN_INCOMPLETE: cwd, ask, acceptance, supervisorCommand and hookEntry are required");
  }
  if (!existsSync(hookEntry)) throw new Error(`HOOK_ENTRY_NOT_FOUND:${hookEntry}`);
  try {
    if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
  } catch (error) {
    throw new Error(`WORKSPACE_NOT_AVAILABLE:${cwd}:${error?.message ?? error}`);
  }
  const hookSyntax = spawnSync(process.execPath, ["--check", hookEntry], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
  });
  if (hookSyntax.error || hookSyntax.status !== 0) {
    throw new Error(`HOOK_PREFLIGHT_FAILED:${hookSyntax.error?.message
      ?? String(hookSyntax.stderr ?? hookSyntax.stdout ?? "syntax check failed").slice(0, 500)}`);
  }
  const resolvedWorkerExecutable = resolveClaudeExecutable(workerExecutable);
  const preflight = workerPreflight(resolvedWorkerExecutable);
  if (!preflight?.ok) {
    const code = attachedMode ? "SUPERVISOR_CREDENTIAL_UNAVAILABLE" : "WORKER_CLI_PREFLIGHT_FAILED";
    throw new Error(`${code}:${preflight?.error ?? "unknown"}`);
  }
  const beforeAcceptance = snapshotWorkspace(cwd);
  const baselineAcceptance = acceptancePreflight({ cwd, command: acceptance });
  const missingCommand = [126, 127].includes(baselineAcceptance?.exit)
    && /(?:command not found|not found|no such file|not recognized)/i.test(String(baselineAcceptance?.output ?? ""));
  if (!baselineAcceptance?.ran || baselineAcceptance.error || baselineAcceptance.timedOut || missingCommand) {
    const detail = baselineAcceptance?.error
      ?? (baselineAcceptance?.timedOut ? `acceptance timed out after ${baselineAcceptance.timeoutMs ?? "the configured deadline"}`
        : missingCommand ? `acceptance command unavailable (exit ${baselineAcceptance.exit}): ${String(baselineAcceptance.output)
          .trim().slice(-500)}`
          : "acceptance did not run");
    throw new Error(`ACCEPTANCE_PREFLIGHT_FAILED:${detail}`);
  }
  const resolvedSupervisorCommand = resolveSupervisorCommand(supervisorCommand, resolvedWorkerExecutable);
  const baseline = snapshotWorkspace(cwd);
  const acceptanceMutation = diffSnapshots(beforeAcceptance, baseline);
  if (acceptanceMutation.changes.length) {
    throw new Error(`ACCEPTANCE_PREFLIGHT_MUTATED_WORKSPACE:${acceptanceMutation.changes
      .map((entry) => entry.path).join(",")}`);
  }
  const compilerInput = {
    cmd: resolvedSupervisorCommand,
    ask,
    acceptance,
    baseline,
    baselineAcceptance,
  };
  let compiled;
  let contractDrafts = 1;
  const deterministicOperatorContract = attachedMode || losslessContract;
  let contractMode = attachedMode ? "lossless-operator-attached"
    : losslessContract ? "lossless-operator-runner"
    : "compiled-and-audited";
  let contractAuditSource = deterministicOperatorContract ? "deterministic-operator-identity"
    : "independent-semantic-auditor";
  let contractFallback = null;
  const contractAuditHistory = [];
  const auditDraft = (semantic) => {
    try {
      return contractAuditor({ ...compilerInput, semantic });
    } catch (error) {
      return { ok: false, error: `CONTRACT_AUDITOR_FAILED:${error?.message ?? error}` };
    }
  };
  let contractAudit;
  if (deterministicOperatorContract) {
    /* Transparent desktop attachment and explicitly preregistered reliability
       runs both need a lossless standard before the first action. Serial
       compiler/auditor/rewrite calls delayed the first real Cowork tool by nine
       minutes and can reject a long protocol merely because its context was
       truncated. Freeze the operator's bytes deterministically; semantic
       interpretation belongs to patrol/outcome evidence where it can be
       falsified against the actual artifact, not in a pre-work chain of prose
       judges. */
    compiled = {
      ok: true,
      semantic: losslessOperatorContract({ ask }),
      attempts: 0,
      packetBytes: Buffer.byteLength(String(ask)),
    };
    contractAudit = {
      ok: true,
      attempts: 0,
      packet: { operatorWords: String(ask), mode: contractMode },
      verdict: {
        passed: true,
        errors: [],
        insufficient: null,
        verifiedFacts: ["objective and success criterion are byte-identical to operator words"],
      },
    };
    contractAuditHistory.push({
      draft: contractDrafts,
      semantic: compiled.semantic,
      audit: contractAudit.verdict,
      error: null,
      packet: contractAudit.packet,
      source: contractAuditSource,
    });
  } else {
    compiled = contractCompiler(compilerInput);
    if (!compiled?.ok) {
      throw new Error(`CONTRACT_COMPILATION_FAILED:${compiled?.error ?? "unknown"}`);
    }
    contractAudit = auditDraft(compiled.semantic);
    contractAuditHistory.push({
      draft: contractDrafts,
      semantic: compiled.semantic,
      audit: contractAudit?.ok ? contractAudit.verdict : null,
      error: contractAudit?.ok ? null : contractAudit?.error ?? "unknown",
      packet: contractAudit?.packet ?? null,
    });
    if (contractAudit?.ok && (!contractAudit.verdict?.passed
      || contractAudit.verdict?.insufficient)) {
    /* The standard is itself a controller output, so a rejected first draft is
       autonomously rewritten from the immutable operator packet before any
       worker exists. One bounded revision avoids both silent poisoning and a
       pre-work infinite debate between models. */
    contractDrafts += 1;
    const revised = contractCompiler({
      ...compilerInput,
      revision: {
        rejectedDraft: compiled.semantic,
        auditErrors: contractAudit.verdict.errors,
        auditInsufficient: contractAudit.verdict.insufficient ?? null,
      },
    });
    if (!revised?.ok) {
      throw new Error(`CONTRACT_RECOMPILATION_FAILED:${revised?.error ?? "unknown"}`);
    }
    compiled = revised;
    contractAudit = auditDraft(compiled.semantic);
    contractAuditHistory.push({
      draft: contractDrafts,
      semantic: compiled.semantic,
      audit: contractAudit?.ok ? contractAudit.verdict : null,
      error: contractAudit?.ok ? null : contractAudit?.error ?? "unknown",
      packet: contractAudit?.packet ?? null,
    });
    }
    if (!contractAudit?.ok) {
      throw new Error(`CONTRACT_AUDIT_FAILED:${contractAudit?.error ?? "unknown"}`);
    }
    if (!contractAudit.verdict?.passed || contractAudit.verdict?.insufficient) {
    const reason = contractAudit.verdict?.insufficient
      ?? contractAudit.verdict?.errors?.join("; ") ?? "contract audit rejected the revised draft";
    if (contractAudit.verdict?.insufficient) {
      throw new Error(`CONTRACT_AUDIT_REJECTED:${String(reason).slice(0, 1000)}`);
    }
    /* Two independent LLM drafts disagreed with the immutable source. Do not
       add a third judge and do not leave an unattended night with no worker.
       Fall back to a deterministically lossless identity contract: less
       interpretation, never a narrower interpretation. The rejected drafts
       remain in the evidence ledger. */
    contractFallback = {
      reason: String(reason).slice(0, 1000),
      rejectedDrafts: contractAuditHistory.filter((entry) => entry.audit?.passed === false).length,
    };
    contractDrafts += 1;
    compiled = {
      ok: true,
      semantic: losslessOperatorContract({ ask }),
      attempts: 0,
      packetBytes: Buffer.byteLength(String(ask)),
    };
    contractMode = "lossless-operator-fallback";
    contractAuditSource = "deterministic-operator-identity";
    contractAudit = {
      ok: true,
      attempts: 0,
      packet: { operatorWords: String(ask), mode: contractMode },
      verdict: {
        passed: true,
        errors: [],
        insufficient: null,
        verifiedFacts: ["objective and success criterion are byte-identical to operator words"],
      },
    };
      contractAuditHistory.push({
        draft: contractDrafts,
        semantic: compiled.semantic,
        audit: contractAudit.verdict,
        error: null,
        packet: contractAudit.packet,
        source: contractAuditSource,
      });
    }
  }
  const maxSupervisorCalls = Math.max(1, Number(controllerOptions.maxSupervisorCalls) || 24);
  const semanticPatrolEvery = Math.max(2, Number(controllerOptions.semanticPatrolEvery) || 96);
  const semanticPatrolMinEvidenceSteps = Math.max(0,
    Number.isFinite(Number(controllerOptions.semanticPatrolMinEvidenceSteps))
      ? Number(controllerOptions.semanticPatrolMinEvidenceSteps) : 6);
  const followupBoundaries = Math.max(2, Number(controllerOptions.followupBoundaries) || 6);
  const maxControllerRestarts = Math.max(1, Number(controllerOptions.maxControllerRestarts) || 3);
  const normalizedWorkerBudget = maxBudgetUsd != null
    && Number.isFinite(Number(maxBudgetUsd)) && Number(maxBudgetUsd) > 0
    ? Number(maxBudgetUsd) : null;
  const contractAuditEvidence = {
    history: contractAuditHistory,
    acceptedDraft: contractDrafts,
  };
  const contractAuditEvidenceHash = `sha256:${createHash("sha256")
    .update(JSON.stringify(contractAuditEvidence)).digest("hex")}`;
  const contract = freezeContract({
    cwd,
    ask,
    acceptance,
    semantic: compiled.semantic,
    semanticAudit: {
      passed: true,
      mode: contractMode,
      source: contractAuditSource,
      draft: contractDrafts,
      rejectedDrafts: contractAuditHistory.filter((entry) => entry.audit?.passed === false).length,
      verifiedFacts: contractAudit.verdict.verifiedFacts.slice(0, 20),
      evidenceHash: contractAuditEvidenceHash,
    },
    baselineEvidence: baseline,
    budget: {
      wallMs: budgetMs,
      workerUsd: normalizedWorkerBudget,
      runtimeSupervisorCalls: maxSupervisorCalls,
      semanticPatrolEvery,
      semanticPatrolMinEvidenceSteps,
      followupBoundaries,
      controllerRestarts: maxControllerRestarts,
    },
  });
  let baselineOutcome = null;
  let baselineOutcomeAudit = null;
  const runPreWorkerSemanticJudge = (invoke, options) => {
    let result = invoke(options);
    if (!result?.ok && result?.failure?.retryable === true) {
      result = invoke({ ...options, validationFeedback:
        result.failure.retryInstruction ?? result.error ?? "Return one valid typed JSON response." });
    }
    return result;
  };
  try {
    /* This is both the t=0 semantic observation and the supervisor capability
       preflight. A red mechanical baseline still needs a live independent
       control plane before an unattended worker is allowed to spend. */
    baselineOutcome = runPreWorkerSemanticJudge(baselineVerifier, {
      cmd: resolvedSupervisorCommand,
      contract,
      baseline,
      current: baseline,
      diff: diffSnapshots(baseline, baseline),
      acceptance: baselineAcceptance,
      baselineAcceptance,
      phase: "baseline",
    });
  } catch (error) {
    baselineOutcome = {
      ok: false,
      error: `BASELINE_OUTCOME_VERIFIER_FAILED:${error?.message ?? error}`,
    };
  }
  if (baselineOutcome?.ok && baselineOutcome.verdict?.passed === true
    && !baselineOutcome.verdict.insufficient) {
    try {
      baselineOutcomeAudit = runPreWorkerSemanticJudge(baselineOutcomeAuditor, {
        cmd: resolvedSupervisorCommand,
        outcomePacket: baselineOutcome.packet ?? {
          contract, baseline, current: baseline, acceptance: baselineAcceptance,
        },
        proposedVerdict: baselineOutcome.verdict,
      });
    } catch (error) {
      baselineOutcomeAudit = {
        ok: false,
        error: `BASELINE_OUTCOME_AUDITOR_FAILED:${error?.message ?? error}`,
      };
    }
  }
  /* The semantic control plane has to prove it can observe the frozen baseline
     before an unattended worker spends. On a green tree it must additionally
     distinguish “already correct” from a shallow false green. If that fresh
     verifier (or a required PASS auditor) could not run, starting the worker
     would create an explicitly unsupervised session.  A semantic REJECT or
     INSUFFICIENT is still a valid control-plane response and may start work;
     only transport/schema/unavailable control fails before worker birth. */
  if (!baselineOutcome?.ok) {
    throw new Error(`SEMANTIC_CONTROL_PREFLIGHT_FAILED:${String(
      baselineOutcome?.error ?? "baseline outcome verifier unavailable").slice(0, 1000)}`);
  }
  if (baselineOutcome?.ok && baselineOutcome.verdict?.passed === true
    && !baselineOutcome.verdict.insufficient && !baselineOutcomeAudit?.ok) {
    throw new Error(`SEMANTIC_CONTROL_PREFLIGHT_FAILED:${String(
      baselineOutcomeAudit?.error ?? "baseline PASS auditor unavailable").slice(0, 1000)}`);
  }
  const binding = createStage05ControlledWayBinding({
    contract,
    host,
    workerExecutable: resolvedWorkerExecutable,
    supervisorCommand: resolvedSupervisorCommand,
    exactClaim: canonicalCase?.claim ?? null,
    exactWay: canonicalCase?.way ?? null,
    exactWorld: canonicalCase?.world ?? null,
    authority: canonicalCase?.authority ?? null,
    createdBeforeWorker: !attachedMode,
  });
  const canonicalCwd = path.resolve(cwd);
  const requestedRoot = path.resolve(workspaceIdentity?.workspaceRoot ?? canonicalCwd);
  const relativeToRoot = path.relative(requestedRoot, canonicalCwd);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("WORKSPACE_IDENTITY_OUTSIDE_SELECTED_ROOT");
  }
  /* Freeze controller-owned artifact identity separately from tool telemetry.
     Cowork's host metadata currently proves the selected local folder but does
     not expose its `/sessions/.../mnt` view.  Never invent that alias: command
     paths remain useful execution telemetry without competing with the bytes,
     diff and acceptance the controller reads from canonicalCwd. */
  const workspaceIdentityBody = {
    schema: "outsider/workspace-identity/v1",
    contractSeal: contract.seal,
    hostProtocol: host,
    canonicalCwd,
    workspaceRoot: requestedRoot,
    hostCwd: workspaceIdentity?.hostCwd ? path.resolve(workspaceIdentity.hostCwd) : canonicalCwd,
    resolutionSource: String(workspaceIdentity?.resolutionSource ?? "runner-cwd"),
    refinementSource: workspaceIdentity?.refinementSource
      ? String(workspaceIdentity.refinementSource) : null,
    metadataSource: workspaceIdentity?.metadataFile
      ? "host-owned-cowork-session-metadata" : null,
    metadataFile: workspaceIdentity?.metadataFile ? path.resolve(workspaceIdentity.metadataFile) : null,
    artifactEvidenceAuthority: "controller-owned",
    executionTelemetryAuthority: "non-authoritative-for-artifact-identity",
    sandboxPathAlias: { status: "not-asserted", aliases: [] },
  };
  const frozenWorkspaceIdentity = {
    ...workspaceIdentityBody,
    identityHash: `sha256:${createHash("sha256")
      .update(canonicalizeStrict(workspaceIdentityBody)).digest("hex")}`,
  };
  const store = RunStore.create({
    cwd, contract, supervisorCommand: resolvedSupervisorCommand, host, stateRoot,
    binding, workspaceIdentity: frozenWorkspaceIdentity,
    ...(runId ? { runId } : {}),
  });
  const baselineOutcomeEvidenceFile = baselineOutcome?.packet
    ? "baseline-outcome-evidence.json" : null;
  if (baselineOutcomeEvidenceFile) store.writeJson(baselineOutcomeEvidenceFile, baselineOutcome.packet);
  const baselineAuditEvidenceFile = baselineOutcomeAudit?.packet
    ? "baseline-outcome-approval-audit.json" : null;
  if (baselineAuditEvidenceFile) store.writeJson(baselineAuditEvidenceFile, baselineOutcomeAudit.packet);
  const contractAuditEvidenceFile = "contract-audit.json";
  store.writeJson(contractAuditEvidenceFile, contractAuditEvidence);
  store.append("stage05_binding_frozen", {
    bindingHash: binding.bindingHash,
    claimMode: binding.claimRef.mode,
    wayMode: binding.wayRef.mode,
    worldMode: binding.worldRef.mode,
    authorityLane: binding.authority.lane,
    createdBeforeWorker: !attachedMode,
    createdBeforeFirstAction: true,
  });
  store.append("contract_compiled", {
    objective: contract.semantic.objective,
    successCriteria: contract.semantic.successCriteria.length,
    architecturalConstraints: contract.semantic.architecturalConstraints.length,
    forbiddenShortcuts: contract.semantic.forbiddenShortcuts.length,
    packetBytes: compiled.packetBytes ?? null,
    attempts: compiled.attempts ?? 1,
    drafts: contractDrafts,
    mode: contractMode,
  });
  if (contractFallback) store.append("contract_fallback_used", {
    mode: contractMode,
    source: contractAuditSource,
    rejectedDrafts: contractFallback.rejectedDrafts,
    reason: contractFallback.reason,
  });
  store.append("contract_audited", {
    passed: true,
    source: contractAuditSource,
    mode: contractMode,
    draft: contractDrafts,
    rejectedDrafts: contractAuditHistory.filter((entry) => entry.audit?.passed === false).length,
    verifiedFacts: contractAudit.verdict.verifiedFacts.slice(0, 20),
    evidenceFile: contractAuditEvidenceFile,
    evidenceHash: contract.semanticAudit.evidenceHash,
    attempts: contractAudit.attempts ?? 1,
  });
  store.append("contract_frozen", {
    ask: contract.ask,
    acceptance: contract.acceptance,
    baselineFingerprint: baseline.fingerprint,
  });
  if (controllerOptions.agentTeamPolicy
    && typeof controllerOptions.agentTeamPolicy === "object"
    && !Array.isArray(controllerOptions.agentTeamPolicy)) {
    const frozenAgentTeamPolicy = JSON.parse(JSON.stringify(controllerOptions.agentTeamPolicy));
    store.writeJson("agent-team-policy.json", {
      schema: "outsider/frozen-agent-team-policy/v1",
      policy: frozenAgentTeamPolicy,
      policyHash: `sha256:${createHash("sha256")
        .update(canonicalizeStrict(frozenAgentTeamPolicy)).digest("hex")}`,
    });
    store.append("agent_team_policy_frozen", {
      policyHash: `sha256:${createHash("sha256")
        .update(canonicalizeStrict(frozenAgentTeamPolicy)).digest("hex")}`,
      enforceExclusiveSliceOwnership:
        frozenAgentTeamPolicy.enforceExclusiveSliceOwnership === true,
      requiredTeammateCount: Array.isArray(frozenAgentTeamPolicy.requiredTeammates)
        ? frozenAgentTeamPolicy.requiredTeammates.length : null,
      expectedFileCount: Object.keys(
        frozenAgentTeamPolicy.expectedFilesByTeammate ?? {}).length,
      createdBeforeWorker: true,
    });
  }
  store.append("baseline_acceptance", {
    ran: baselineAcceptance.ran,
    passed: baselineAcceptance.passed,
    exit: baselineAcceptance.exit,
    command: baselineAcceptance.command,
    outputTail: String(baselineAcceptance.output ?? "").slice(-2000),
  });
  if (baselineOutcomeAudit) {
    store.append("baseline_outcome_approval_audit", {
      baselineFingerprint: baseline.fingerprint,
      passed: Boolean(baselineOutcomeAudit.ok && baselineOutcomeAudit.verdict?.passed
        && !baselineOutcomeAudit.verdict?.insufficient),
      errors: baselineOutcomeAudit.ok ? baselineOutcomeAudit.verdict.errors.slice(0, 12) : [],
      verifiedFacts: baselineOutcomeAudit.ok
        ? baselineOutcomeAudit.verdict.verifiedFacts.slice(0, 12) : [],
      insufficient: baselineOutcomeAudit.ok
        ? baselineOutcomeAudit.verdict.insufficient ?? null : null,
      error: !baselineOutcomeAudit.ok
        ? String(baselineOutcomeAudit.error ?? "baseline PASS audit failed").slice(0, 500) : null,
      evidenceFile: baselineAuditEvidenceFile,
      evidenceHash: baselineOutcomeAudit?.packet
        ? `sha256:${createHash("sha256").update(JSON.stringify(baselineOutcomeAudit.packet)).digest("hex")}`
        : null,
    });
  }
  const baselineApprovalPassed = baselineOutcome?.verdict?.passed !== true
    || Boolean(baselineOutcomeAudit?.ok && baselineOutcomeAudit.verdict?.passed
      && !baselineOutcomeAudit.verdict?.insufficient);
  store.append("baseline_outcome_verdict", {
    checked: Boolean(baselineOutcome),
    passed: baselineOutcome?.ok ? Boolean(baselineOutcome.verdict.passed
      && baselineApprovalPassed) : false,
    verifierProposedPassed: baselineOutcome?.ok ? baselineOutcome.verdict.passed : false,
    approvalAuditPassed: baselineOutcome?.verdict?.passed === true ? baselineApprovalPassed : null,
    gaps: baselineOutcome?.ok ? [
      ...baselineOutcome.verdict.gaps,
      ...(baselineOutcome.verdict.passed === true && !baselineApprovalPassed
        ? (baselineOutcomeAudit?.verdict?.errors ?? [baselineOutcomeAudit?.error ?? "PASS audit failed"])
        : []),
    ].slice(0, 12) : [],
    evidence: baselineOutcome?.ok ? baselineOutcome.verdict.evidence.slice(0, 12) : [],
    insufficient: baselineOutcome?.ok ? baselineOutcome.verdict.insufficient ?? null : null,
    error: baselineOutcome && !baselineOutcome.ok
      ? String(baselineOutcome.error ?? "baseline semantic verification failed").slice(0, 500) : null,
    baselineFingerprint: baseline.fingerprint,
    acceptancePassed: baselineAcceptance.passed,
    evidenceFile: baselineOutcomeEvidenceFile,
    evidenceHash: baselineOutcome?.packet
      ? `sha256:${createHash("sha256").update(JSON.stringify(baselineOutcome.packet)).digest("hex")}`
      : null,
  });
  store.writeJson("baseline-attestation.json", {
    checked: Boolean(baselineOutcome),
    ok: Boolean(baselineOutcome?.ok && baselineApprovalPassed),
    verdict: baselineOutcome?.ok ? { ...baselineOutcome.verdict,
      passed: Boolean(baselineOutcome.verdict.passed && baselineApprovalPassed) } : null,
    approvalAudit: baselineOutcomeAudit?.ok ? baselineOutcomeAudit.verdict : null,
    error: baselineOutcome && !baselineOutcome.ok ? baselineOutcome.error : null,
    baselineFingerprint: baseline.fingerprint,
  });
  store.writeJson("baseline.json", baseline);
  const settingsPath = path.join(store.directory, "worker-settings.json");
  writeFileSync(settingsPath, JSON.stringify(controlledWorkerSettings(hookEntry), null, 2), { mode: 0o600 });
  const mandate = workerMandate({ contract, baseline });
  const mandatePath = path.join(store.directory, "worker-mandate.md");
  writeFileSync(mandatePath, mandate, { mode: 0o600 });
  store.append("worker_mandate_frozen", {
    bytes: Buffer.byteLength(mandate),
    sha256: `sha256:${createHash("sha256").update(mandate).digest("hex")}`,
  });
  const executable = resolvedWorkerExecutable;
  const launch = controlledWorkerLaunchPlan({
    executable,
    prompt: workerPrompt ?? ask,
    settingsPath,
    mandate,
    maxBudgetUsd: normalizedWorkerBudget,
    disallowedTools: workerDisallowedTools,
    workerTransport,
    ptyWrapperExecutable,
    ptyWrapperScript,
  });
  const args = launch.claudeArgs;
  const launchExecutable = launch.executable;
  const launchArgs = launch.args;

  const token = createControllerToken();
  const socketPath = controllerSocketPath(store.runId);
  const controllerConfigPath = path.join(store.directory, "controller-config.json");
  const recoverableControllerOptions = Object.fromEntries(Object.entries(controllerOptions)
    .filter(([key, value]) => !["maxControllerRestarts", "controllerLeaseMs",
      "controllerHeartbeatMs"].includes(key) && typeof value !== "function"));
  writeFileSync(controllerConfigPath, JSON.stringify({
    schema: "outsider/controller-config/v1",
    runDirectory: store.directory,
    supervisorCommand: resolvedSupervisorCommand,
    controllerOptions: recoverableControllerOptions,
    leaseMs: Math.max(1_000, Number(controllerOptions.controllerLeaseMs) || 12_000),
    heartbeatMs: Math.max(250, Number(controllerOptions.controllerHeartbeatMs) || 3_000),
  }, null, 2), { mode: 0o600 });
  try { chmodSync(controllerConfigPath, 0o600); } catch { /* best effort on non-POSIX hosts */ }
  const controllerHostEntry = fileURLToPath(new URL("../bin/outsider-controller-host.mjs", import.meta.url));
  let child = null;
  const watchdog = await startControllerWatchdog({
    hostEntry: controllerHostEntry,
    configPath: controllerConfigPath,
    socketPath,
    token,
    hostEnvironment: isolatedWorkerEnvironment(process.env),
    maxRestarts: maxControllerRestarts,
    onFatal: () => { try { child?.kill("SIGTERM"); } catch { /* worker not running */ } },
  });
  await watchdog.record({
    eventType: attachedMode ? "worker_attached" : "worker_launch",
    payload: attachedMode
      ? { host, processOwnedBy: "host", controlBoundaryOwnedBy: "outsider" }
      : { executable, argv: args.map((arg) => String(arg).slice(0, 300)),
        transport: workerTransport,
        launchExecutable: workerTransport === "interactive-pty" ? launchExecutable : null },
    statePatch: { status: "running", socketPath, workerPid: null,
      workerMode: attachedMode ? "attached" : "owned" },
  });
  if (attachedMode) {
    return {
      runId: store.runId,
      store,
      contract,
      controller: null,
      child: null,
      watchdog,
      rpc: { close: () => watchdog.close() },
      settingsPath,
      socketPath,
      token,
      async handleHook(payload, timeoutMs = 890_000) {
        return requestController({ socketPath, token, payload, timeoutMs });
      },
      async record(eventType, payload = {}, statePatch = null) {
        return watchdog.record({ eventType, payload, statePatch });
      },
      async supersede(reason = "operator-contract-amended") {
        await watchdog.record({ eventType: "attached_run_superseded", payload: { reason },
          statePatch: { status: "superseded" } });
        await watchdog.close();
      },
      async finish() {
        let result;
        try {
          result = await watchdog.finish({ requireIntervention: false,
            timeoutMs: 15 * 60_000 });
        } finally {
          await watchdog.close();
        }
        try {
          const evidence = finalizeStage05Evidence({ directory: store.directory });
          return { ...result, evidence: { ok: true, ...evidence } };
        } catch (error) {
          return { ...result, evidence: { ok: false, error: String(error?.message ?? error) } };
        }
      },
    };
  }
  try {
    child = spawnWorker(launchExecutable, launchArgs, {
      cwd,
      stdio: launch.stdio,
      detached: workerTransport === "interactive-pty",
      env: {
        ...isolatedWorkerEnvironment(process.env),
        OUTSIDER_RUN: "1",
        OUTSIDER_RUN_ID: store.runId,
        OUTSIDER_CONTROLLER_SOCKET: socketPath,
        OUTSIDER_CONTROLLER_TOKEN: token,
        OUTSIDER_BUDGET_MS: "890000",
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
      },
    });
  } catch (error) {
    await watchdog.record({ eventType: "worker_launch_failed",
      payload: { error: String(error?.message ?? error) } }).catch(() => undefined);
    await watchdog.close();
    throw error;
  }
  await watchdog.record({ statePatch: { workerPid: child.pid ?? null } });
  const terminateWorker = (signal = "SIGTERM") => {
    if (workerTransport === "interactive-pty" && Number.isInteger(child?.pid)) {
      try { process.kill(-child.pid, signal); return true; } catch { /* wrapper may already own no group */ }
    }
    try { return child.kill(signal); } catch { return false; }
  };
  const killer = setTimeout(() => {
    watchdog.record({ eventType: "worker_budget_exhausted", payload: { budgetMs } })
      .catch(() => undefined);
    terminateWorker("SIGTERM");
  }, budgetMs);
  killer.unref?.();

  return {
    runId: store.runId,
    store,
    contract,
    controller: null,
    child,
    watchdog,
    rpc: { close: () => watchdog.close() },
    settingsPath,
    socketPath,
    token,
    workerTransport,
    terminateWorker,
    sendWorkerInput(value) {
      if (workerTransport !== "interactive-pty" || !child?.stdin?.writable) return false;
      return child.stdin.write(String(value));
    },
    async record(eventType, payload = {}, statePatch = null) {
      return watchdog.record({ eventType, payload, statePatch });
    },
    async finish() {
      clearTimeout(killer);
      let result;
      try {
        result = await watchdog.finish({ requireIntervention: requireInterventionProof });
      } finally {
        /* Stop the lease heartbeat before hashing the run directory. A manifest
           over a still-changing controller-lease.json would be born stale. */
        await watchdog.close();
      }
      try {
        const evidence = finalizeStage05Evidence({ directory: store.directory });
        return { ...result, evidence: { ok: true, ...evidence } };
      } catch (error) {
        return { ...result, evidence: {
          ok: false, error: String(error?.message ?? error),
        } };
      }
    },
  };
}
