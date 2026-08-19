import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { discoverAcceptance } from "../src/outsider-acceptance-discovery.js";
import { attachedSessionKey, AttachedLedger } from "../src/outsider-attached-ledger.js";
import { AttachedDaemonController, attachedSupervisorCommand, resolveAttachedWorkspace,
  resolvePromptWorkspace } from "../src/outsider-attached-daemon.js";
import { desktopSessionCapabilityFile } from "../src/outsider-attached-client.js";
import { startKernelRun, workerMandate } from "../src/outsider-kernel-runner.js";
import { RunStore } from "../src/outsider-kernel-store.js";
import { verifyStage05RunDirectory } from "../src/outsider-stage05-evidence.js";

const temp = () => mkdtempSync(path.join(tmpdir(), "outsider-attached-test-"));

test("acceptance discovery prefers repository-owned explicit and ecosystem commands", () => {
  const cwd = temp();
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  assert.equal(discoverAcceptance(cwd).command, "npm test");
  writeFileSync(path.join(cwd, ".outsider.json"), JSON.stringify({ acceptance: "npm run sealed" }));
  assert.deepEqual(discoverAcceptance(cwd), {
    command: "npm run sealed", source: ".outsider.json#acceptance", confidence: "explicit", discovered: true,
  });
  rmSync(cwd, { recursive: true, force: true });
});

test("session identity never collapses two unknown or distinct sessions", () => {
  assert.equal(attachedSessionKey({ cwd: "/same" }), null);
  assert.notEqual(attachedSessionKey({ session_id: "one" }), attachedSessionKey({ session_id: "two" }));
  assert.notEqual(attachedSessionKey({ transcript_path: "/a/main.jsonl" }),
    attachedSessionKey({ transcript_path: "/b/main.jsonl" }));
});

test("Claude Desktop resolves the operator-selected folder instead of its outputs cwd", () => {
  const root = temp();
  const sessionRoot = path.join(root, "account", "host-session");
  const localId = "local_2ac38506-5de7-4934-a26e-50e4dfe7e793";
  const outputs = path.join(sessionRoot, localId, "outputs");
  const workspace = path.join(root, "selected-workspace");
  mkdirSync(outputs, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(sessionRoot, `${localId}.json`), JSON.stringify({
    sessionId: localId,
    cwd: outputs,
    userSelectedFolders: [workspace],
  }));
  const resolved = resolveAttachedWorkspace("claude-desktop", { cwd: outputs });
  assert.equal(resolved.cwd, workspace);
  assert.equal(resolved.hostCwd, outputs);
  assert.equal(resolved.source, "claude-desktop:userSelectedFolders");
  rmSync(root, { recursive: true, force: true });
});

test("Claude Desktop refuses to guess between multiple selected folders", () => {
  const root = temp();
  const sessionRoot = path.join(root, "account", "host-session");
  const localId = "local_d0439d77-a7c3-46a6-9230-99097321ff6c";
  const outputs = path.join(sessionRoot, localId, "outputs");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  for (const directory of [outputs, first, second]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(sessionRoot, `${localId}.json`), JSON.stringify({
    sessionId: localId,
    cwd: outputs,
    userSelectedFolders: [first, second],
  }));
  const resolved = resolveAttachedWorkspace("claude-desktop", { cwd: outputs });
  assert.equal(resolved.cwd, outputs);
  assert.equal(resolved.source, "claude-desktop:ambiguous-user-selected-folders");
  rmSync(root, { recursive: true, force: true });
});

test("an operator-named nested repository narrows a broad Cowork folder deterministically", () => {
  const root = temp();
  const repository = path.join(root, "fixture", "nested-repo");
  mkdirSync(path.join(repository, "src"), { recursive: true });
  writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    scripts: { test: "node test.mjs" },
  }));
  writeFileSync(path.join(repository, "src", "ledger.js"), "export const value = 1;\n");
  const resolved = resolvePromptWorkspace(root,
    "只修复 fixture/nested-repo/src/ledger.js，并运行 fixture/nested-repo 的 npm test");
  assert.equal(resolved.cwd, repository);
  assert.equal(resolved.source, "operator-path:repository-owned-acceptance");
  rmSync(root, { recursive: true, force: true });
});

test("an explicitly named one-segment Cowork subdirectory preserves the operator cwd", () => {
  const root = temp();
  const repository = path.join(root, "final-1.3.6-fixture");
  mkdirSync(path.join(repository, "src"), { recursive: true });
  writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    scripts: { test: "node test.mjs" },
  }));
  writeFileSync(path.join(repository, "test.mjs"), "// frozen acceptance\n");
  writeFileSync(path.join(repository, "src", "ledger.js"), "export const value = 1;\n");
  const prompt = "只在 final-1.3.6-fixture 子目录中工作。修复 src/ledger.js；"
    + "不要修改 test.mjs 或 package.json，在该目录运行 npm test。";
  const resolved = resolvePromptWorkspace(root, prompt);
  assert.equal(resolved.cwd, repository);
  assert.equal(resolved.source, "operator-path:repository-owned-acceptance");
  assert.deepEqual(resolved.candidates, [repository]);
  rmSync(root, { recursive: true, force: true });
});

