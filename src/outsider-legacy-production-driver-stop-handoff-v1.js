/*
 * Durable stop-handoff evidence for a legacy first-reality production driver.
 *
 * The legacy v1/v2 writer has no shared filesystem lock. Before it stops, this
 * module observes an exact v2 `resume` process paused by Node --inspect-brk
 * before any user module/provider code and binds it to the confirmed program.
 * After it stops, the module
 * scans again, snapshots the final replayed journal head, and writes a
 * module-issued lease. Lease replay scans again and rejects any restarted
 * driver for the same request/runtime before emergency append is permitted.
 *
 * This is a migration interlock, not a general process supervisor. A future
 * writer should own a native shared lease rather than rely on process scans.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_LEGACY_PRODUCTION_DRIVER_STOP_HANDOFF_V1_";
const OBSERVATION_SCHEMA
  = "outsider/legacy-production-driver-live-observation/v1";
const LEASE_SCHEMA
  = "outsider/legacy-production-driver-stopped-lease/v1";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_LEGACY_PRODUCTION_DRIVER_STOP_HANDOFF_V1_SCHEMAS
  = Object.freeze({ observation: OBSERVATION_SCHEMA, lease: LEASE_SCHEMA });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8")
    .digest("hex")}`;
}

function snapshot(value, code) {
  try { return JSON.parse(canonicalizeStrict(value)); }
  catch { fail(code); }
}

function identifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function clockValue(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  return instant(value, "CLOCK_RESULT_INVALID");
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    const written = writeSync(descriptor, bytes);
    if (written !== bytes.length) fail("PRIVATE_RECORD_WRITE_INCOMPLETE");
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === "EEXIST") fail("PRIVATE_RECORD_ALREADY_EXISTS");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  syncDirectory(path.dirname(file));
}

function readPrivate(file, code) {
  if (!existsSync(file)) fail(`${code}_MISSING`);
  const metadata = lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 2 || metadata.size > 64 * 1024) {
    fail(`${code}_NOT_PRIVATE_REGULAR_FILE`);
  }
  const bytes = readFileSync(file);
  if (bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_INVALID_JSON`); }
  return snapshot(value, `${code}_NOT_CANONICAL`);
}

function commandTokens(commandLine) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  let started = false;
  for (const character of commandLine) {
    if (escaped) {
      token += character;
      escaped = false;
      started = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote !== null) {
      if (character === quote) quote = null;
      else token += character;
      started = true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
      continue;
    }
    token += character;
    started = true;
  }
  if (escaped || quote !== null) return null;
  if (started) tokens.push(token);
  return tokens;
}

function exactResumeArguments(argv, expected) {
  return argv.length === 7
    && argv[0] === "resume"
    && argv[1] === "--request-id" && argv[2] === expected.requestId
    && argv[3] === "--profile-dir" && argv[4] === expected.profileDirectory
    && argv[5] === "--runtime-dir" && argv[6] === expected.runtimeDirectory;
}

function matchingFlag(argv, name, expected) {
  const position = argv.indexOf(name);
  return position >= 1 && argv[position + 1] === expected
    && argv.indexOf(name, position + 1) === -1;
}

export function classifyLegacyProductionDriverCommandLineV1(commandLine,
  expected = {}) {
  if (typeof commandLine !== "string" || commandLine.length < 1
    || typeof expected.profileDirectory !== "string"
    || typeof expected.runtimeDirectory !== "string"
    || typeof expected.requestId !== "string") return null;
  const tokens = commandTokens(commandLine);
  const executable = tokens?.[0] ?? "";
  const nodeProcess = /^(?:node|nodejs)(?:-[A-Za-z0-9._-]+)?$/u
    .test(path.basename(executable));
  if (!nodeProcess || tokens === null) return null;
  const scriptIndexes = tokens.flatMap((token, index) =>
    /^outsider-first-committed-reality-production-v[12]\.mjs$/u
      .test(path.basename(token)) ? [index] : []);
  if (scriptIndexes.length !== 1) return null;
  const scriptIndex = scriptIndexes[0];
  const launcherVersion = /-v1\.mjs$/u.test(tokens[scriptIndex])
    ? "v1" : "v2";
  const nodeArguments = tokens.slice(1, scriptIndex);
  const argv = tokens.slice(scriptIndex + 1);
  const commandKind = ["confirm", "confirm-and-drive", "resume"]
    .includes(argv[0]) ? argv[0] : "UNKNOWN";
  const exactIdentity = matchingFlag(argv, "--request-id",
    expected.requestId)
    && matchingFlag(argv, "--profile-dir", expected.profileDirectory)
    && matchingFlag(argv, "--runtime-dir", expected.runtimeDirectory);
  if (!exactIdentity) return null;
  const pausedBeforeUserCode = nodeArguments.length === 1
    && nodeArguments[0] === "--inspect-brk=127.0.0.1:0";
  const exactMigrationInvocation = launcherVersion === "v2"
    && pausedBeforeUserCode
    && exactResumeArguments(argv, expected);
  return Object.freeze({
    commandLineHash: digest(
      "outsider/legacy-driver-command-line/v1", commandLine),
    commandKind,
    launcherVersion,
    exactMigrationInvocation,
    pausedBeforeUserCode,
  });
}

function defaultProcessScan({ profileDirectory, runtimeDirectory, requestId }) {
  let output;
  try {
    output = execFileSync("/bin/ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 5_000,
    });
  } catch { fail("PROCESS_SCAN_FAILED"); }
  const candidates = [];
  for (const line of output.split("\n")) {
    const matched = /^\s*(\d+)\s+(.+)$/u.exec(line);
    if (matched === null) continue;
    const pid = Number(matched[1]);
    const commandLine = matched[2];
    const classified = classifyLegacyProductionDriverCommandLineV1(
      commandLine, { profileDirectory, runtimeDirectory, requestId });
    if (classified === null) continue;
    candidates.push({
      pid,
      ...classified,
    });
  }
  return candidates;
}

function checkedScan(raw) {
  const value = snapshot(raw, "PROCESS_SCAN_NOT_CANONICAL");
  if (!Array.isArray(value) || value.length > 32) {
    fail("PROCESS_SCAN_INVALID");
  }
  for (const item of value) {
    if (item === null || typeof item !== "object"
      || !Number.isSafeInteger(item.pid) || item.pid < 1
      || typeof item.commandLineHash !== "string"
      || !HASH.test(item.commandLineHash)
      || !["UNKNOWN", "confirm", "confirm-and-drive", "resume"]
        .includes(item.commandKind)
      || !["v1", "v2"].includes(item.launcherVersion)
      || typeof item.exactMigrationInvocation !== "boolean"
      || typeof item.pausedBeforeUserCode !== "boolean") {
      fail("PROCESS_SCAN_INVALID");
    }
  }
  if (new Set(value.map((item) => item.pid)).size !== value.length) {
    fail("PROCESS_SCAN_DUPLICATE_PID");
  }
  return value;
}

function checkedProjection(raw, expected) {
  const value = snapshot(raw, "PROGRAM_PROJECTION_NOT_CANONICAL");
  if (value === null || typeof value !== "object"
    || value.programId !== expected.programId
    || value.programHash !== expected.programHash
    || value.committed !== true
    || typeof value.eventCount !== "number"
    || !Number.isSafeInteger(value.eventCount) || value.eventCount < 1
    || typeof value.journalHeadHash !== "string"
    || !HASH.test(value.journalHeadHash)) fail("PROGRAM_PROJECTION_INVALID");
  return value;
}

function observationFile(directory, observationId) {
  const key = createHash("sha256").update(observationId, "utf8").digest("hex");
  return path.join(directory, "observations", `${key}.json`);
}

function leaseFile(directory, programId) {
  const key = createHash("sha256").update(programId, "utf8").digest("hex");
  return path.join(directory, "leases", `${key}.json`);
}

function ensurePrivateDirectories(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const child of ["observations", "leases"]) {
    const directory = path.join(root, child);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return realpathSync(root);
}

/**
 * processScan must return every active first-reality driver for the exact
 * runtime/request as [{ pid, commandLineHash }]. inspectProgram must replay
 * the authoritative v1 journal projection.
 */
