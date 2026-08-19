import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

export const JUDGE_PROCESS_SCHEMA = "outsider/judge-process-ownership/v1";
export const JUDGE_OWNERSHIP_DIRECTORY = ".outsider-judge-processes";

const sha = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const positivePid = (value) => Number.isInteger(Number(value)) && Number(value) > 1
  ? Number(value) : null;
const sessionValue = (value) => Number.isInteger(Number(value)) && Number(value) >= 0
  ? Number(value) : null;

function psField(pid, field, run = spawnSync) {
  const result = run("/bin/ps", ["-p", String(pid), "-o", `${field}=`], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 2_000,
  });
  if (result.status !== 0) return null;
  const value = String(result.stdout ?? "").trim();
  return value || null;
}

/** Capture an OS identity that changes when a PID is reused. The command is
 * hashed before persistence: model arguments remain local and never enter the
 * evidence stream. A managed judge is deliberately a detached process-group
 * leader, so pid/pgid must be identical; the platform session field is also
 * committed to detect PID reuse. */
export function inspectJudgeProcess(pid, { run = spawnSync } = {}) {
  const id = positivePid(pid);
  if (!id) return null;
  const pgid = positivePid(psField(id, "pgid", run));
  /* macOS reports sess=0 for a detached Node child even though it is a new
     process-group leader. Preserve that stable OS field; pgid is the authority
     used for the exact group kill. */
  const sessionId = sessionValue(psField(id, "sess", run));
  const started = psField(id, "lstart", run);
  const command = psField(id, "command", run);
  if (!pgid || sessionId == null || !started || !command) return null;
  return {
    pid: id,
    pgid,
    sessionId,
    processIdentityHash: sha(JSON.stringify({ pid: id, pgid, sessionId, started, command })),
  };
}

export function writeJudgeProcessOwnership({ directory, ownerId, generation,
  logicalOperationId = randomUUID(), pid, run = spawnSync } = {}) {
  if (!directory || !ownerId || !Number.isInteger(Number(generation))) {
    throw new Error("JUDGE_PROCESS_OWNERSHIP_CONTEXT_REQUIRED");
  }
  const identity = inspectJudgeProcess(pid, { run });
  if (!identity || identity.pid !== identity.pgid) {
    throw new Error("JUDGE_PROCESS_NOT_ISOLATED_GROUP_LEADER");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const record = {
    schema: JUDGE_PROCESS_SCHEMA,
    ownerId: String(ownerId),
    generation: Number(generation),
    logicalOperationId: String(logicalOperationId),
    ...identity,
    recordedAt: new Date().toISOString(),
  };
  const file = path.join(directory, `${logicalOperationId}.json`);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: "wx" });
  renameSync(temporary, file);
  return { file, record };
}

export function removeJudgeProcessOwnership(file) {
  if (file) rmSync(file, { force: true });
}

export function judgeOwnershipFiles(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".json"))
    .sort().map((name) => path.join(directory, name));
}

function readRecord(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kill only process groups durably owned by the exact crashed controller.
 * A malformed record, PID reuse, or an identity mismatch is a hard failure:
 * recovery stays fail-closed instead of risking an unrelated local process. */
export async function cleanupOwnedJudgeProcesses({ directory, ownerId,
  timeoutMs = 2_000, inspect = inspectJudgeProcess,
  kill = (pgid) => process.kill(-pgid, "SIGKILL") } = {}) {
  const files = judgeOwnershipFiles(directory);
  const result = { inspected: files.length, terminated: 0, stale: 0,
    failures: [], remaining: 0 };
  for (const file of files) {
    const record = readRecord(file);
    if (!record || record.schema !== JUDGE_PROCESS_SCHEMA
      || record.ownerId !== String(ownerId)
      || !positivePid(record.pid) || record.pid !== record.pgid
      || sessionValue(record.sessionId) == null
      || !/^sha256:[0-9a-f]{64}$/.test(String(record.processIdentityHash ?? ""))) {
      result.failures.push({ file: path.basename(file), reason: "invalid-ownership-record" });
      continue;
    }
    const current = inspect(record.pid);
    if (!current) {
      removeJudgeProcessOwnership(file);
      result.stale += 1;
      continue;
    }
    if (current.pid !== record.pid || current.pgid !== record.pgid
      || current.sessionId !== record.sessionId
      || current.processIdentityHash !== record.processIdentityHash) {
      result.failures.push({ file: path.basename(file), reason: "process-identity-mismatch" });
      continue;
    }
    try { kill(record.pgid); } catch (error) {
      if (isAlive(record.pid)) {
        result.failures.push({ file: path.basename(file),
          reason: `kill-failed:${String(error?.message ?? error).slice(0, 300)}` });
        continue;
      }
    }
    const deadline = Date.now() + Math.max(100, Number(timeoutMs) || 2_000);
    while (Date.now() < deadline && isAlive(record.pid)) await wait(20);
    if (isAlive(record.pid)) {
      result.failures.push({ file: path.basename(file), reason: "process-remained-alive" });
      continue;
    }
    removeJudgeProcessOwnership(file);
    result.terminated += 1;
  }
  result.remaining = judgeOwnershipFiles(directory).length;
  return result;
}

export function judgeOwnershipDirectory(runDirectory) {
  return path.join(String(runDirectory), JUDGE_OWNERSHIP_DIRECTORY);
}
