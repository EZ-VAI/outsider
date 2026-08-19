import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assessAgentTeamNegativeControl,
  assessR3IntegrationCorrection,
  assessR3SupervisedExperience,
  crossCheckAgentTeamLedgers,
  isClaudeWorkspaceTrustPrompt,
  parseAgentTeamHostEnvelopes,
  stabilizeAgentTeamEvidence,
} from "../scripts/stage05-agent-team-probe.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const received = (overrides = {}) => ({
  schema: "outsider/agent-team-host-envelope/v2",
  recorderSourceHash: digest("recorder"),
  at: "2026-08-12T00:00:00.000Z",
  pid: 1,
  envelopeId: "envelope-1",
  phase: "received",
  hookEventName: "PostToolUse",
  toolUseId: "spawn-store",
  toolName: "Agent",
  requestedAgentName: "store-owner",
  requestedAgentNameHash: digest("teammate-name\0store-owner"),
  requestedAgentModel: "sonnet",
  requiredAgentModel: "sonnet",
  modelGuardViolation: false,
  runtimeModels: [],
  responseHostAgentIdHash: digest("host-agent\0raw-store"),
  responseStatus: "teammate_spawned",
  responseIsAsync: false,
  ...overrides,
});
const delegated = (entry, overrides = {}) => ({
  schema: "outsider/agent-team-host-envelope/v2",
  recorderSourceHash: entry.recorderSourceHash,
  at: "2026-08-12T00:00:01.000Z",
  pid: entry.pid,
  envelopeId: entry.envelopeId,
  phase: "delegated",
  receivedEnvelopeHash: digest(JSON.stringify(entry)),
  hookEventName: entry.hookEventName,
  toolUseId: entry.toolUseId,
  delegatedStatus: 0,
  delegatedSignal: null,
  delegatedError: null,
  ...overrides,
});
const bytesFor = (...entries) => Buffer.from(`${entries.map(JSON.stringify).join("\n")}\n`);

test("agent-team host envelope is fail-closed until every recorder call delegated", () => {
  const spawn = received();
  const incomplete = parseAgentTeamHostEnvelopes(bytesFor(spawn));
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(";"), /no delegated completion/);

  const complete = parseAgentTeamHostEnvelopes(bytesFor(spawn, delegated(spawn)));
  assert.equal(complete.ok, true, complete.errors.join(";"));
  assert.equal(complete.receivedCount, 1);
  assert.equal(complete.delegatedCount, 1);

  const forged = parseAgentTeamHostEnvelopes(bytesFor(spawn,
    delegated(spawn, { receivedEnvelopeHash: digest("different") })));
  assert.equal(forged.ok, false);
  assert.match(forged.errors.join(";"), /does not bind/);
});