test("Cowork keeps one identity while refining its selected folder to the named repository", async () => {
  const root = temp();
  const sessionRoot = path.join(root, "host-session");
  const localId = "local_cowork-refinement";
  const outputs = path.join(sessionRoot, localId, "outputs");
  const selected = path.join(root, "selected");
  const repository = path.join(selected, "nested-repo");
  mkdirSync(outputs, { recursive: true });
  mkdirSync(path.join(repository, "src"), { recursive: true });
  writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    scripts: { test: "node test.mjs" },
  }));
  writeFileSync(path.join(sessionRoot, `${localId}.json`), JSON.stringify({
    sessionId: localId, cwd: outputs, userSelectedFolders: [selected],
  }));
  const calls = [];
  const daemon = new AttachedDaemonController({ root: path.join(root, "attached"),
    hookEntry: "/hook.mjs", startRun: fakeRunFactory(calls) });
  const base = { session_id: "cowork-refinement", cwd: outputs };
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "SessionStart",
  } });
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "UserPromptSubmit",
    prompt: "修复 nested-repo/src/ledger.js，然后运行 npm test",
  } });
  const tool = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: path.join(repository, "src", "ledger.js") },
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contract.ask.includes("nested-repo/src/ledger.js"), true);
  assert.equal(path.dirname(path.dirname(calls[0].store.directory)), repository);
  assert.equal(calls[0].startOptions.workspaceIdentity.resolutionSource,
    "claude-desktop:userSelectedFolders");
  assert.equal(calls[0].startOptions.workspaceIdentity.refinementSource,
    "operator-path:repository-owned-acceptance");
  assert.equal(calls[0].startOptions.workspaceIdentity.workspaceRoot, selected);
  assert.equal(calls[0].startOptions.workspaceIdentity.sandboxPathAlias.status, "not-asserted");
  assert.deepEqual(calls[0].startOptions.workspaceIdentity.sandboxPathAlias.aliases, []);
  assert.equal(tool.output.hookSpecificOutput.permissionDecision, "allow");
  const key = attachedSessionKey(base);
  const ledger = JSON.parse(readFileSync(path.join(root, "attached", "sessions", key,
    "session.json"), "utf8"));
  assert.equal(ledger.cwd, repository);
  assert.equal(ledger.workspaceRoot, selected);
  assert.equal(ledger.identityConflicts, undefined);
  await daemon.close();
  rmSync(root, { recursive: true, force: true });
});

test("Cowork promotes a late selected-folder identity before the first tool action", async () => {
  const root = temp();
  const sessionRoot = path.join(root, "host-session");
  const localId = "local_cowork-late-folder";
  const outputs = path.join(sessionRoot, localId, "outputs");
  const selected = path.join(root, "selected");
  const repository = path.join(selected, "nested-repo");
  mkdirSync(outputs, { recursive: true });
  mkdirSync(path.join(repository, "src"), { recursive: true });
  writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    scripts: { test: "node test.mjs" },
  }));
  const calls = [];
  const daemon = new AttachedDaemonController({ root: path.join(root, "attached"),
    hookEntry: "/hook.mjs", startRun: fakeRunFactory(calls) });
  const identity = { session_id: "cowork-late-folder" };
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...identity, cwd: outputs, hook_event_name: "SessionStart",
  } });
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...identity, cwd: outputs, hook_event_name: "UserPromptSubmit",
    prompt: "修复 nested-repo/src/ledger.js，然后运行 npm test",
  } });
  assert.equal(calls.length, 0);
  writeFileSync(path.join(sessionRoot, `${localId}.json`), JSON.stringify({
    sessionId: localId, cwd: outputs, userSelectedFolders: [selected],
  }));
  const tool = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...identity, cwd: selected, hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: path.join(repository, "src", "ledger.js") },
  } });
  assert.equal(calls.length, 1, "the authenticated promotion bootstraps before the action");
  assert.equal(path.dirname(path.dirname(calls[0].store.directory)), repository);
  assert.equal(tool.output.hookSpecificOutput.permissionDecision, "allow");
  const key = attachedSessionKey(identity);
  const ledger = JSON.parse(readFileSync(path.join(root, "attached", "sessions", key,
    "session.json"), "utf8"));
  assert.equal(ledger.workspaceRoot, selected);
  assert.equal(ledger.cwd, repository);
  assert.equal(ledger.workspaceResolution.source, "claude-desktop:userSelectedFolders");
  assert.equal(ledger.identityConflicts, undefined);
  await daemon.close();
  rmSync(root, { recursive: true, force: true });
});

