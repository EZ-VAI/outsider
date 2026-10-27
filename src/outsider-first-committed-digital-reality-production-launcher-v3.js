/*
 * Versioned first-reality launcher descendant adding a narrow, explicitly
 * confirmed emergency fail-close path to the unchanged v2 composition.
 *
 * Emergency flow is deliberately separate from original outcome authority:
 *   observe exact live legacy driver -> stop it -> issue stopped lease
 *   -> emergency proposal -> exact emergency confirmation -> fail-close
 *
 * The stopped lease is replayed immediately before journal append. Ordinary
 * goal/proposal/confirmation/resume behavior remains delegated to v2.
 */

import { createHash } from "node:crypto";
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
import { createDurableOutcomeEmergencyFailCloseV1,
  prepareDurableOutcomeEmergencyFailCloseRequestV1 }
  from "./outsider-durable-outcome-emergency-fail-close-v1.js";
import { createFirstCommittedDigitalRealityProductionLauncherV2,
  OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V2 }
  from "./outsider-first-committed-digital-reality-production-launcher-v2.js";
import { createLegacyProductionDriverStopHandoffV1 }
  from "./outsider-legacy-production-driver-stop-handoff-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";

const PREFIX = "OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_LAUNCHER_V3_";
const CREDENTIALS_SCHEMA
  = "outsider/first-committed-digital-reality-production-credentials/v2";
const EMERGENCY_REQUEST_RECORD_SCHEMA
  = "outsider/first-reality-emergency-fail-close-proposal-record/v1";
const EMERGENCY_AUTHORIZATION_SCHEMA
  = "outsider/first-reality-emergency-fail-close-authorization/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

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

function clockValue(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("CLOCK_RESULT_INVALID");
  return value;
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
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  syncDirectory(path.dirname(file));
}

