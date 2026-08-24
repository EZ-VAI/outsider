import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hookConfigFor } from "../src/outsider-agents.js";
import { AttachedDaemonController } from "../src/outsider-attached-daemon.js";
import { assessCodexStage05Control } from "../src/outsider-codex-control-evidence.js";
import { CodexLiveReceiptStore } from "../src/outsider-codex-live-receipts.js";
import {
  CODEX_ADVISORY_LIFECYCLE_EVENTS, CODEX_HOOK_PROBE_SCHEMA,
  CODEX_REQUIRED_LIFECYCLE_EVENTS,
  CODEX_WORKER_ADAPTER_VERSION, createCodexHookCapabilityProbe,
  verifyCodexHookCapabilityProbe,
} from "../src/outsider-codex-worker-adapter.js";
import { handleHookInvocation } from "../src/outsider-hook.js";
import { OutsiderKernelController } from "../src/outsider-kernel-controller.js";
import { runProductDoctor } from "../src/outsider-product.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";

const OFFICIAL_EVENTS = ["sessionStart", "sessionEnd", "userPromptSubmit",
  "preToolUse", "permissionRequest", "postToolUse", "preCompact", "postCompact",
  "subagentStart", "subagentStop", "stop"];
const CORE_EVENTS = OFFICIAL_EVENTS.filter((event) => event !== "sessionEnd");
const ADVISORY_EVENTS = ["sessionEnd"];
const CONFIG_EVENTS = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse",
  "PermissionRequest", "PostToolUse", "PreCompact", "PostCompact", "SubagentStart",
  "SubagentStop", "Stop"];
const CORE_CONFIG_EVENTS = CONFIG_EVENTS.filter((event) => event !== "SessionEnd");
const OUTPUT_KINDS = ["warning", "stop", "feedback", "context", "error"];
const ADDED_CORE_EVENTS = ["permissionRequest", "preCompact", "postCompact",
  "subagentStart", "subagentStop"];

function receiptStore() {
  return { record: ({ result }) => ({ result,
    receipt: { receiptHash: workerDigest("receipt"), recordedAt: "2026-08-23T00:00:00.000Z" },
    source: { sourceHash: workerDigest("source") }, controllerKeyId: "fixture-controller",
    signingKeySource: "LOCAL_INSTALLATION_KEY" }) };
}

function mutableLedger(active) {
  return {
    value: { active, completedRuns: [] },
    save(patch = {}) { this.value = { ...this.value, ...patch }; return this.value; },
    setActive(next) { return this.save({ active: next }); },
    completeActive(status, extra = {}) {
      const completed = { ...this.value.active, ...extra, status };
      this.value = { ...this.value, active: null,
        completedRuns: [...this.value.completedRuns, completed] };
      return this.value;
    },
  };
}

function liveReceiptCapture(prefix) {
  const store = new CodexLiveReceiptStore({
    root: mkdtempSync(path.join(tmpdir(), prefix)),
  });
  const captured = [];
  const record = store.record.bind(store);
  store.record = (options) => {
    const value = record(options);
    captured.push(value);
    return value;
  };
  return { store, captured };
}

function capabilityFixture(eventNames = OFFICIAL_EVENTS, {
  duplicateEvent = null, pluginBoundaryNoticeEvent = null,
  pluginBoundaryBypass = false, detachedEvent = null,
} = {}) {
  const binaryBytes = Buffer.from("codex-binary-v2-fixture");
  const schemaBytes = Buffer.from(JSON.stringify({ definitions: {
    HookEventName: { enum: eventNames }, HookOutputEntryKind: { enum: OUTPUT_KINDS },
  } }));
  const currentHash = workerDigest("outsider attached command");
  const hooks = eventNames.map((eventName) => ({ eventName, enabled: true,
    trustStatus: "trusted", currentHash,
    command: eventName === detachedEvent ? "outsider-hook.mjs hook codex"
      : "outsider-hook.mjs hook codex --attached-control" }));
  if (duplicateEvent) hooks.push({ eventName: duplicateEvent, enabled: true,
    trustStatus: "trusted", currentHash: workerDigest("drifted duplicate"),
    command: "outsider-hook.mjs hook codex --attached-control" });
  if (pluginBoundaryNoticeEvent) hooks.push({ eventName: pluginBoundaryNoticeEvent,
    enabled: true, trustStatus: "trusted", currentHash: workerDigest("plugin boundary notice"),
    command: "/plugins/outsider/bin/outsider-codex-boundary.mjs session-start"
      + (pluginBoundaryBypass ? " --dangerously-bypass-hook-trust" : "") });
  const hooksList = { data: [{ hooks }] };
  const probe = createCodexHookCapabilityProbe({ binaryVersion: "fixture",
    binarySha256: workerDigest(binaryBytes), schemaBundleHash: workerDigest(schemaBytes),
    eventNames, outputEntryKinds: OUTPUT_KINDS,
    configuredHooks: hooks.map(({ command, ...hook }) => ({ ...hook,
      attachedControl: /(?:^|\s)--attached-control(?:\s|$)/.test(command),
      bypassedHookTrust: /--dangerously-bypass-hook-trust/.test(command) })) });
  return { binaryBytes, schemaBytes, hooksList, probe };
}

