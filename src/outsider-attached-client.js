import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requestController } from "./outsider-controller-rpc.js";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;

function attachedFileError(code, file) {
  const error = new Error(`${code}:${file}`);
  error.code = code;
  return error;
}

function lstatOrNull(file) {
  try { return lstatSync(file, { bigint: true }); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

const sameFile = (left, right) => Boolean(left && right && left.isFile() && right.isFile()
  && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
  && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs);
const sameDirectory = (left, right) => Boolean(left && right
  && left.isDirectory() && right.isDirectory() && left.dev === right.dev
  && left.ino === right.ino && left.mode === right.mode);
const sameNode = (left, right) => Boolean(left && right && left.dev === right.dev
  && left.ino === right.ino && left.mode === right.mode && left.size === right.size);

function securePrivateDirectory(directory, trustedRoot = path.dirname(path.resolve(directory))) {
  const root = path.resolve(trustedRoot);
  const target = path.resolve(directory);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw attachedFileError("ATTACHED_PATH_OUTSIDE_TRUSTED_ROOT", target);
  }
  const rootStats = lstatSync(root, { bigint: true });
  if (rootStats.isSymbolicLink()) throw attachedFileError("ATTACHED_DIRECTORY_SYMLINK_REFUSED", root);
  if (!rootStats.isDirectory()) throw attachedFileError("ATTACHED_DIRECTORY_REQUIRED", root);
  const chain = [{ file: root, stats: rootStats }];
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stats = lstatOrNull(current);
    if (!stats) {
      try { mkdirSync(current, { mode: 0o700 }); }
      catch (error) { if (error?.code !== "EEXIST") throw error; }
      stats = lstatSync(current, { bigint: true });
    }
    if (stats.isSymbolicLink()) throw attachedFileError("ATTACHED_DIRECTORY_SYMLINK_REFUSED", current);
    if (!stats.isDirectory()) throw attachedFileError("ATTACHED_DIRECTORY_REQUIRED", current);
    if ((Number(stats.mode) & 0o777) !== 0o700) {
      throw attachedFileError("ATTACHED_DIRECTORY_PERMISSIONS_INSECURE", current);
    }
    chain.push({ file: current, stats });
  }
  return { directory: target, chain };
}

const stablePrivateChain = (chain) => chain.every(({ file, stats }) => {
  const current = lstatOrNull(file);
  return current && !current.isSymbolicLink() && sameDirectory(stats, current);
});

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function stablePrivateFile(file, testOnlyReadObserver = null) {
  const before = lstatOrNull(file);
  if (!before) return null;
  if (before.isSymbolicLink()) throw attachedFileError("ATTACHED_PRIVATE_FILE_SYMLINK_REFUSED", file);
  if (!before.isFile()) throw attachedFileError("ATTACHED_PRIVATE_FILE_TYPE_REFUSED", file);
  if ((Number(before.mode) & 0o777) !== 0o600) {
    throw attachedFileError("ATTACHED_PRIVATE_FILE_PERMISSIONS_INSECURE", file);
  }
  const descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    testOnlyReadObserver?.({ phase: "private-file-opened", file });
    const bytes = readFileSync(descriptor);
    testOnlyReadObserver?.({ phase: "private-file-read", file });
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatOrNull(file);
    if (!sameFile(before, opened) || !sameFile(opened, after) || !sameFile(after, current)) {
      throw attachedFileError("ATTACHED_PRIVATE_FILE_IDENTITY_CHANGED", file);
    }
    return { bytes, stats: after };
  } finally { closeSync(descriptor); }
}

