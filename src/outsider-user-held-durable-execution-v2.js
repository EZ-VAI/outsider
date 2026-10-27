/*
 * Same-node continuation for explicitly versioned durable OutcomePrograms.
 * Reuses the deployed v1 hash-only broker protocol. It does not reassign work,
 * create another Attempt, or retry unknown provider writes itself. The local
 * program driver owns operation-ID reconciliation. An unfinished/HOLD result
 * must never be submitted as a completed broker execution.
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  assertUserHeldFormationPrivateBindingV1,
  createUserHeldFormationExecutionClaimRequestV1,
  createUserHeldFormationExecutionResultSubmissionV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
  normalizeUserHeldFormationExecutionClaimResponseV1,
  normalizeUserHeldFormationExecutionCompletionAckV1,
  OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS,
} from "./outsider-user-held-formation-executor-protocol-v1.js";

const fail = code => {
  const error = new Error(`OUTSIDER_DURABLE_EXECUTION_V2_${code}`);
  error.outsiderCode = code;
  throw error;
};

export const privateExecutionRecordExists = existsSync;
export function privateExecutionRecordNames(directory) {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}
export async function publishPrivateExecutionRecord(file, value, { replace = false } = {}) {
  (replace ? replacePrivateExecutionRecord : writePrivateExecutionRecordOnce)(file, value);
}
export function readPrivateExecutionBytes(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
    || stat.size < 1 || stat.size > 1024 * 1024) fail("PRIVATE_FILE_INVALID");
  return readFileSync(file);
}

export function writePrivateExecutionRecordOnce(file, value) {
  publishPrivateExecutionBytes(file, Buffer.from(`${canonicalizeStrict(value)}\n`));
}

export function replacePrivateExecutionRecord(file, value) {
  publishPrivateExecutionBytes(file, Buffer.from(`${canonicalizeStrict(value)}\n`), { replace: true });
}

// Publish on the same filesystem only after every byte is durable. Immutable
// records use link (not rename), so a concurrent writer cannot replace history.
export function publishPrivateExecutionBytes(file, bytes, { replace = false } = {}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const matches = () => {
    const stat=lstatSync(file);
    return stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o600
      &&stat.size===bytes.length&&readFileSync(file).equals(bytes);
  };
  if (!replace && existsSync(file)) {
    if (!matches()) fail("LOCAL_RECORD_MISMATCH");
    return;
  }
  const temporary = path.join(path.dirname(file), `.pending-${randomUUID()}`);
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    if (replace) renameSync(temporary, file);
    else try { linkSync(temporary, file); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!matches()) fail("LOCAL_RECORD_MISMATCH");
    }
    const directory = openSync(path.dirname(file), "r");
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

/* Lock ports sit below every default ephemeral range (Linux 32768 to 60999,
 * macOS and IANA 49152 to 65535). The earlier range 49152 to 65535 overlapped
 * them: an outbound connection that happened to get the same local port made
 * the lock report NODE_ALREADY_RUNNING while nobody held it. 30000 and above
 * is left free for Kubernetes node ports. All processes that share locks must
 * run the same version, because the port for a given lock id changed here.
 */
export const EXECUTION_LOCK_PORTS = Object.freeze({ first: 20000, count: 10000 });
export function executionLockPort(jobHash) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(jobHash)) fail("LOCK_ID_INVALID");
  return EXECUTION_LOCK_PORTS.first + createHash("sha256").update(jobHash).digest().readUInt32BE(0) % EXECUTION_LOCK_PORTS.count;
}

/** Kernel-held, same-host mutex: a crashed process cannot leave a stale lock.
 * This loopback listener accepts no requests or data. A hash collision with
 * another job/service is a conservative busy error, never concurrent access.
 * Cross-host/shared-filesystem workers require a distributed lease instead.
 */