test("observer-only attached mode explicitly allows tools instead of deferring to a human", async () => {
  const root = temp();
  const cwd = path.join(root, "no-acceptance");
  mkdirSync(cwd);
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs" });
  const base = { agent: "claude-desktop", input: { session_id: "observer", cwd } };
  await daemon.handleHook({ ...base,
    input: { ...base.input, hook_event_name: "SessionStart" } });
  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "UserPromptSubmit", prompt: "inspect only" } });
  const tool = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "README.md" } } });
  assert.equal(tool.output.hookSpecificOutput.permissionDecision, "allow");
  assert.notEqual(tool.output.hookSpecificOutput.permissionDecision, "defer");
  assert.match(tool.output.hookSpecificOutput.additionalContext, /OUTSIDER_OBSERVER_ONLY/);
  assert.match(tool.output.hookSpecificOutput.additionalContext, /不是 Outsider 的独立验收证明/);

  const later = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "README.md" } } });
  assert.equal(later.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(Object.hasOwn(later.output.hookSpecificOutput, "additionalContext"), false,
    "observer-only disclosure is injected once instead of taxing every tool boundary");

  const stopped = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "Stop" } });
  assert.equal(stopped.output.decision, "approve");
  assert.equal(stopped.decision.verdict, "allow");
  assert.match(stopped.output.systemMessage, /observer-only/);
  assert.match(stopped.output.systemMessage, /Stage 0\.5/);
  assert.match(stopped.output.systemMessage, /不得解释为/);

  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "UserPromptSubmit", prompt: "inspect a second task" } });
  const nextTask = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "README.md" } } });
  assert.match(nextTask.output.hookSpecificOutput.additionalContext, /OUTSIDER_OBSERVER_ONLY/,
    "a new task in the same Cowork session gets its own first-boundary disclosure");
  await daemon.close();
  rmSync(root, { recursive: true, force: true });
});

test("a bootstrap preflight failure allows only diagnostic reads, backs off, and self-recovers", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  const calls = [];
  let attempts = 0;
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: async (options) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("ACCEPTANCE_PREFLIGHT_FAILED:acceptance command unavailable (exit 127): npm: command not found");
      }
      return fakeRunFactory(calls)(options);
    } });
  const base = { session_id: "bootstrap-recovery", cwd };
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "UserPromptSubmit", prompt: "repair the ledger",
  } });

  const read = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/ledger.js" },
  } });
  assert.equal(read.output.hookSpecificOutput.permissionDecision, "allow");
  assert.match(read.output.hookSpecificOutput.additionalContext, /仅允许只读诊断工具/);
  const session = daemon.sessions.get(attachedSessionKey(base));
  assert.equal(session.ledger.value.active.status, "bootstrap-failed");
  assert.equal(session.ledger.value.active.bootstrapAttempts, 1);

  const write = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "src/ledger.js", content: "bad" },
  } });
  assert.equal(write.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(attempts, 1, "the retry deadline prevents a hot loop on every boundary");

  session.ledger.setActive({ ...session.ledger.value.active,
    retryAt: new Date(Date.now() - 1_000).toISOString() });
  const recovered = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/ledger.js" },
  } });
  assert.equal(attempts, 2);
  assert.equal(calls.length, 1);
  assert.equal(recovered.output.hookSpecificOutput.permissionDecision, "allow");
  assert.match(recovered.output.hookSpecificOutput.additionalContext, /Outsider controlled worker mandate/);
  await daemon.close();
  rmSync(root, { recursive: true, force: true });
});

test("a persistent bootstrap failure releases a read-only review with an explicit unverified terminal", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: async () => {
      throw new Error("ACCEPTANCE_PREFLIGHT_FAILED:acceptance command unavailable (exit 127): vitest: command not found");
    } });
  const base = { session_id: "bootstrap-read-only-terminal", cwd };
  await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "UserPromptSubmit", prompt: "inspect this repository and advise",
  } });

  const read = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "README.md" },
  } });
  assert.equal(read.output.hookSpecificOutput.permissionDecision, "allow");

  const write = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: "README.md", content: "changed" },
  } });
  assert.equal(write.output.hookSpecificOutput.permissionDecision, "deny",
    "bootstrap degradation never authorizes a mutation");

  const stopped = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "Stop",
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.match(stopped.output.systemMessage, /只读分析/);
  assert.match(stopped.output.systemMessage, /没有建立.*Stage 0\.5/);
  const session = daemon.sessions.get(attachedSessionKey(base));
  assert.equal(session.ledger.value.active, null);
  assert.equal(session.ledger.value.completedRuns.at(-1).status, "read-only-unverified");
  assert.equal(session.ledger.value.completedRuns.at(-1).proofComplete, false);
  assert.equal(session.ledger.value.completedRuns.at(-1).deliveryComplete, false);

  const repeated = await daemon.handleHook({ agent: "claude-desktop", input: {
    ...base, hook_event_name: "Stop",
  } });
  assert.equal(repeated.output.decision, "approve");
  assert.match(repeated.output.systemMessage, /只读分析/);
  await daemon.close();
  rmSync(root, { recursive: true, force: true });
});

