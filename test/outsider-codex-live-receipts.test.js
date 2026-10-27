import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyCodexControllerReceipt } from "../src/outsider-codex-control-evidence.js";
import {
  CodexLiveReceiptStore, loadCodexLiveReceiptBundles,
} from "../src/outsider-codex-live-receipts.js";
import { AttachedDaemonController } from "../src/outsider-attached-daemon.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";

const H = workerDigest;
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function metadata(file, event = "preToolUse") {
  const currentHash = H(`hook:${event}`);
  const command = '"/usr/local/bin/node" "/opt/outsider-hook.mjs" hook codex --attached-control';
  const hooksList = { data: [{ cwd: "/private/work", hooks: [{ eventName: event,
    enabled: true, trustStatus: "trusted", currentHash, command,
    sourcePath: "/private/hooks.json" }], warnings: [], errors: [] }] };
  const body = { schema: "outsider/codex-same-connection-hook-metadata/v1",
    recordedAt: "2026-08-21T00:00:00.000Z", cwdHash: H("/private/work"), hooksList };
  writeFileSync(file, JSON.stringify({ ...body,
    snapshotHash: H({ domain: body.schema, body }) }), { mode: 0o600 });
  return currentHash;
}

test("production Codex receipts persist private sources and replay payload without claiming delivery or recovery", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-codex-live-"));
  const metadataFile = path.join(root, "hook-metadata.json");
  const currentHash = metadata(metadataFile);
  const store = new CodexLiveReceiptStore({ root });
  const input = { hook_event_name: "PreToolUse", session_id: "thread-live",
    turn_id: "turn-live", tool_use_id: "item-live", cwd: "/private/work",
    tool_name: "Bash", tool_input: { command: "private command" } };
  const first = store.record({ input, result: { decision: { verdict: "allow" },
    output: { hookSpecificOutput: { hookEventName: "PreToolUse",
      permissionDecision: "allow" } } }, controllerPath: "KERNEL_CONTROLLER",
    runtime: { hookMetadataFile: metadataFile,
      entrypointHash: H("entry"), argvHash: H("argv") },
    capturedAt: new Date("2026-08-21T00:00:01.000Z") });
  assert.equal(first.receipt.hookCurrentHash, currentHash);
  assert.deepEqual(first.receipt.runtimeClaims, { controllerPath: "KERNEL_CONTROLLER",
    kernelControllerInvoked: true, payloadCaptured: true, hostDeliveryObserved: false,
    outsiderDecisionAttributed: true, semanticRecoveryEstablished: false, invokedModel: false });
  assert.equal(first.receipt.identityProvenance.sessionId, "HOST_SESSION_ID_FALLBACK");
  assert.equal(first.receipt.identityProvenance.threadId, "HOST_THREAD_ID");
  assert.equal(statSync(first.sourceFile).mode & 0o777, 0o600);
  assert.equal(statSync(first.receiptFile).mode & 0o777, 0o600);
  const trusted = [first.controllerKeyId];
  const checked = verifyCodexControllerReceipt(first.receipt,
    { trustedControllerKeyIds: trusted, source: first.source });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, true);

  const tampered = structuredClone(first.source);
  tampered.controllerResult.output.hookSpecificOutput.permissionDecision = "deny";
  assert.equal(verifyCodexControllerReceipt(first.receipt,
    { trustedControllerKeyIds: trusted, source: tampered }).ok, false);
  assert.equal(verifyCodexControllerReceipt(first.receipt,
    { trustedControllerKeyIds: trusted }).ok, false,
  "a signed hash-only receipt cannot replace its private canonical source");

  metadata(metadataFile, "postToolUse");
  const second = store.record({ input: { ...input, hook_event_name: "PostToolUse",
    tool_response: { success: true, output: "private result" } },
  result: { decision: { verdict: "allow" }, output: {} },
  controllerPath: "KERNEL_CONTROLLER", runtime: { hookMetadataFile: metadataFile,
    entrypointHash: H("entry"), argvHash: H("argv") },
  capturedAt: new Date("2026-08-21T00:00:02.000Z") });
  assert.equal(second.receipt.previousReceiptHash, first.receipt.receiptHash);
  assert.match(second.receipt.outcomeHash, /^sha256:/);
  const loaded = loadCodexLiveReceiptBundles({ root, threadIds: ["thread-live"] });
  assert.equal(loaded.length, 2);
  assert.deepEqual(loaded.map((entry) => entry.receiptHash),
    [first.receipt.receiptHash, second.receipt.receiptHash]);
  assert.equal(JSON.stringify(first.receipt).includes("private command"), false);
});

