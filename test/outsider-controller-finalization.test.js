import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startRecoverableControllerHost } from "../src/outsider-controller-host.js";
import { reconcileTerminalControllerRun } from "../src/outsider-controller-watchdog.js";
import { acquireControllerLease } from "../src/outsider-controller-lease.js";
import { controllerSocketPath, createControllerToken, requestController,
  startControllerRpc } from "../src/outsider-controller-rpc.js";
import { startControllerWatchdog } from "../src/outsider-controller-watchdog.js";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import {
  createStage05ControlledWayBinding, finalizeStage05Evidence, verifyStage05RunDirectory,
} from "../src/outsider-stage05-evidence.js";
import { freezeContract } from "../src/outsider-work-contract.js";
import net from "node:net";

function preterminalRun() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-finalization-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 2;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({
    cwd,
    ask: "finish only after every accepted hook is durable",
    acceptance: "node --test",
    semantic: {
      objective: "preserve value 2",
      successCriteria: ["value remains 2"],
      architecturalConstraints: [],
      forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] },
      uncertainties: [],
    },
    semanticAudit: { passed: true, evidenceHash: "sha256:finalization-audit" },
    baselineEvidence: baseline,
  });
  const binding = createStage05ControlledWayBinding({
    contract,
    workerExecutable: "/private/worker",
    supervisorCommand: "fake-supervisor",
  });
  const store = RunStore.create({
    cwd,
    contract,
    supervisorCommand: "fake-supervisor",
    stateRoot: path.join(root, "runs"),
    binding,
  });
  store.writeJson("baseline.json", baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: contract.semantic.objective,
    successCriteria: contract.semantic.successCriteria.length });
  store.append("contract_audited", { passed: true,
    evidenceHash: contract.semanticAudit.evidenceHash });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  store.append("worker_launch", { executable: "/private/worker" });
  return { root, cwd, baseline, store };
}

