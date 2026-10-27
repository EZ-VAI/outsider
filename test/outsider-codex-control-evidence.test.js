import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assessCodexStage05Control, codexControlKeyId,
  createCodexAppServerControlTrace, createCodexControllerReceipt,
  createCodexControllerReceiptFromSource, createCodexControllerReceiptSource,
  verifyCodexAppServerControlTrace, verifyCodexControllerReceipt,
  verifyCodexStage05ControlAssessment,
} from "../src/outsider-codex-control-evidence.js";
import { canonicalizeStrict } from "../src/canonical.js";
import { createCodexHookCapabilityProbe } from "../src/outsider-codex-worker-adapter.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";
import { handleHookInvocation } from "../src/outsider-hook.js";
import { hookConfigFor, mergeHookConfig } from "../src/outsider-agents.js";
import { kernelAgentForAttachedHost } from "../src/outsider-attached-daemon.js";
import { OutsiderKernelController } from "../src/outsider-kernel-controller.js";
import { CodexLiveReceiptStore } from "../src/outsider-codex-live-receipts.js";

const keypair = () => generateKeyPairSync("ed25519", {
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const recorder = keypair();
const controller = keypair();
const attacker = keypair();
const H = (value) => workerDigest(value);
const hookHash = H("one-installed-attached-command");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eventNames = ["preToolUse", "permissionRequest", "postToolUse", "preCompact",
  "postCompact", "sessionStart", "userPromptSubmit", "subagentStart", "subagentStop", "stop"];
const outputKinds = ["warning", "stop", "feedback", "context", "error"];
const methods = ["hook/started", "hook/completed", "item/started", "item/completed",
  "turn/started", "turn/completed", "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval", "item/permissions/requestApproval"];
const requiredHooks = ["sessionStart", "userPromptSubmit", "preToolUse", "postToolUse", "stop"];

function fixture({ trustStatus = "trusted", command = "outsider hook codex --attached-control",
  exposesHookItemIdentity = true } = {}) {
  const binaryBytes = Buffer.from("codex-native-0.144.5-fixture");
  const schemaBytes = Buffer.from(JSON.stringify({ definitions: {
    HookEventName: { enum: eventNames }, HookOutputEntryKind: { enum: outputKinds },
    ServerMethods: { enum: methods },
    HookRunSummary: { type: "object", properties: exposesHookItemIdentity
      ? { itemId: { type: "string" } } : {} },
  } }));
  const nativeHooks = requiredHooks.map((eventName) => ({ eventName, enabled: true,
    trustStatus, currentHash: hookHash, command }));
  const hooksList = { data: [{ hooks: nativeHooks }] };
  const hookProbe = createCodexHookCapabilityProbe({ binaryVersion: "0.144.5",
    binarySha256: H(binaryBytes), schemaBundleHash: H(schemaBytes),
    eventNames, outputEntryKinds: outputKinds,
    configuredHooks: nativeHooks.map(({ command: _command, ...hook }) => hook) });
  return { binaryBytes, schemaBytes, hooksList, hookProbe };
}

function hookRun(id, eventName, status, { includeItemIdentity = true } = {}) {
  return { id, eventName, handlerType: "command", executionMode: "sync",
    scope: "user", sourcePath: "/private/trusted/hooks.json", source: "user",
    displayOrder: 0, status, statusMessage: null, startedAt: 1,
    completedAt: status === "running" ? null : 2,
    durationMs: status === "running" ? null : 1, entries: [],
    ...(includeItemIdentity && ["preToolUse", "postToolUse"].includes(eventName)
      ? { itemId: "item-allow" } : {}) };
}

function traceSource(hooksList, { includeHookList = true, blockPre = false,
  hookItemIdentity = true } = {}) {
  const frames = [];
  const add = (direction, message) => frames.push({ sequence: frames.length, direction, message });
  if (includeHookList) {
    add("CLIENT_TO_SERVER", { id: "outsider-hooks", method: "hooks/list",
      params: { cwds: ["/private/work"] } });
    add("SERVER_TO_CLIENT", { id: "outsider-hooks", result: hooksList });
  }
  add("SERVER_TO_CLIENT", { method: "thread/started", params: { thread: {
    id: "thread-1", sessionId: "session-1", parentThreadId: null,
    cwd: "/private/work", cliVersion: "0.144.5",
  } } });
  add("SERVER_TO_CLIENT", { method: "turn/started", params: {
    threadId: "thread-1", turn: { id: "turn-1", status: "inProgress" },
  } });
  for (const [id, eventName] of [["h-session", "sessionStart"],
    ["h-prompt", "userPromptSubmit"], ["h-pre", "preToolUse"]]) {
    add("SERVER_TO_CLIENT", { method: "hook/started", params: {
      threadId: "thread-1", turnId: eventName === "sessionStart" ? null : "turn-1",
      run: hookRun(id, eventName, "running", { includeItemIdentity: hookItemIdentity }),
    } });
    add("SERVER_TO_CLIENT", { method: "hook/completed", params: {
      threadId: "thread-1", turnId: eventName === "sessionStart" ? null : "turn-1",
      run: hookRun(id, eventName, eventName === "preToolUse" && blockPre ? "blocked" : "completed",
        { includeItemIdentity: hookItemIdentity }),
    } });
  }
  add("SERVER_TO_CLIENT", { method: "item/started", params: {
    threadId: "thread-1", turnId: "turn-1", startedAtMs: 3,
    item: { type: "commandExecution", id: "item-allow", status: "inProgress",
      command: "private", cwd: "/private/work", processId: null },
  } });
  add("SERVER_TO_CLIENT", { method: "item/completed", params: {
    threadId: "thread-1", turnId: "turn-1", completedAtMs: 4,
    item: { type: "commandExecution", id: "item-allow", status: "completed",
      command: "private", cwd: "/private/work", processId: null,
      aggregatedOutput: "private output", exitCode: 0 },
  } });
  add("SERVER_TO_CLIENT", { method: "hook/started", params: {
    threadId: "thread-1", turnId: "turn-1",
    run: hookRun("h-post", "postToolUse", "running", { includeItemIdentity: hookItemIdentity }),
  } });
  add("SERVER_TO_CLIENT", { method: "hook/completed", params: {
    threadId: "thread-1", turnId: "turn-1",
    run: hookRun("h-post", "postToolUse", "completed", { includeItemIdentity: hookItemIdentity }),
  } });
  add("SERVER_TO_CLIENT", { id: "approval-1",
    method: "item/commandExecution/requestApproval", params: {
      threadId: "thread-1", turnId: "turn-1", itemId: "item-deny", startedAtMs: 5,
      command: "private dangerous command", cwd: "/private/work",
    } });
  add("CLIENT_TO_SERVER", { id: "approval-1", result: { decision: "decline" } });
  add("SERVER_TO_CLIENT", { method: "hook/started", params: {
    threadId: "thread-1", turnId: "turn-1", run: hookRun("h-stop", "stop", "running"),
  } });
  add("SERVER_TO_CLIENT", { method: "hook/completed", params: {
    threadId: "thread-1", turnId: "turn-1", run: hookRun("h-stop", "stop", "completed"),
  } });
  add("SERVER_TO_CLIENT", { method: "turn/completed", params: {
    threadId: "thread-1", turn: { id: "turn-1", status: "completed" },
  } });
  return Buffer.from(frames.map((frame) => canonicalizeStrict(frame)).join("\n") + "\n");
}

function rewriteSource(source, mutate) {
  const frames = source.toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  const next = mutate(frames) ?? frames;
  next.forEach((frame, sequence) => { frame.sequence = sequence; });
  return Buffer.from(next.map((frame) => canonicalizeStrict(frame)).join("\n") + "\n");
}

function receipt(eventName, decision, { itemId = null, outcome = null,
  controllerAvailable = true, turnId = "turn-1", privateKeyPem = controller.privateKey,
  hostDeliveryBinding = null, hookCurrentHashValue = hookHash } = {}) {
  return createCodexControllerReceipt({ eventName, sessionId: "session-1",
    threadId: "thread-1", turnId, itemId, hookCurrentHash: hookCurrentHashValue,
    input: { hidden: "input" }, decision, output: { hidden: "output" }, outcome,
    controllerAvailable, hostDeliveryBinding,
    recordedAt: new Date("2026-08-21T00:00:00.000Z"), privateKeyPem });
}

function completeReceipts() {
  return [
    receipt("sessionStart", "OBSERVE", { turnId: null }),
    receipt("userPromptSubmit", "OBSERVE", { turnId: "turn-1" }),
    receipt("preToolUse", "ALLOW", { itemId: "item-allow" }),
    receipt("postToolUse", "OBSERVE", { itemId: "item-allow", outcome: { exitCode: 0 } }),
    receipt("preToolUse", "DENY", { itemId: "item-deny", hostDeliveryBinding: {
      approvalRequestIdHash: H(canonicalizeStrict("approval-1")),
      approvalResponseNativeHash: H({ id: "approval-1", result: { decision: "decline" } }),
    } }),
    receipt("stop", "ALLOW"),
  ];
}

function sealedTrace(parts, source = traceSource(parts.hooksList)) {
  return createCodexAppServerControlTrace(source, { privateKeyPem: recorder.privateKey,
    recordedAt: new Date("2026-08-21T00:00:01.000Z"),
    binarySha256: parts.hookProbe.binary.sha256,
    schemaBundleHash: parts.hookProbe.generatedSchema.bundleHash,
    appServerSchemaBundleHash: H(parts.schemaBytes),
    hookProbeRecordHash: parts.hookProbe.recordHash, bypassedHookTrust: false });
}

test("Codex installer registers the attached lifecycle, not a Pre-only observer", () => {
  const config = hookConfigFor("codex", "/opt/outsider");
  assert.deepEqual(Object.keys(config.value.hooks).sort(),
    ["PostToolUse", "PreCompact", "PreToolUse", "SessionStart", "Stop", "UserPromptSubmit"].sort());
  for (const entries of Object.values(config.value.hooks)) {
    assert.equal(entries.length, 1);
    assert.match(entries[0].hooks[0].command, /hook codex --attached-control$/);
    assert.equal(entries[0].hooks[0].timeout, 900);
  }
});

test("Codex reinstall replaces the old observer command once and preserves user hooks", () => {
  const incoming = hookConfigFor("codex", "/new/outsider").value;
  const existing = { hooks: {
    PreToolUse: [{ matcher: "", hooks: [{ type: "command",
      command: "/old/outsider hook codex" }] }],
    Stop: [{ hooks: [{ type: "command", command: "/user/stop-check" }] }],
  } };
  const once = mergeHookConfig(existing, incoming);
  const twice = mergeHookConfig(once, incoming);
  for (const event of Object.keys(incoming.hooks)) {
    const outsiderEntries = twice.hooks[event].filter((entry) =>
      /outsider/.test(entry.hooks?.[0]?.command ?? ""));
    assert.equal(outsiderEntries.length, 1, `${event} has exactly one controller`);
    assert.match(outsiderEntries[0].hooks[0].command, /--attached-control$/);
  }
  assert.ok(twice.hooks.Stop.some((entry) => entry.hooks?.[0]?.command === "/user/stop-check"));
});

test("standalone Codex PostToolUse is observation-only and never reruns Pre policy", () => {
  const result = handleHookInvocation({ agent: "codex", input: {
    hook_event_name: "PostToolUse", tool_name: "Bash",
    tool_input: { command: "rm -rf /var/data" },
  } });
  assert.equal(result.decision.verdict, "allow");
  assert.deepEqual(result.output, {});
});

test("kernel preserves Codex host identity so its measured rollout parser is selected", () => {
  assert.equal(kernelAgentForAttachedHost("codex"), "codex");
  assert.equal(kernelAgentForAttachedHost("claude-code"), "claude-code");
  assert.equal(kernelAgentForAttachedHost("claude-desktop"), "claude-code",
    "Cowork keeps the public Claude parser while Codex gains its own parser");
  assert.throws(() => kernelAgentForAttachedHost("unknown"), /UNSUPPORTED_ATTACHED_HOST/);
  const kernel = Object.create(OutsiderKernelController.prototype);
  kernel.recordEvaluatorFault = () => {};
  kernel.preTool = ({ agent }) => ({ decision: { verdict: "allow", reason: agent }, output: {} });
  const result = kernel.handleHook({ agent: "codex", input: {
    hook_event_name: "PreToolUse", session_id: "session-1",
    tool_name: "Read", tool_input: { file_path: "x" },
  } });
  assert.equal(result.decision.reason, "codex");
  assert.throws(() => kernel.handleHook({ agent: "unknown", input: {
    hook_event_name: "PreToolUse",
  } }), /UNSUPPORTED_HOST/);
});

test("signature-only fixtures cannot close the live source-replay DoD", () => {
  const parts = fixture();
  const source = traceSource(parts.hooksList);
  const trace = sealedTrace(parts, source);
  const recorderKeyId = codexControlKeyId(recorder.publicKey);
  const controllerKeyId = codexControlKeyId(controller.publicKey);
  const checked = verifyCodexAppServerControlTrace(trace, { source,
    trustedRecorderKeyIds: [recorderKeyId] });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(JSON.stringify(trace).includes("private dangerous command"), false,
    "the signed artifact is a hash-only projection");
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: completeReceipts(), trustedRecorderKeyIds: [recorderKeyId],
    trustedControllerKeyIds: [controllerKeyId] });
  assert.equal(assessment.controlLevel, "ACTION_CONTROLLED_PARTIAL");
  assert.deepEqual(assessment.missingRequirements, ["LIVE_CONTROLLER_RECEIPTS_MISSING"]);
  assert.deepEqual(assessment.doD, { preActionCapture: true,
    controllerDecisionAndIntervention: true, postOutcome: true, stopFinalization: true,
    sessionContextIdentity: true, failVisibleAvailability: true });
  assert.equal(assessment.authority.invokedModel, false);
  assert.equal(assessment.authority.bypassedHookTrust, false);
  const sources = { ...parts, trace, traceSource: source,
    controllerReceipts: completeReceipts(), trustedRecorderKeyIds: [recorderKeyId],
    trustedControllerKeyIds: [controllerKeyId] };
  assert.equal(verifyCodexStage05ControlAssessment(assessment, sources).ok, true);
  const resealed = structuredClone(assessment);
  resealed.controlLevel = "UNCONTROLLED";
  const { assessmentHash: _old, ...body } = resealed;
  resealed.assessmentHash = H(body);
  assert.equal(verifyCodexStage05ControlAssessment(resealed, sources).ok, false,
    "caller resealing cannot replace source replay");
});