test("contract ledger versions mid-run prompts and starts a new task after completion", () => {
  const root = temp();
  const ledger = new AttachedLedger({ root, sessionKey: "s", host: "claude-code", cwd: root });
  const first = ledger.addPrompt("build the controller");
  assert.equal(first.entry.taskNumber, 1);
  ledger.setActive({ status: "running", runId: "r1" });
  const revision = ledger.addPrompt("also preserve normal Claude UX");
  assert.equal(revision.entry.taskNumber, 1);
  assert.match(revision.combinedPrompt, /build the controller[\s\S]*preserve normal Claude UX/);
  ledger.completeActive("complete");
  const next = ledger.addPrompt("new task");
  assert.equal(next.entry.taskNumber, 2);
  rmSync(root, { recursive: true, force: true });
});

test("attached mandate makes the pre-action boundary explicit", () => {
  const text = workerMandate({ contract: { seal: "s", ask: "do it", semantic: {}, budget: {} },
    baseline: { files: {} }, attachedMode: true });
  assert.match(text, /before any tool action executed/);
  assert.doesNotMatch(text, /before the worker started/);
});

test("attached default supervisor is direct argv so timeout owns the Claude process", () => {
  const root = temp();
  try {
    const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs" });
    assert.ok(Array.isArray(daemon.supervisorCommand));
    assert.equal(daemon.supervisorCommand[1], "-p");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("attached helper accepts typed supervisor argv without shell string coercion", () => {
  const argv = [process.execPath, "/tmp/oracle with spaces.mjs"];
  assert.deepEqual(attachedSupervisorCommand({ env: {
    OUTSIDER_SUPERVISOR_ARGV: JSON.stringify(argv),
    OUTSIDER_SUPERVISOR: "must not win",
  } }), argv);
  assert.throws(() => attachedSupervisorCommand({ env: {
    OUTSIDER_SUPERVISOR_ARGV: "not-json",
  } }), /OUTSIDER_SUPERVISOR_ARGV_INVALID_JSON/);
});

test("attached kernel owns the control boundary without spawning a replacement worker", async (t) => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
  const semantic = {
    objective: "preserve exact value",
    successCriteria: ["value remains exact"],
    architecturalConstraints: [], forbiddenShortcuts: [],
    scope: { in: ["value.js"], out: [] }, uncertainties: [],
  };
  let spawned = false;
  let compilerCalls = 0;
  let auditorCalls = 0;
  let run;
  try {
    run = await startKernelRun({
      cwd, ask: "preserve exact value", acceptance: "node --test",
      supervisorCommand: "node fake-supervisor.mjs",
      hookEntry: path.resolve("bin/outsider-hook.mjs"),
      stateRoot: path.join(root, "runs"), attachedMode: true, host: "claude-desktop",
      workspaceIdentity: {
        hostCwd: path.join(root, "cowork-host", "outputs"),
        workspaceRoot: cwd,
        resolutionSource: "claude-desktop:userSelectedFolders",
        refinementSource: "selected-workspace-root",
      },
      spawnWorker: () => { spawned = true; throw new Error("must not spawn"); },
      workerPreflight: () => ({ ok: true }),
      acceptancePreflight: () => ({ ran: true, passed: false, exit: 1,
        command: "node --test", output: "baseline red" }),
      contractCompiler: () => { compilerCalls += 1;
        return { ok: true, semantic, attempts: 1, packetBytes: 1 }; },
      contractAuditor: () => { auditorCalls += 1;
        return { ok: true, verdict: { passed: true, errors: [],
          verifiedFacts: ["operator words preserved"] }, attempts: 1, packet: {} }; },
      baselineVerifier: () => ({ ok: true, packet: { phase: "baseline" }, verdict: {
        passed: false, gaps: ["baseline acceptance is red"],
        evidence: ["frozen acceptance exit is nonzero"], insufficient: null,
      } }),
    });
  } catch (error) {
    if (/\bEPERM\b/.test(String(error?.message ?? error))) {
      t.skip("local IPC prohibited by sandbox");
      rmSync(root, { recursive: true, force: true });
      return;
    }
    throw error;
  }
  assert.equal(spawned, false);
  assert.equal(compilerCalls, 0,
    "transparent attach freezes operator bytes without serial pre-work model calls");
  assert.equal(auditorCalls, 0);
  assert.equal(run.child, null);
  assert.equal(run.contract.semantic.objective, run.contract.ask);
  assert.equal(run.contract.semanticAudit.mode, "lossless-operator-attached");
  const binding = JSON.parse(readFileSync(path.join(run.store.directory, "stage05-binding.json"), "utf8"));
  assert.equal(binding.createdBeforeWorker, false);
  assert.equal(binding.createdBeforeFirstAction, true);
  assert.equal(binding.source.hostProtocol, "claude-desktop");
  const workspaceIdentity = JSON.parse(readFileSync(path.join(run.store.directory,
    "workspace-identity.json"), "utf8"));
  assert.equal(workspaceIdentity.canonicalCwd, cwd);
  assert.equal(workspaceIdentity.artifactEvidenceAuthority, "controller-owned");
  assert.equal(workspaceIdentity.executionTelemetryAuthority,
    "non-authoritative-for-artifact-identity");
  assert.equal(workspaceIdentity.sandboxPathAlias.status, "not-asserted");
  assert.match(workspaceIdentity.identityHash, /^sha256:[a-f0-9]{64}$/);
  const recovered = RunStore.open({
    directory: run.store.directory,
    supervisorCommand: run.store.supervisorCommand,
  });
  assert.equal(recovered.readJson("workspace-identity.json").identityHash,
    workspaceIdentity.identityHash);
  const identityFile = path.join(run.store.directory, "workspace-identity.json");
  writeFileSync(identityFile, JSON.stringify({ ...workspaceIdentity,
    canonicalCwd: path.join(root, "other-repository") }, null, 2));
  assert.throws(() => RunStore.open({ directory: run.store.directory,
    supervisorCommand: run.store.supervisorCommand }), /WORKSPACE_IDENTITY_BROKEN/);
  writeFileSync(identityFile, JSON.stringify(workspaceIdentity, null, 2));
  assert.ok(run.store.events().some((event) => event.type === "worker_attached"));
  await run.supersede("test-complete");
  rmSync(root, { recursive: true, force: true });
});

function fakeRunFactory(calls, { finishResult = null, finishError = null } = {}) {
  return async ({ cwd, ask, acceptance, ...startOptions }) => {
    const runId = `run-${calls.length + 1}`;
    const directory = path.join(cwd, ".fake", runId);
    mkdirSync(directory, { recursive: true });
    const run = {
      runId,
      socketPath: `/tmp/${runId}.sock`,
      token: `token-${runId}`,
      contract: { seal: `seal-${runId}`, ask, acceptance, semantic: { objective: ask }, budget: {} },
      startOptions,
      store: { directory, readJson: () => ({ fingerprint: "sha256:test", files: {} }) },
      handled: [],
      async handleHook(payload) {
        this.handled.push(payload.input.hook_event_name);
        return { decision: { verdict: "allow" },
          output: payload.input.hook_event_name === "Stop" ? { decision: "approve" } : {} };
      },
      async finish() {
        if (finishError) throw finishError;
        return finishResult ?? { acceptance: { passed: true },
          proof: { complete: true, deliveryComplete: true }, evidence: { ok: true } };
      },
      async supersede() { this.superseded = true; },
    };
    calls.push(run);
    return run;
  };
}

test("normal host lifecycle transparently boots the kernel, stays silent, and finalizes proof", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  const calls = [];
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: fakeRunFactory(calls) });
  const base = { agent: "claude-code", input: { session_id: "native-1", cwd } };
  assert.deepEqual((await daemon.handleHook({ ...base,
    input: { ...base.input, hook_event_name: "SessionStart" } })).output, {});
  const submitted = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "UserPromptSubmit", prompt: "fix the real architecture" } });
  assert.equal(calls.length, 0, "ordinary prompt submission does not wait for contract model calls");
  assert.deepEqual(submitted.output, {});
  const tool = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/a.js" } } });
  assert.equal(calls.length, 1, "the kernel is ready before the first tool executes");
  assert.match(tool.output.hookSpecificOutput.additionalContext, /Outsider controlled worker mandate/);
  const stop = await daemon.handleHook({ ...base,
    input: { ...base.input, hook_event_name: "Stop" } });
  assert.equal(stop.output.decision, "approve");
  const sessionKey = attachedSessionKey(base.input);
  const persisted = JSON.parse(readFileSync(path.join(root, "sessions", sessionKey, "session.json"), "utf8"));
  assert.equal(persisted.active, null);
  assert.equal(persisted.completedRuns[0].proofComplete, true);
  rmSync(root, { recursive: true, force: true });
});

