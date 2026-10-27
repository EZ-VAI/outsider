import test from "node:test";
import assert from "node:assert/strict";
import {
  createCodexHookCapabilityProbe, createCodexLiveConformance,
  createCodexWorkerObservation,
  verifyCodexHookCapabilityProbe, verifyCodexWorkerObservation,
} from "../src/outsider-codex-worker-adapter.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";

const H = (value) => workerDigest(value);
const EVENTS = ["preToolUse", "permissionRequest", "postToolUse", "preCompact",
  "postCompact", "sessionStart", "userPromptSubmit", "subagentStart", "subagentStop", "stop"];
const OUTPUTS = ["warning", "stop", "feedback", "context", "error"];

function probeFixture({ trustStatus = "untrusted", allControlHooks = true } = {}) {
  const binaryBytes = Buffer.from("fixture-native-binary");
  const schemaBytes = Buffer.from(JSON.stringify({ definitions: {
    HookEventName: { enum: EVENTS }, HookOutputEntryKind: { enum: OUTPUTS },
  } }));
  const hookCurrentHash = H("configured-hook");
  const names = allControlHooks ? ["preToolUse", "postToolUse", "stop"] : ["preToolUse"];
  const nativeHooks = names.map((eventName) => ({ eventName, enabled: true, trustStatus,
    currentHash: hookCurrentHash, command: "outsider-hook.mjs hook codex" }));
  const hooksList = { data: [{ hooks: nativeHooks }] };
  const record = createCodexHookCapabilityProbe({ binaryVersion: "0.144.5",
    binarySha256: workerDigest(binaryBytes), schemaBundleHash: workerDigest(schemaBytes),
    eventNames: EVENTS, outputEntryKinds: OUTPUTS,
    configuredHooks: nativeHooks.map(({ command: _command, ...hook }) => hook) });
  return { record, sources: { binaryBytes, schemaBytes, hooksList }, hookCurrentHash };
}

function liveFixture({ record, hookCurrentHash }) {
  const sessionIdHash = H("live-session");
  const firstTool = H("tool-allow"), deniedTool = H("tool-deny");
  const events = [
    { sequence: 0, eventName: "PreToolUse", sessionIdHash,
      toolUseIdHash: firstTool, hookCurrentHash, decision: "allow",
      additionalContextObserved: true, updatedInputObserved: false,
      stopContinuationObserved: false },
    { sequence: 1, eventName: "PostToolUse", sessionIdHash,
      toolUseIdHash: firstTool, hookCurrentHash, decision: null,
      additionalContextObserved: false, updatedInputObserved: false,
      stopContinuationObserved: false },
    { sequence: 2, eventName: "PreToolUse", sessionIdHash,
      toolUseIdHash: deniedTool, hookCurrentHash, decision: "deny",
      additionalContextObserved: false, updatedInputObserved: true,
      stopContinuationObserved: false },
    { sequence: 3, eventName: "Stop", sessionIdHash,
      toolUseIdHash: null, hookCurrentHash, decision: null,
      additionalContextObserved: false, updatedInputObserved: false,
      stopContinuationObserved: true },
  ];
  return { record: createCodexLiveConformance({
    binarySha256: record.binary.sha256,
    schemaBundleHash: record.generatedSchema.bundleHash,
    hookCurrentHash,
    events,
  }), events };
}

