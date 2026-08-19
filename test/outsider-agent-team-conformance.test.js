import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  assessAgentTeamConformance, isAuditedCrossOwnerCorrectionEffect,
} from "../src/outsider-agent-team-conformance.js";

const digest = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;

function modernFixture({ receiptFirst = false } = {}) {
  const events = [];
  const add = (type, value = {}) => {
    const body = { seq: events.length + 1, type, ...value };
    const event = { ...body, eventHash: digest(canonicalizeStrict(body)) };
    events.push(event);
    return event;
  };
  const taskUpdate = ({ taskId, owner, blockedBy = [], key, agentId = "main" }) => {
    const pre = add("boundary_reached", { boundary: "PreToolUse", tool: "TaskUpdate",
      toolUseId: key, agentId });
    const post = add("boundary_reached", { boundary: "PostToolUse", tool: "TaskUpdate",
      toolUseId: key, agentId, exit: 0 });
    return add("task_graph_updated", { taskId, owner, status: "in_progress", blockedBy,
      hostSucceeded: true, toolUseId: key, preBoundarySeq: pre.seq,
      preBoundaryEventHash: pre.eventHash, postBoundarySeq: post.seq,
      postBoundaryEventHash: post.eventHash });
  };
  add("agent_registered", { agentId: "main", agentKind: "main" });
  for (const taskId of ["store", "scheduler", "integration"]) {
    add("team_task_created", { taskId });
  }
  taskUpdate({ taskId: "store", owner: "store-owner", key: "own-store" });
  taskUpdate({ taskId: "scheduler", owner: "scheduler-owner", key: "own-scheduler" });
  taskUpdate({ taskId: "integration", owner: "lead", blockedBy: ["store", "scheduler"],
    key: "own-integration" });

  const initialFileHashesByTeammate = {};
  for (const [name, taskId, file, expectedCheck] of [
    ["store-owner", "store", "src/store.js", "npm run test:store"],
    ["scheduler-owner", "scheduler", "src/scheduler.js", "npm run test:scheduler"],
  ]) {
    const agentId = `teammate:${name}`;
    const rawAgentId = `raw-${name}`;
    const spawnToolUseId = `spawn-${name}`;
    const teammateNameHash = digest(`teammate-name\0${name}`);
    const taskDefinitionHash = digest(`task-definition\0${taskId}`);
    const delegationBindingHash = digest(`delegation-binding\0${name}\0${taskId}`);
    const intentBody = {
      key: digest(`agent-tool-use\0${spawnToolUseId}`),
      teammateNameHash,
      promptHash: digest(`prompt-${name}`),
      parentAgentIdHash: digest("parent-main"),
      spawnDelegationIdHash: digest(`delegation-${name}`),
      teamTaskIdHash: digest(`task\0${taskId}`),
      taskLinkStatus: "unique-owned-team-task",
      delegationBindingHash,
      taskDefinitionHash,
    };
    add("team_delegation_bound", {
      toolUseIdHash: intentBody.key,
      teammateNameHash,
      teamTaskIdHash: intentBody.teamTaskIdHash,
      taskDefinitionHash,
      delegationBindingHash,
      promptHash: intentBody.promptHash,
      directPromptBound: true,
    });
    const request = add("team_spawn_requested", {
      toolUseId: spawnToolUseId,
      toolUseIdHash: intentBody.key,
      teammateNameHash,
      promptHash: intentBody.promptHash,
      parentAgentIdHash: intentBody.parentAgentIdHash,
      spawnDelegationIdHash: intentBody.spawnDelegationIdHash,
      teamTaskIdHash: intentBody.teamTaskIdHash,
      taskLinkStatus: intentBody.taskLinkStatus,
      delegationBindingHash,
      taskDefinitionHash,
      spawnIntentHash: digest(canonicalizeStrict(intentBody)),
    });
    const capabilityValue = { toolUseId: spawnToolUseId, requestedNameHash: teammateNameHash,
      status: "teammate_spawned", bindable: true, isAsync: false };
    let capability;
    if (receiptFirst) capability = add("team_spawn_capability_observed", capabilityValue);
    const registration = add("agent_registered", { agentId: rawAgentId, agentKind: "subagent" });
    const rawContext = add("subagent_context_injected", { agentId: rawAgentId,
      oncePerAgent: true });
    if (!receiptFirst) capability = add("team_spawn_capability_observed", capabilityValue);
    const canonicalAgentIdHash = digest(`canonical-agent\0${agentId}`);
    const identityBindingHash = digest(canonicalizeStrict({
      spawnIntentHash: request.spawnIntentHash,
      teammateNameHash,
      agentIdHash: digest(`host-agent\0${rawAgentId}`),
      canonicalAgentIdHash,
    }));
    const binding = add("team_identity_bound", {
      status: "teammate_spawned", toolUseId: spawnToolUseId,
      toolUseIdHash: request.toolUseIdHash, teammateNameHash,
      agentIdHash: digest(`host-agent\0${rawAgentId}`), canonicalAgentIdHash,
      identityBindingHash, spawnIntentHash: request.spawnIntentHash,
      teamTaskIdHash: request.teamTaskIdHash,
      spawnDelegationIdHash: request.spawnDelegationIdHash,
      rawRegistrationSeq: registration.seq, rawRegistrationEventHash: registration.eventHash,
      rawContextSeq: rawContext.seq, rawContextEventHash: rawContext.eventHash,
    });
    add("teammate_context_injected", { agentId, oncePerAgent: true,
      identityProvenanceHash: identityBindingHash, identityLineageHash: null });

    const beforeHash = digest(`initial-${name}`);
    initialFileHashesByTeammate[name] = beforeHash;
    const editUseId = `edit-${name}`;
    const editPre = add("boundary_reached", { boundary: "PreToolUse", tool: "Edit",
      toolUseId: editUseId, agentId });
    const editPost = add("boundary_reached", { boundary: "PostToolUse", tool: "Edit",
      toolUseId: editUseId, agentId, exit: 0 });
    const touch = add("confirmed_file_touch", { agentId, taskIds: [taskId], file,
      toolUseId: editUseId, executed: true, changed: true, beforeHash,
      afterHash: digest(`changed-${name}`), identityBindingHash,
      preBoundarySeq: editPre.seq, preBoundaryEventHash: editPre.eventHash,
      postBoundarySeq: editPost.seq, postBoundaryEventHash: editPost.eventHash });

    const checkUseId = `check-${name}`;
    add("boundary_reached", { boundary: "PreToolUse", tool: "Bash",
      toolUseId: checkUseId, agentId, action: expectedCheck, isTest: true });
    add("boundary_reached", { boundary: "PostToolUse", tool: "Bash",
      toolUseId: checkUseId, agentId, action: expectedCheck, isTest: true, exit: 0 });

    const completeUseId = `complete-${name}`;
    const completePre = add("boundary_reached", { boundary: "PreToolUse", tool: "TaskUpdate",
      toolUseId: completeUseId, agentId });
    const completionIntentBody = {
      toolUseIdHash: digest(`task-completion-tool-use\0${completeUseId}`),
      taskIdHash: digest(`task\0${taskId}`),
      agentIdHash: digest(`completion-agent\0${agentId}`),
      identityBindingHash,
      taskGeneration: 1,
      preBoundarySeq: completePre.seq,
      preBoundaryEventHash: completePre.eventHash,
    };
    const completionIntentHash = digest(canonicalizeStrict(completionIntentBody));
    const intent = add("task_completion_intent_recorded", { ...completionIntentBody,
      completionIntentHash });
    add("task_completion_verified_pending_host", { taskId, agentId,
      completionIntentHash, identityBindingHash, taskGeneration: 1,
      independentlyVerified: true });
    const completePost = add("boundary_reached", { boundary: "PostToolUse", tool: "TaskUpdate",
      toolUseId: completeUseId, agentId, exit: 0 });
    add("team_task_completed", { taskId, agentId, independentlyVerified: true,
      toolUseId: completeUseId, completionIntentHash, identityBindingHash,
      postHostSucceeded: true, completionIntentEventSeq: intent.seq,
      completionIntentEventHash: intent.eventHash,
      preBoundarySeq: completePre.seq, preBoundaryEventHash: completePre.eventHash,
      postBoundarySeq: completePost.seq, postBoundaryEventHash: completePost.eventHash,
      taskGeneration: 1,
      touchSeq: touch.seq, bindingSeq: binding.seq, capabilitySeq: capability.seq });
  }

  const integrationCheck = "npm test";
  add("boundary_reached", { boundary: "PreToolUse", tool: "Bash",
    toolUseId: "integration-check", agentId: "main", action: integrationCheck, isTest: true });
  add("boundary_reached", { boundary: "PostToolUse", tool: "Bash",
    toolUseId: "integration-check", agentId: "main", action: integrationCheck,
    isTest: true, exit: 0 });
  const finalFingerprint = digest("final-tree");
  const acceptance = add("acceptance_finished", { phase: "integration", ran: true,
    passed: true, exit: 0, finalFingerprint });
  const audit = add("outcome_approval_audit", { phase: "integration", passed: true,
    finalFingerprint });
  const outcome = add("outcome_verdict", { phase: "integration", passed: true,
    finalFingerprint, approvalAuditSeq: audit.seq });
  add("multi_agent_integration_verified", { taskId: "integration", agentId: "main",
    acceptanceSeq: acceptance.seq, acceptanceExit: 0,
    outcomeVerdictSeq: outcome.seq, approvalAuditSeq: audit.seq, finalFingerprint });
  add("coordination_ready_at_stop", {});
  return { events, initialFileHashesByTeammate };
}