test("verified delivery without causal attribution ends visibly and repeated Stop is idempotent", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  const calls = [];
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: fakeRunFactory(calls, { finishResult: {
      acceptance: { passed: true }, evidence: { ok: true },
      proof: { complete: false, deliveryComplete: true,
        interventionRequired: true, interventionComplete: false },
    } }) });
  const base = { agent: "claude-code", input: { session_id: "unattributed-1", cwd } };
  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "UserPromptSubmit", prompt: "repair the semantic defect" } });
  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/a.js" } } });
  const stop = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "Stop" } });
  assert.equal(stop.output.decision, "approve");
  assert.match(stop.output.systemMessage, /已独立验证为正确.*缺少完整.*因果链/);
  const sessionKey = attachedSessionKey(base.input);
  const file = path.join(root, "sessions", sessionKey, "session.json");
  const persisted = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(persisted.active, null);
  assert.equal(persisted.completedRuns[0].status, "delivered-unattributed");
  assert.equal(persisted.completedRuns[0].proofComplete, false);
  assert.equal(persisted.completedRuns[0].deliveryComplete, true);
  const repeated = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "Stop" } });
  assert.equal(repeated.output.decision, "approve");
  assert.match(repeated.output.systemMessage, /重复 Stop 已幂等放行/);
  rmSync(root, { recursive: true, force: true });
});