test("a caller-signed or tampered trace cannot impersonate the trusted recorder", () => {
  const parts = fixture();
  const source = traceSource(parts.hooksList);
  const forged = createCodexAppServerControlTrace(source, { privateKeyPem: attacker.privateKey,
    recordedAt: new Date("2026-08-21T00:00:01.000Z"),
    binarySha256: parts.hookProbe.binary.sha256,
    schemaBundleHash: parts.hookProbe.generatedSchema.bundleHash,
    appServerSchemaBundleHash: H(parts.schemaBytes),
    hookProbeRecordHash: parts.hookProbe.recordHash });
  assert.equal(verifyCodexAppServerControlTrace(forged, { source,
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)] }).ok, false);
  const trusted = sealedTrace(parts, source);
  const tamperedSource = Buffer.from(source.toString("utf8").replace("item-allow", "item-other"));
  assert.equal(verifyCodexAppServerControlTrace(trusted, { source: tamperedSource,
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)] }).ok, false);
});

test("a host block without an exact controller receipt is not credited to Outsider", () => {
  const parts = fixture();
  const source = traceSource(parts.hooksList, { blockPre: true });
  const trace = sealedTrace(parts, source);
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: [], trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.equal(assessment.controlLevel, "UNCONTROLLED");
  assert.ok(assessment.missingRequirements.includes("PRE_ACTION_CONTROLLER_ITEM_BINDING_MISSING"));
  assert.equal(assessment.doD.controllerDecisionAndIntervention, false);
});