function fixture() {
  const events = [];
  const add = (type, value = {}) => events.push({ seq: events.length + 1, type, ...value });
  add("agent_registered", { agentId: "main", agentKind: "main" });
  for (const [name, task, file] of [["store-owner", "store", "src/store.js"],
    ["scheduler-owner", "scheduler", "src/scheduler.js"]]) {
    const agentId = `teammate:${name}`;
    add("agent_registered", { agentId, agentKind: "teammate",
      identityProvenanceHash: `sha256:${name}`, identityLineageHash: `sha256:lineage-${name}`,
      lineageHashes: [{ kind: "session-id", hash: `sha256:lineage-${name}` }] });
    add("teammate_context_injected", { agentId, oncePerAgent: true,
      identityProvenanceHash: `sha256:context-${name}`,
      identityLineageHash: `sha256:lineage-${name}` });
    add("team_task_created", { taskId: task });
    add("task_graph_updated", { taskId: task, owner: name, status: "in_progress", blockedBy: [] });
    add("confirmed_file_touch", { agentId, taskIds: [task], file });
    add("team_task_completed", { agentId, taskId: task, independentlyVerified: true });
  }
  add("team_task_created", { taskId: "integration" });
  add("task_graph_updated", { taskId: "integration", owner: "lead", status: "in_progress",
    blockedBy: ["store", "scheduler"] });
  add("multi_agent_integration_verified", { taskId: "integration", agentId: "main",
    finalFingerprint: "sha256:F" });
  add("coordination_ready_at_stop", {});
  return events;
}

