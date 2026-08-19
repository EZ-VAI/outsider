#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AttachedDaemonController } from "../src/outsider-attached-daemon.js";
import { defaultAttachedRoot, writeAttachedDescriptor } from "../src/outsider-attached-client.js";
import { startControllerRpc } from "../src/outsider-controller-rpc.js";

const root = process.env.OUTSIDER_ATTACHED_ROOT || defaultAttachedRoot();
const socketPath = process.env.OUTSIDER_ATTACHED_SOCKET;
const token = process.env.OUTSIDER_ATTACHED_TOKEN
  || (process.env.OUTSIDER_ATTACHED_TOKEN_FILE
    ? readFileSync(process.env.OUTSIDER_ATTACHED_TOKEN_FILE, "utf8").trim() : null);
if (!socketPath || !token) {
  process.stderr.write("outsider attached daemon: missing socket/token\n");
  process.exit(2);
}
const hookEntry = fileURLToPath(new URL("./outsider-hook.mjs", import.meta.url));
const packageRoot = path.dirname(path.dirname(hookEntry));
let packageVersion = null;
try { packageVersion = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")).version; }
catch { /* descriptor remains usable without cosmetic version metadata */ }
const controller = new AttachedDaemonController({ root, hookEntry });
let rpc;
try {
  try {
    rpc = await startControllerRpc({ controller, socketPath, token });
  } catch (error) {
    /* Sandboxed desktop/plugin runtimes may forbid Unix-domain sockets while
       still allowing loopback.  The authenticated descriptor keeps the same
       local-only trust boundary. */
    if (!/\b(?:EPERM|EACCES)\b/.test(String(error?.message ?? error))) throw error;
    rpc = await startControllerRpc({ controller, socketPath: "tcp://127.0.0.1:0", token });
  }
  writeAttachedDescriptor(root, {
    schema: "outsider/attached-daemon/v1",
    transport: process.env.OUTSIDER_DAEMON_TRANSPORT || "embedded",
    protocolVersion: 1,
    pid: process.pid,
    socketPath: rpc.socketPath,
    token,
    startedAt: new Date().toISOString(),
    packageRoot,
    packageVersion,
  });
} catch (error) {
  process.stderr.write(`outsider attached daemon: ${error?.message ?? error}\n`);
  process.exit(1);
}

const shutdown = async () => {
  try { await controller.close(); await rpc.close(); } finally { process.exit(0); }
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