test("Codex 0.144.5 turn-only hook summaries cannot be promoted by temporal adjacency", () => {
  const parts = fixture({ exposesHookItemIdentity: false });
  const source = traceSource(parts.hooksList, { hookItemIdentity: false });
  const trace = sealedTrace(parts, source);
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: completeReceipts(),
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.notEqual(assessment.controlLevel, "LIFECYCLE_CONTROLLED");
  assert.ok(assessment.missingRequirements.includes("APP_SERVER_HOOK_ITEM_ID_NOT_EXPOSED"));
  assert.ok(assessment.missingRequirements.includes("HOST_PRE_ACTION_DELIVERY_MISSING"));
  assert.ok(assessment.missingRequirements.includes("HOST_POST_OUTCOME_DELIVERY_MISSING"));
});

test("a live source-replayed receipt removes only the receipt gap, not host delivery or semantic recovery", () => {
  const parts = fixture({ exposesHookItemIdentity: false });
  const source = traceSource(parts.hooksList, { hookItemIdentity: false });
  const trace = sealedTrace(parts, source);
  const receiptSource = createCodexControllerReceiptSource({ input: {
    hook_event_name: "PreToolUse", session_id: "thread-1", turn_id: "turn-1",
    tool_use_id: "item-allow", tool_name: "Bash", tool_input: { command: "private" },
  }, result: { decision: { verdict: "allow" }, output: { hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: "allow" } } },
  hookMetadata: { eventName: "preToolUse", currentHash: hookHash,
    trustStatus: "trusted", commandHash: H("command"), sourcePathHash: H("path"),
    metadataSnapshotHash: H("metadata") }, controllerPath: "KERNEL_CONTROLLER",
  controllerAvailable: true, capturedAt: new Date("2026-08-21T00:00:00.000Z"),
  invocation: { agent: "codex", attachedControl: true, bypassedHookTrust: false,
    entrypointHash: H("entry"), argvHash: H("argv"),
    signingKeySource: "APP_SERVER_RECORDER_PINNED" } });
  const live = createCodexControllerReceiptFromSource(receiptSource,
    { privateKeyPem: controller.privateKey });
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: [live], controllerReceiptSources: [{ receiptHash: live.receiptHash,
      source: receiptSource }], trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.equal(assessment.controlLevel, "UNCONTROLLED");
  assert.equal(assessment.missingRequirements.includes("LIVE_CONTROLLER_RECEIPTS_MISSING"), false);
  assert.equal(assessment.claimBoundary.payload.canonicalHookSourceReplayed, true);
  assert.equal(assessment.claimBoundary.hostDelivery.exactActionCrossBinding, false);
  assert.equal(assessment.claimBoundary.outsiderAttribution.trustedSignedReceipt, true);
  assert.equal(assessment.claimBoundary.semanticRecovery.established, false);
  assert.ok(assessment.missingRequirements.includes("APP_SERVER_HOOK_ITEM_ID_NOT_EXPOSED"));
  assert.ok(assessment.missingRequirements.includes("HOST_PRE_ACTION_DELIVERY_MISSING"));
});