test("real teammate identity, mandate, owned effects and integration form one conformance proof", () => {
  const result = assessAgentTeamConformance(fixture(), {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.teammateChains.length, 2);
  assert.equal(result.integrationChain.taskId, "integration");
});

test("a teammate prefix without host lineage cannot impersonate a real teammate", () => {
  const events = fixture().map((event) => event.agentId === "teammate:store-owner"
    && event.type === "agent_registered" ? { ...event, agentKind: "subagent",
      lineageHashes: [] } : event);
  const result = assessAgentTeamConformance(events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("real host identity evidence missing: teammate:store-owner"));
});

test("identity conflict or context after the first action fails closed", () => {
  const events = fixture();
  const context = events.find((event) => event.type === "teammate_context_injected"
    && event.agentId === "teammate:store-owner");
  context.seq = 999;
  events.push({ seq: 1000, type: "agent_identity_conflict", agentId: "teammate:store-owner" });
  const result = assessAgentTeamConformance(events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("host teammate identity conflicted during the run"));
  assert.ok(result.errors.some((error) => /mandate/.test(error)));
});

test("task touch and completion cannot be pooled across teammates", () => {
  const events = fixture().map((event) => event.type === "confirmed_file_touch"
    && event.agentId === "teammate:store-owner" ? { ...event, taskIds: ["scheduler"] } : event);
  const result = assessAgentTeamConformance(events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("owned teammate task chain missing: teammate:store-owner"));
});

test("lead integration must depend on both completed teammate tasks and precede ready Stop", () => {
  const events = fixture().map((event) => event.type === "task_graph_updated"
    && event.taskId === "integration" ? { ...event, blockedBy: ["store"] } : event);
  const result = assessAgentTeamConformance(events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /lead integration/.test(error)));
});

