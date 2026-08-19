import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanupOwnedJudgeProcesses, inspectJudgeProcess, judgeOwnershipFiles,
  writeJudgeProcessOwnership,
} from "../src/outsider-judge-process-ownership.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.resolve(here, "../src/outsider-json-command-process.mjs");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error("WAIT_TIMEOUT");
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test("exact crashed-controller ownership reaps the detached judge group", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-judge-owner-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true, stdio: "ignore",
  });
  child.unref();
  await waitUntil(() => inspectJudgeProcess(child.pid));
  writeJudgeProcessOwnership({ directory, ownerId: "owner-a", generation: 1,
    logicalOperationId: "judge-a", pid: child.pid });
  const cleaned = await cleanupOwnedJudgeProcesses({ directory, ownerId: "owner-a" });
  assert.equal(cleaned.terminated, 1);
  assert.equal(cleaned.remaining, 0);
  assert.deepEqual(cleaned.failures, []);
  assert.equal(alive(child.pid), false);
});

test("owner or OS identity mismatch never kills an unrelated process", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-judge-mismatch-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true, stdio: "ignore",
  });
  child.unref();
  await waitUntil(() => inspectJudgeProcess(child.pid));
  const owned = writeJudgeProcessOwnership({ directory, ownerId: "owner-a", generation: 1,
    logicalOperationId: "judge-a", pid: child.pid });
  const record = JSON.parse(readFileSync(owned.file, "utf8"));
  writeFileSync(owned.file, JSON.stringify({ ...record,
    processIdentityHash: `sha256:${"0".repeat(64)}` }));
  const mismatched = await cleanupOwnedJudgeProcesses({ directory, ownerId: "owner-a" });
  assert.equal(mismatched.terminated, 0);
  assert.equal(mismatched.remaining, 1);
  assert.equal(mismatched.failures[0]?.reason, "process-identity-mismatch");
  assert.equal(alive(child.pid), true);
  process.kill(-child.pid, "SIGKILL");
  await waitUntil(() => !alive(child.pid));
});

test("SIGKILLed synchronous runner leaves a measurable record that recovery reaps", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-judge-crash-"));
  const marker = path.join(directory, "child.pid");
  const operation = randomUUID();
  const source = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const wrapper = spawn(process.execPath, [runner], {
    detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  wrapper.stdin.end(JSON.stringify({
    executable: process.execPath,
    argv: ["-e", source],
    input: "",
    timeoutMs: 60_000,
    env: process.env,
    ownership: { directory, ownerId: "controller-owner", generation: 1,
      logicalOperationId: operation },
  }));
  await waitUntil(() => existsSync(marker) && judgeOwnershipFiles(directory).length === 1);
  const judgePid = Number(readFileSync(marker, "utf8"));
  assert.equal(alive(judgePid), true);
  process.kill(-wrapper.pid, "SIGKILL");
  await waitUntil(() => !alive(wrapper.pid));
  assert.equal(alive(judgePid), true, "regression precondition: detached judge survived owner crash");
  const cleaned = await cleanupOwnedJudgeProcesses({ directory,
    ownerId: "controller-owner" });
  assert.equal(cleaned.terminated, 1);
  assert.equal(cleaned.remaining, 0);
  assert.equal(alive(judgePid), false);
});