// Another holder of the same lock usually finishes within milliseconds, and two
// unrelated jobs can hash to the same port. Wait briefly before reporting busy,
// instead of failing a step that would have run a moment later.
export const EXECUTION_LOCK_WAIT_MS = 2000;
export async function withUserHeldExecutionLockV2(jobHash, operation, { waitMs = EXECUTION_LOCK_WAIT_MS } = {}) {
  const port = executionLockPort(jobHash), until = Date.now() + waitMs;
  let server;
  for (let delay = 10; ; delay = Math.min(delay * 2, 200)) {
    server = createServer(socket => socket.destroy());
    const cause = await new Promise(resolve => {
      server.once("error", resolve);
      server.listen({ port, host: "127.0.0.1", exclusive: true }, () => resolve(null));
    });
    if (!cause) break;
    if (cause.code !== "EADDRINUSE" || Date.now() + delay > until) {
      const code = cause.code === "EADDRINUSE" ? "NODE_ALREADY_RUNNING" : "NODE_LOCK_UNAVAILABLE";
      const error = new Error(`OUTSIDER_DURABLE_EXECUTION_V2_${code}`, { cause });
      error.outsiderCode = code;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  try { return await operation(); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

export async function runDurableUserHeldFormationExecutorV2(input, dependencies) {
  const { fetchImpl, clock, isLocalProgramTerminal } = dependencies ?? {};
  if (typeof fetchImpl !== "function" || typeof clock !== "function"
    || typeof isLocalProgramTerminal !== "function") fail("DEPENDENCIES_INVALID");
  const binding = assertUserHeldFormationPrivateBindingV1(input.binding);
  if (binding.job.adapterBinding.adapterId !== "user-held-outcome-program"
    || binding.job.adapterBinding.adapterVersion !== "2.0.0") fail("DURABLE_V2_BINDING_REQUIRED");
  const origin = new URL(input.centralOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password
    || origin.pathname !== "/" || origin.search || origin.hash) fail("ORIGIN_INVALID");
  if (deriveUserHeldFormationExecutorCapabilityHashV1({
    bearerToken: input.bearerToken, jobHash: binding.jobHash,
  }) !== input.executorCapabilityHash) fail("CAPABILITY_MISMATCH");

  return withUserHeldExecutionLockV2(binding.jobHash, async () => {
    mkdirSync(input.journalDirectory, { recursive: true, mode: 0o700 });
    const stat = lstatSync(input.journalDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || (stat.mode & 0o777) !== 0o700) fail("DIRECTORY_NOT_PRIVATE");
    const file = name => path.join(input.journalDirectory, name);
    const read = name => JSON.parse(readPrivateExecutionBytes(file(name)));
    async function post(route, body) {
      const response = await fetchImpl(`${origin.origin}${route}`, {
        method: "POST", headers: { authorization: `Bearer ${input.bearerToken}`,
          "content-type": "application/json", accept: "application/json" },
        body: canonicalizeStrict(body), signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (!(response instanceof Response) || response.status !== 200) {
        fail(`BROKER_HTTP_${response?.status ?? "INVALID"}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 64 * 1024) fail("BROKER_RESPONSE_TOO_LARGE");
      return JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes));
    }
    const claim = normalizeUserHeldFormationExecutionClaimResponseV1(await post(
      "/v1/client-execution-claims", createUserHeldFormationExecutionClaimRequestV1({
        jobKey: binding.jobKey, jobHash: binding.jobHash,
        executorCapabilityHash: input.executorCapabilityHash, requestedAt: clock(),
      })));
    if (claim.jobHash !== binding.jobHash || claim.jobKey !== binding.jobKey) fail("CLAIM_MISMATCH");
    const submissionFile = file("result-submission.json");
    let submission = existsSync(submissionFile) ? read("result-submission.json") : null;
    if (submission && (submission.jobHash !== binding.jobHash
      || submission.jobKey !== binding.jobKey
      || submission.leaseHash !== claim.leaseHash)) fail("SUBMISSION_BINDING_MISMATCH");

    if (claim.state !== "COMPLETE" && submission === null) {
      if (claim.leaseHash === null || claim.leaseExpiresAt === null) fail("LEASE_UNAVAILABLE");
      if (Date.parse(clock()) >= Date.parse(claim.leaseExpiresAt)) fail("LEASE_EXPIRED_NO_EXECUTION");
      writePrivateExecutionRecordOnce(file("claim-binding.json"), {
        schema: "outsider/private-durable-execution-claim/v2",
        jobHash: binding.jobHash, jobKey: binding.jobKey,
        leaseHash: claim.leaseHash, leaseExpiresAt: claim.leaseExpiresAt,
      });
      const invocation = claim.invocation ?? {
        schema: OUTSIDER_USER_HELD_FORMATION_EXECUTOR_PROTOCOL_V1_SCHEMAS.invocation,
        job: binding.job, jobHash: binding.jobHash, jobKey: binding.jobKey,
      };
      const result = await binding.executeFrozenPlan(invocation);
      if (result.state === "HOLD" || isLocalProgramTerminal() !== true) {
        fail("LOCAL_PROGRAM_NOT_TERMINAL");
      }
      submission = createUserHeldFormationExecutionResultSubmissionV1({
        jobKey: binding.jobKey, jobHash: binding.jobHash,
        leaseHash: claim.leaseHash, submittedAt: clock(), result,
      });
      // Persist BEFORE the HTTP write; response loss replays identical bytes.
      writePrivateExecutionRecordOnce(submissionFile, submission);
    }
    if (isLocalProgramTerminal() !== true) fail("LOCAL_PROGRAM_NOT_TERMINAL");
    const completion = claim.state === "COMPLETE" ? claim.completion
      : normalizeUserHeldFormationExecutionCompletionAckV1(await post(
        `/v1/client-executions/${binding.jobKey}/receipt`, submission));
    if (completion.jobHash !== binding.jobHash || completion.jobKey !== binding.jobKey
      || completion.leaseHash !== claim.leaseHash
      || submission === null
      || canonicalizeStrict(completion.result) !== canonicalizeStrict(submission.result)) {
      fail("COMPLETION_MISMATCH");
    }
    writePrivateExecutionRecordOnce(file("completion.json"), completion);
    return Object.freeze({ state: "COMPLETE", jobKey: binding.jobKey,
      jobHash: binding.jobHash, receiptHash: completion.receiptHash,
      resultHash: completion.result.resultHash, replayed: claim.state === "COMPLETE",
      authorityMinted: false, outcomeCommitted: false });
  });
}
