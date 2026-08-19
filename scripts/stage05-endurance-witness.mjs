#!/usr/bin/env node
/*
 * Controller-external monotonic-time witness for the Stage 0.5 endurance run.
 *
 * Only the evaluator can request a checkpoint and it cannot choose its
 * timestamp. The worker never receives the socket or token. The evaluator
 * binds each request to a successful, already-recorded host health-check
 * boundary; the server accepts it only after real monotonic time has elapsed.
 * Changing a workspace file or printing a fake date cannot shorten the run.
 */
import net from "node:net";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const iso = (milliseconds) => new Date(milliseconds).toISOString();
const monotonicMilliseconds = () => Number(process.hrtime.bigint() / 1_000_000n);

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

export class EnduranceWitnessLedger {
  constructor({ minimumDurationMs, minimumIntervalMs, minimumCheckpoints, now = null,
    monotonicNow = null, wallNow = null, startedAtMs = null,
    startedMonotonicMs = null } = {}) {
    this.minimumDurationMs = Math.max(1, Number(minimumDurationMs) || 1);
    this.minimumIntervalMs = Math.max(1, Number(minimumIntervalMs) || 1);
    this.minimumCheckpoints = Math.max(2, Number(minimumCheckpoints) || 2);
    /* `now` is retained only as an explicit deterministic-test adapter. In a
       live witness, duration and spacing come from process.hrtime.bigint(); a
       wall-clock jump can change display timestamps but cannot shorten the
       experiment. */
    this.monotonicNow = monotonicNow ?? now ?? monotonicMilliseconds;
    this.wallNow = wallNow ?? now ?? (() => Date.now());
    this.clockSource = now ? "injected-test-clock" : "process.hrtime.bigint";
    this.startedMonotonicMs = startedMonotonicMs ?? this.monotonicNow();
    this.startedAtMs = startedAtMs ?? this.wallNow();
    this.checkpoints = [];
    this.wallClockDiscontinuities = [];
    this.lastObservation = { monotonicMs: this.startedMonotonicMs, wallMs: this.startedAtMs };
  }

  observeClocks() {
    const monotonicMs = this.monotonicNow();
    const wallMs = this.wallNow();
    const monotonicDelta = monotonicMs - this.lastObservation.monotonicMs;
    const wallDelta = wallMs - this.lastObservation.wallMs;
    if (monotonicDelta < 0 || Math.abs(wallDelta - monotonicDelta) > 30_000) {
      this.wallClockDiscontinuities.push({
        observedAt: iso(wallMs), monotonicDeltaMs: monotonicDelta, wallDeltaMs: wallDelta,
      });
    }
    this.lastObservation = { monotonicMs, wallMs };
    return { monotonicMs, wallMs };
  }

  record({ label = null, pid = null, runId = null, toolUseId = null } = {}) {
    const { monotonicMs, wallMs } = this.observeClocks();
    const prior = this.checkpoints.at(-1) ?? null;
    const remainingMs = prior
      ? Math.max(0, this.minimumIntervalMs - (monotonicMs - prior.monotonicMs)) : 0;
    if (remainingMs > 0) return {
      accepted: false,
      reason: "CHECKPOINT_TOO_EARLY",
      remainingMs,
      nextDueAt: iso(wallMs + remainingMs),
      status: this.status({ monotonicMs, wallMs, observe: false }),
    };
    const checkpoint = {
      ordinal: this.checkpoints.length + 1,
      at: iso(wallMs),
      atMs: wallMs,
      monotonicMs,
      elapsedMs: monotonicMs - this.startedMonotonicMs,
      sincePriorMs: prior ? monotonicMs - prior.monotonicMs : null,
      label: label == null ? null : String(label).slice(0, 200),
      clientPid: Number(pid) || null,
      runId: runId == null ? null : String(runId),
      toolUseId: toolUseId == null ? null : String(toolUseId),
    };
    this.checkpoints.push(checkpoint);
    return { accepted: true, checkpoint,
      status: this.status({ monotonicMs, wallMs, observe: false }) };
  }