test("decoy created tasks cannot authorize ghost ownership and pooled touches", () => {
  const events = fixture();
  for (const event of events) {
    if (event.type === "task_graph_updated" && event.taskId === "store") event.taskId = "ghost-store";
    if (event.type === "confirmed_file_touch" && event.agentId === "teammate:store-owner") {
      event.taskIds = ["ghost-store", "scheduler"];
    }
    if (event.type === "team_task_completed" && event.agentId === "teammate:store-owner") {
      event.taskId = "ghost-store";
    }
  }
  const result = assessAgentTeamConformance(events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("owned teammate task chain missing: teammate:store-owner"));
});

test("integration cannot be attributed to a teammate or an unnamed actor", () => {
  for (const agentId of [null, "teammate:store-owner"]) {
    const events = fixture();
    const integration = events.find((event) => event.type === "multi_agent_integration_verified");
    integration.agentId = agentId;
    const result = assessAgentTeamConformance(events, {
      requiredTeammateNames: ["store-owner", "scheduler-owner"],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /lead integration/.test(error)));
  }
});

test("formal mode rejects legacy-only identity and enforces exact graph cardinality", () => {
  const result = assessAgentTeamConformance(fixture(), {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
    requireTeammateSpawnBinding: true,
    exactTaskCount: 4,
    exactTeammateBindingCount: 2,
    exactIntegrationCount: 2,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /real host identity evidence missing/.test(error)));
  assert.ok(result.errors.includes("team task graph cardinality mismatch: expected 4, got 3"));
  assert.ok(result.errors.includes("teammate binding cardinality mismatch: expected 2, got 0"));
  assert.ok(result.errors.includes("integration cardinality mismatch: expected 2, got 1"));
});

for (const receiptFirst of [false, true]) {
  test(`formal modern teammate binding accepts the ${receiptFirst ? "receipt-first" : "start-first"} rendezvous`, () => {
    const modern = modernFixture({ receiptFirst });
    const result = assessAgentTeamConformance(modern.events, {
      requiredTeammateNames: ["store-owner", "scheduler-owner"],
      requireTeammateSpawnBinding: true,
      expectedFilesByTeammate: {
        "store-owner": "src/store.js",
        "scheduler-owner": "src/scheduler.js",
      },
      initialFileHashesByTeammate: modern.initialFileHashesByTeammate,
      expectedChecksByTeammate: {
        "store-owner": "npm run test:store",
        "scheduler-owner": "npm run test:scheduler",
      },
      expectedIntegrationCheck: "npm test",
      exactTaskCount: 3,
      exactTeammateBindingCount: 2,
      exactIntegrationCount: 1,
    });
    assert.equal(result.ok, true, result.errors.join("; "));
    assert.equal(result.teammateChains.every((chain) => chain.completionToolUseId), true);
    assert.equal(result.integrationChain.checkToolUseId, "integration-check");
  });
}

