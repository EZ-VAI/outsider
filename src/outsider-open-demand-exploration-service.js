import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { interfaceDigest } from "./outsider-openapi-demand-matcher.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = f => JSON.parse(readPrivateExecutionBytes(f));
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function createOpenDemandExplorationService({ directory, profileFile, modelCommandFile,
  launch = (args) => spawn(process.execPath, [fileURLToPath(new URL("../scripts/outsider-open-demand-explore-worker.mjs", import.meta.url)), ...args],
    { stdio: "ignore" }) }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let active = null, closing = false, completion = Promise.resolve();
  const rootFor = id => {
    if (!/^explore_[a-f0-9]{32}$/u.test(id ?? "")) fail("GOAL_NODE_EXPLORATION_ID_INVALID");
    return path.join(directory, id);
  };
  const inspect = id => {
    const root = rootFor(id), file = n => path.join(root, `${n}.json`);
    if (!existsSync(file("request"))) fail("GOAL_NODE_EXPLORATION_NOT_FOUND");
    const result = existsSync(file("result")) ? read(file("result")) : null;
    const failure = existsSync(file("failure")) ? read(file("failure")) : null;
    return { explorationId: id, state: result ? "FRONTIER_READY" : failure ? "FAILED" : active === id ? "EXPLORING" : "INTERRUPTED",
      result, failure, confirmationAvailable: false, executionAuthorized: false, paymentAuthorized: false };
  };
  const service = {
    inspect,
    create(request, replayParent = null) {
      if (!request || Object.keys(request).sort().join(",") !== "goal,requestId"
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(request.requestId ?? "")
        || typeof request.goal !== "string" || !request.goal.trim() || request.goal.length > 12000) fail("GOAL_NODE_EXPLORATION_REQUEST_INVALID");
      const id = `explore_${interfaceDigest(request.requestId).slice(7, 39)}`, root = rootFor(id);
      if (existsSync(path.join(root, "request.json"))) {
        if (interfaceDigest(read(path.join(root, "request.json"))) !== interfaceDigest(request)) fail("GOAL_NODE_EXPLORATION_REQUEST_CONFLICT");
        const prior = existsSync(path.join(root, "replay-parent.json")) ? read(path.join(root, "replay-parent.json")) : null;
        if (interfaceDigest(prior) !== interfaceDigest(replayParent)) fail("GOAL_NODE_EXPLORATION_PARENT_CONFLICT");
        return inspect(id);
      }
      if (active || closing) fail("GOAL_NODE_EXPLORATION_BUSY");
      mkdirSync(root, { recursive: true, mode: 0o700 });
      writeOnce(path.join(root, "request.json"), request);
      if (replayParent) writeOnce(path.join(root, "replay-parent.json"), replayParent);
      active = id;
      try {
        const child = launch([root, profileFile, modelCommandFile]);
        completion = new Promise(resolve => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; active = null; resolve(); } };
          child.once("error", done); child.once("exit", done);
        });
      } catch { active = null; fail("GOAL_NODE_EXPLORATION_WORKER_START_FAILED"); }
      return inspect(id);
    },
    refresh(request) {
      if (!request || Object.keys(request).sort().join(",") !== "explorationId,requestId") fail("GOAL_NODE_EXPLORATION_REFRESH_INVALID");
      const parent = inspect(request.explorationId);
      if (parent.state !== "FRONTIER_READY") fail("GOAL_NODE_EXPLORATION_PARENT_NOT_READY");
      return service.create({ requestId: request.requestId, goal: read(path.join(rootFor(request.explorationId), "request.json")).goal },
        { explorationId: request.explorationId, resultHash: interfaceDigest(parent.result) });
    },
    async close() { closing = true; await completion; },
  };
  return service;
}
