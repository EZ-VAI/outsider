import { randomUUID } from "node:crypto";
import { existsSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

function tcpTarget(value) {
  const match = String(value ?? "").match(/^tcp:\/\/([^:]+):(\d+)$/);
  return match ? { host: match[1], port: Number(match[2]) } : null;
}

export function controllerSocketPath(runId) {
  /* Unix domain sockets have a short path limit on macOS. */
  return path.join(tmpdir(), `outsider-${String(runId).replace(/[^a-z0-9]/gi, "").slice(0, 16)}-${process.pid}.sock`);
}

export function createControllerToken() { return randomUUID(); }

function reply(socket, value) {
  /* The controller owns the state transition, not the short-lived hook RPC.
     A hook may hit its host timeout and close the peer while a long semantic
     decision is still finishing. Writing the durable result to that closed
     peer can raise EPIPE asynchronously; it must never kill the controller or
     erase the later run_finalized event. */
  if (socket.destroyed || !socket.writable) return false;
  try {
    socket.end(`${JSON.stringify(value)}\n`);
    return true;
  } catch {
    try { socket.destroy(); } catch { /* peer is already gone */ }
    return false;
  }
}

function evaluationReplyFailpoint(result) {
  const name = "after-correction-persisted-before-rpc-reply";
  if (process.env.OUTSIDER_EVALUATION_ALLOW_FAILPOINTS !== "1"
    || process.env.OUTSIDER_EVALUATION_RPC_FAILPOINT !== name
    || !result?.decision?.interventionId) return;
  const marker = process.env.OUTSIDER_EVALUATION_FAILPOINT_MARKER;
  const receipt = process.env.OUTSIDER_EVALUATION_FAILPOINT_RECEIPT;
  if (!marker || !receipt) throw new Error("EVALUATION_RPC_FAILPOINT_PATHS_REQUIRED");
  const expected = JSON.parse(readFileSync(marker, "utf8"));
  if (expected?.schema !== "outsider/evaluation-rpc-failpoint/v1" || expected.name !== name) {
    throw new Error("EVALUATION_RPC_FAILPOINT_MARKER_INVALID");
  }
  let descriptor;
  try { descriptor = openSync(receipt, "wx", 0o600); } catch (error) {
    if (error?.code === "EEXIST") return;
    throw error;
  }
  writeFileSync(descriptor, `${JSON.stringify({ schema: "outsider/evaluation-rpc-failpoint-receipt/v1",
    name, interventionId: result.decision.interventionId, pid: process.pid })}\n`);
  closeSync(descriptor);
  process.kill(process.pid, "SIGKILL");
}

export async function startControllerRpc({
  controller,
  socketPath,
  token,
  finalizeController = null,
  terminalResponse = (payload, state) => ({
    terminal: state.phase === "terminal",
    finalizing: state.phase !== "terminal",
    error: state.error ?? null,
  }),
  drainTimeoutMs = 15 * 60_000,
}) {
  if (!controller || !socketPath || !token) throw new Error("RPC_INCOMPLETE");
  const tcp = tcpTarget(socketPath);
  if (!tcp && existsSync(socketPath)) unlinkSync(socketPath);
  let queue = Promise.resolve();
  let phase = "accepting";
  let finalResult = null;
  let finalError = null;
  let finalization = null;

  const waitForDrain = async (barrier) => {
    let timer;
    try {
      await Promise.race([
        barrier,
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`RPC_QUIESCENCE_TIMEOUT:${drainTimeoutMs}`)),
            drainTimeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  /* Finalization is a barrier, not another controller request.  The IPC
     watchdog and a recovered attached daemon can race a lifecycle hook that
     was already accepted by the socket.  Flip the admission bit synchronously,
     drain the exact queue prefix that existed at that instant, and only then
     allow run_finalized to be written.  Requests parsed after the flip receive
     a terminal/finalizing response and never enter controller.handleHook. */
  const finish = (payload = {}) => {
    if (finalization) return finalization;
    if (typeof finalizeController !== "function") {
      return Promise.reject(new Error("RPC_FINALIZER_UNAVAILABLE"));
    }
    phase = "draining";
    const barrier = queue;
    finalization = (async () => {
      await waitForDrain(barrier);
      finalResult = await finalizeController(payload);
      phase = "terminal";
      return finalResult;
    })().catch((error) => {
      finalError = String(error?.message ?? error);
      phase = "failed";
      throw error;
    });
    return finalization;
  };

  const rejectedResult = (payload) => terminalResponse(payload, {
    phase, result: finalResult, error: finalError,
  });
  const server = net.createServer((socket) => {
    let buffer = "";
    let handled = false;
    /* Peer disconnects are request-scoped failures. The queued controller
       operation remains authoritative and the server must stay alive. */
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) {
        handled = true;
        reply(socket, { ok: false, error: "RPC_REQUEST_TOO_LARGE" });
        return;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      handled = true;
      let request;
      try { request = JSON.parse(buffer.slice(0, newline)); } catch {
        reply(socket, { ok: false, error: "RPC_INVALID_JSON" });
        return;
      }
      if (request.token !== token) {
        reply(socket, { ok: false, error: "RPC_UNAUTHORIZED" });
        return;
      }
      let task;
      if (request.payload?._outsiderControl === "finish" && finalizeController) {
        task = finish(request.payload);
      } else if (phase !== "accepting") {
        task = Promise.resolve(rejectedResult(request.payload));
      } else {
        task = queue.catch(() => undefined)
          .then(async () => {
            const prepared = typeof controller.prepareHook === "function"
              ? await controller.prepareHook(request.payload) : null;
            return controller.handleHook(request.payload, prepared);
          });
        queue = task.then(() => undefined, () => undefined);
      }
      task.then((result) => {
        evaluationReplyFailpoint(result);
        reply(socket, { ok: true, result });
      }).catch((error) => {
        reply(socket, { ok: false, error: String(error?.message ?? error) });
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(tcp ?? socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const boundSocketPath = tcp && address && typeof address === "object"
    ? `tcp://${address.address === "::" ? "127.0.0.1" : address.address}:${address.port}`
    : socketPath;
  return {
    socketPath: boundSocketPath,
    get phase() { return phase; },
    get finalResult() { return finalResult; },
    finish,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      try { if (!tcp && existsSync(socketPath)) unlinkSync(socketPath); } catch { /* already gone */ }
    },
  };
}

export function requestController({ socketPath, token, payload, timeoutMs = 290_000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(tcpTarget(socketPath) ?? socketPath);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`RPC_TIMEOUT:${timeoutMs}`));
    }, timeoutMs);
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn(value);
    };
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ token, payload })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      let response;
      try { response = JSON.parse(buffer.slice(0, newline)); } catch {
        finish(reject, new Error("RPC_INVALID_RESPONSE"));
        return;
      }
      if (!response.ok) finish(reject, new Error(response.error || "RPC_FAILED"));
      else finish(resolve, response.result);
    });
    socket.once("error", (error) => finish(reject, error));
    /* SIGKILL may remove the controller after it durably committed work but
       before any reply byte reached the hook client. On macOS that commonly
       arrives as a clean EOF/close rather than an `error` event. Leaving this
       promise pending until the multi-minute hook timeout prevents the
       watchdog's recovered generation from receiving the retry boundary. */
    socket.once("end", () => {
      if (!settled && !buffer.includes("\n")) {
        finish(reject, new Error("RPC_CONNECTION_CLOSED_BEFORE_RESPONSE"));
      }
    });
    socket.once("close", () => {
      if (!settled) finish(reject, new Error("RPC_CONNECTION_CLOSED_BEFORE_RESPONSE"));
    });
  });
}
