import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync,
  statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requestController } from "./outsider-controller-rpc.js";

export function defaultAttachedRoot() {
  return path.resolve(process.env.OUTSIDER_ATTACHED_ROOT
    || path.join(process.env.OUTSIDER_HOME || path.join(homedir(), ".outsider"), "attached"));
}

function paths(root) {
  const id = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return {
    descriptor: path.join(root, "daemon.json"),
    lock: path.join(root, "daemon.lock"),
    socketPath: path.join(tmpdir(), `outsider-attached-${id}.sock`),
  };
}

const DESKTOP_CAPABILITY_SCHEMA = "outsider/desktop-session-capability/v1";

function desktopSessionIdentity(payload) {
  const input = payload?.input ?? {};
  return input.session_id ?? input.sessionId
    ?? input.transcript_path ?? input.transcriptPath ?? input.cwd ?? "unknown-session";
}

export function desktopSessionCapabilityFile(root, payload) {
  const id = createHash("sha256")
    .update(`cowork-session\0${String(desktopSessionIdentity(payload))}`).digest("hex");
  return path.join(root, "session-capabilities", `${id}.json`);
}

function readDesktopCapability(root, payload) {
  const record = readDescriptor(desktopSessionCapabilityFile(root, payload));
  return record?.schema === DESKTOP_CAPABILITY_SCHEMA ? record : null;
}