test("a finalized conservative stop discloses red and never creates an unrecoverable Stop wall", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  const calls = [];
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: fakeRunFactory(calls, { finishResult: {
      acceptance: { passed: false }, evidence: { ok: true },
      proof: { complete: false, deliveryComplete: false,
        interventionRequired: true, interventionComplete: false },
    } }) });
  const base = { agent: "claude-code", input: { session_id: "conservative-1", cwd } };
  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "UserPromptSubmit", prompt: "finish safely" } });
  await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/a.js" } } });
  const stop = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "Stop" } });
  assert.equal(stop.output.decision, "approve");
  assert.match(stop.output.systemMessage, /已终止为红.*不得视为交付/);
  const repeated = await daemon.handleHook({ ...base, input: { ...base.input,
    hook_event_name: "Stop" } });
  assert.equal(repeated.output.decision, "approve");
  assert.match(repeated.output.systemMessage, /保守停机.*不是完成/);
  rmSync(root, { recursive: true, force: true });
});

test("an inherited session id crossing cwd fails closed and is disclosed", async () => {
  const root = temp();
  const firstCwd = path.join(root, "repo-a");
  const secondCwd = path.join(root, "repo-b");
  for (const cwd of [firstCwd, secondCwd]) {
    mkdirSync(cwd);
    writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ scripts: { test: "node test.mjs" } }));
  }
  const calls = [];
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    startRun: fakeRunFactory(calls) });
  await daemon.handleHook({ agent: "claude-code", input: {
    hook_event_name: "SessionStart", session_id: "inherited", cwd: firstCwd,
  } });
  const collision = await daemon.handleHook({ agent: "claude-code", input: {
    hook_event_name: "PreToolUse", session_id: "inherited", cwd: secondCwd,
    tool_name: "Read", tool_input: { file_path: "src/a.js" },
  } });
  assert.equal(collision.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(collision.output.hookSpecificOutput.permissionDecisionReason, /不同 cwd/);
  assert.equal(calls.length, 0, "a collided identity must never bootstrap or merge trajectories");
  const key = attachedSessionKey({ session_id: "inherited" });
  const ledger = JSON.parse(readFileSync(path.join(root, "sessions", key, "session.json"), "utf8"));
  assert.equal(ledger.identityConflicts.length, 1);
  assert.equal(ledger.cwd, firstCwd);
  rmSync(root, { recursive: true, force: true });
});