function rollout({ unknown = false, orphan = false } = {}) {
  const entries = [
    { timestamp: "2026-08-21T00:00:00Z", type: "session_meta",
      payload: { id: "private-session", session_id: "private-session",
        cli_version: "0.144.5", model_provider: "firstParty" } },
    { timestamp: "2026-08-21T00:00:01Z", type: "event_msg",
      payload: { type: "task_started", turn_id: "private-turn" } },
    { timestamp: "2026-08-21T00:00:02Z", type: "response_item",
      payload: { type: "function_call", namespace: "functions", name: "exec_command",
        call_id: "private-call-1", arguments: JSON.stringify({ cmd: "secret-command-123" }) } },
  ];
  if (!orphan) entries.push({ timestamp: "2026-08-21T00:00:03Z", type: "response_item",
    payload: { type: "function_call_output", call_id: "private-call-1",
      output: "Process exited with code 0\nOutput:\nsecret-output-456" } });
  entries.push({ timestamp: "2026-08-21T00:00:04Z", type: "event_msg",
    payload: { type: "sub_agent_activity", event_id: "private-agent-event", kind: "spawn" } });
  entries.push({ timestamp: "2026-08-21T00:00:05Z", type: "event_msg",
    payload: { type: "task_complete", turn_id: "private-turn" } });
  if (unknown) entries.push({ timestamp: "2026-08-21T00:00:06Z", type: "response_item",
    payload: { type: "future_authority_event", allowed: true } });
  return Buffer.from(entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("native schema + hooks/list metadata is a candidate, not live control", () => {
  const { record, sources } = probeFixture();
  const selfCheck = verifyCodexHookCapabilityProbe(record);
  assert.equal(selfCheck.ok, true);
  assert.equal(selfCheck.verificationMode, "SELF_CHECK_ONLY");
  const replayed = verifyCodexHookCapabilityProbe(record, sources);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.verificationMode, "FULL_LOCAL_METADATA_REPLAY");
  assert.equal(record.assessment.engineSupportsControlledCandidate, true);
  assert.equal(record.assessment.installedPreToolTrusted, false);
  assert.equal(record.assessment.candidateControlLevel, "LIFECYCLE_CONTROLLED_CANDIDATE");
  assert.equal(record.assessment.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(record.authority.bypassedHookTrust, false);
  assert.equal(record.authority.invokedModel, false);
});

test("real-shaped Codex rollout becomes privacy-safe paired worker evidence", () => {
  const source = rollout();
  const probe = probeFixture();
  const record = createCodexWorkerObservation(source, {
    hookProbe: probe.record, hookProbeSources: probe.sources,
  });
  assert.equal(record.integrity.complete, true);
  assert.equal(record.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.equal(record.capabilityHandshake.capabilities.INTERVENE.reasonCode,
    "codex_control_hooks_untrusted");
  assert.equal(record.events.filter((event) => event.kind === "ACTION_PROPOSED").length, 1);
  assert.equal(record.events.filter((event) => event.kind === "ACTION_RESULT").length, 1);
  assert.equal(record.events.find((event) => event.kind === "ACTION_RESULT").resultStatus,
    "SUCCEEDED");
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized,
    /private-session|private-turn|private-call|secret-command|secret-output/);
  assert.equal(verifyCodexWorkerObservation(record, { sourceBytes: source }).ok, true);
  assert.equal(verifyCodexWorkerObservation(record, {
    sourceBytes: Buffer.from(`${source}tamper`),
  }).ok, false);
});

test("trusted metadata plus caller-asserted live events remains observation-only", () => {
  const probe = probeFixture({ trustStatus: "trusted" });
  const live = liveFixture(probe);
  const record = createCodexWorkerObservation(rollout(), {
    hookProbe: probe.record,
    hookProbeSources: probe.sources,
    liveConformance: live,
  });
  assert.equal(record.capabilityHandshake.capabilities.INTERVENE.status, "UNSUPPORTED");
  assert.equal(record.capabilityHandshake.capabilities.INTERVENE.reasonCode,
    "codex_hook_conformance_not_authenticated");
  assert.equal(record.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.ok(record.capabilityHandshake.capabilities.OBSERVE.evidenceRefs
    .includes(live.record.recordHash));
  assert.equal(record.authority.establishesSemanticOutcome, false,
    "live hook delivery still does not prove the delivered work is correct");
});

test("schema drift and unsettled actions are fail-visible incomplete observations", () => {
  const drifted = createCodexWorkerObservation(rollout({ unknown: true }));
  assert.equal(drifted.integrity.complete, false);
  assert.ok(drifted.integrity.gaps.some((gap) => gap.includes("UNKNOWN_RESPONSE_ITEM_TYPE")));
  assert.equal(drifted.capabilityHandshake.capabilities.INTERVENE.status, "UNSUPPORTED");
  const unsettled = createCodexWorkerObservation(rollout({ orphan: true }));
  assert.equal(unsettled.integrity.complete, false);
  assert.ok(unsettled.integrity.gaps.some((gap) => gap.includes("UNSETTLED_CALL")));
  assert.ok(unsettled.integrity.gaps.includes("ACTION_RESULT_MISSING"));
});

test("probe tampering cannot forge trust or live conformance", () => {
  const forged = structuredClone(probeFixture().record);
  forged.configuredHooks[0].trustStatus = "trusted";
  forged.assessment.claimableControlLevel = "ACTION_CONTROLLED";
  assert.equal(verifyCodexHookCapabilityProbe(forged).ok, false);
});

test("trusted self-asserted metadata plus an arbitrary conformance hash has no authority", () => {
  const probe = probeFixture({ trustStatus: "trusted" });
  const selfAsserted = { ...probe.record,
    liveConformanceHash: H("attacker-controlled-hash") };
  selfAsserted.recordHash = workerDigest(Object.fromEntries(Object.entries(selfAsserted)
    .filter(([key]) => key !== "recordHash")));
  assert.equal(verifyCodexHookCapabilityProbe(selfAsserted).ok, false,
    "unknown self-asserted authority fields must invalidate source replay");

  const observation = createCodexWorkerObservation(rollout(), { hookProbe: probe.record });
  assert.equal(observation.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.equal(observation.capabilityHandshake.capabilities.INTERVENE.reasonCode,
    "codex_hook_metadata_not_replayed");
});

test("a replayed conformance chain must bind the same binary, schema, and hook hash", () => {
  const probe = probeFixture({ trustStatus: "trusted" });
  const live = liveFixture(probe);
  const drifted = structuredClone(live.record);
  drifted.binarySha256 = H("different-binary");
  const { recordHash: _old, ...body } = drifted;
  drifted.recordHash = workerDigest(body);
  assert.throws(() => createCodexWorkerObservation(rollout(), {
    hookProbe: probe.record, hookProbeSources: probe.sources,
    liveConformance: { record: drifted, events: live.events },
  }), /CODEX_LIVE_CONFORMANCE_NOT_BOUND|CODEX_LIVE_CONFORMANCE_INVALID/);
});

test("a fabricated but structurally complete event list cannot unlock control", () => {
  const attacker = probeFixture({ trustStatus: "trusted" });
  const fabricated = liveFixture(attacker);
  assert.equal(fabricated.record.authority.selfReportedHostEvents, true);
  assert.equal(fabricated.record.authority.authenticatedControllerEnvelopes, false);
  const observation = createCodexWorkerObservation(rollout(), {
    hookProbe: attacker.record, hookProbeSources: attacker.sources,
    liveConformance: fabricated,
  });
  assert.equal(observation.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.equal(observation.authority.establishesInterventionDelivery, false);
});