test("Codex runtime inventory requires ten core events and reports SessionEnd as advisory", () => {
  assert.deepEqual([...CODEX_REQUIRED_LIFECYCLE_EVENTS], CORE_EVENTS);
  assert.deepEqual([...CODEX_ADVISORY_LIFECYCLE_EVENTS], ADVISORY_EVENTS);
  assert.equal(CODEX_HOOK_PROBE_SCHEMA, "outsider/codex-hook-capability-probe/v2");
  assert.equal(CODEX_WORKER_ADAPTER_VERSION, 2);
  const config = hookConfigFor("codex", "/opt/outsider");
  assert.deepEqual(Object.keys(config.value.hooks).sort(), [...CONFIG_EVENTS].sort());
  for (const event of CONFIG_EVENTS) {
    const handler = config.value.hooks[event][0].hooks[0];
    assert.equal(handler.timeout, event === "SessionEnd" ? 3 : 900,
      `${event} must stay inside its native Codex lifecycle timeout`);
  }
  const currentHash = workerDigest("one-command-hash");
  const configuredHooks = OFFICIAL_EVENTS.map((eventName) => ({ eventName, enabled: true,
    trustStatus: "trusted", currentHash, attachedControl: true,
    bypassedHookTrust: false }));
  const probe = createCodexHookCapabilityProbe({ binaryVersion: "fixture",
    binarySha256: workerDigest("binary"), schemaBundleHash: workerDigest("schema"),
    eventNames: OFFICIAL_EVENTS, outputEntryKinds: OUTPUT_KINDS, configuredHooks });
  assert.equal(probe.assessment.engineSupportsControlledCandidate, true);
  assert.equal(probe.assessment.installedControlHooksTrusted, true);
  assert.equal(probe.assessment.engineSupportsAdvisoryEvents, true);
  assert.equal(probe.assessment.installedAdvisoryHooksTrusted, true);
  assert.equal(verifyCodexHookCapabilityProbe({ ...probe,
    schema: "outsider/codex-hook-capability-probe/v1" }).ok, false,
  "legacy v1 cannot be reinterpreted with v2 core/advisory semantics");
  const incomplete = createCodexHookCapabilityProbe({ binaryVersion: "fixture",
    binarySha256: workerDigest("binary"), schemaBundleHash: workerDigest("schema"),
    eventNames: OFFICIAL_EVENTS.filter((event) => event !== "sessionEnd"),
    outputEntryKinds: OUTPUT_KINDS,
    configuredHooks: configuredHooks.filter((hook) => hook.eventName !== "sessionEnd") });
  assert.equal(incomplete.assessment.engineSupportsControlledCandidate, true,
    "the ten live core events remain the controlled candidate inventory");
  assert.equal(incomplete.assessment.installedControlHooksTrusted, true);
  assert.equal(incomplete.assessment.engineSupportsAdvisoryEvents, false);
  assert.equal(incomplete.assessment.installedAdvisoryHooksTrusted, false);
  const coreFixture = capabilityFixture(CORE_EVENTS);
  const coreAssessment = assessCodexStage05Control({ ...coreFixture,
    hookProbe: coreFixture.probe, appServerSchemaBytes: coreFixture.schemaBytes });
  assert.equal(coreAssessment.missingRequirements.some((entry) =>
    entry.startsWith("HOOK_PROBE_CORE_EVENT_") || entry.startsWith("CONTROL_HOOK_")), false,
  "missing advisory SessionEnd cannot make the ten-core source-bound inventory red");

  const fullFixture = capabilityFixture();
  const fullAssessment = assessCodexStage05Control({ ...fullFixture,
    hookProbe: fullFixture.probe, appServerSchemaBytes: fullFixture.schemaBytes });
  assert.equal(fullAssessment.missingRequirements.some((entry) =>
    entry.startsWith("HOOK_PROBE_CORE_EVENT_") || entry.startsWith("CONTROL_HOOK_")), false,
  "the complete unique trusted attached inventory clears the authoritative install gate");
  const coexistence = capabilityFixture(OFFICIAL_EVENTS,
    { pluginBoundaryNoticeEvent: "sessionStart" });
  const coexistenceAssessment = assessCodexStage05Control({ ...coexistence,
    hookProbe: coexistence.probe, appServerSchemaBytes: coexistence.schemaBytes });
  assert.equal(coexistence.probe.assessment.installedControlHooksTrusted, true);
  assert.equal(coexistenceAssessment.missingRequirements.some((entry) =>
    entry.startsWith("HOOK_PROBE_CORE_EVENT_") || entry.startsWith("CONTROL_HOOK_")), false,
  "one plugin boundary notice may coexist with the unique attached SessionStart controller");
  const bypass = capabilityFixture(OFFICIAL_EVENTS,
    { pluginBoundaryNoticeEvent: "sessionStart", pluginBoundaryBypass: true });
  const bypassAssessment = assessCodexStage05Control({ ...bypass,
    hookProbe: bypass.probe, appServerSchemaBytes: bypass.schemaBytes });
  assert.equal(bypass.probe.assessment.installedControlHooksTrusted, false);
  assert.ok(bypassAssessment.missingRequirements.includes("HOOK_TRUST_BYPASS_PRESENT"));

  for (const missingEvent of ADDED_CORE_EVENTS) {
    const fixture = capabilityFixture(OFFICIAL_EVENTS.filter((event) => event !== missingEvent));
    const assessment = assessCodexStage05Control({ ...fixture,
      hookProbe: fixture.probe, appServerSchemaBytes: fixture.schemaBytes });
    assert.equal(fixture.probe.assessment.engineSupportsControlledCandidate, false,
      `${missingEvent} must keep the engine candidate red`);
    assert.equal(fixture.probe.assessment.installedControlHooksTrusted, false,
      `${missingEvent} must keep the trusted install red`);
    assert.ok(assessment.missingRequirements.includes("HOOK_PROBE_CORE_EVENT_ENGINE_SUPPORT_MISSING"));
    assert.ok(assessment.missingRequirements.includes("HOOK_PROBE_CORE_EVENT_TRUSTED_INSTALL_MISSING"));
    assert.ok(assessment.missingRequirements.includes(`CONTROL_HOOK_MISSING:${missingEvent}`));
  }
  const duplicate = capabilityFixture(OFFICIAL_EVENTS, { duplicateEvent: "postCompact" });
  const duplicateAssessment = assessCodexStage05Control({ ...duplicate,
    hookProbe: duplicate.probe, appServerSchemaBytes: duplicate.schemaBytes });
  assert.equal(duplicate.probe.assessment.installedControlHooksTrusted, false);
  assert.ok(duplicateAssessment.missingRequirements.includes(
    "CONTROL_HOOK_AMBIGUOUS:postCompact"));
  const detached = capabilityFixture(OFFICIAL_EVENTS, { detachedEvent: "permissionRequest" });
  const detachedAssessment = assessCodexStage05Control({ ...detached,
    hookProbe: detached.probe, appServerSchemaBytes: detached.schemaBytes });
  assert.ok(detachedAssessment.missingRequirements.includes(
    "CONTROL_HOOK_MISSING:permissionRequest"));

  const home = mkdtempSync(path.join(tmpdir(), "outsider-codex-direct-doctor-"));
  const codexHome = path.join(home, ".codex");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(path.join(codexHome, "hooks.json"), JSON.stringify({ hooks:
    Object.fromEntries(CONFIG_EVENTS.map((event) => [event, [{ hooks: [{ type: "command",
      command: "outsider-hook.mjs hook codex --attached-control" }] }]])) }));
  const report = runProductDoctor({ home, codexHome,
    stateRoot: path.join(home, "runs"), attachedRoot: path.join(home, "attached"),
    workerExecutable: "/fixture/claude", workerPreflight: () => ({ ok: true }) });
  assert.deepEqual(report.surfaces.codex.requiredEvents, CORE_CONFIG_EVENTS);
  assert.deepEqual(report.surfaces.codex.advisoryEvents, ["SessionEnd"]);
  assert.equal(report.surfaces.codex.hooksConfigured, true);
  assert.equal(report.surfaces.codex.advisoryHooksConfigured, true);
  assert.equal(report.surfaces.codex.completeLifecycleCoverageEstablished, false,
    "installed inventory is reported accurately without claiming a live run");
});

