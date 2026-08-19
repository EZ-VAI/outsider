#!/usr/bin/env node

/*
 * Execute one JSON judge command inside its own process group.
 *
 * child_process.execFileSync({ timeout }) only signals the immediate process.
 * A CLI can leave descendants holding stdout/stderr open, which makes the
 * nominal timeout block far beyond its deadline.  This tiny runner owns the
 * whole POSIX process group, kills that group at the deadline, and returns a
 * bounded result envelope to the synchronous controller caller.
 */

import { spawn } from "node:child_process";
import {
  removeJudgeProcessOwnership, writeJudgeProcessOwnership,
} from "./outsider-judge-process-ownership.js";

const MAX_STREAM_BYTES = 8 * 1024 * 1024;
const GRACE_MS = 1_000;

let request;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, code: "RUNNER_INPUT_INVALID",
    message: String(error?.message ?? error), status: null, signal: null,
    timedOut: false, stdout: "", stderr: "" }));
  process.exitCode = 2;
  process.exit();
}

const executable = String(request?.executable ?? "");
const argv = Array.isArray(request?.argv) ? request.argv.map(String) : [];
const timeoutMs = Math.max(1, Math.floor(Number(request?.timeoutMs) || 1));
const input = String(request?.input ?? "");
const env = request?.env && typeof request.env === "object" ? request.env : process.env;

let stdout = Buffer.alloc(0);
let stderr = Buffer.alloc(0);
let overflow = null;
let timedOut = false;
let settled = false;
let graceTimer = null;
let ownershipFile = null;

const append = (current, chunk, stream) => {
  if (current.length + chunk.length > MAX_STREAM_BYTES) {
    overflow ??= stream;
    return current;
  }
  return Buffer.concat([current, chunk]);
};

const child = spawn(executable, argv, {
  detached: process.platform !== "win32",
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

try {
  if (request?.ownership && process.platform !== "win32") {
    ownershipFile = writeJudgeProcessOwnership({
      ...request.ownership,
      pid: child.pid,
    }).file;
  }
} catch (error) {
  let alive = false;
  try { process.kill(child.pid, 0); alive = true; } catch { /* already exited */ }
  /* A deterministic/local judge may finish between spawn() and ps(1). There
     is then no live authority to recover and no ownership record is needed. */
  if (!alive) {
    ownershipFile = null;
  } else {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch { /* child may already have exited */ }
  process.stdout.write(JSON.stringify({ ok: false, code: "JUDGE_OWNERSHIP_FAILED",
    message: String(error?.message ?? error), status: null, signal: null,
    timedOut: false, stdout: "", stderr: "" }));
  process.exitCode = 1;
  process.exit();
  }
}

const finish = ({ status = null, signal = null, code = null, message = null } = {}) => {
  if (settled) return;
  settled = true;
  clearTimeout(deadlineTimer);
  if (graceTimer) clearTimeout(graceTimer);
  removeJudgeProcessOwnership(ownershipFile);
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  process.stdout.write(JSON.stringify({
    ok: !timedOut && !overflow && code == null && status === 0,
    code: overflow ? "ENOBUFS" : timedOut ? "ETIMEDOUT" : code,
    message: message ?? (overflow ? `${overflow} exceeded ${MAX_STREAM_BYTES} bytes`
      : timedOut ? `command timed out after ${timeoutMs}ms` : null),
    status,
    signal,
    timedOut,
    stdout: stdout.toString("utf8"),
    stderr: stderr.toString("utf8"),
  }));
};

const killGroup = () => {
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }
};

const deadlineTimer = setTimeout(() => {
  timedOut = true;
  killGroup();
  /* A broken descendant may retain a pipe outside the process group.  The
     controller's deadline still wins: close our pipe handles after one short
     grace and return a typed timeout envelope. */
  graceTimer = setTimeout(() => finish({ status: null, signal: "SIGKILL" }), GRACE_MS);
}, timeoutMs);
deadlineTimer.unref?.();

child.stdout.on("data", (chunk) => {
  stdout = append(stdout, Buffer.from(chunk), "stdout");
  if (overflow) killGroup();
});
child.stderr.on("data", (chunk) => {
  stderr = append(stderr, Buffer.from(chunk), "stderr");
  if (overflow) killGroup();
});
child.once("error", (error) => finish({ code: error?.code ?? "SPAWN_ERROR",
  message: String(error?.message ?? error) }));
child.once("close", (status, signal) => finish({ status, signal }));
child.stdin.end(input);