function privateJson(file, code) {
  let metadata;
  try { metadata = lstatSync(file); } catch { fail(`${code}_MISSING`); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 2 || metadata.size > 1024 * 1024) {
    fail(`${code}_NOT_PRIVATE_REGULAR_FILE`);
  }
  const bytes = readFileSync(file);
  if (bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_INVALID_JSON`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function recordFile(directory, requestId, suffix) {
  const name = createHash("sha256").update(requestId, "utf8").digest("hex");
  return path.join(directory, `${name}.${suffix}.json`);
}

function interventionFile(directory, interventionId, suffix) {
  const name = createHash("sha256").update(interventionId, "utf8")
    .digest("hex");
  return path.join(directory, `${name}.${suffix}.json`);
}

function validateCredentialReadiness(profileDirectory) {
  const credentials = privateJson(path.join(profileDirectory,
    OUTSIDER_FIRST_COMMITTED_REALITY_CREDENTIALS_FILE_V2),
  "CREDENTIALS_FILE");
  const github = credentials.githubReleaseAsset;
  if (credentials.schema !== CREDENTIALS_SCHEMA
    || credentials.cloudflare === null
    || typeof credentials.cloudflare !== "object"
    || typeof credentials.cloudflare.apiToken !== "string"
    || credentials.cloudflare.apiToken.length < 20
    || github === null || typeof github !== "object"
    || typeof github.contentsWriteApiToken !== "string"
    || github.contentsWriteApiToken.length < 20
    || typeof github.administrationReadApiToken !== "string"
    || github.administrationReadApiToken.length < 20
    || github.contentsWriteApiToken !== github.administrationReadApiToken
    || github.administrationReadCapabilityConfirmed !== true
    || credentials.uptimeRobot === null
    || typeof credentials.uptimeRobot !== "object"
    || typeof credentials.uptimeRobot.apiToken !== "string"
    || credentials.uptimeRobot.apiToken.length < 1
    || /\s/u.test(credentials.uptimeRobot.apiToken)
    || typeof credentials.uptimeRobot.expiresAt !== "string"
    || !Number.isFinite(Date.parse(credentials.uptimeRobot.expiresAt))
    || new Date(credentials.uptimeRobot.expiresAt).toISOString()
      !== credentials.uptimeRobot.expiresAt) {
    fail("CREDENTIALS_FILE_INVALID");
  }
}

/** V3 adds emergency controls without changing any v1/v2 program artifact. */
export function createFirstCommittedDigitalRealityProductionLauncherV3(
  input = {}) {
  if (input === null || typeof input !== "object"
    || typeof input.profileDirectory !== "string"
    || input.profileDirectory.length < 1
    || typeof input.runtimeDirectory !== "string"
    || input.runtimeDirectory.length < 1) fail("INPUT_INVALID");
  let profileDirectory;
  try { profileDirectory = realpathSync(path.resolve(input.profileDirectory)); }
  catch { fail("PROFILE_DIRECTORY_MISSING"); }
  const processProfileDirectory = path.resolve(input.profileDirectory);
  const runtimeDirectory = path.resolve(input.runtimeDirectory);
  const clock = input.clock ?? (() => new Date().toISOString());
  if (typeof clock !== "function") fail("CLOCK_INVALID");
  const base = createFirstCommittedDigitalRealityProductionLauncherV2(input);
  const requestsDirectory = path.join(runtimeDirectory, "requests");
  const emergencyRoot = path.join(runtimeDirectory,
    "emergency-fail-close-control-v1");
  const emergencyRequests = path.join(emergencyRoot, "requests");
  const emergencyAuthorizations = path.join(emergencyRoot, "authorizations");
  for (const directory of [emergencyRoot, emergencyRequests,
    emergencyAuthorizations]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  function outcomeConfirmationReplay({ requestId, programId, programHash },
    { requireCredentials = true } = {}) {
    const proposal = base.proposal(requestId);
    if (proposal.programId !== programId
      || proposal.programHash !== programHash) fail("PROPOSAL_REPLAY_MISMATCH");
    const request = privateJson(recordFile(requestsDirectory, requestId,
      "request"), "REQUEST_RECORD");
    const confirmation = privateJson(recordFile(requestsDirectory, requestId,
      "confirmation"), "CONFIRMATION_RECORD");
    const program = verifyOutcomeProgramV1(request.program);
    if (request.schema !== "outsider/private-outcome-request/v1"
      || program.orderId !== requestId || program.programId !== programId
      || program.programHash !== programHash
      || confirmation.schema !== "outsider/outcome-confirmation/v1"
      || confirmation.requestId !== requestId
      || confirmation.proposalId !== request.proposalId
      || confirmation.programHash !== programHash) {
      fail("CONFIRMATION_REPLAY_MISMATCH");
    }
    if (requireCredentials) validateCredentialReadiness(profileDirectory);
    return { confirmed: true, requestId, programId, programHash };
  }

  const stopHandoff = createLegacyProductionDriverStopHandoffV1({
    directory: path.join(emergencyRoot, "legacy-driver-stop-handoff"),
    profileDirectory: processProfileDirectory,
    runtimeDirectory,
    clock,
    inspectProgram: (programId) => base.inspectProgram(programId),
    ...(input.legacyDriverProcessScan === undefined ? {}
      : { processScan: input.legacyDriverProcessScan }),
  });

  function assertNormalExecutionNotStopped(requestId) {
    const proposal = base.proposal(requestId);
    if (stopHandoff.stoppedLeaseExists(proposal.programId)) {
      fail("STOP_HANDOFF_ACTIVE_NORMAL_EXECUTION_FORBIDDEN");
    }
  }

  function readEmergencyRequest(interventionId) {
    const record = privateJson(interventionFile(emergencyRequests,
      interventionId, "request"), "EMERGENCY_REQUEST_RECORD");
    const prepared = prepareDurableOutcomeEmergencyFailCloseRequestV1(
      record.request);
    if (record.schema !== EMERGENCY_REQUEST_RECORD_SCHEMA
      || record.emergencyRequestHash !== prepared.requestHash
      || record.interventionId !== interventionId) {
      fail("EMERGENCY_REQUEST_RECORD_INVALID");
    }
    return { record, prepared };
  }

  const emergency = createDurableOutcomeEmergencyFailCloseV1({
    directory: path.join(runtimeDirectory, "executions"),
    clock,
    outcomeConfirmationReplay(inputValue) {
      return outcomeConfirmationReplay(inputValue);
    },
    stoppedDriverLeaseReplay(expected) {
      return stopHandoff.replayStoppedDriverLease(expected);
    },
    writerExclusionReplay(expected) {
      return stopHandoff.assertNoLegacyWriter(expected);
    },
    emergencyAuthorizationReplay(expected) {
      const authorization = privateJson(interventionFile(
        emergencyAuthorizations, expected.interventionId, "authorization"),
      "EMERGENCY_AUTHORIZATION_RECORD");
      const body = Object.fromEntries(Object.entries(authorization)
        .filter(([key]) => key !== "authorizationHash"));
      if (authorization.schema !== EMERGENCY_AUTHORIZATION_SCHEMA
        || authorization.authorizationHash
          !== digest(authorization.schema, body)
        || authorization.authorized !== true
        || authorization.moduleIssued !== true) {
        fail("EMERGENCY_AUTHORIZATION_RECORD_INVALID");
      }
      return authorization;
    },
    resumeProgram({ requestId, runOptions }) {
      return base.resumeConfirmed(requestId, runOptions);
    },
    ...(input.emergencyJournalWriteChunk === undefined ? {}
      : { writeJournalChunk: input.emergencyJournalWriteChunk }),
  });

  return Object.freeze({
    requestOutcome(request) { return base.requestOutcome(request); },
    proposal(requestId) { return base.proposal(requestId); },
    confirmOutcome(confirmation, runOptions = {}) {
      assertNormalExecutionNotStopped(confirmation?.requestId);
      return base.confirmOutcome(confirmation, runOptions);
    },
    confirmAndDrive(confirmation, runOptions = {}) {
      assertNormalExecutionNotStopped(confirmation?.requestId);
      return base.confirmAndDrive(confirmation, runOptions);
    },
    resumeConfirmed(requestId, runOptions = {}) {
      assertNormalExecutionNotStopped(requestId);
      return base.resumeConfirmed(requestId, runOptions);
    },
    inspectProgram(programId) { return base.inspectProgram(programId); },
    observeLegacyDriver(inputValue) {
      outcomeConfirmationReplay(inputValue, { requireCredentials: false });
      return stopHandoff.observeLiveDriver(inputValue);
    },
    finalizeStoppedDriver(inputValue) {
      return stopHandoff.finalizeStoppedDriver(inputValue);
    },
    async requestEmergencyFailClose(inputValue) {
      const prepared = prepareDurableOutcomeEmergencyFailCloseRequestV1(
        inputValue);
      const { request, requestHash } = prepared;
      outcomeConfirmationReplay(request);
      await stopHandoff.replayStoppedDriverLease({
        leaseHash: request.stoppedDriverLeaseHash,
        requestId: request.requestId,
        programId: request.programId,
        programHash: request.programHash,
        journalEventCount: request.expectedEventCount,
        journalHeadHash: request.expectedJournalHeadHash,
        interventionStarted: false,
      });
      const projection = base.inspectProgram(request.programId);
      if (projection.state !== "PAUSED_RETRYABLE"
        || projection.eventCount !== request.expectedEventCount
        || projection.journalHeadHash !== request.expectedJournalHeadHash
        || projection.retry?.subjectId !== request.blockedNodeId
        || projection.retry?.operationId !== request.blockedOperationId
        || projection.retry?.observationOccurrence
          !== request.blockedObservationOccurrence
        || projection.retry?.reason !== request.blockedReason) {
        fail("EMERGENCY_PRECONDITION_MISMATCH");
      }
      const file = interventionFile(emergencyRequests,
        request.interventionId, "request");
      const record = {
        schema: EMERGENCY_REQUEST_RECORD_SCHEMA,
        schemaVersion: "1.0.0",
        interventionId: request.interventionId,
        emergencyRequestHash: requestHash,
        requestedAt: clockValue(clock),
        request,
      };
      if (existsSync(file)) {
        const existing = readEmergencyRequest(request.interventionId).record;
        if (existing.emergencyRequestHash !== requestHash) {
          fail("INTERVENTION_ID_REUSED");
        }
      } else {
        writeOnce(file, record);
      }
      return Object.freeze({
        schema: "outsider/public-first-reality-emergency-fail-close-proposal/v1",
        schemaVersion: "1.0.0",
        interventionId: request.interventionId,
        requestId: request.requestId,
        programId: request.programId,
        programHash: request.programHash,
        emergencyRequestHash: requestHash,
        expectedEventCount: request.expectedEventCount,
        expectedJournalHeadHash: request.expectedJournalHeadHash,
        stoppedDriverLeaseHash: request.stoppedDriverLeaseHash,
        witnessSuccessAsserted: false,
        confirmationRequired: true,
        nextAction: "CONFIRM_EMERGENCY_FAIL_CLOSE_ONCE",
      });
    },
    async confirmEmergencyFailClose(inputValue, runOptions = {}) {
      if (inputValue === null || typeof inputValue !== "object"
        || canonicalizeStrict(Object.keys(inputValue).sort())
          !== canonicalizeStrict(["authorizationEvidenceHash",
            "emergencyRequestHash", "interventionId"].sort())
        || typeof inputValue.interventionId !== "string"
        || !IDENTIFIER.test(inputValue.interventionId)
        || typeof inputValue.emergencyRequestHash !== "string"
        || !HASH.test(inputValue.emergencyRequestHash)
        || typeof inputValue.authorizationEvidenceHash !== "string"
        || !HASH.test(inputValue.authorizationEvidenceHash)) {
        fail("EMERGENCY_CONFIRMATION_INVALID");
      }
      const { record, prepared } = readEmergencyRequest(
        inputValue.interventionId);
      if (prepared.requestHash !== inputValue.emergencyRequestHash) {
        fail("EMERGENCY_CONFIRMATION_HASH_MISMATCH");
      }
      const request = prepared.request;
      outcomeConfirmationReplay(request);
      const file = interventionFile(emergencyAuthorizations,
        request.interventionId, "authorization");
      await stopHandoff.assertNoLegacyWriter({
        leaseHash: request.stoppedDriverLeaseHash,
        requestId: request.requestId,
        programId: request.programId,
        programHash: request.programHash,
      });
      let authorization;
      if (existsSync(file)) {
        const existing = privateJson(file, "EMERGENCY_AUTHORIZATION_RECORD");
        const existingBody = Object.fromEntries(Object.entries(existing)
          .filter(([key]) => key !== "authorizationHash"));
        if (existing.schema !== EMERGENCY_AUTHORIZATION_SCHEMA
          || existing.authorizationHash !== digest(existing.schema,
            existingBody)
          || existing.emergencyRequestHash !== prepared.requestHash
          || existing.interventionId !== request.interventionId
          || existing.authorizationEvidenceHash
            !== inputValue.authorizationEvidenceHash) {
          fail("EMERGENCY_CONFIRMATION_REPLAY_MISMATCH");
        }
        authorization = existing;
      } else {
        const body = {
          schema: EMERGENCY_AUTHORIZATION_SCHEMA,
          schemaVersion: "1.0.0",
          authorized: true,
          moduleIssued: true,
          interventionId: request.interventionId,
          requestId: request.requestId,
          programId: request.programId,
          programHash: request.programHash,
          emergencyRequestHash: prepared.requestHash,
          journalEventCount: request.expectedEventCount,
          journalHeadHash: request.expectedJournalHeadHash,
          stoppedDriverLeaseHash: request.stoppedDriverLeaseHash,
          authorizationEvidenceHash: inputValue.authorizationEvidenceHash,
          authorizedAt: clockValue(clock),
          proposalRequestedAt: record.requestedAt,
        };
        authorization = { ...body,
          authorizationHash: digest(body.schema, body) };
        writeOnce(file, authorization);
      }
      return emergency.failClose(request, runOptions);
    },
  });
}