function writePrivateJson(file, value, { trustedRoot = path.dirname(path.dirname(file)),
  testOnlyWriteObserver = null } = {}) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2));
  const secured = securePrivateDirectory(path.dirname(file), trustedRoot);
  const final = path.join(secured.directory, path.basename(file));
  const before = lstatOrNull(final);
  if (before?.isSymbolicLink()) throw attachedFileError("ATTACHED_PRIVATE_FILE_SYMLINK_REFUSED", final);
  if (before && !before.isFile()) throw attachedFileError("ATTACHED_PRIVATE_FILE_TYPE_REFUSED", final);
  let descriptor;
  let temporary;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    temporary = path.join(secured.directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
    try {
      descriptor = openSync(temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
      break;
    } catch (error) { if (error?.code !== "EEXIST") throw error; }
  }
  if (descriptor == null) throw attachedFileError("ATTACHED_PRIVATE_TEMP_CREATE_FAILED", final);
  let exists = true;
  let written;
  try {
    try {
      fchmodSync(descriptor, 0o600);
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      written = fstatSync(descriptor, { bigint: true });
    } finally { closeSync(descriptor); }
    testOnlyWriteObserver?.({ phase: "private-temp-durable", file: final, temporary });
    if (!stablePrivateChain(secured.chain)) {
      throw attachedFileError("ATTACHED_PRIVATE_PARENT_IDENTITY_CHANGED", final);
    }
    const stableTemp = stablePrivateFile(temporary);
    if (!sameFile(written, stableTemp.stats) || !bytes.equals(stableTemp.bytes)) {
      throw attachedFileError("ATTACHED_PRIVATE_TEMP_IDENTITY_CHANGED", temporary);
    }
    const current = lstatOrNull(final);
    if (current?.isSymbolicLink()) throw attachedFileError("ATTACHED_PRIVATE_FILE_SYMLINK_REFUSED", final);
    if ((before == null) !== (current == null) || (before && !sameFile(before, current))) {
      throw attachedFileError("ATTACHED_PRIVATE_FILE_IDENTITY_CHANGED", final);
    }
    renameSync(temporary, final);
    exists = false;
    fsyncDirectory(secured.directory);
    const installed = stablePrivateFile(final);
    if (!sameNode(written, installed.stats) || !bytes.equals(installed.bytes)
      || !stablePrivateChain(secured.chain)) {
      throw attachedFileError("ATTACHED_PRIVATE_PUBLISH_VERIFY_FAILED", final);
    }
    return final;
  } finally {
    if (exists) {
      const current = lstatOrNull(temporary);
      if (current && written && current.dev === written.dev && current.ino === written.ino) {
        unlinkSync(temporary);
      } else if (current) throw attachedFileError("ATTACHED_PRIVATE_TEMP_IDENTITY_CHANGED", temporary);
    }
  }
}

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
  const record = readAttachedDescriptor(desktopSessionCapabilityFile(root, payload));
  return record?.schema === DESKTOP_CAPABILITY_SCHEMA ? record : null;
}

export function writeDesktopCapability(root, payload, status, reason = null, options = {}) {
  const file = desktopSessionCapabilityFile(root, payload);
  return writePrivateJson(file, {
    schema: DESKTOP_CAPABILITY_SCHEMA,
    sessionIdentityHash: `sha256:${path.basename(file, ".json")}`,
    status,
    reason,
    establishedAt: new Date().toISOString(),
  }, { trustedRoot: root, ...options });
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

export function readAttachedDescriptor(file, { testOnlyReadObserver = null } = {}) {
  const snapshot = stablePrivateFile(file, testOnlyReadObserver);
  if (!snapshot) return null;
  try { return JSON.parse(snapshot.bytes.toString("utf8")); } catch { return null; }
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
    const current = readAttachedDescriptor(descriptorFile);
    if (current?.pid === descriptor.pid && current?.token === descriptor.token) unlinkSync(descriptorFile);
  } catch { /* a concurrent hook may already have replaced the descriptor */ }
}

export async function ensureAttachedDaemon({ root = defaultAttachedRoot(),
  daemonEntry = fileURLToPath(new URL("../bin/outsider-attached-daemon.mjs", import.meta.url)),
  spawnDaemon = spawn, timeoutMs = 8_000, retryStaleLock = true,
  requireSystemHelper = false } = {}) {
  securePrivateDirectory(root);
  const target = paths(root);
  const desiredPackageRoot = daemonPackageRoot(daemonEntry);
  let descriptor = readAttachedDescriptor(target.descriptor);
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
    descriptor = readAttachedDescriptor(target.descriptor);
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

export function writeAttachedDescriptor(root, descriptor, options = {}) {
  const file = paths(root).descriptor;
  return writePrivateJson(file, descriptor, {
    trustedRoot: path.dirname(path.resolve(root)), ...options,
  });
}