test("a controller-bound exact workspace cd wrapper proves the preregistered slice check", () => {
  const modern = modernFixture();
  const agentId = "teammate:store-owner";
  const expected = "npm run test:store";
  const check = modern.events.find((event) => event.type === "boundary_reached"
    && event.boundary === "PostToolUse" && event.agentId === agentId
    && event.action === expected);
  const { eventHash: ignored, ...body } = check;
  Object.assign(check, {
    ...body,
    action: `cd "/tmp/frozen-workspace" && ${expected}`,
    expectedCheckMatch: "exact-workspace-cd-wrapper",
    expectedCheckHash: digest(canonicalizeStrict({
      schema: "outsider/expected-check-binding/v1", agentId, commands: [expected],
    })),
  });
  check.eventHash = digest(canonicalizeStrict(Object.fromEntries(
    Object.entries(check).filter(([key]) => key !== "eventHash"))));
  const options = {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: {
      "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
    },
    initialFileHashesByTeammate: modern.initialFileHashesByTeammate,
    expectedChecksByTeammate: {
      "store-owner": expected, "scheduler-owner": "npm run test:scheduler",
    },
    expectedIntegrationCheck: "npm test", exactTaskCount: 3,
    exactTeammateBindingCount: 2, exactIntegrationCount: 1,
  };
  const accepted = assessAgentTeamConformance(modern.events, options);
  assert.equal(accepted.ok, true, accepted.errors.join("; "));

  const unbound = structuredClone(modern.events);
  const unboundCheck = unbound.find((event) => event.seq === check.seq);
  delete unboundCheck.expectedCheckHash;
  delete unboundCheck.expectedCheckMatch;
  const { eventHash: removed, ...unboundBody } = unboundCheck;
  unboundCheck.eventHash = digest(canonicalizeStrict(unboundBody));
  const rejected = assessAgentTeamConformance(unbound, options);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes("owned teammate task chain missing: teammate:store-owner"));
});

test("the lead may run only the preregistered slice suite before the integration check", () => {
  const modern = modernFixture();
  const expected = "npm test";
  const commands = ["npm run test:store", "npm run test:scheduler", expected];
  const check = modern.events.find((event) => event.type === "boundary_reached"
    && event.boundary === "PostToolUse" && event.agentId === "main"
    && event.action === expected);
  const { eventHash: ignored, ...body } = check;
  Object.assign(check, {
    ...body,
    action: `cd "/tmp/frozen-workspace" && ${commands.join(" && ")}`,
    expectedCheckMatch: "exact-workspace-preregistered-suite",
    expectedCheckHash: digest(canonicalizeStrict({
      schema: "outsider/expected-check-binding/v1", agentId: "main", commands,
    })),
  });
  check.eventHash = digest(canonicalizeStrict(Object.fromEntries(
    Object.entries(check).filter(([key]) => key !== "eventHash"))));
  const result = assessAgentTeamConformance(modern.events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: {
      "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
    },
    initialFileHashesByTeammate: modern.initialFileHashesByTeammate,
    expectedChecksByTeammate: {
      "store-owner": commands[0], "scheduler-owner": commands[1],
    },
    expectedIntegrationCheck: expected, exactTaskCount: 3,
    exactTeammateBindingCount: 2, exactIntegrationCount: 1,
  });
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.integrationChain.checkToolUseId, "integration-check");
});

test("formal exact mode rejects extra canonical teammates and out-of-slice effects", () => {
  const modern = modernFixture();
  const lastSeq = Math.max(...modern.events.map((event) => event.seq));
  const extraBody = { seq: lastSeq + 1, type: "agent_registered",
    agentId: "teammate:mallory", agentKind: "teammate" };
  modern.events.push({ ...extraBody, eventHash: digest(canonicalizeStrict(extraBody)) });
  const lateBody = { seq: lastSeq + 2, type: "confirmed_file_touch",
    agentId: "teammate:store-owner", file: "src/index.js", executed: true,
    changed: true, toolUseId: "late-extra", beforeHash: digest("a"), afterHash: digest("b") };
  modern.events.push({ ...lateBody, eventHash: digest(canonicalizeStrict(lateBody)) });
  const result = assessAgentTeamConformance(modern.events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: {
      "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
    },
    initialFileHashesByTeammate: modern.initialFileHashesByTeammate,
    expectedChecksByTeammate: {
      "store-owner": "npm run test:store", "scheduler-owner": "npm run test:scheduler",
    },
    expectedIntegrationCheck: "npm test", exactTaskCount: 3,
    exactTeammateBindingCount: 2, exactIntegrationCount: 1,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /unexpected canonical teammates/.test(error)));
  assert.ok(result.errors.some((error) => /outside its frozen slice/.test(error)));
  assert.ok(result.errors.some((error) => /after task completion/.test(error)));
});