  status(value = null) {
    const clocks = value && typeof value === "object"
      ? value : this.observeClocks();
    const monotonicMs = Number(clocks.monotonicMs);
    const wallMs = Number(clocks.wallMs);
    const elapsedMs = Math.max(0, monotonicMs - this.startedMonotonicMs);
    const enoughDuration = elapsedMs >= this.minimumDurationMs;
    const enoughCheckpoints = this.checkpoints.length >= this.minimumCheckpoints;
    return {
      schema: "outsider/stage05-endurance-witness/v1",
      clockSource: this.clockSource,
      startedAt: iso(this.startedAtMs),
      observedAt: iso(wallMs),
      elapsedMs,
      minimumDurationMs: this.minimumDurationMs,
      minimumIntervalMs: this.minimumIntervalMs,
      minimumCheckpoints: this.minimumCheckpoints,
      checkpoints: this.checkpoints,
      wallClockDiscontinuities: this.wallClockDiscontinuities,
      enoughDuration,
      enoughCheckpoints,
      passed: enoughDuration && enoughCheckpoints,
    };
  }
}

export async function startEnduranceWitness({ socketPath, evidenceFile, minimumDurationMs,
  minimumIntervalMs, minimumCheckpoints, runId, token, now = null,
  monotonicNow = null, wallNow = null } = {}) {
  if (!socketPath || !evidenceFile || !runId || !token) {
    throw new Error("ENDURANCE_WITNESS_IDENTITY_REQUIRED");
  }
  try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* stale */ }
  const ledger = new EnduranceWitnessLedger({ minimumDurationMs, minimumIntervalMs,
    minimumCheckpoints, now, monotonicNow, wallNow });
  const persist = () => atomicJson(evidenceFile, ledger.status());
  persist();
  const server = net.createServer((socket) => {
    let raw = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => { raw += chunk; });
    socket.on("end", () => {
      let request = {};
      try { request = JSON.parse(raw || "{}"); } catch {
        socket.end(`${JSON.stringify({ ok: false, error: "INVALID_JSON" })}\n`);
        return;
      }
      if (request.token !== token || request.runId !== runId) {
        socket.end(`${JSON.stringify({ ok: false, error: "UNAUTHORIZED_OR_WRONG_RUN" })}\n`);
        return;
      }
      const result = request.action === "record"
        ? request.toolUseId
          ? ledger.record({ label: request.label, pid: request.pid,
            runId: request.runId, toolUseId: request.toolUseId })
          : { ok: false, error: "CHECKPOINT_TOOL_USE_ID_REQUIRED" }
        : request.action === "status" ? ledger.status()
          : { ok: false, error: "UNKNOWN_ACTION" };
      if (request.action === "record" && result.accepted) persist();
      socket.end(`${JSON.stringify({ ok: result.error == null, ...result })}\n`);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => { server.off("error", reject); resolve(); });
  });
  return {
    ledger,
    socketPath,
    evidenceFile,
    async close() {
      persist();
      await new Promise((resolve) => server.close(resolve));
      try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* closed */ }
      return ledger.status();
    },
  };
}

export async function requestEnduranceWitness({ socketPath, action, label = null, runId = null,
  token = null, toolUseId = null,
  timeoutMs = 5_000 } = {}) {
  if (!socketPath) throw new Error("ENDURANCE_WITNESS_SOCKET_REQUIRED");
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let raw = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("ENDURANCE_WITNESS_TIMEOUT"));
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(JSON.stringify({ action, label, pid: process.pid,
      runId, token, toolUseId })));
    socket.on("data", (chunk) => { raw += chunk; });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
    socket.on("close", () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(raw.trim())); } catch { reject(new Error("ENDURANCE_WITNESS_BAD_REPLY")); }
    });
  });
}

async function main() {
  const action = process.argv[2];
  if (!action || !["record", "status"].includes(action)) {
    process.stderr.write("usage: stage05-endurance-witness <record|status> [label]\n");
    process.exit(64);
  }
  const result = await requestEnduranceWitness({
    socketPath: process.env.OUTSIDER_ENDURANCE_WITNESS_SOCKET,
    action,
    label: process.argv[3] ?? null,
    runId: process.env.OUTSIDER_ENDURANCE_RUN_ID,
    token: process.env.OUTSIDER_ENDURANCE_WITNESS_TOKEN,
    toolUseId: process.env.OUTSIDER_ENDURANCE_TOOL_USE_ID ?? null,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (action === "status" && result.passed !== true) process.exitCode = 1;
  if (action === "record" && result.accepted !== true) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
