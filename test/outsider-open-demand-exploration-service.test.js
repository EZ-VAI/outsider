import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createOpenDemandExplorationService } from "../src/outsider-open-demand-exploration-service.js";
import { writePrivateExecutionRecordOnce } from "../src/outsider-user-held-durable-execution-v2.js";
test("exploration returns immediately, preserves exact request and replays result without relaunch", async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-explorer-")); t.after(() => rmSync(directory, { recursive: true }));
  const child = new EventEmitter(); let calls = 0, workerDirectory;
  const service = createOpenDemandExplorationService({ directory, launch: args => { calls++; workerDirectory = args[0]; return child; } });
  const request = { requestId: "one", goal: "coordinate an unfamiliar outcome" };
  const started = service.create(request); assert.equal(started.state, "EXPLORING");
  assert.equal(service.create(request).explorationId, started.explorationId); assert.equal(calls, 1);
  assert.throws(() => service.create({ ...request, goal: "changed" }), { code: "GOAL_NODE_EXPLORATION_REQUEST_CONFLICT" });
  assert.throws(() => service.create({ ...request, requestId: "two" }), { code: "GOAL_NODE_EXPLORATION_BUSY" });
  writePrivateExecutionRecordOnce(path.join(workerDirectory, "result.json"), { completeTemporaryNetwork: false });
  child.emit("exit", 0); await service.close();
  const successor = createOpenDemandExplorationService({ directory, launch: () => { throw new Error("must not relaunch"); } });
  assert.equal(successor.create(request).state, "FRONTIER_READY"); assert.equal(calls, 1);
  assert.equal(successor.inspect(started.explorationId).confirmationAvailable, false);
});
test("process interruption stays distinct from a successful frontier and never silently repeats a model run", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-explorer-"));
  try {
    const first = createOpenDemandExplorationService({ directory, launch: () => new EventEmitter() });
    const request = { requestId: "interrupted", goal: "unknown goal" }; const created = first.create(request);
    const restarted = createOpenDemandExplorationService({ directory, launch: () => { throw new Error("not permitted"); } });
    assert.equal(restarted.create(request).state, "INTERRUPTED");
    assert.equal(restarted.inspect(created.explorationId).executionAuthorized, false);
  } finally { rmSync(directory, { recursive: true }); }
});
test("refresh creates a lineage-bound descendant without rewriting the completed parent", async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-explorer-refresh-"));
  t.after(() => rmSync(directory, { recursive: true }));
  let child, workerDirectory;
  const service = createOpenDemandExplorationService({ directory, launch: args => { workerDirectory = args[0]; child = new EventEmitter(); return child; } });
  const parent = service.create({ requestId: "parent", goal: "same goal" });
  writePrivateExecutionRecordOnce(path.join(workerDirectory, "result.json"), { completeTemporaryNetwork: false });
  child.emit("exit", 0);
  const request = { explorationId: parent.explorationId, requestId: "refresh-one" };
  const descendant = service.refresh(request);
  assert.notEqual(descendant.explorationId, parent.explorationId);
  assert.equal(service.inspect(parent.explorationId).state, "FRONTIER_READY");
  assert.equal(service.refresh(request).explorationId, descendant.explorationId);
  assert.throws(() => service.create({ requestId: "refresh-one", goal: "same goal" }), { code: "GOAL_NODE_EXPLORATION_PARENT_CONFLICT" });
  child.emit("exit", 0); await service.close();
});