test("host lifecycle gaps and hook failures remain disqualifying", () => {
  const parts = fixture();
  const source = rewriteSource(traceSource(parts.hooksList), (frames) => {
    const failed = frames.find((frame) => frame.message.method === "hook/completed"
      && frame.message.params?.run?.eventName === "postToolUse");
    failed.message.params.run.status = "failed";
    return frames.filter((frame) => !(frame.message.method === "hook/completed"
      && frame.message.params?.run?.eventName === "sessionStart"));
  });
  const trace = sealedTrace(parts, source);
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: completeReceipts(),
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.notEqual(assessment.controlLevel, "LIFECYCLE_CONTROLLED");
  assert.ok(assessment.missingRequirements.includes("HOST_TRACE_GAP:HOOK_FAILURE_OBSERVED"));
  assert.ok(assessment.missingRequirements.includes("HOST_SESSION_START_DELIVERY_MISSING"));
});

test("ambiguous duplicate JSON-RPC request IDs are rejected during source replay", () => {
  const parts = fixture();
  const source = rewriteSource(traceSource(parts.hooksList), (frames) => {
    frames.splice(1, 0, structuredClone(frames[0]));
    return frames;
  });
  assert.throws(() => sealedTrace(parts, source), /TRACE_DUPLICATE_REQUEST_ID/);
});