test("non-action lifecycle events never enter PreToolUse and unknown Codex events fail closed", async () => {
  for (const event of ["PermissionRequest", "PostCompact", "SessionEnd"]) {
    const fallback = handleHookInvocation({ agent: "codex", input: {
      hook_event_name: event, tool_name: "Bash", tool_input: { command: "private" },
    } });
    assert.deepEqual(fallback.output, {});
    if (event === "PermissionRequest") assert.equal(fallback.decision.verdict, "defer");
  }
  assert.throws(() => handleHookInvocation({ agent: "codex",
    input: { hook_event_name: "FutureUnknownBoundary" } }),
  /UNSUPPORTED_HOOK_EVENT:FutureUnknownBoundary/);

  const kernel = Object.create(OutsiderKernelController.prototype);
  kernel.recordEvaluatorFault = () => {};
  kernel.preTool = () => { throw new Error("PRE_TOOL_MUST_NOT_RUN"); };
  for (const event of ["PermissionRequest", "PostCompact", "SessionEnd"]) {
    const result = kernel.handleHook({ agent: "codex", input: { hook_event_name: event } });
    assert.deepEqual(result.output, {});
    assert.equal(result.decision.verdict, "defer");
  }
  assert.throws(() => kernel.handleHook({ agent: "codex",
    input: { hook_event_name: "FutureUnknownBoundary" } }),
  /UNSUPPORTED_HOOK_EVENT:FutureUnknownBoundary/);

  const patches = [];
  const daemon = Object.create(AttachedDaemonController.prototype);
  daemon.session = () => ({ identityConflict: null, run: null,
    ledger: { save: (patchValue) => patches.push(patchValue) } });
  daemon.ensureRecovery = async () => { throw new Error("RECOVERY_MUST_NOT_RUN"); };
  for (const event of ["PermissionRequest", "PostCompact", "SessionEnd"]) {
    const result = await daemon.handleHookCore({ agent: "codex", input: {
      hook_event_name: event, session_id: "thread-1", cwd: "/private/work",
    } });
    assert.deepEqual(result.output, {});
  }
  assert.equal(patches.length, 3);
  await assert.rejects(daemon.handleHookCore({ agent: "codex", input: {
    hook_event_name: "FutureUnknownBoundary", session_id: "thread-1", cwd: "/private/work",
  } }), /UNSUPPORTED_HOOK_EVENT:FutureUnknownBoundary/);

  const liveReceipts = new CodexLiveReceiptStore({
    root: mkdtempSync(path.join(tmpdir(), "outsider-codex-direct-receipts-")),
  });
  for (const [hookEventName, expectedEventName] of [
    ["PermissionRequest", "permissionRequest"], ["SessionEnd", "sessionEnd"],
  ]) {
    const recorded = liveReceipts.record({
      input: { hook_event_name: hookEventName, session_id: "thread-receipts" },
      result: { decision: { verdict: "defer" }, output: {} },
      capturedAt: new Date("2026-08-23T00:00:00.000Z"),
    });
    assert.equal(recorded.receipt.eventName, expectedEventName);
    assert.equal(recorded.receipt.decision, "OBSERVE");
  }

  const routed = liveReceiptCapture("outsider-codex-direct-route-");
  let kernelCalls = 0;
  const activeSession = { agent: "codex", identityConflict: null,
    run: { handleHook: async () => { kernelCalls += 1; throw new Error("MUST_NOT_ROUTE_KERNEL"); } },
    ledger: mutableLedger({ status: "running", ask: "fixture" }) };
  const routedDaemon = Object.create(AttachedDaemonController.prototype);
  routedDaemon.session = () => activeSession;
  routedDaemon.ensureRecovery = async () => {};
  routedDaemon.codexReceiptStore = routed.store;
  for (const [hookEventName, sessionId] of [
    ["PermissionRequest", "thread-permission-route"],
    ["PostCompact", "thread-postcompact-route"],
  ]) {
    await routedDaemon.handleHook({ agent: "codex",
      input: { hook_event_name: hookEventName, session_id: sessionId } });
  }
  assert.equal(kernelCalls, 0);
  assert.equal(routed.captured.length, 2);
  for (const { receipt } of routed.captured) {
    assert.equal(receipt.runtimeClaims.controllerPath, "ATTACHED_POLICY");
    assert.equal(receipt.runtimeClaims.kernelControllerInvoked, false,
      "an existing run is not evidence that this hook invoked the kernel");
  }
});