test("real attached Codex policy emits receipts with zero model calls and fails closed if persistence breaks", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-codex-attached-"));
  const workspace = mkdtempSync(path.join(tmpdir(), "outsider-codex-workspace-"));
  let modelOrRunCalls = 0;
  const daemon = new AttachedDaemonController({ root, hookEntry: "/hook.mjs",
    supervisorCommand: ["/bin/false"], startRun: async () => {
      modelOrRunCalls += 1;
      throw new Error("must not start for observer-only zero-model probe");
    } });
  const common = { session_id: "thread-zero-model", turn_id: "turn-zero-model",
    cwd: workspace, transcript_path: null };
  await daemon.handleHook({ agent: "codex", input: { ...common,
    hook_event_name: "SessionStart" }, codexRuntime: {} });
  await daemon.handleHook({ agent: "codex", input: { ...common,
    hook_event_name: "UserPromptSubmit", prompt: "read only" }, codexRuntime: {} });
  const pre = await daemon.handleHook({ agent: "codex", input: { ...common,
    hook_event_name: "PreToolUse", tool_use_id: "read-1", tool_name: "Read",
    tool_input: { file_path: "README.md" } }, codexRuntime: {} });
  assert.equal(pre.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(modelOrRunCalls, 0);
  const loaded = loadCodexLiveReceiptBundles({ root, threadIds: [common.session_id] });
  assert.equal(loaded.length, 3);
  const preBundle = loaded.find((entry) => entry.receipt.eventName === "preToolUse");
  assert.equal(preBundle.receipt.runtimeClaims.controllerPath, "ATTACHED_POLICY");
  assert.equal(preBundle.receipt.runtimeClaims.kernelControllerInvoked, false);
  assert.equal(preBundle.receipt.runtimeClaims.hostDeliveryObserved, false);

  daemon.codexReceiptStore.record = () => { throw new Error("simulated-disk-failure"); };
  const denied = await daemon.handleHook({ agent: "codex", input: { ...common,
    hook_event_name: "PreToolUse", tool_use_id: "read-2", tool_name: "Read",
    tool_input: { file_path: "README.md" } }, codexRuntime: {} });
  assert.equal(denied.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.output.hookSpecificOutput.permissionDecisionReason,
    /receipt 未能安全持久化/);

  daemon.codexReceiptStore.record = CodexLiveReceiptStore.prototype.record.bind(
    daemon.codexReceiptStore);
  daemon.handleHookCore = async () => ({ decision: { verdict: "allow" },
    output: { _outsiderStderr: "Outsider controller 不可用：simulated" } });
  const failedVisible = await daemon.handleHook({ agent: "codex", input: { ...common,
    hook_event_name: "PostToolUse", tool_use_id: "read-3", tool_name: "Read",
    tool_input: { file_path: "README.md" }, tool_response: { success: true } },
  codexRuntime: {} });
  assert.match(failedVisible.output._outsiderStderr, /controller 不可用/);
  const afterFailure = loadCodexLiveReceiptBundles({ root,
    threadIds: [common.session_id] }).at(-1).receipt;
  assert.equal(afterFailure.runtimeClaims.controllerPath, "ATTACHED_FAIL_VISIBLE");
  assert.equal(afterFailure.availability.controllerAvailable, false);
  assert.equal(afterFailure.availability.failVisible, true);
  await daemon.close();
});

test("shipped Codex hook emits a source-replayed receipt through the authenticated daemon", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-codex-hook-probe-"));
  const workspace = mkdtempSync(path.join(tmpdir(), "outsider-codex-hook-workspace-"));
  const run = spawnSync(process.execPath,
    [path.join(rootDirectory, "bin", "outsider-hook.mjs"),
      "hook", "codex", "--attached-control"], {
      input: JSON.stringify({ hook_event_name: "SessionStart",
        session_id: "thread-production-zero-model", cwd: workspace,
        transcript_path: null, model: "none", permission_mode: "default" }),
      encoding: "utf8", timeout: 15_000,
      env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root,
        OUTSIDER_BUDGET_MS: "12000" },
    });
  if (run.status !== 0 && /listen EPERM|local IPC is prohibited/.test(run.stderr)) {
    t.skip("local IPC is prohibited by this test sandbox");
    return;
  }
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotThrow(() => JSON.parse(run.stdout || "{}"));
  try {
    const bundles = loadCodexLiveReceiptBundles({ root,
      threadIds: ["thread-production-zero-model"] });
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0].receipt.eventName, "sessionStart");
    assert.equal(bundles[0].receipt.runtimeClaims.payloadCaptured, true);
    assert.equal(bundles[0].receipt.runtimeClaims.hostDeliveryObserved, false);
    assert.equal(bundles[0].receipt.runtimeClaims.semanticRecoveryEstablished, false);
    assert.equal(bundles[0].receipt.runtimeClaims.invokedModel, false);
  } finally {
    try {
      const daemon = JSON.parse(readFileSync(path.join(root, "daemon.json"), "utf8"));
      if (Number.isSafeInteger(daemon.pid) && daemon.pid > 1) process.kill(daemon.pid, "SIGTERM");
    } catch { /* already stopped */ }
  }
});