test("cross-turn receipts, missing same-connection trust, and trust bypass fail closed", () => {
  const bypass = fixture({ command: "outsider hook codex --attached-control --dangerously-bypass-hook-trust" });
  const source = traceSource(bypass.hooksList, { includeHookList: false });
  const trace = sealedTrace(bypass, source);
  const receipts = completeReceipts();
  receipts[2] = receipt("preToolUse", "ALLOW", { itemId: "item-allow", turnId: "turn-other" });
  const assessment = assessCodexStage05Control({ ...bypass, trace, traceSource: source,
    controllerReceipts: receipts,
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.notEqual(assessment.controlLevel, "LIFECYCLE_CONTROLLED");
  assert.ok(assessment.missingRequirements.includes("HOOK_TRUST_BYPASS_PRESENT"));
  assert.ok(assessment.missingRequirements.includes("HOOK_TRUST_SAME_CONNECTION_NOT_PROVEN"));
  assert.ok(assessment.missingRequirements.includes("PRE_ACTION_CONTROLLER_ITEM_BINDING_MISSING"));
});

test("controller receipt schema and trust boundary reject mutation and attacker keys", () => {
  const valid = receipt("preToolUse", "DENY", { itemId: "item-deny" });
  assert.equal(verifyCodexControllerReceipt(valid,
    { trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] }).ok, true);
  const mutated = structuredClone(valid);
  mutated.decision = "ALLOW";
  assert.equal(verifyCodexControllerReceipt(mutated,
    { trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] }).ok, false);
  const untrusted = receipt("preToolUse", "DENY",
    { itemId: "item-deny", privateKeyPem: attacker.privateKey });
  assert.equal(verifyCodexControllerReceipt(untrusted,
    { trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] }).ok, false);
  assert.throws(() => receipt("preToolUse", "OBSERVE", { itemId: "item-allow" }),
    /PRE_DECISION_REQUIRED/);
  assert.throws(() => receipt("stop", "OBSERVE"), /STOP_DECISION_REQUIRED/);
});