test("host spawn receipt, kernel identity binding and task completion cross-check", () => {
  const spawnPre = received({
    envelopeId: "envelope-0",
    hookEventName: "PreToolUse",
    responseHostAgentIdHash: null,
    responseStatus: null,
    responseIsAsync: null,
  });
  const spawn = received();
  const subagentStart = received({
    envelopeId: "envelope-start",
    hookEventName: "SubagentStart",
    toolUseId: null,
    toolName: null,
    requestedAgentName: null,
    requestedAgentNameHash: null,
    responseHostAgentIdHash: null,
    responseStatus: null,
    responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    runtimeModels: ["claude-sonnet-5"],
  });
  const completionPre = received({
    envelopeId: "envelope-2",
    hookEventName: "PreToolUse",
    toolUseId: "complete-store",
    toolName: "TaskUpdate",
    requestedAgentName: null,
    requestedAgentNameHash: null,
    responseHostAgentIdHash: null,
    responseStatus: null,
    responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task",
    taskUpdateStatus: "completed",
  });
  const completion = received({
    envelopeId: "envelope-3",
    hookEventName: "TaskCompleted",
    toolUseId: null,
    toolName: null,
    requestedAgentName: null,
    requestedAgentNameHash: null,
    responseHostAgentIdHash: null,
    responseStatus: null,
    responseIsAsync: null,
    taskId: "store-task",
  });
  const completionPost = received({
    envelopeId: "envelope-4",
    hookEventName: "PostToolUse",
    toolUseId: "complete-store",
    toolName: "TaskUpdate",
    requestedAgentName: null,
    requestedAgentNameHash: null,
    responseHostAgentIdHash: null,
    responseStatus: null,
    responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task",
    taskUpdateStatus: "completed",
  });
  const hostEnvelope = parseAgentTeamHostEnvelopes(bytesFor(
    spawnPre, delegated(spawnPre), spawn, delegated(spawn),
    subagentStart, delegated(subagentStart),
    completionPre, delegated(completionPre), completion, delegated(completion),
    completionPost, delegated(completionPost),
  ));
  const bindingHash = digest("identity-binding");
  const events = [{
    type: "team_spawn_capability_observed",
    toolUseId: "spawn-store",
    requestedNameHash: digest("teammate-name\0store-owner"),
    status: "teammate_spawned",
    bindable: true,
    isAsync: false,
  }, {
    type: "team_identity_bound",
    status: "teammate_spawned",
    toolUseIdHash: digest("agent-tool-use\0spawn-store"),
    teammateNameHash: digest("teammate-name\0store-owner"),
    agentIdHash: digest("host-agent\0raw-store"),
    receiptAgentIdHash: digest("host-agent\0raw-store"),
    identityBindingHash: bindingHash,
  }];
  const conformance = { teammateChains: [{
    agentId: "teammate:store-owner",
    identityBindingHash: bindingHash,
    taskId: "store-task",
    completionToolUseId: "complete-store",
    completionIntentHash: digest("completion-intent"),
  }] };
  const checked = crossCheckAgentTeamLedgers({ hostEnvelope, events, conformance,
    requiredTeammateNames: ["store-owner"], requiredAgentModel: "sonnet" });
  assert.equal(checked.ok, true, checked.errors.join(";"));
  assert.deepEqual(checked.matched[0].runtimeModels, ["claude-sonnet-5"]);

  const opusStart = { ...subagentStart, runtimeModels: ["claude-opus-5"] };
  const opusEnvelope = parseAgentTeamHostEnvelopes(bytesFor(
    spawnPre, delegated(spawnPre), spawn, delegated(spawn),
    opusStart, delegated(opusStart),
    completionPre, delegated(completionPre), completion, delegated(completion),
    completionPost, delegated(completionPost),
  ));
  const opusRejected = crossCheckAgentTeamLedgers({ hostEnvelope: opusEnvelope, events,
    conformance, requiredTeammateNames: ["store-owner"], requiredAgentModel: "sonnet" });
  assert.equal(opusRejected.ok, false);
  assert.match(opusRejected.errors.join(";"), /runtime model evidence/);

  events[1] = { ...events[1], receiptAgentIdHash: digest("host-agent\0wrong") };
  const rejected = crossCheckAgentTeamLedgers({ hostEnvelope, events, conformance,
    requiredTeammateNames: ["store-owner"] });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(";"), /identity binding/);

  const wrongPin = { ...spawn, responsePinName: "scheduler-owner" };
  const wrongPinEnvelope = parseAgentTeamHostEnvelopes(bytesFor(
    spawnPre, delegated(spawnPre), wrongPin, delegated(wrongPin),
    subagentStart, delegated(subagentStart),
    completionPre, delegated(completionPre), completion, delegated(completion),
    completionPost, delegated(completionPost),
  ));
  const pinRejected = crossCheckAgentTeamLedgers({ hostEnvelope: wrongPinEnvelope,
    events: [{ ...events[0] }, { ...events[1], agentIdHash: digest("host-agent\0raw-store"),
      receiptAgentIdHash: digest("host-agent\0raw-store") }],
    conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(pinRejected.ok, false);
  assert.match(pinRejected.errors.join(";"), /contradicts requested teammate identity/);

  const wrongCompletion = { teammateChains: [{ ...conformance.teammateChains[0],
    completionToolUseId: "different-completion" }] };
  const completionRejected = crossCheckAgentTeamLedgers({ hostEnvelope,
    events: [{ ...events[0] }, { ...events[1], agentIdHash: digest("host-agent\0raw-store"),
      receiptAgentIdHash: digest("host-agent\0raw-store") }],
    conformance: wrongCompletion, requiredTeammateNames: ["store-owner"] });
  assert.equal(completionRejected.ok, false);
  assert.match(completionRejected.errors.join(";"), /completion lacks one host-bound/);
});

test("host cross-ledger accepts one cryptographically bound delegation challenge but no extra Agent attempt", () => {
  const challenge = received({ envelopeId: "challenge-pre", hookEventName: "PreToolUse",
    toolUseId: "challenge-store", responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null });
  const spawnPre = received({ envelopeId: "spawn-pre", hookEventName: "PreToolUse",
    responseHostAgentIdHash: null, responseStatus: null, responseIsAsync: null });
  const spawnPost = received({ envelopeId: "spawn-post" });
  const start = received({ envelopeId: "spawn-start", hookEventName: "SubagentStart",
    toolUseId: null, toolName: null, requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store") });
  const completionPre = received({ envelopeId: "completion-pre", hookEventName: "PreToolUse",
    toolUseId: "complete-store", toolName: "TaskUpdate", requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task", taskUpdateStatus: "completed" });
  const completion = received({ envelopeId: "completion-event", hookEventName: "TaskCompleted",
    toolUseId: null, toolName: null, requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null, taskId: "store-task" });
  const completionPost = received({ envelopeId: "completion-post", hookEventName: "PostToolUse",
    toolUseId: "complete-store", toolName: "TaskUpdate", requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task", taskUpdateStatus: "completed" });
  const envelopeFor = (...extra) => parseAgentTeamHostEnvelopes(bytesFor(
    challenge, delegated(challenge), ...extra,
    spawnPre, delegated(spawnPre), spawnPost, delegated(spawnPost),
    start, delegated(start), completionPre, delegated(completionPre),
    completion, delegated(completion), completionPost, delegated(completionPost),
  ));
  const bindingHash = digest("challenge-binding");
  const baseEvents = [{ type: "team_delegation_binding_required",
    toolUseIdHash: digest("agent-tool-use\0challenge-store"),
    teammateNameHash: digest("teammate-name\0store-owner"),
    resolution: "deny-before-agent-spawn" },
  { type: "team_spawn_capability_observed", toolUseId: "spawn-store",
    requestedNameHash: digest("teammate-name\0store-owner"), status: "teammate_spawned",
    bindable: true, isAsync: false },
  { type: "team_identity_bound", status: "teammate_spawned",
    toolUseIdHash: digest("agent-tool-use\0spawn-store"),
    teammateNameHash: digest("teammate-name\0store-owner"),
    agentIdHash: digest("host-agent\0raw-store"),
    receiptAgentIdHash: digest("host-agent\0raw-store"), identityBindingHash: bindingHash }];
  const conformance = { teammateChains: [{ agentId: "teammate:store-owner",
    identityBindingHash: bindingHash, taskId: "store-task",
    completionToolUseId: "complete-store", completionIntentHash: digest("intent") }] };
  const accepted = crossCheckAgentTeamLedgers({ hostEnvelope: envelopeFor(),
    events: baseEvents, conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(accepted.ok, true, accepted.errors.join(";"));

  const unbound = crossCheckAgentTeamLedgers({ hostEnvelope: envelopeFor(),
    events: baseEvents.slice(1), conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(unbound.ok, false);
  assert.match(unbound.errors.join(";"), /matching host Agent Pre\/Post pair/);

  const extra = received({ envelopeId: "extra-pre", hookEventName: "PreToolUse",
    toolUseId: "extra-store", responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null });
  const excessive = crossCheckAgentTeamLedgers({
    hostEnvelope: envelopeFor(extra, delegated(extra)), events: baseEvents,
    conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(excessive.ok, false);
  assert.match(excessive.errors.join(";"), /at most one bound challenge/);
});

test("host cross-ledger accepts a serial teammate resume but rejects concurrent duplicate starts", () => {
  const spawnPre = received({ envelopeId: "resume-pre", hookEventName: "PreToolUse",
    responseHostAgentIdHash: null, responseStatus: null, responseIsAsync: null });
  const spawnPost = received({ envelopeId: "resume-post" });
  const start = (id) => received({ envelopeId: id, hookEventName: "SubagentStart",
    toolUseId: null, toolName: null, requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store") });
  const stop = received({ envelopeId: "resume-stop", hookEventName: "SubagentStop",
    toolUseId: null, toolName: null, requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store") });
  const firstStart = start("resume-start-1");
  const secondStart = start("resume-start-2");
  const completionPre = received({ envelopeId: "resume-complete-pre",
    hookEventName: "PreToolUse", toolUseId: "complete-store", toolName: "TaskUpdate",
    requestedAgentName: null, requestedAgentNameHash: null,
    responseHostAgentIdHash: null, responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task", taskUpdateStatus: "completed" });
  const completion = received({ envelopeId: "resume-completed", hookEventName: "TaskCompleted",
    toolUseId: null, toolName: null, requestedAgentName: null,
    requestedAgentNameHash: null, responseHostAgentIdHash: null,
    responseStatus: null, responseIsAsync: null, taskId: "store-task" });
  const completionPost = received({ envelopeId: "resume-complete-post",
    hookEventName: "PostToolUse", toolUseId: "complete-store", toolName: "TaskUpdate",
    requestedAgentName: null, requestedAgentNameHash: null,
    responseHostAgentIdHash: null, responseStatus: null, responseIsAsync: null,
    inputHostAgentIdHash: digest("host-agent\0raw-store"),
    taskUpdateTaskId: "store-task", taskUpdateStatus: "completed" });
  const bindingHash = digest("resume-binding");
  const events = [{ type: "team_spawn_capability_observed", toolUseId: "spawn-store",
    requestedNameHash: digest("teammate-name\0store-owner"),
    status: "teammate_spawned", bindable: true, isAsync: false },
  { type: "team_identity_bound", status: "teammate_spawned",
    toolUseIdHash: digest("agent-tool-use\0spawn-store"),
    teammateNameHash: digest("teammate-name\0store-owner"),
    agentIdHash: digest("host-agent\0raw-store"),
    receiptAgentIdHash: digest("host-agent\0raw-store"), identityBindingHash: bindingHash }];
  const conformance = { teammateChains: [{ agentId: "teammate:store-owner",
    identityBindingHash: bindingHash, taskId: "store-task",
    completionToolUseId: "complete-store", completionIntentHash: digest("resume-intent") }] };
  const envelope = (includeStop) => parseAgentTeamHostEnvelopes(bytesFor(
    spawnPre, delegated(spawnPre), spawnPost, delegated(spawnPost),
    firstStart, delegated(firstStart),
    ...(includeStop ? [stop, delegated(stop)] : []),
    secondStart, delegated(secondStart),
    completionPre, delegated(completionPre), completion, delegated(completion),
    completionPost, delegated(completionPost),
  ));
  const resumed = crossCheckAgentTeamLedgers({ hostEnvelope: envelope(true), events,
    conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(resumed.ok, true, resumed.errors.join(";"));
  assert.equal(resumed.matched[0].hostStartCount, 2);

  const concurrent = crossCheckAgentTeamLedgers({ hostEnvelope: envelope(false), events,
    conformance, requiredTeammateNames: ["store-owner"] });
  assert.equal(concurrent.ok, false);
  assert.match(concurrent.errors.join(";"), /serial host SubagentStart lifecycle/);
});

test("headless negative control distinguishes explicit async from fail-closed missing status", () => {
  const asyncReceipt = received({
    responseStatus: "async_launched",
    responseIsAsync: true,
    responseHostAgentIdHash: digest("host-agent\0ordinary-agent"),
  });
  const hostEnvelope = parseAgentTeamHostEnvelopes(bytesFor(
    asyncReceipt, delegated(asyncReceipt),
  ));
  const events = [{
    type: "team_spawn_capability_observed",
    toolUseId: asyncReceipt.toolUseId,
    requestedNameHash: asyncReceipt.requestedAgentNameHash,
    status: "async_launched",
    isAsync: true,
  }];
  const explicit = assessAgentTeamNegativeControl({ hostEnvelope, events });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.proofKind, "explicit-async");
  const missingReceipt = received({ responseStatus: null, responseIsAsync: null });
  const missingEnvelope = parseAgentTeamHostEnvelopes(bytesFor(
    missingReceipt, delegated(missingReceipt),
  ));
  const missing = assessAgentTeamNegativeControl({ hostEnvelope: missingEnvelope,
    events: [{ type: "team_spawn_capability_observed",
      toolUseId: missingReceipt.toolUseId,
      requestedNameHash: missingReceipt.requestedAgentNameHash,
      status: "missing", isAsync: false }] });
  assert.equal(missing.ok, true);
  assert.equal(missing.proofKind, "fail-closed-missing-status");
  const contaminated = assessAgentTeamNegativeControl({ hostEnvelope,
    events: [...events, { type: "team_identity_bound", agentId: "teammate:store-owner" }] });
  assert.equal(contaminated.ok, false);
});

test("R3 assessment binds the audited correction to integration without trigger prose", () => {
  const interventionId = "integration-intervention";
  const correctionAuthorityHash = digest("integration-authority");
  const finalFingerprint = digest("integration-final-fingerprint");
  const common = { interventionId, correctionAuthorityHash };
  const events = [
    { seq: 1, type: "evaluator_fault_injected", evaluatorOwned: true,
      kind: "r3-integration-drift", sourceHash: "sha256:source", markerHash: "sha256:marker",
      logicalTarget: "src/index.js", beforeHash: "sha256:before", afterHash: "sha256:after",
      faultAuthorityHash: "sha256:fault" },
    { seq: 2, type: "boundary_paused", interventionId },
    { seq: 3, type: "supervisor_verdict", onTrack: false, ...common },
    { seq: 4, type: "correction_factual_audit", passed: true, insufficient: false, ...common },
    { seq: 5, type: "correction_emitted", channel: "TaskCompleted.exit2",
      source: "supervisor_plan", trigger: null, ...common },
    { seq: 6, type: "correction_observed", ...common },
    { seq: 7, type: "effect_observed", matchedExpectedAction: "runRef:frozenAcceptance",
      artifactFingerprint: finalFingerprint, ...common },
    { seq: 8, type: "acceptance_finished", phase: "integration", taskId: "3",
      passed: true, finalFingerprint, interventionId },
    { seq: 9, type: "outcome_verdict", phase: "integration", passed: true,
      finalFingerprint, interventionId },
    { seq: 10, type: "intervention_resolved", causalEffectSeq: 7,
      finalFingerprint, ...common },
    { seq: 11, type: "multi_agent_integration_verified", taskId: "3",
      finalFingerprint, ...common },
  ];
  const injectionEntries = [{ evaluatorR3Injection: { applied: true,
    sourceHash: "sha256:source", markerHash: "sha256:marker", logicalTarget: "src/index.js",
    beforeHash: "sha256:before", afterHash: "sha256:after" } }];
  const assessed = assessR3IntegrationCorrection({ events, injectionEntries });
  assert.equal(assessed.ok, true);
  assert.equal(assessed.causalChainComplete, true);
  assert.equal(assessed.correctionAuthorityHash, correctionAuthorityHash);

  const wrongAuthority = events.map((event) => event.type === "multi_agent_integration_verified"
    ? { ...event, correctionAuthorityHash: digest("different") } : event);
  assert.equal(assessR3IntegrationCorrection({ events: wrongAuthority,
    injectionEntries }).ok, false);
  const outOfOrder = events.map((event) => event.type === "effect_observed"
    ? { ...event, seq: 11 } : event);
  assert.equal(assessR3IntegrationCorrection({ events: outOfOrder,
    injectionEntries }).ok, false);
});

test("R3 supervised Experience gate requires sealed attributable treatment evidence", () => {
  const eligible = {
    schema: "outsider/supervised-experience/v2",
    terminal: { terminalClass: "SAFE_DELIVERY" },
    learningLabels: {
      deliveryResolved: true,
      outsiderCausalContribution: true,
      eligibleForCorrectionEffectLearning: true,
      causalAttributionClass: "AUDITED_INTERVENTION_COMPLETE",
    },
    causalChains: [{ sealedComplete: true }],
  };
  assert.equal(assessR3SupervisedExperience(eligible).ok, true);
  assert.equal(assessR3SupervisedExperience({
    ...eligible,
    terminal: { terminalClass: "VERIFIED_DELIVERY_UNATTRIBUTED" },
  }).ok, false);
  assert.equal(assessR3SupervisedExperience({
    ...eligible,
    causalChains: [{ sealedComplete: false }],
  }).ok, false);
});

test("only Claude's explicit workspace trust screen authorizes the canary Enter", () => {
  const screen = "\u001b[?25l Quick safety check: Is this a project you created or one you trust? "
    + "1. Yes, I trust this folder 2. No, exit";
  assert.equal(isClaudeWorkspaceTrustPrompt(screen), true);
  assert.equal(isClaudeWorkspaceTrustPrompt("Do you trust this correction? Yes"), false);
  assert.equal(isClaudeWorkspaceTrustPrompt("Quick safety check: unrelated workspace"), false);
});

test("stability wait does not accept a received hook before delegated completion", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-agent-team-stable-"));
  try {
    const payloadLog = path.join(directory, "host.jsonl");
    const eventsPath = path.join(directory, "events.jsonl");
    const entry = received();
    writeFileSync(payloadLog, bytesFor(entry));
    writeFileSync(eventsPath, `${JSON.stringify({ seq: 1, type: "worker_exit" })}\n`);
    setTimeout(() => writeFileSync(payloadLog, bytesFor(entry, delegated(entry))), 25);
    const stable = await stabilizeAgentTeamEvidence({ payloadLog, eventsPath,
      timeoutMs: 500, intervalMs: 5, stableSamples: 2 });
    assert.equal(stable.ok, true, stable.hostEnvelope.errors.join(";"));
    assert.equal(stable.hostEnvelope.delegatedCount, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("probe binds raw and assessed evidence before finish and gates both modes", () => {
  const source = readFileSync(path.join(root, "scripts", "stage05-agent-team-probe.mjs"), "utf8");
  const rawCopy = source.indexOf("path.join(run.store.directory, copiedEnvelopeName)");
  const assessed = source.indexOf('run.record("agent_team_conformance_assessed"');
  const finish = source.indexOf("finish = await run.finish()");
  assert.ok(rawCopy > 0 && assessed > rawCopy && finish > assessed,
    "raw envelope and assessed event must be inside the run before terminal seal");
  assert.match(source, /workerExit\.code === 0 && protocolOk && deliveryProofOk/);
  assert.match(source, /protocolOk && negativeEvidenceOk && sourceHashesStable/);
  assert.match(source, /hostEnvelopeSourceStable/,
    "the unsealed recorder source must still match the exact sealed copy after finish");
  assert.doesNotMatch(source, /sendWorkerInput\("\/exit/,
    "controlled workers disable slash commands, so /exit cannot be the shutdown protocol");
  assert.match(source, /hostQuiescent[\s\S]*sendWorkerInput\("\\x04\\x04"\)/,
    "formal workers exit through the host's confirmed EOT pair only after the ledger is quiescent");
});

test("recorder emits a bound delegated receipt after the real hook returns", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-agent-team-recorder-"));
  try {
    const log = path.join(directory, "host.jsonl");
    const realHook = path.join(directory, "real-hook.mjs");
    writeFileSync(realHook, "process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('{}'));\n");
    const probeHook = path.join(root, "scripts", "stage05-agent-team-probe-hook.mjs");
    const run = spawnSync(process.execPath, [probeHook], {
      input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Agent",
        tool_use_id: "spawn-store", tool_input: { name: "store-owner" },
        tool_response: { status: "teammate_spawned", agentId: "raw-store" } }),
      env: { ...process.env, OUTSIDER_AGENT_TEAM_PROBE_PAYLOAD_LOG: log,
        OUTSIDER_AGENT_TEAM_PROBE_REAL_HOOK: realHook },
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    const parsed = parseAgentTeamHostEnvelopes(readFileSync(log));
    assert.equal(parsed.ok, true, parsed.errors.join(";"));
    assert.equal(parsed.received[0].responseStatus, "teammate_spawned");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recorder blocks an Agent spawn before execution when the explicit Sonnet model is absent", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-agent-team-model-"));
  try {
    const log = path.join(directory, "host.jsonl");
    const realHook = path.join(directory, "real-hook.mjs");
    writeFileSync(realHook, "process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('{}'));\n");
    const probeHook = path.join(root, "scripts", "stage05-agent-team-probe-hook.mjs");
    const run = spawnSync(process.execPath, [probeHook], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent",
        tool_use_id: "spawn-store", tool_input: { name: "store-owner" } }),
      env: { ...process.env, OUTSIDER_AGENT_TEAM_PROBE_PAYLOAD_LOG: log,
        OUTSIDER_AGENT_TEAM_PROBE_REAL_HOOK: realHook,
        OUTSIDER_AGENT_TEAM_REQUIRED_MODEL: "sonnet" },
      encoding: "utf8",
    });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /MODEL_POLICY_REJECTED/);
    const parsed = parseAgentTeamHostEnvelopes(readFileSync(log));
    assert.equal(parsed.ok, true, parsed.errors.join(";"));
    assert.equal(parsed.received[0].modelGuardViolation, true);
    assert.equal(parsed.delegated[0].evaluatorModelGuardBlocked, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
