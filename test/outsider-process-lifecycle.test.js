import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { terminateChildProcessBounded } from "../src/outsider-process-lifecycle.js";

test("bounded process-group termination kills a worker that ignores TERM", {
  skip: process.platform === "win32",
}, async () => {
  const child = spawn(process.execPath, ["-e", `
    process.on("SIGTERM", () => {});
    process.stdout.write("ready\\n");
    setInterval(() => {}, 1000);
  `], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", resolve);
  });
  const result = await terminateChildProcessBounded({
    child,
    terminate: (signal) => process.kill(-child.pid, signal),
    graceMs: 30,
    killGraceMs: 1_000,
  });
  assert.equal(result.terminated, true);
  assert.equal(result.forced, true);
  assert.equal(child.signalCode, "SIGKILL");
});

test("bounded termination is idempotent for an already closed child", async () => {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolve) => child.once("close", resolve));
  let signals = 0;
  const result = await terminateChildProcessBounded({
    child,
    terminate: () => { signals += 1; },
    graceMs: 1,
  });
  assert.deepEqual(result, { terminated: true, forced: false, alreadyClosed: true });
  assert.equal(signals, 0);
});