test("missing native delivery, wrong installed hash, and duplicate receipts cannot promote", () => {
  const parts = fixture();
  const source = traceSource(parts.hooksList);
  const trace = sealedTrace(parts, source);
  const receipts = completeReceipts();
  receipts[4] = receipt("preToolUse", "DENY", { itemId: "item-deny" });
  receipts[2] = receipt("preToolUse", "ALLOW", { itemId: "item-allow",
    hookCurrentHashValue: H("different-installed-hook") });
  receipts.push(receipt("preToolUse", "DENY", { itemId: "item-allow" }));
  const assessment = assessCodexStage05Control({ ...parts, trace, traceSource: source,
    controllerReceipts: receipts,
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)],
    trustedControllerKeyIds: [codexControlKeyId(controller.publicKey)] });
  assert.notEqual(assessment.controlLevel, "LIFECYCLE_CONTROLLED");
  assert.ok(assessment.missingRequirements.includes("EXACT_HOST_CONTROLLER_INTERVENTION_MISSING"));
  assert.ok(assessment.missingRequirements.includes("CONTROLLER_RECEIPT_HOOK_HASH_MISMATCH"));
  assert.ok(assessment.missingRequirements.includes("CONTROLLER_RECEIPT_DUPLICATE"));
});

test("metadata-only or untrusted hooks remain UNCONTROLLED with machine gaps", () => {
  const parts = fixture({ trustStatus: "untrusted", command: "outsider hook codex" });
  const assessment = assessCodexStage05Control({ ...parts });
  assert.equal(assessment.controlLevel, "UNCONTROLLED");
  assert.ok(assessment.missingRequirements.includes("SIGNED_APP_SERVER_TRACE_MISSING"));
  assert.ok(assessment.missingRequirements.includes("CONTROL_HOOK_NOT_TRUSTED_ATTACHED:preToolUse"));
  assert.equal(assessment.authority.callerSelfReportAccepted, false);
});