test("an RPC peer that closes before replying fails immediately instead of waiting for hook timeout", async () => {
  const peers = new Set();
  const server = net.createServer((socket) => {
    peers.add(socket);
    socket.once("close", () => peers.delete(socket));
    socket.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const startedAt = Date.now();
  try {
    await assert.rejects(requestController({
      socketPath: `tcp://127.0.0.1:${address.port}`,
      token: "closed-peer",
      payload: { input: { hook_event_name: "Stop" } },
      timeoutMs: 30_000,
    }), /RPC_CONNECTION_CLOSED_BEFORE_RESPONSE/);
    assert.ok(Date.now() - startedAt < 2_000, "closed peers must not consume the hook timeout");
  } finally {
    for (const peer of peers) peer.destroy();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a terminal event crash is reconciled without appending or re-judging", () => {
  const fixture = preterminalRun();
  const fingerprint = fixture.baseline.fingerprint;
  acquireControllerLease({ store: fixture.store, ownerId: "dead-generation-1",
    ttlMs: 60_000 });
  fixture.store.append("acceptance_finished", { phase: "stop", ran: true,
    passed: true, exit: 0, finalFingerprint: fingerprint, interventionId: null });
  const audit = fixture.store.append("outcome_approval_audit", { phase: "stop", passed: true,
    finalFingerprint: fingerprint, interventionId: null });
  fixture.store.append("outcome_verdict", { phase: "stop", passed: true,
    finalFingerprint: fingerprint, interventionId: null, approvalAuditSeq: audit.seq });
  fixture.store.append("acceptance_finished", { phase: "final", ran: true,
    passed: true, exit: 0, finalFingerprint: fingerprint, interventionId: null });
  const terminal = fixture.store.append("run_finalized", { proofComplete: true,
    deliveryComplete: true, interventionRequired: false, interventionComplete: true,
    acceptancePassed: true, finalFingerprint: fingerprint, errors: [],
    supervisorReliability: {} });
  const config = path.join(fixture.store.directory, "controller-config.test.json");
  writeFileSync(config, JSON.stringify({ runDirectory: fixture.store.directory,
    supervisorCommand: "fake-supervisor" }));

  const before = readFileSync(fixture.store.eventsPath);
  const recovered = reconcileTerminalControllerRun({ configPath: config, now: 42 });
  assert.equal(recovered.terminal.seq, terminal.seq);
  assert.equal(recovered.proof.complete, true);
  assert.deepEqual(readFileSync(fixture.store.eventsPath), before,
    "terminal reconciliation must never append to the causal stream");
  const reopened = RunStore.open({ directory: fixture.store.directory,
    supervisorCommand: "fake-supervisor" });
  assert.equal(reopened.readState().status, "complete");
  assert.equal(reopened.readState().terminalReconciled, true);
  assert.equal(reopened.readJson("controller-lease.json").status, "released");
  assert.equal(reopened.events().at(-1).type, "run_finalized");
  finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
});

test("watchdog reconciles a real SIGKILL after run_finalized and seals the unchanged stream", async () => {
  const fixture = preterminalRun();
  const transcript = path.join(fixture.cwd, "session.jsonl");
  writeFileSync(transcript, "");
  const supervisorBody = `process.stdout.write(JSON.stringify({onTrack:true,drift:"",plan:[],`
    + `expectedNextActions:[],acceptanceRisk:"low",passed:true,gaps:[],`
    + `evidence:["frozen artifact remains valid"],errors:[],`
    + `verifiedFacts:["frozen evidence supports PASS"]}))`;
  const supervisorCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(supervisorBody)}`;
  /* The fixture was created under fake-supervisor; create a fresh store with
     the same frozen contract so RunStore's supervisor identity is exact. */
  const root = path.join(fixture.root, "live");
  const binding = createStage05ControlledWayBinding({ contract: fixture.store.contract,
    workerExecutable: "/private/worker", supervisorCommand });
  const store = RunStore.create({ cwd: fixture.cwd, contract: fixture.store.contract,
    supervisorCommand, stateRoot: root, binding });
  store.writeJson("baseline.json", fixture.baseline);
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: fixture.store.contract.semantic.objective,
    successCriteria: fixture.store.contract.semantic.successCriteria.length });
  store.append("contract_audited", { passed: true,
    evidenceHash: fixture.store.contract.semanticAudit.evidenceHash });
  store.append("contract_frozen", { ask: fixture.store.contract.ask,
    acceptance: fixture.store.contract.acceptance });
  store.append("worker_launch", { executable: "/private/worker" });
  const config = path.join(store.directory, "controller-config.test.json");
  writeFileSync(config, JSON.stringify({ schema: "outsider/controller-config/v1",
    runDirectory: store.directory, supervisorCommand,
    controllerOptions: { maxSupervisorCalls: 12 }, leaseMs: 20_000, heartbeatMs: 250 }));
  const marker = path.join(fixture.root, "finalization-failpoint.json");
  writeFileSync(marker, JSON.stringify({
    schema: "outsider/evaluation-finalization-failpoint/v1",
    name: "after-run-finalized-before-state",
  }));
  const socketPath = controllerSocketPath(store.runId);
  const token = createControllerToken();
  const watchdog = await startControllerWatchdog({
    hostEntry: path.resolve("bin/outsider-controller-host.mjs"), configPath: config,
    socketPath, token, readyTimeoutMs: 5_000,
    hostEnvironment: { ...process.env, OUTSIDER_EVALUATION_ALLOW_FAILPOINTS: "1",
      OUTSIDER_EVALUATION_FINALIZATION_FAILPOINT: "after-run-finalized-before-state",
      OUTSIDER_EVALUATION_FAILPOINT_MARKER: marker },
  });
  try {
    const stopped = await requestController({ socketPath, token, payload: {
      agent: "claude-code", input: { hook_event_name: "Stop", transcript_path: transcript },
    }, timeoutMs: 5_000 });
    assert.equal(stopped.output.decision, "approve");
    const result = await watchdog.finish({ timeoutMs: 10_000 });
    assert.equal(result.proof.complete, true);
    assert.equal(watchdog.terminalResult?.proof.complete, true);
    assert.equal(watchdog.restarts, 0, "terminal reconciliation does not mint generation 2");
    const reopened = RunStore.open({ directory: store.directory, supervisorCommand });
    assert.equal(reopened.events().filter((event) => event.type === "run_finalized").length, 1);
    assert.equal(reopened.events().at(-1).type, "run_finalized");
    assert.equal(reopened.readState().terminalReconciled, true);
    assert.equal(reopened.readJson("controller-lease.json").status, "released");
    finalizeStage05Evidence({ directory: store.directory });
    assert.equal(verifyStage05RunDirectory(store.directory).ok, true);
  } finally {
    await watchdog.close();
  }
});

test("waitUntilReady never returns the killed generation before its replacement socket is live", async () => {
  const fixture = preterminalRun();
  const supervisorCommand = "fake-supervisor";
  const config = path.join(fixture.store.directory, "controller-config.readiness.json");
  writeFileSync(config, JSON.stringify({ schema: "outsider/controller-config/v1",
    runDirectory: fixture.store.directory, supervisorCommand,
    controllerOptions: { maxSupervisorCalls: 12 }, leaseMs: 20_000, heartbeatMs: 250 }));
  const socketPath = controllerSocketPath(fixture.store.runId);
  const token = createControllerToken();
  const watchdog = await startControllerWatchdog({
    hostEntry: path.resolve("bin/outsider-controller-host.mjs"), configPath: config,
    socketPath, token, readyTimeoutMs: 5_000,
  });
  try {
    const generation = watchdog.generation;
    watchdog.crashForTest("SIGKILL");
    await watchdog.waitUntilReady({ timeoutMs: 5_000 });
    assert.equal(watchdog.generation, generation + 1);
    const ping = await requestController({ socketPath, token,
      payload: { _outsiderControl: "ping" }, timeoutMs: 1_000 });
    assert.equal(ping.ready, true);
  } finally {
    await watchdog.close();
  }
});

test("finish drains an accepted hook, fences late hooks, releases its lease and seals once", async () => {
  const fixture = preterminalRun();
  let enterHook;
  let releaseHook;
  const hookEntered = new Promise((resolve) => { enterHook = resolve; });
  const hookRelease = new Promise((resolve) => { releaseHook = resolve; });
  let hookCalls = 0;
  const token = "finalization-test-token";
  const host = await startRecoverableControllerHost({
    runDirectory: fixture.store.directory,
    supervisorCommand: "fake-supervisor",
    socketPath: "tcp://127.0.0.1:0",
    token,
    heartbeatMs: 60_000,
    drainTimeoutMs: 5_000,
    controllerFactory: ({ store }) => ({
      async handleHook(payload) {
        hookCalls += 1;
        store.append("blocking_hook_started", { marker: payload.marker });
        enterHook();
        await hookRelease;
        store.append("blocking_hook_finished", { marker: payload.marker });
        return { decision: { verdict: "allow" }, output: {} };
      },
      finish() {
        const finalFingerprint = fixture.baseline.fingerprint;
        store.append("acceptance_finished", { phase: "final", ran: true,
          passed: true, exit: 0 });
        store.append("outcome_verdict", { phase: "final", passed: true, finalFingerprint });
        store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
          interventionRequired: false, interventionComplete: true,
          acceptancePassed: true, finalFingerprint, errors: [] });
        store.saveState({ status: "complete", proof: { complete: true,
          deliveryComplete: true, interventionRequired: false, interventionComplete: true } });
        return { runId: store.runId, acceptance: { passed: true },
          proof: { complete: true, deliveryComplete: true, errors: [] } };
      },
    }),
  });
  try {
    const first = requestController({
      socketPath: host.rpc.socketPath,
      token,
      payload: { marker: "accepted-before-finish", input: {
        hook_event_name: "TaskCompleted", task_id: "owned-task",
      } },
      timeoutMs: 5_000,
    });
    await hookEntered;

    /* Recovered attached daemons finalize through the authenticated socket,
       while the watchdog uses host.finish over IPC.  Both routes share this
       exact rpc.finish barrier. */
    const finishing = requestController({
      socketPath: host.rpc.socketPath,
      token,
      payload: { _outsiderControl: "finish", requireIntervention: false },
      timeoutMs: 5_000,
    });
    while (host.acceptingHooks) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(host.acceptingHooks, false);
    const crossing = await requestController({
      socketPath: host.rpc.socketPath,
      token,
      payload: { marker: "arrived-after-finish", input: {
        hook_event_name: "PreToolUse", tool_name: "Edit",
      } },
      timeoutMs: 5_000,
    });
    assert.equal(crossing.finalizing, true);
    assert.equal(crossing.output.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(hookCalls, 1, "a post-barrier hook must never enter controller.handleHook");

    releaseHook();
    await first;
    const result = await finishing;
    assert.equal(result.proof.complete, true);
    assert.equal(host.finalized, true);

    const afterTerminal = await requestController({
      socketPath: host.rpc.socketPath,
      token,
      payload: { marker: "late-after-terminal", input: {
        hook_event_name: "TaskCompleted", task_id: "late-task",
      } },
      timeoutMs: 5_000,
    });
    assert.equal(afterTerminal.terminal, true);
    assert.equal(hookCalls, 1);

    const reopened = RunStore.open({ directory: fixture.store.directory,
      supervisorCommand: "fake-supervisor" });
    const events = reopened.events();
    const terminal = events.filter((event) => event.type === "run_finalized");
    assert.equal(terminal.length, 1);
    assert.equal(events.at(-1).type, "run_finalized");
    assert.ok(events.findIndex((event) => event.type === "blocking_hook_finished")
      < events.findIndex((event) => event.type === "run_finalized"));
    const lease = JSON.parse(readFileSync(path.join(fixture.store.directory,
      "controller-lease.json"), "utf8"));
    assert.equal(lease.status, "released");

    const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
    assert.equal(evidence.manifest.terminal.proofComplete, true);
    assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
  } finally {
    await host.close();
  }
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true,
    "host shutdown after finalization must not mutate sealed run evidence");
});

test("a drain timeout fails closed and never runs the finalizer beside live hook work", async () => {
  let enterHook;
  let releaseHook;
  const hookEntered = new Promise((resolve) => { enterHook = resolve; });
  const hookRelease = new Promise((resolve) => { releaseHook = resolve; });
  let hookCalls = 0;
  let finalizeCalls = 0;
  const token = "drain-timeout-token";
  const rpc = await startControllerRpc({
    socketPath: "tcp://127.0.0.1:0",
    token,
    drainTimeoutMs: 25,
    controller: { async handleHook() {
      hookCalls += 1;
      enterHook();
      await hookRelease;
      return { decision: { verdict: "allow" }, output: {} };
    } },
    finalizeController() {
      finalizeCalls += 1;
      return { proof: { complete: true } };
    },
    terminalResponse: (payload, state) => ({ finalizing: true,
      phase: state.phase, error: state.error }),
  });
  try {
    const first = requestController({ socketPath: rpc.socketPath, token,
      payload: { input: { hook_event_name: "TaskCompleted" } }, timeoutMs: 1_000 });
    await hookEntered;
    await assert.rejects(requestController({ socketPath: rpc.socketPath, token,
      payload: { _outsiderControl: "finish" }, timeoutMs: 1_000 }),
    /RPC_QUIESCENCE_TIMEOUT/);
    assert.equal(finalizeCalls, 0);
    const late = await requestController({ socketPath: rpc.socketPath, token,
      payload: { input: { hook_event_name: "PreToolUse" } }, timeoutMs: 1_000 });
    assert.equal(late.phase, "failed");
    assert.match(late.error, /RPC_QUIESCENCE_TIMEOUT/);
    assert.equal(hookCalls, 1);
    releaseHook();
    await first;
  } finally {
    releaseHook?.();
    await rpc.close();
  }
});

test("a controller-owned hook preparer durably precedes the Stop decision", async () => {
  const fixture = preterminalRun();
  const token = "hook-preparer-token";
  const observed = [];
  const host = await startRecoverableControllerHost({
    runDirectory: fixture.store.directory,
    supervisorCommand: "fake-supervisor",
    socketPath: "tcp://127.0.0.1:0",
    token,
    heartbeatMs: 60_000,
    hookPreparer({ payload, store }) {
      assert.equal(payload.input.hook_event_name, "Stop");
      const prepared = store.append("evaluation_fault_injected", {
        boundary: "Stop", preparedBeforeController: true,
      });
      return { injectedSeq: prepared.seq, injectedEventHash: prepared.eventHash };
    },
    controllerFactory: ({ store }) => ({
      handleHook(payload, prepared) {
        const event = store.append("stop_handled_after_preparation", {
          injectedSeq: prepared.injectedSeq,
          injectedEventHash: prepared.injectedEventHash,
        });
        observed.push(event);
        return { decision: { verdict: "allow" }, output: { decision: "approve" } };
      },
      finish() { throw new Error("not used"); },
    }),
  });
  try {
    const response = await requestController({
      socketPath: host.rpc.socketPath,
      token,
      payload: { input: { hook_event_name: "Stop" } },
      timeoutMs: 5_000,
    });
    assert.equal(response.decision.verdict, "allow");
    assert.equal(observed.length, 1);
    const events = host.store.events();
    const injected = events.find((event) => event.type === "evaluation_fault_injected");
    const handled = events.find((event) => event.type === "stop_handled_after_preparation");
    assert.ok(injected.seq < handled.seq);
    assert.equal(handled.injectedSeq, injected.seq);
    assert.equal(handled.injectedEventHash, injected.eventHash);
  } finally {
    await host.close();
  }
});