export function createLegacyProductionDriverStopHandoffV1(options = {}) {
  if (options === null || typeof options !== "object"
    || typeof options.directory !== "string" || options.directory.length < 1
    || typeof options.runtimeDirectory !== "string"
    || options.runtimeDirectory.length < 1
    || typeof options.profileDirectory !== "string"
    || options.profileDirectory.length < 1
    || typeof options.inspectProgram !== "function") fail("OPTIONS_INVALID");
  const root = ensurePrivateDirectories(path.resolve(options.directory));
  const runtimeDirectory = path.resolve(options.runtimeDirectory);
  const profileDirectory = path.resolve(options.profileDirectory);
  try { realpathSync(profileDirectory); }
  catch { fail("PROFILE_DIRECTORY_MISSING"); }
  if (/\s/u.test(profileDirectory) || /\s/u.test(runtimeDirectory)) {
    fail("MIGRATION_PROCESS_PATH_CONTAINS_WHITESPACE");
  }
  const clock = options.clock ?? (() => new Date().toISOString());
  const processScan = options.processScan ?? defaultProcessScan;
  if (typeof clock !== "function" || typeof processScan !== "function") {
    fail("OPTIONS_INVALID");
  }

  async function scan(requestId) {
    return checkedScan(await processScan({
      profileDirectory, runtimeDirectory, requestId,
    }));
  }

  return Object.freeze({
    stoppedLeaseExists(programId) {
      identifier(programId, "PROGRAM_ID_INVALID");
      return existsSync(leaseFile(root, programId));
    },
    async assertNoLegacyWriter(expected = {}) {
      identifier(expected.requestId, "REQUEST_ID_INVALID");
      identifier(expected.programId, "PROGRAM_ID_INVALID");
      hash(expected.programHash, "PROGRAM_HASH_INVALID");
      hash(expected.leaseHash, "LEASE_HASH_INVALID");
      const lease = readPrivate(leaseFile(root, expected.programId),
        "STOPPED_DRIVER_LEASE");
      const leaseBody = Object.fromEntries(Object.entries(lease)
        .filter(([key]) => key !== "leaseHash"));
      if (lease.schema !== LEASE_SCHEMA
        || lease.leaseHash !== digest(lease.schema, leaseBody)
        || lease.leaseHash !== expected.leaseHash
        || lease.requestId !== expected.requestId
        || lease.programId !== expected.programId
        || lease.programHash !== expected.programHash
        || lease.moduleIssued !== true || lease.stopped !== true) {
        fail("STOPPED_DRIVER_LEASE_WRITER_EXCLUSION_MISMATCH");
      }
      const active = await scan(expected.requestId);
      if (active.length !== 0) fail("LEGACY_DRIVER_RESTARTED");
      return Object.freeze({
        legacyWriterProcessesAbsent: true,
        checkedAt: clockValue(clock),
        leaseHash: lease.leaseHash,
      });
    },
    async observeLiveDriver(input = {}) {
      if (input === null || typeof input !== "object"
        || canonicalizeStrict(Object.keys(input).sort())
          !== canonicalizeStrict(["driverPid", "observationId", "programHash",
            "programId", "requestId"].sort())) fail("OBSERVATION_INPUT_INVALID");
      identifier(input.observationId, "OBSERVATION_ID_INVALID");
      identifier(input.requestId, "REQUEST_ID_INVALID");
      identifier(input.programId, "PROGRAM_ID_INVALID");
      hash(input.programHash, "PROGRAM_HASH_INVALID");
      if (!Number.isSafeInteger(input.driverPid) || input.driverPid < 1) {
        fail("DRIVER_PID_INVALID");
      }
      const active = await scan(input.requestId);
      const selected = active.find((item) => item.pid === input.driverPid);
      if (selected === undefined || active.length !== 1
        || selected.launcherVersion !== "v2"
        || selected.commandKind !== "resume"
        || selected.exactMigrationInvocation !== true
        || selected.pausedBeforeUserCode !== true) {
        fail("EXACT_LIVE_DRIVER_NOT_ESTABLISHED");
      }
      const projection = checkedProjection(
        await options.inspectProgram(input.programId), input);
      if (projection.state !== "PAUSED_RETRYABLE") {
        fail("DRIVER_PROGRAM_NOT_PAUSED");
      }
      const body = {
        schema: OBSERVATION_SCHEMA,
        schemaVersion: "1.0.0",
        observationId: input.observationId,
        requestId: input.requestId,
        programId: input.programId,
        programHash: input.programHash,
        driverPid: input.driverPid,
        commandLineHash: selected.commandLineHash,
        commandKind: "resume",
        pausedBeforeUserCode: true,
        evidenceMode: "MIGRATION_ONLY_PAUSED_BEFORE_USER_CODE_V1",
        driverIdentityHash: digest("outsider/legacy-production-driver/v1", {
          requestId: input.requestId,
          programId: input.programId,
          programHash: input.programHash,
          driverPid: input.driverPid,
          commandLineHash: selected.commandLineHash,
          commandKind: "resume",
          pausedBeforeUserCode: true,
        }),
        observedAt: clockValue(clock),
        observedJournalEventCount: projection.eventCount,
        observedJournalHeadHash: projection.journalHeadHash,
        rawCommandProjected: false,
      };
      const record = { ...body, observationHash: digest(body.schema, body) };
      writeOnce(observationFile(root, input.observationId), record);
      return Object.freeze({ ...record });
    },

    async finalizeStoppedDriver(input = {}) {
      if (input === null || typeof input !== "object"
        || canonicalizeStrict(Object.keys(input).sort())
          !== canonicalizeStrict(["observationId",
            "stopAuthorizationEvidenceHash"].sort())) {
        fail("FINALIZE_INPUT_INVALID");
      }
      identifier(input.observationId, "OBSERVATION_ID_INVALID");
      hash(input.stopAuthorizationEvidenceHash,
        "STOP_AUTHORIZATION_EVIDENCE_HASH_INVALID");
      const observation = readPrivate(observationFile(root,
        input.observationId), "OBSERVATION_RECORD");
      if (observation.schema !== OBSERVATION_SCHEMA
        || observation.observationHash !== digest(observation.schema,
          Object.fromEntries(Object.entries(observation)
            .filter(([key]) => key !== "observationHash")))) {
        fail("OBSERVATION_RECORD_INVALID");
      }
      const active = await scan(observation.requestId);
      if (active.length !== 0) fail("LEGACY_DRIVER_STILL_ACTIVE");
      const projection = checkedProjection(await options.inspectProgram(
        observation.programId), observation);
      if (projection.state !== "PAUSED_RETRYABLE") {
        fail("PROGRAM_NO_LONGER_PAUSED");
      }
      const body = {
        schema: LEASE_SCHEMA,
        schemaVersion: "1.0.0",
        moduleIssued: true,
        stopped: true,
        observationId: observation.observationId,
        observationHash: observation.observationHash,
        requestId: observation.requestId,
        programId: observation.programId,
        programHash: observation.programHash,
        driverPid: observation.driverPid,
        driverIdentityHash: observation.driverIdentityHash,
        driverObservationEvidenceMode:
          "MIGRATION_ONLY_PAUSED_BEFORE_USER_CODE_V1",
        productionExecutionClaimed: false,
        providerOperationClaimed: false,
        stoppedObservedAt: clockValue(clock),
        journalEventCount: projection.eventCount,
        journalHeadHash: projection.journalHeadHash,
        stopAuthorizationEvidenceHash: input.stopAuthorizationEvidenceHash,
        processScanMatchedDriverCount: 0,
        legacyWriterRestartStillForbidden: true,
      };
      const record = { ...body, leaseHash: digest(body.schema, body) };
      writeOnce(leaseFile(root, observation.programId), record);
      return Object.freeze({ ...record });
    },

    async replayStoppedDriverLease(expected = {}) {
      identifier(expected.requestId, "REQUEST_ID_INVALID");
      identifier(expected.programId, "PROGRAM_ID_INVALID");
      hash(expected.programHash, "PROGRAM_HASH_INVALID");
      hash(expected.leaseHash, "LEASE_HASH_INVALID");
      hash(expected.journalHeadHash, "JOURNAL_HEAD_HASH_INVALID");
      if (!Number.isSafeInteger(expected.journalEventCount)
        || expected.journalEventCount < 1
        || typeof expected.interventionStarted !== "boolean") {
        fail("JOURNAL_EVENT_COUNT_OR_REPLAY_MODE_INVALID");
      }
      const lease = readPrivate(leaseFile(root, expected.programId),
        "STOPPED_DRIVER_LEASE");
      const body = Object.fromEntries(Object.entries(lease)
        .filter(([key]) => key !== "leaseHash"));
      if (lease.schema !== LEASE_SCHEMA
        || lease.leaseHash !== digest(lease.schema, body)
        || lease.leaseHash !== expected.leaseHash
        || lease.requestId !== expected.requestId
        || lease.programId !== expected.programId
        || lease.programHash !== expected.programHash
        || lease.journalEventCount !== expected.journalEventCount
        || lease.journalHeadHash !== expected.journalHeadHash
        || lease.moduleIssued !== true || lease.stopped !== true) {
        fail("STOPPED_DRIVER_LEASE_REPLAY_MISMATCH");
      }
      const active = await scan(lease.requestId);
      if (active.length !== 0) fail("LEGACY_DRIVER_RESTARTED");
      const projection = checkedProjection(
        await options.inspectProgram(lease.programId), lease);
      const freshHeadRequired = expected.interventionStarted === false;
      if ((freshHeadRequired
          && (projection.eventCount !== lease.journalEventCount
            || projection.journalHeadHash !== lease.journalHeadHash
            || projection.state !== "PAUSED_RETRYABLE"))
        || (!freshHeadRequired
          && !["PAUSED_RETRYABLE", "FAILED_CLOSED"].includes(
            projection.state))) {
        fail("STOPPED_DRIVER_LEASE_JOURNAL_MOVED");
      }
      return Object.freeze({ ...lease });
    },
  });
}