test("stdio recorder captures same-connection hooks/list and consumes live receipts without a model", () => {
  const parts = fixture();
  const dir = mkdtempSync(path.join(tmpdir(), "outsider-codex-recorder-"));
  const fakeCodex = path.join(dir, "fake-codex");
  copyFileSync(path.join(root, "test", "fixtures", "fake-codex-app-server.mjs"), fakeCodex);
  chmodSync(fakeCodex, 0o700);
  const probeFile = path.join(dir, "probe.json");
  const schemaFile = path.join(dir, "schema.json");
  const appSchemaFile = path.join(dir, "app-schema.json");
  const keyFile = path.join(dir, "recorder.pem");
  const sourceFile = path.join(dir, "source.jsonl");
  const traceFile = path.join(dir, "trace.json");
  const assessmentFile = `${traceFile}.readiness.json`;
  const receiptRoot = path.join(dir, "attached");
  const binaryBytes = readFileSync(fakeCodex);
  const probe = createCodexHookCapabilityProbe({ binaryVersion: "0.144.5",
    binarySha256: H(binaryBytes), schemaBundleHash: H(parts.schemaBytes),
    eventNames, outputEntryKinds: outputKinds,
    configuredHooks: parts.hooksList.data[0].hooks
      .map(({ command: _command, ...hook }) => hook) });
  writeFileSync(probeFile, JSON.stringify(probe));
  writeFileSync(schemaFile, parts.schemaBytes);
  writeFileSync(appSchemaFile, parts.schemaBytes);
  writeFileSync(keyFile, recorder.privateKey, { mode: 0o600 });
  new CodexLiveReceiptStore({ root: receiptRoot }).record({ input: {
    hook_event_name: "SessionStart", session_id: "thread-recorder-live", cwd: dir,
    transcript_path: null, model: "none", permission_mode: "default",
  }, result: { decision: { verdict: "allow" }, output: {} },
  controllerPath: "ATTACHED_POLICY", controllerAvailable: true,
  capturedAt: new Date("2026-08-21T00:00:00.000Z") });
  const run = spawnSync(process.execPath,
    [path.join(root, "bin", "outsider-codex-app-server.mjs"),
      "--source", sourceFile, "--trace", traceFile, "--signing-key", keyFile,
      "--probe", probeFile, "--native-binary", fakeCodex,
      "--schema", schemaFile, "--app-server-schema", appSchemaFile,
      "--codex", fakeCodex, "--cwd", dir, "--receipt-root", receiptRoot], {
      input: `${JSON.stringify({ id: 1, method: "initialize", params: {} })}\n`
        + `${JSON.stringify({ method: "initialized", params: {} })}\n`,
      encoding: "utf8", timeout: 10_000,
      env: { ...process.env, OUTSIDER_FAKE_CODEX_HOOKS: JSON.stringify(parts.hooksList),
        OUTSIDER_FAKE_CODEX_THREAD_ID: "thread-recorder-live" },
    });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /no model was started by the recorder/);
  const source = readFileSync(sourceFile);
  const trace = JSON.parse(readFileSync(traceFile, "utf8"));
  const assessment = JSON.parse(readFileSync(assessmentFile, "utf8"));
  const checked = verifyCodexAppServerControlTrace(trace, { source,
    trustedRecorderKeyIds: [codexControlKeyId(recorder.publicKey)] });
  assert.equal(checked.ok, true);
  assert.ok(trace.events.some((event) => event.kind === "HOOKS_LIST_RESPONSE"
    && event.resultHash === H(parts.hooksList)));
  assert.equal(assessment.controlLevel, "UNCONTROLLED");
  assert.equal(assessment.missingRequirements.includes("LIVE_CONTROLLER_RECEIPTS_MISSING"), false);
  assert.equal(assessment.claimBoundary.payload.canonicalHookSourceReplayed, true);
  assert.equal(assessment.claimBoundary.outsiderAttribution.trustedSignedReceipt, true);
  assert.equal(assessment.claimBoundary.hostDelivery.exactActionCrossBinding, false);
  assert.equal(assessment.claimBoundary.semanticRecovery.established, false);
  assert.equal(assessment.authority.invokedModel, false);
});