test("a restarted attached daemon waits for controller quiescence before sealing", async () => {
  const root = temp();
  const cwd = path.join(root, "repo");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
  const transcript = path.join(cwd, "session.jsonl");
  writeFileSync(transcript, "");
  const acceptance = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
  const semantic = { objective: "preserve value", successCriteria: ["value remains valid"],
    architecturalConstraints: [], forbiddenShortcuts: [],
    scope: { in: ["value.js"], out: [] }, uncertainties: [] };
  const supervisorBody = `process.stdout.write(JSON.stringify({onTrack:true,drift:"",plan:[],`
    + `expectedNextActions:[],acceptanceRisk:"low",passed:true,gaps:[],`
    + `evidence:["unchanged baseline satisfies contract"],errors:[],`
    + `verifiedFacts:["evidence supports the decision"]}))`;
  const supervisorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(supervisorBody)}`;
  const run = await startKernelRun({
    cwd, ask: "preserve value", acceptance,
    supervisorCommand,
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot: path.join(root, "runs"), attachedMode: true,
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: ({ command }) => ({ ran: true, passed: true, exit: 0,
      command, output: "baseline green" }),
    contractCompiler: () => ({ ok: true, semantic, attempts: 1, packetBytes: 1 }),
    contractAuditor: () => ({ ok: true, verdict: { passed: true, errors: [],
      verifiedFacts: ["operator meaning preserved"] }, attempts: 1, packet: {} }),
    baselineOutcomeAuditor: () => ({ ok: true, packet: {}, verdict: { passed: true,
      errors: [], verifiedFacts: ["unchanged baseline satisfies the contract"] } }),
  });
  const sessionKey = attachedSessionKey({ session_id: "recovered-finish" });
  const ledger = new AttachedLedger({ root, sessionKey, host: "claude-code", cwd });
  ledger.addPrompt("preserve value");
  ledger.setActive({ status: "running", runId: run.runId, runDirectory: run.store.directory,
    socketPath: run.socketPath, token: run.token, contract: run.contract,
    ask: "preserve value", mandateDelivered: true, startedAt: new Date().toISOString() });
  const restartedDaemon = new AttachedDaemonController({ root,
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    startRun: async () => { throw new Error("must reconnect, not rebootstrap"); } });
  try {
    const stopped = await restartedDaemon.handleHook({ agent: "claude-code", input: {
      hook_event_name: "Stop", session_id: "recovered-finish", cwd,
      transcript_path: transcript,
    } });
    assert.equal(stopped.output.decision, "approve");
    assert.equal(verifyStage05RunDirectory(run.store.directory).ok, true);
    assert.equal(run.watchdog.restarts, 0,
      "a terminal controller exit must not create a post-finalize recovery generation");
    const events = run.store.events();
    assert.equal(events.at(-1).type, "run_finalized");
    assert.equal(events.filter((event) => event.type === "controller_recovered").length, 0);
  } finally {
    await run.watchdog.close().catch(() => undefined);
    await restartedDaemon.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("daemon and controller can restart together on the same attached run identity", async () => {
  const root = temp();
  const cwd = path.join(root, "repo-joint-recovery");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 1;\n");
  const transcript = path.join(cwd, "session.jsonl");
  writeFileSync(transcript, "");
  const acceptance = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
  const semantic = { objective: "preserve value", successCriteria: ["value remains valid"],
    architecturalConstraints: [], forbiddenShortcuts: [],
    scope: { in: ["value.js"], out: [] }, uncertainties: [] };
  const supervisorBody = `process.stdout.write(JSON.stringify({onTrack:true,drift:"",plan:[],`
    + `expectedNextActions:[],acceptanceRisk:"low",passed:true,gaps:[],`
    + `evidence:["unchanged baseline satisfies contract"],errors:[],`
    + `verifiedFacts:["evidence supports the decision"]}))`;
  const supervisorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(supervisorBody)}`;
  const run = await startKernelRun({ cwd, ask: "preserve value", acceptance,
    supervisorCommand, hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot: path.join(root, "runs"), attachedMode: true,
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: ({ command }) => ({ ran: true, passed: true, exit: 0,
      command, output: "baseline green" }),
    contractCompiler: () => ({ ok: true, semantic, attempts: 1, packetBytes: 1 }),
    contractAuditor: () => ({ ok: true, verdict: { passed: true, errors: [],
      verifiedFacts: ["operator meaning preserved"] }, attempts: 1, packet: {} }),
    baselineOutcomeAuditor: () => ({ ok: true, packet: {}, verdict: { passed: true,
      errors: [], verifiedFacts: ["unchanged baseline satisfies the contract"] } }),
  });
  const sessionKey = attachedSessionKey({ session_id: "joint-recovery" });
  const ledger = new AttachedLedger({ root, sessionKey, host: "claude-code", cwd });
  ledger.addPrompt("preserve value");
  ledger.setActive({ status: "running", runId: run.runId, runDirectory: run.store.directory,
    socketPath: run.socketPath, token: run.token, contract: run.contract,
    ask: "preserve value", mandateDelivered: true, startedAt: new Date().toISOString() });
  const originalOwner = run.watchdog.ownerId;
  const originalGeneration = run.watchdog.generation;
  run.watchdog.crashForTest("SIGKILL");
  /* Simulate the daemon dying before its watchdog can launch generation 2. */
  await run.watchdog.close().catch(() => undefined);

  const restarted = new AttachedDaemonController({ root,
    hookEntry: path.resolve("bin/outsider-hook.mjs"), supervisorCommand,
    startRun: async () => { throw new Error("must recover the existing run, not bootstrap"); } });
  try {
    const response = await restarted.handleHook({ agent: "claude-code", input: {
      hook_event_name: "PreToolUse", session_id: "joint-recovery", cwd,
      transcript_path: transcript, tool_name: "Read", tool_input: { file_path: "value.js" },
    } });
    assert.equal(response.output.hookSpecificOutput.permissionDecision, "allow");
    const reopened = RunStore.open({ directory: run.store.directory, supervisorCommand });
    const recovered = reopened.events().find((event) => event.type === "controller_recovered");
    assert.equal(recovered.generation, originalGeneration + 1);
    assert.equal(recovered.replacingOwnerId, originalOwner);
    assert.equal(reopened.readState().runId, run.runId);
    assert.equal(ledger.read().active.runId, run.runId);
  } finally {
    await restarted.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("normal outsider hook lazily starts one background daemon without outsider run", (t) => {
  const root = temp();
  const hook = path.resolve("bin/outsider-hook.mjs");
  const payload = { _outsiderAttachedPing: true, hook_event_name: "SessionStart",
    session_id: "smoke", cwd: root };
  const result = spawnSync(process.execPath, [hook, "claude-code"], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
  if (/ATTACHED_DAEMON_START_TIMEOUT/.test(result.stderr)
    && !statOrNull(path.join(root, "daemon.json"))) {
    rmSync(root, { recursive: true, force: true });
    t.skip("local IPC is prohibited by the test sandbox; release conformance runs outside it");
    return;
  }
  const descriptor = JSON.parse(readFileSync(path.join(root, "daemon.json"), "utf8"));
  assert.ok(descriptor.pid > 0);
  assert.equal(statSync(root).mode & 0o077, 0);
  writeFileSync(path.join(root, "daemon.json"), JSON.stringify({
    ...descriptor, packageRoot: path.join(root, "stale-plugin-runtime"),
  }));
  const upgraded = spawnSync(process.execPath, [hook, "claude-code"], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(upgraded.status, 0, upgraded.stderr);
  const upgradedDescriptor = JSON.parse(readFileSync(path.join(root, "daemon.json"), "utf8"));
  assert.notEqual(upgradedDescriptor.pid, descriptor.pid,
    "an authenticated sidecar from a different plugin package is retired automatically");
  assert.equal(path.resolve(upgradedDescriptor.packageRoot), path.resolve("."));
  writeFileSync(path.join(root, "daemon.json"), JSON.stringify({
    ...upgradedDescriptor,
    transport: "system-helper",
    protocolVersion: 1,
    packageRoot: path.join(root, "native-stable-runtime"),
  }));
  const desktop = spawnSync(process.execPath, [hook, "claude-desktop"], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(desktop.status, 0, desktop.stderr);
  assert.equal(JSON.parse(readFileSync(path.join(root, "daemon.json"), "utf8")).pid,
    upgradedDescriptor.pid, "a compatible native helper survives plugin package upgrades");
  try { process.kill(upgradedDescriptor.pid, "SIGKILL"); } catch { /* already exited */ }
  const restarted = spawnSync(process.execPath, [hook, "claude-code"], {
    input: JSON.stringify(payload), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(restarted.status, 0, restarted.stderr);
  const descriptor2 = JSON.parse(readFileSync(path.join(root, "daemon.json"), "utf8"));
  assert.notEqual(descriptor2.pid, upgradedDescriptor.pid,
    "the next ordinary hook replaces a dead sidecar");
  try { process.kill(descriptor2.pid, "SIGTERM"); } catch { /* already exited */ }
  rmSync(root, { recursive: true, force: true });
});

test("a Cowork session without a helper handshake is observer-only and never bricks tools", () => {
  const root = temp();
  const hook = path.resolve("bin/outsider-hook.mjs");
  const input = { hook_event_name: "PreToolUse", session_id: "desktop-missing-helper",
    cwd: root, tool_name: "Read", tool_input: { file_path: "x" } };
  const result = spawnSync(process.execPath, [hook, "claude-desktop"], {
    input: JSON.stringify(input),
    encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(result.status, 0, result.stderr);
  const allowed = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(allowed.permissionDecision, "allow");
  assert.match(allowed.permissionDecisionReason,
    /OUTSIDER_OBSERVER_ONLY_REMOTE_HELPER_UNREACHABLE/);
  assert.equal(existsSync(desktopSessionCapabilityFile(root,
    { agent: "claude-desktop", input })), true);
  const stopped = spawnSync(process.execPath, [hook, "claude-desktop"], {
    input: JSON.stringify({ ...input, hook_event_name: "Stop" }), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(JSON.parse(stopped.stdout).decision, "approve");
  assert.match(JSON.parse(stopped.stdout).systemMessage, /cannot receive a Stage 0\.5/);
  assert.equal(existsSync(path.join(root, "daemon.json")), false,
    "the hosted plugin never spawns a misleading sandbox supervisor");
  rmSync(root, { recursive: true, force: true });
});

test("a Cowork session loses tools only after its authenticated helper handshake is lost", () => {
  const root = temp();
  const hook = path.resolve("bin/outsider-hook.mjs");
  const input = { hook_event_name: "PreToolUse", session_id: "desktop-controlled-helper-lost",
    cwd: root, tool_name: "Read", tool_input: { file_path: "x" } };
  const capability = desktopSessionCapabilityFile(root, { agent: "claude-desktop", input });
  mkdirSync(path.dirname(capability), { recursive: true });
  writeFileSync(capability, JSON.stringify({
    schema: "outsider/desktop-session-capability/v1",
    sessionIdentityHash: `sha256:${path.basename(capability, ".json")}`,
    status: "controlled",
    reason: "authenticated-system-helper-handshake",
    establishedAt: new Date().toISOString(),
  }));
  const result = spawnSync(process.execPath, [hook, "claude-desktop"], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 15_000,
    env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root, OUTSIDER_BUDGET_MS: "12000" },
  });
  assert.equal(result.status, 0, result.stderr);
  const denied = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(denied.permissionDecision, "deny");
  assert.match(denied.permissionDecisionReason, /DESKTOP_SYSTEM_HELPER_REQUIRED/);
  rmSync(root, { recursive: true, force: true });
});

function statOrNull(file) {
  try { return statSync(file); } catch { return null; }
}