test("attached Codex projects canonical ALLOW to native no-decision while preserving deny", async () => {
  const decisions = [
    { decision: { verdict: "allow", reason: "on track" }, output: {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } } },
    { decision: { verdict: "allow", reason: "on track with mandate" }, output: {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
        additionalContext: "frozen worker mandate" } } },
    { decision: { verdict: "warn", corrective: "return to the frozen architecture" }, output: {
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
        permissionDecisionReason: "return to the frozen architecture" } } },
  ];
  const receipts = liveReceiptCapture("outsider-codex-direct-native-allow-");
  const session = { run: {}, ledger: { save: () => {} } };
  const daemon = Object.create(AttachedDaemonController.prototype);
  daemon.session = () => session;
  daemon.handleHookCore = async () => decisions.shift();
  daemon.codexReceiptStore = receipts.store;
  const input = { hook_event_name: "PreToolUse", session_id: "thread-1",
    turn_id: "turn-1", tool_use_id: "tool-1",
    tool_name: "Bash", tool_input: { command: "npm test" } };
  const continued = await daemon.handleHook({ agent: "codex", input });
  assert.deepEqual(continued.output, {},
    "Codex ALLOW is an empty native envelope, not unsupported permissionDecision:allow");
  const contextual = await daemon.handleHook({ agent: "codex",
    input: { ...input, tool_use_id: "tool-2" } });
  assert.deepEqual(contextual.output, { hookSpecificOutput: {
    hookEventName: "PreToolUse", additionalContext: "frozen worker mandate",
  } }, "additional context survives without an unsupported allow decision");
  const paused = await daemon.handleHook({ agent: "codex",
    input: { ...input, tool_use_id: "tool-3" } });
  assert.equal(paused.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(paused.output.hookSpecificOutput.permissionDecisionReason, /frozen architecture/);
  assert.deepEqual(receipts.captured.map(({ receipt }) => receipt.decision),
    ["ALLOW", "ALLOW", "DENY"]);
  assert.equal(receipts.captured[0].source.controllerResult.output
    .hookSpecificOutput.permissionDecision, "allow",
    "the signed source retains canonical ALLOW before native projection");
  assert.equal(receipts.captured[1].source.controllerResult.output
    .hookSpecificOutput.additionalContext, "frozen worker mandate");
  assert.equal(receipts.captured[2].source.controllerResult.output
    .hookSpecificOutput.permissionDecision, "deny");

  const claude = Object.create(AttachedDaemonController.prototype);
  claude.handleHookCore = async () => ({ decision: { verdict: "allow" }, output: {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
  } });
  const claudeResult = await claude.handleHook({ agent: "claude-code", input });
  assert.equal(claudeResult.output.hookSpecificOutput.permissionDecision, "allow",
    "the native Codex projection does not alter Claude output");
});

