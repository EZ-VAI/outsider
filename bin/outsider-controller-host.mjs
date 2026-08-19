#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { startRecoverableControllerHost } from "../src/outsider-controller-host.js";

const configPath = process.env.OUTSIDER_CONTROLLER_CONFIG;
const socketPath = process.env.OUTSIDER_CONTROLLER_SOCKET;
const token = process.env.OUTSIDER_CONTROLLER_TOKEN;
if (!configPath || !socketPath || !token) {
  process.stderr.write("outsider controller host: missing recovery configuration\n");
  process.exit(2);
}

let config;
try { config = JSON.parse(readFileSync(configPath, "utf8")); } catch (error) {
  process.stderr.write(`outsider controller host: unreadable configuration: ${error?.message ?? error}\n`);
  process.exit(2);
}

let host;
try {
  host = await startRecoverableControllerHost({
    runDirectory: config.runDirectory,
    supervisorCommand: config.supervisorCommand,
    controllerOptions: config.controllerOptions,
    ownerId: process.env.OUTSIDER_CONTROLLER_OWNER,
    replacingOwnerId: process.env.OUTSIDER_REPLACING_CONTROLLER_OWNER || null,
    leaseMs: config.leaseMs,
    heartbeatMs: config.heartbeatMs,
    socketPath,
    token,
    hookPreparer: ({ payload, store }) => {
      const input = payload?.input ?? payload;
      const event = input?.hook_event_name ?? input?.hookEventName;
      const armFile = process.env.OUTSIDER_ENDURANCE_DRILL_ARM_FILE;
      const markerFile = process.env.OUTSIDER_ENDURANCE_DRILL_MARKER_FILE;
      const receiptFile = process.env.OUTSIDER_ENDURANCE_DRILL_RECEIPT_FILE;
      if (event !== "Stop" || !armFile || !markerFile || !receiptFile
        || !existsSync(armFile) || existsSync(receiptFile)) return null;
      const armBytes = readFileSync(armFile);
      const arm = JSON.parse(armBytes.toString("utf8"));
      if (arm.runId !== store.runId || typeof arm.content !== "string" || !arm.content) {
        throw new Error("ENDURANCE_DRILL_ARM_IDENTITY_MISMATCH");
      }
      const contentHash = `sha256:${createHash("sha256").update(arm.content).digest("hex")}`;
      if (contentHash !== arm.contentHash) throw new Error("ENDURANCE_DRILL_CONTENT_HASH_MISMATCH");
      let injected = store.events().find((event) =>
        event.type === "endurance_recovery_drill_injected"
        && Number(event.armedEventSeq) === Number(arm.armedEventSeq)
        && event.contentHash === contentHash);
      const markerTemporary = `${markerFile}.${process.pid}.tmp`;
      writeFileSync(markerTemporary, arm.content, { mode: 0o600 });
      renameSync(markerTemporary, markerFile);
      if (!injected) {
        injected = store.append("endurance_recovery_drill_injected", {
          path: ".outsider-endurance-drift",
          contentHash,
          armedEventSeq: arm.armedEventSeq,
          armHash: `sha256:${createHash("sha256").update(armBytes).digest("hex")}`,
          hookEventName: event,
          evaluatorOwned: true,
          controllerPreparedBeforeHook: true,
        });
      }
      const receipt = {
        schema: "outsider/stage05-endurance-drill-receipt/v1",
        runId: arm.runId,
        armedEventSeq: arm.armedEventSeq,
        armHash: `sha256:${createHash("sha256").update(armBytes).digest("hex")}`,
        contentHash,
        hookEventName: event,
        injectedEventSeq: injected.seq,
        injectedEventHash: injected.eventHash,
      };
      const receiptTemporary = `${receiptFile}.${process.pid}.tmp`;
      writeFileSync(receiptTemporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      renameSync(receiptTemporary, receiptFile);
      return receipt;
    },
  });
} catch (error) {
  process.stderr.write(`outsider controller host: start failed: ${error?.message ?? error}\n`);
  process.exit(1);
}

process.send?.({ type: "ready", ownerId: host.ownerId,
  generation: host.lease.generation, pid: process.pid });

process.on("message", async (message) => {
  if (message?.type === "record-and-crash-for-test") {
    try {
      const signal = message.signal === "SIGTERM" ? "SIGTERM" : "SIGKILL";
      const recorded = host.record({
        eventType: message.eventType,
        payload: message.payload ?? {},
        statePatch: message.statePatch,
      });
      /* Evaluation-only failpoint. The event append is synchronous. Wait for
         the IPC acknowledgement to flush before killing this generation so
         the harness cannot confuse a successful injected crash with a lost
         record reply. Do not close/release the lease: the watchdog must
         exercise the real crashed-owner replacement path. */
      process.send?.({ type: "record-and-crash-armed", requestId: message.requestId,
        event: recorded.event, ownerId: host.ownerId, generation: host.lease.generation },
      (error) => {
        if (error) return;
        process.kill(process.pid, signal);
      });
    } catch (error) {
      process.send?.({ type: "record-and-crash-error", requestId: message.requestId,
        error: String(error?.message ?? error) });
    }
    return;
  }
  if (message?.type === "record") {
    try {
      const recorded = host.record({
        eventType: message.eventType,
        payload: message.payload ?? {},
        statePatch: message.statePatch,
      });
      process.send?.({ type: "record-result", requestId: message.requestId,
        event: recorded.event, terminal: recorded.terminal, accepted: recorded.accepted });
    } catch (error) {
      process.send?.({ type: "record-error", requestId: message.requestId,
        error: String(error?.message ?? error) });
    }
    return;
  }
  if (message?.type === "finish") {
    try {
      const result = await host.finish({
        requireIntervention: Boolean(message.requireIntervention),
      });
      process.send?.({ type: "finish-result", requestId: message.requestId, result });
    } catch (error) {
      process.send?.({ type: "finish-error", requestId: message.requestId,
        error: String(error?.message ?? error) });
    }
    return;
  }
  if (message?.type === "shutdown") {
    await host.close();
    process.exit(0);
  }
});

const shutdown = async () => {
  try { await host.close(); } finally { process.exit(0); }
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