test("a factually audited lead repair does not erase the teammate's original slice proof", () => {
  const modern = modernFixture();
  const add = (type, value = {}) => {
    const body = { seq: modern.events.at(-1).seq + 1, type, ...value };
    const event = { ...body, eventHash: digest(canonicalizeStrict(body)) };
    modern.events.push(event);
    return event;
  };
  const interventionId = "repair-store";
  const authority = digest("repair-store-authority");
  const beforeHash = modern.events.find((event) => event.type === "confirmed_file_touch"
    && event.agentId === "teammate:store-owner").afterHash;
  const audit = add("correction_factual_audit", { interventionId,
    correctionAuthorityHash: authority, passed: true });
  const action = { kind: "edit", path: "src/store.js", preSha256: beforeHash };
  const emitted = add("correction_emitted", { interventionId,
    correctionAuthorityHash: authority, agentId: "main", factualAuditSeq: audit.seq,
    expectedActions: [action] });
  add("correction_observed", { interventionId, correctionAuthorityHash: authority,
    agentId: "main" });
  const pre = add("boundary_reached", { boundary: "PreToolUse", tool: "Edit",
    toolUseId: "audited-repair", agentId: "main" });
  const post = add("boundary_reached", { boundary: "PostToolUse", tool: "Edit",
    toolUseId: "audited-repair", agentId: "main", exit: 0 });
  const touch = add("confirmed_file_touch", { agentId: "main", file: "src/store.js",
    taskIds: [], toolUseId: "audited-repair", beforeHash, afterHash: digest("repaired"),
    executed: true, changed: true, preBoundarySeq: pre.seq,
    preBoundaryEventHash: pre.eventHash, postBoundarySeq: post.seq,
    postBoundaryEventHash: post.eventHash });
  add("expected_action_observed", { interventionId, correctionAuthorityHash: authority,
    agentId: "main", toolUseId: touch.toolUseId, eventSeq: post.seq,
    effectKind: "edit", strong: true, succeeded: true,
    expectedAction: JSON.stringify(action) });
  add("effect_observed", { interventionId, correctionAuthorityHash: authority,
    agentId: "main", toolUseId: touch.toolUseId, eventSeq: post.seq,
    changedFiles: [touch.file] });

  assert.equal(isAuditedCrossOwnerCorrectionEffect(modern.events, touch), true);
  const result = assessAgentTeamConformance(modern.events, {
    requiredTeammateNames: ["store-owner", "scheduler-owner"],
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: {
      "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
    },
    initialFileHashesByTeammate: modern.initialFileHashesByTeammate,
    expectedChecksByTeammate: {
      "store-owner": "npm run test:store", "scheduler-owner": "npm run test:scheduler",
    },
    expectedIntegrationCheck: "npm test", exactTaskCount: 3,
    exactTeammateBindingCount: 2, exactIntegrationCount: 1,
  });
  assert.equal(result.ok, true, result.errors.join("; "));

  const changedAudit = { ...audit, passed: false };
  const { eventHash: ignored, ...auditBody } = changedAudit;
  changedAudit.eventHash = digest(canonicalizeStrict(auditBody));
  const rejected = modern.events.map((event) => event.seq === audit.seq ? changedAudit : event);
  assert.equal(isAuditedCrossOwnerCorrectionEffect(rejected, touch), false);
});