test("attached Codex Stop continues only with complete evidence and rejects a red finalization", async () => {
  const completeReceipts = liveReceiptCapture("outsider-codex-direct-stop-");
  const completeLedger = mutableLedger({ status: "running", ask: "complete the fixture" });
  const completeSession = { agent: "codex", needsMandate: false,
    ledger: completeLedger,
    run: { runId: "complete-run", handleHook: async () => ({ decision: { verdict: "allow" },
      output: { decision: "approve", systemMessage: "verified" } }),
    finish: async () => ({ acceptance: { passed: true }, evidence: { ok: true },
      proof: { complete: true, deliveryComplete: true } }) } };
  const complete = Object.create(AttachedDaemonController.prototype);
  complete.session = () => completeSession;
  complete.ensureRecovery = async () => {};
  complete.codexReceiptStore = completeReceipts.store;
  const input = { hook_event_name: "Stop", session_id: "thread-complete" };
  const continued = await complete.handleHook({ agent: "codex", input });
  assert.deepEqual(continued.output, { systemMessage: "verified" },
    "Codex continue is the native empty-object Stop envelope, not Claude approve");
  assert.equal(completeReceipts.captured.length, 1);
  assert.equal(completeReceipts.captured[0].source.controllerResult.output.decision, "approve",
    "the signed source retains the canonical controller verdict");
  assert.equal(completeReceipts.captured[0].receipt.decision, "ALLOW");
  assert.equal(completeReceipts.captured[0].receipt.runtimeClaims.controllerPath,
    "KERNEL_CONTROLLER");
  assert.equal(completeReceipts.captured[0].receipt.runtimeClaims.kernelControllerInvoked, true);

  const unattributedReceipts = liveReceiptCapture("outsider-codex-direct-unattributed-");
  const unattributedLedger = mutableLedger({ status: "running",
    ask: "deliver a correct result", runId: "unattributed-run" });
  const unattributedSession = { agent: "codex", needsMandate: false,
    ledger: unattributedLedger,
    run: { runId: "unattributed-run",
      handleHook: async () => ({ decision: { verdict: "allow" },
        output: { decision: "approve" } }),
      finish: async () => ({ acceptance: { passed: true }, evidence: { ok: true },
        proof: { complete: false, deliveryComplete: true } }) } };
  const unattributed = Object.create(AttachedDaemonController.prototype);
  unattributed.session = () => unattributedSession;
  unattributed.ensureRecovery = async () => {};
  unattributed.codexReceiptStore = unattributedReceipts.store;
  const delivered = await unattributed.handleHook({ agent: "codex",
    input: { hook_event_name: "Stop", session_id: "thread-unattributed" } });
  assert.equal(delivered.output.decision, undefined);
  assert.match(delivered.output.systemMessage, /无法归因|不能计为 Stage 0\.5/);
  assert.equal(unattributedLedger.value.active, null);
  assert.equal(unattributedLedger.value.completedRuns.at(-1).status,
    "delivered-unattributed");
  assert.equal(unattributedSession.run, null);
  assert.equal(unattributedReceipts.captured[0].receipt.decision, "ALLOW");
  assert.equal(unattributedReceipts.captured[0].source.controllerResult.output.decision,
    "approve");

  const redLedger = mutableLedger({ status: "running", ask: "repair the fixture",
    runId: "red-run" });
  let originalStopCalls = 0;
  const originalRun = { runId: "red-run",
    handleHook: async () => { originalStopCalls += 1; return { decision: { verdict: "allow" },
      output: { decision: "approve" } }; },
    finish: async () => ({ acceptance: { passed: true }, evidence: { ok: false },
      proof: { complete: true, deliveryComplete: true } }) };
  const redSession = { agent: "codex", needsMandate: false,
    bootstrapEpoch: 1, ledger: redLedger, run: originalRun };
  let repairStopCalls = 0;
  const repairRun = { runId: "repair-run", store: { directory: "/fixture" }, contract: {},
    handleHook: async ({ input: hookInput }) => {
      const event = hookInput.hook_event_name;
      if (event === "PreToolUse") return { decision: { verdict: "allow" }, output: {
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } } };
      if (event === "PostToolUse") return { decision: { verdict: "allow" }, output: {} };
      if (event === "Stop") {
        repairStopCalls += 1;
        return { decision: { verdict: "allow" }, output: { decision: "approve" } };
      }
      throw new Error(`UNEXPECTED_REPAIR_EVENT:${event}`);
    },
    finish: async () => ({ acceptance: { passed: true }, evidence: { ok: true },
      proof: { complete: true, deliveryComplete: true } }) };
  const red = Object.create(AttachedDaemonController.prototype);
  red.session = () => redSession;
  red.ensureRecovery = async () => {};
  red.bootstrap = async (session) => {
    session.run = repairRun;
    session.needsMandate = false;
    session.ledger.setActive({ status: "running", ask: "repair the fixture",
      runId: repairRun.runId });
    return { controlled: true, run: repairRun };
  };
  const blocked = await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "Stop", session_id: "thread-red" } });
  assert.equal(blocked.output.decision, "block");
  assert.match(blocked.output.reason, /证据封存不完整|最终机械验收|因果证明/);
  assert.equal(redSession.run, originalRun, "a red finalization retains the logical run");
  assert.notEqual(redLedger.value.active, null, "a red finalization retains the active contract");
  assert.equal(redLedger.value.completedRuns.length, 0);
  assert.equal(redLedger.value.active.codexTerminalRepair.generation, 1);

  const unchangedRetry = await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "Stop", session_id: "thread-red" } });
  assert.equal(unchangedRetry.output.decision, "block");
  assert.match(unchangedRetry.output.reason, /原样重试 Stop 已拒绝/);
  assert.equal(originalStopCalls, 1, "unchanged Stop must not re-finalize the terminal run");

  const repairPre = await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "PreToolUse", session_id: "thread-red",
    tool_name: "Edit", tool_input: { path: "fixture.js" } } });
  assert.equal(repairPre.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(redSession.run, repairRun);
  assert.equal(redLedger.value.active.codexTerminalRepair.actionAuthorized, true);

  const prematureRetry = await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "Stop", session_id: "thread-red" } });
  assert.equal(prematureRetry.output.decision, "block");
  assert.equal(repairStopCalls, 0, "Stop remains blocked until the repair outcome is observed");

  await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "PostToolUse", session_id: "thread-red",
    tool_name: "Edit", tool_response: { success: true } } });
  assert.equal(redLedger.value.active.codexTerminalRepair.actionObserved, true);
  const repaired = await red.handleHookCore({ agent: "codex", input: {
    hook_event_name: "Stop", session_id: "thread-red" } });
  assert.equal(repaired.output.decision, "approve");
  assert.equal(repairStopCalls, 1);
  assert.equal(redSession.run, null);
  assert.equal(redLedger.value.active, null);
  assert.equal(redLedger.value.completedRuns.at(-1).status, "complete");

  let exhaustedBootstrapCalls = 0;
  const exhaustedLedger = mutableLedger({ status: "running", ask: "bounded repair",
    codexTerminalRepair: { generation: 4, maximumGenerations: 3, rearmed: false,
      rearmAttempts: 0, actionAuthorized: false, actionObserved: false } });
  const exhaustedSession = { agent: "codex", needsMandate: false,
    ledger: exhaustedLedger, run: originalRun };
  const exhausted = Object.create(AttachedDaemonController.prototype);
  exhausted.session = () => exhaustedSession;
  exhausted.bootstrap = async () => { exhaustedBootstrapCalls += 1; };
  const exhaustedDecision = await exhausted.handleHookCore({ agent: "codex", input: {
    hook_event_name: "PreToolUse", session_id: "thread-exhausted" } });
  assert.equal(exhaustedDecision.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(exhaustedDecision.output.hookSpecificOutput.permissionDecisionReason,
    /REPAIR_GENERATION_BUDGET_EXHAUSTED/);
  assert.equal(exhaustedBootstrapCalls, 0);

  const claudeLedger = mutableLedger({ status: "running", ask: "claude fixture" });
  const claudeSession = { agent: "claude-code", needsMandate: false, ledger: claudeLedger,
    run: { handleHook: async () => ({ decision: { verdict: "allow" },
      output: { decision: "approve" } }),
    finish: async () => ({ acceptance: { passed: false },
      proof: { complete: false, deliveryComplete: false } }) } };
  const claude = Object.create(AttachedDaemonController.prototype);
  claude.session = () => claudeSession;
  claude.ensureRecovery = async () => {};
  const claudeTerminal = await claude.handleHookCore({ agent: "claude-code",
    input: { hook_event_name: "Stop", session_id: "claude-thread" } });
  assert.equal(claudeTerminal.output.decision, "approve",
    "Claude retains its prior conservative terminalization semantics");
  assert.equal(claudeSession.run, null);
  assert.equal(claudeLedger.value.active, null);
  assert.equal(claudeLedger.value.completedRuns.at(-1).status, "incomplete");
});
