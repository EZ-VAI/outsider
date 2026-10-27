/*
 * Dispatch an entire durable OutcomeProgram through the existing user-held
 * broker. The injected driver owns provider adapters and their credentials.
 * The broker receives only the protocol's order-scoped keyed commitments.
 * A completed broker job reports the replayed program state; it does not mint
 * a commercial guarantee or turn deployed resources into capacity leases.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { formationJobIdentityV1 } from "./outsider-formation-job-worker-v1.js";
import { publicOutcomeRunViewV1 } from "./outsider-production-outcome-runner-v1.js";
import { createUserHeldFormationPrivateBindingV1 }
  from "./outsider-user-held-formation-executor-protocol-v1.js";

const ADAPTER = Object.freeze({
  adapterId: "user-held-outcome-program", adapterVersion: "1.0.0",
});
const DURABLE_ADAPTER = Object.freeze({
  adapterId: "user-held-outcome-program", adapterVersion: "2.0.0",
});
const PREFIX = "OUTSIDER_USER_HELD_OUTCOME_PROGRAM_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "FAILED_CLOSED", "UNAVAILABLE"]);
const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = (domain, value) => sha(`${domain}\0${canonicalizeStrict(value)}`);
function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o700) fail("DIRECTORY_NOT_PRIVATE");
  return realpathSync(directory);
}
function writeRecord(file, record) {
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(record)}\n`);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
  const directory = openSync(path.dirname(file), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function readRecord(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o600 || stat.size > 1024 * 1024) {
    fail("RECEIPT_NOT_PRIVATE");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

export function createUserHeldOutcomeProgramComposition(input, dependencies) {
  const { driver } = dependencies ?? {};
  if (!driver || typeof driver.confirmAndDrive !== "function"
    || typeof driver.inspectProgram !== "function"
    || typeof driver.proposal !== "function") fail("DRIVER_INVALID");
  const durable = input?.executionMode === "DURABLE_AUTONOMOUS_V2";
  if (input?.executionMode !== undefined && !durable) fail("EXECUTION_MODE_INVALID");
  if (durable && (typeof driver.confirmAndDriveDurably !== "function"
    || typeof driver.prepareDurableExecution !== "function"
    || typeof driver.resumeAndDrive !== "function")) fail("DURABLE_DRIVER_REQUIRED");
  const adapter = durable ? DURABLE_ADAPTER : ADAPTER;
  const proposal = driver.proposal(input?.requestId);
  if (!proposal || proposal.requestId !== input.requestId
    || proposal.programHash !== input.outcomeProgramHash
    || !HASH.test(input.outcomeProgramHash ?? "")
    || !Buffer.isBuffer(input.privateEnvelopeBytes)
    || input.privateEnvelopeBytes.length < 1
    || input.privateEnvelopeBytes.length > 64 * 1024) fail("INPUT_INVALID");
  const envelope = Buffer.from(input.privateEnvelopeBytes);
  const planHash = digest(`outsider/user-held-outcome-program-plan/v${durable ? 2 : 1}`, {
    adapterBinding: adapter, requestId: input.requestId,
    programId: proposal.programId, outcomeProgramHash: proposal.programHash,
    parameterEnvelopeHash: sha(envelope), graphRefs: input.graphRefs,
    issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  });
  const identity = formationJobIdentityV1({
    schema: "outsider/formation-job/v1", orderId: input.requestId,
    planHash, adapterBinding: adapter,
    outcomeProgramHash: proposal.programHash,
    parameterEnvelopeHash: sha(envelope), graphRefs: input.graphRefs,
    issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  });
  const directory = privateDirectory(path.join(input.privateRoot,
    "user-held-outcome-program", identity.jobHash.slice(7)));
  const markerFile = path.join(directory, "execution-started.json");
  const receiptFile = path.join(directory, "execution-receipt.json");
  let inFlight = null;

  function inspect() {
    const view = publicOutcomeRunViewV1(driver.inspectProgram(proposal.programId));
    if (view.programId !== proposal.programId
      || view.programHash !== proposal.programHash) fail("PROGRAM_REPLAY_MISMATCH");
    return view;
  }
  function resultFor(view) {
    const completed = view.state === "SUCCEEDED";
    return Object.freeze({
      state: completed ? "COMPLETED"
        : view.state === "UNAVAILABLE" ? "UNAVAILABLE" : "RECOVERY_REQUIRED",
      reasonCode: completed ? "DURABLE_OUTCOME_PROGRAM_SUCCEEDED"
        : TERMINAL.has(view.state) ? `DURABLE_OUTCOME_PROGRAM_${view.state}`
          : "DURABLE_OUTCOME_PROGRAM_REQUIRES_LOCAL_RESUME",
      resultHash: digest("outsider/user-held-outcome-program-result/v1", view),
      // The durable journal is committed by resultHash. Journal events are
      // not relabelled as raw provider source occurrences.
      sourceOccurrenceHashes: Object.freeze([]),
      externalEffect: completed ? "CONFIRMED"
        : Object.values(view.formation).some(x => x.reserved)
          ? "ATTEMPTED" : "UNKNOWN",
      retryDisposition: "DO_NOT_RETRY",
    });
  }
  function persist(view) {
    const result = resultFor(view);
    const body = { schema: "outsider/private-user-held-outcome-program-receipt/v1",
      jobHash: identity.jobHash, programView: view, executorResult: result };
    const receipt = { ...body, receiptHash: digest(body.schema, body) };
    writeRecord(receiptFile, receipt);
    return result;
  }
  function replayReceipt() {
    const receipt = readRecord(receiptFile);
    const { receiptHash, ...body } = receipt;
    if (body.schema !== "outsider/private-user-held-outcome-program-receipt/v1"
      || body.jobHash !== identity.jobHash
      || receiptHash !== digest(body.schema, body)) fail("RECEIPT_INVALID");
    const replayed = inspect();
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(body.programView)
      || canonicalizeStrict(resultFor(replayed))
        !== canonicalizeStrict(body.executorResult)) fail("RECEIPT_REPLAY_MISMATCH");
    return Object.freeze(body.executorResult);
  }
  const executor = Object.freeze({
    async executeFrozenPlan(invocation) {
      const invoked = formationJobIdentityV1(invocation?.job);
      if (invoked.jobHash !== identity.jobHash
        || invocation.jobHash !== identity.jobHash
        || invocation.jobKey !== identity.jobKey) fail("INVOCATION_MISMATCH");
      if (inFlight !== null) return inFlight;
      inFlight = (async () => {
        if (existsSync(receiptFile)) return replayReceipt();
        if (existsSync(markerFile)) {
          const marker = readRecord(markerFile);
          if (marker.jobHash !== identity.jobHash) fail("MARKER_MISMATCH");
          // V1 remains terminal-replay-only. V2 resumes the same granted
          // program; the driver reconciles stable provider operation IDs.
          // The CLI must own the node's cross-process single-writer lock.
          if (durable) {
            // A terminal journal is sufficient even if credentials have since
            // expired. Only the pre-journal crash gap needs the driver here.
            let existing = null;
            try { existing = inspect(); }
            catch (error) {
              if (!error.message?.startsWith("OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_PROGRAM_NOT_FOUND:")) throw error;
            }
            if (existing !== null && TERMINAL.has(existing.state)) return persist(existing);
            const driven = await driver.resumeAndDrive({
              requestId: input.requestId, programHash: proposal.programHash,
              autonomousResumeBindingHash: identity.jobHash,
            });
            const replayed = inspect();
            if (canonicalizeStrict(publicOutcomeRunViewV1(driven))
              !== canonicalizeStrict(replayed)) fail("DRIVER_RESULT_REPLAY_MISMATCH");
            return TERMINAL.has(replayed.state) ? persist(replayed) : resultFor(replayed);
          }
          const replayed = inspect();
          return TERMINAL.has(replayed.state) ? persist(replayed) : resultFor(replayed);
        }
        if (durable) driver.prepareDurableExecution({
          requestId: input.requestId, programHash: proposal.programHash,
          autonomousResumeBindingHash: identity.jobHash,
        });
        writeRecord(markerFile, {
          schema: "outsider/private-user-held-outcome-program-start/v1",
          jobHash: identity.jobHash, programHash: proposal.programHash,
          requestId: input.requestId,
        });
        const confirmation = { requestId: input.requestId, programHash: proposal.programHash };
        const driven = durable
          ? await driver.confirmAndDriveDurably({ ...confirmation,
            autonomousResumeBindingHash: identity.jobHash })
          : await driver.confirmAndDrive(confirmation);
        const replayed = inspect();
        if (canonicalizeStrict(publicOutcomeRunViewV1(driven))
          !== canonicalizeStrict(replayed)) fail("DRIVER_RESULT_REPLAY_MISMATCH");
        return TERMINAL.has(replayed.state) ? persist(replayed) : resultFor(replayed);
      })();
      try { return await inFlight; } finally { inFlight = null; }
    },
  });
  const composition = Object.freeze({ job: identity.job, executor,
    localProjection: Object.freeze({
      schema: "outsider/private-user-held-outcome-program-composition/v1",
      adapterBinding: adapter, jobHash: identity.jobHash, jobKey: identity.jobKey,
      programId: proposal.programId, programHash: proposal.programHash,
      executorCredentialsProjected: false, rawJournalProjected: false,
      brokerReceiptEstablishesOutcomeTruth: false,
      providerIssuedCapacityEstablished: false, commercialCommitmentIssued: false,
    }),
  });
  return Object.freeze({ ...composition,
    inspectLocalProgram: inspect,
    createUserHeldBinding(commitmentKeyBytes) {
      return createUserHeldFormationPrivateBindingV1({ composition,
        privateEnvelopeBytes: envelope, commitmentKeyBytes });
    },
  });
}