function writeDesktopCapability(root, payload, status, reason = null) {
  const file = desktopSessionCapabilityFile(root, payload);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({
    schema: DESKTOP_CAPABILITY_SCHEMA,
    sessionIdentityHash: `sha256:${path.basename(file, ".json")}`,
    status,
    reason,
    establishedAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}

const desktopObserverMessage = () =>
  "OUTSIDER_OBSERVER_ONLY_REMOTE_HELPER_UNREACHABLE: this Cowork session cannot reach the "
  + "installed local Outsider helper. Tools remain available, but this task is not controlled "
  + "and cannot receive a Stage 0.5 delivery or causal proof. Start a new session after a "
  + "successful helper handshake to restore controlled mode.";

function desktopObserverOnlyResponse(payload) {
  const event = payload?.input?.hook_event_name ?? payload?.input?.hookEventName ?? null;
  const message = desktopObserverMessage();
  if (event === "PreToolUse") return {
    decision: { verdict: "allow", corrective: message },
    output: { hookSpecificOutput: { hookEventName: "PreToolUse",
      permissionDecision: "allow", permissionDecisionReason: message,
      additionalContext: message } },
  };
  if (event === "Stop" || event === "SubagentStop") return {
    decision: { verdict: "allow", corrective: message },
    output: { decision: "approve", systemMessage: message },
  };
  if (event === "UserPromptSubmit" || event === "SessionStart") return {
    decision: { verdict: "allow", corrective: message },
    output: { hookSpecificOutput: { hookEventName: event, additionalContext: message } },
  };
  return { decision: { verdict: "allow", corrective: message }, output: {} };
}

function readDescriptor(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

async function ping(descriptor, timeoutMs = 800) {
  if (!descriptor?.socketPath || !descriptor?.token) return false;
  try {
    await requestController({ socketPath: descriptor.socketPath, token: descriptor.token,
      payload: { agent: "claude-code", input: { _outsiderAttachedPing: true,
        session_id: "outsider-health" } }, timeoutMs });
    return true;
  } catch { return false; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const daemonPackageRoot = (daemonEntry) => path.dirname(path.dirname(path.resolve(daemonEntry)));
const compatibleSystemHelper = (descriptor) => descriptor?.transport === "system-helper"
  && Number(descriptor?.protocolVersion) === 1;

async function retireMismatchedDaemon(descriptor, { descriptorFile, timeoutMs = 3_000 } = {}) {
  /* Only retire a process after the authenticated socket ping succeeded.  A
     stale pid in a user-editable descriptor is never enough authority to send
     a signal to an unrelated process. */
  if (!(Number(descriptor?.pid) > 0)) throw new Error("ATTACHED_DAEMON_PACKAGE_MISMATCH_NO_PID");
  try { process.kill(Number(descriptor.pid), "SIGTERM"); }
  catch (error) { if (error?.code !== "ESRCH") throw error; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && await ping(descriptor, 200)) await wait(25);
  if (await ping(descriptor, 200)) throw new Error("ATTACHED_DAEMON_PACKAGE_MISMATCH_STILL_RUNNING");
  try {
    const current = readDescriptor(descriptorFile);
    if (current?.pid === descriptor.pid && current?.token === descriptor.token) unlinkSync(descriptorFile);
  } catch { /* a concurrent hook may already have replaced the descriptor */ }
}

export async function ensureAttachedDaemon({ root = defaultAttachedRoot(),
  daemonEntry = fileURLToPath(new URL("../bin/outsider-attached-daemon.mjs", import.meta.url)),
  spawnDaemon = spawn, timeoutMs = 8_000, retryStaleLock = true,
  requireSystemHelper = false } = {}) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const target = paths(root);
  const desiredPackageRoot = daemonPackageRoot(daemonEntry);
  let descriptor = readDescriptor(target.descriptor);
  if (await ping(descriptor)) {
    if (compatibleSystemHelper(descriptor)) return descriptor;
    if (requireSystemHelper) {
      throw new Error("DESKTOP_SYSTEM_HELPER_REQUIRED:运行 outsider install --scope user 后重开 Cowork");
    }
    if (descriptor?.packageRoot && path.resolve(descriptor.packageRoot) === desiredPackageRoot) {
      return descriptor;
    }
    await retireMismatchedDaemon(descriptor, { descriptorFile: target.descriptor });
    descriptor = null;
  }
  if (requireSystemHelper) {
    throw new Error("DESKTOP_SYSTEM_HELPER_REQUIRED:运行 outsider install --scope user 后重开 Cowork");
  }

  let lockFd = null;
  try { lockFd = openSync(target.lock, "wx", 0o600); } catch { /* another hook starts it */ }
  if (lockFd != null) {
    const token = randomUUID();
    try {
      try { if (existsSync(target.socketPath)) unlinkSync(target.socketPath); } catch { /* stale */ }
      const child = spawnDaemon(process.execPath, [daemonEntry], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, OUTSIDER_ATTACHED_ROOT: root,
          OUTSIDER_ATTACHED_SOCKET: target.socketPath, OUTSIDER_ATTACHED_TOKEN: token },
      });
      child.unref?.();
    } finally {
      closeSync(lockFd);
      try { unlinkSync(target.lock); } catch { /* waiter may have removed stale lock */ }
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    descriptor = readDescriptor(target.descriptor);
    if (descriptor?.packageRoot
      && path.resolve(descriptor.packageRoot) === desiredPackageRoot
      && await ping(descriptor)) return descriptor;
    await wait(50);
  }
  if (retryStaleLock && existsSync(target.lock)) {
    let stale = false;
    try { stale = Date.now() - statSync(target.lock).mtimeMs >= timeoutMs; } catch { stale = true; }
    if (stale) {
      try { unlinkSync(target.lock); } catch { /* another waiter recovered it */ }
      return ensureAttachedDaemon({ root, daemonEntry, spawnDaemon, timeoutMs,
        retryStaleLock: false, requireSystemHelper });
    }
  }
  throw new Error("ATTACHED_DAEMON_START_TIMEOUT");
}

export async function requestAttached({ payload, timeoutMs = 890_000,
  root = defaultAttachedRoot() } = {}) {
  const desktop = payload?.agent === "claude-desktop";
  const priorCapability = desktop ? readDesktopCapability(root, payload) : null;
  if (priorCapability?.status === "observer-only") {
    return desktopObserverOnlyResponse(payload);
  }
  let descriptor;
  try {
    descriptor = await ensureAttachedDaemon({ root, requireSystemHelper: desktop });
  } catch (error) {
    if (desktop && priorCapability?.status !== "controlled"
      && String(error?.message ?? error).startsWith("DESKTOP_SYSTEM_HELPER_REQUIRED:")) {
      try {
        writeDesktopCapability(root, payload, "observer-only",
          "system-helper-unreachable-at-handshake");
      } catch { /* an unpersistable remote sandbox still must not brick the host */ }
      return desktopObserverOnlyResponse(payload);
    }
    throw error;
  }
  if (desktop && priorCapability?.status !== "controlled") {
    try {
      writeDesktopCapability(root, payload, "controlled", "authenticated-system-helper-handshake");
    } catch { /* the live authenticated transport remains authoritative for this boundary */ }
  }
  return requestController({ socketPath: descriptor.socketPath, token: descriptor.token,
    payload, timeoutMs });
}

export function writeAttachedDescriptor(root, descriptor) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = paths(root).descriptor;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(descriptor, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
  return file;
}
