/*
 * Append-only emergency fail-close control for an already-confirmed and
 * committed durable OutcomeProgram.
 *
 * This module is deliberately not a second orchestrator. It appends one
 * truthful intervention batch to the existing v1 journal, then asks the
 * original orchestrator to resume. The original orchestrator therefore owns
 * every provider close/release call and reuses its deterministic operationId
 * values, including after a process restart.
 *
 * The control never writes a witness completion. A durable operator/product
 * defect record and non-zero operations telemetry are appended before
 * CLOSURE_STARTED one fsynced event at a time, so the episode cannot retain
 * zeroInternalOpsObserved or become PROGRAM_SUCCEEDED.
 *
 * Concurrency boundary: the v1 orchestrator predates a cross-process lock.
 * The caller must stop that writer first and bind evidence of doing so. Exact
 * journal head/count preconditions prevent a stale, accidental invocation,
 * but cannot substitute for a lock that the old writer does not observe.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS }
  from "./outsider-durable-outcome-program-orchestrator-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";

const PREFIX = "OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_";
const REQUEST_SCHEMA
  = "outsider/durable-outcome-emergency-fail-close-request/v1";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const TERMINAL_EVENTS = new Set([
  "PROGRAM_UNAVAILABLE",
  "PROGRAM_SUCCEEDED",
  "PROGRAM_FAILED_CLOSED",
]);
const EMERGENCY_CLEANUP_EVENTS = new Set([
  "OBLIGATION_CLOSE_REQUESTED",
  "OBLIGATION_CLOSE_PROGRESS",
  "OBLIGATION_CLOSED",
  "RESERVATION_RELEASE_REQUESTED",
  "RESERVATION_RELEASED",
  "PROGRAM_FAILED_CLOSED",
]);
const REQUEST_FIELDS = Object.freeze([
  "blockedNodeId",
  "blockedObservationOccurrence",
  "blockedOperationId",
  "blockedReason",
  "diagnosisEvidenceHash",
  "expectedEventCount",
  "expectedJournalHeadHash",
  "interventionId",
  "productDefectCode",
  "programHash",
  "programId",
  "requestId",
  "schema",
  "schemaVersion",
  "stoppedDriverLeaseHash",
]);

export const OUTSIDER_DURABLE_OUTCOME_EMERGENCY_FAIL_CLOSE_V1_SCHEMA
  = REQUEST_SCHEMA;

function fail(code, detail = null) {
  const error = new TypeError(detail === null
    ? `${PREFIX}${code}` : `${PREFIX}${code}:${detail}`);
  error.outsiderCode = code;
  throw error;
}

function snapshot(value, code = "VALUE_NOT_CANONICAL") {
  try { return JSON.parse(canonicalizeStrict(value)); }
  catch { fail(code); }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8")
    .digest("hex")}`;
}

function operationId(programHash, phase, subject) {
  return `op_${createHash("sha256")
    .update(`${programHash}\0${phase}\0${subject}`, "utf8")
    .digest("hex").slice(0, 40)}`;
}

function assertIdentifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(code);
  return value;
}

function assertHash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function assertInstant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function normalizedRequest(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || canonicalizeStrict(Object.keys(input).sort())
      !== canonicalizeStrict([...REQUEST_FIELDS].sort())
    || input.schema !== REQUEST_SCHEMA || input.schemaVersion !== "1.0.0") {
    fail("REQUEST_INVALID");
  }
  if (!Number.isSafeInteger(input.expectedEventCount)
    || input.expectedEventCount < 1
    || !Number.isSafeInteger(input.blockedObservationOccurrence)
    || input.blockedObservationOccurrence < 1
    || typeof input.blockedReason !== "string"
    || input.blockedReason.length < 1
    || Buffer.byteLength(input.blockedReason, "utf8") > 256) {
    fail("REQUEST_INVALID");
  }
  assertIdentifier(input.interventionId, "INTERVENTION_ID_INVALID");
  assertIdentifier(input.requestId, "REQUEST_ID_INVALID");
  assertIdentifier(input.programId, "PROGRAM_ID_INVALID");
  assertIdentifier(input.blockedNodeId, "BLOCKED_NODE_ID_INVALID");
  assertIdentifier(input.blockedOperationId, "BLOCKED_OPERATION_ID_INVALID");
  assertIdentifier(input.productDefectCode, "PRODUCT_DEFECT_CODE_INVALID");
  assertHash(input.programHash, "PROGRAM_HASH_INVALID");
  assertHash(input.expectedJournalHeadHash, "EXPECTED_HEAD_HASH_INVALID");
  assertHash(input.diagnosisEvidenceHash, "DIAGNOSIS_EVIDENCE_HASH_INVALID");
  assertHash(input.stoppedDriverLeaseHash,
    "STOPPED_DRIVER_LEASE_HASH_INVALID");
  return snapshot(input, "REQUEST_NOT_CANONICAL");
}

export function prepareDurableOutcomeEmergencyFailCloseRequestV1(input) {
  const request = normalizedRequest(input);
  return Object.freeze({
    request: Object.freeze(request),
    requestHash: digest(REQUEST_SCHEMA, request),
  });
}

function journalFile(directory, programId) {
  const name = createHash("sha256").update(programId, "utf8").digest("hex");
  return path.join(directory, `${name}.events.jsonl`);
}

function checkedJournalFile(directory, programId) {
  const file = journalFile(directory, programId);
  if (!existsSync(file)) fail("PROGRAM_NOT_FOUND");
  let metadata;
  try { metadata = lstatSync(file); } catch { fail("JOURNAL_STAT_FAILED"); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600 || metadata.size < 1) {
    fail("JOURNAL_NOT_PRIVATE_REGULAR_FILE");
  }
  return Object.freeze({ file, device: metadata.dev, inode: metadata.ino });
}

function verifyEvent(event, sequence, previousEventHash) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    fail("JOURNAL_EVENT_INVALID");
  }
  const body = {
    schema: event.schema,
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    previousEventHash: event.previousEventHash,
    recordedAt: event.recordedAt,
    eventType: event.eventType,
    payload: event.payload,
  };
  if (body.schema
      !== OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS.journalEvent
    || body.schemaVersion !== "1.0.0" || body.sequence !== sequence
    || body.previousEventHash !== previousEventHash
    || typeof body.eventType !== "string" || body.eventType.length < 1) {
    fail("JOURNAL_CHAIN_INVALID");
  }
  assertInstant(body.recordedAt, "JOURNAL_RECORDED_AT_INVALID");
  if (event.eventHash !== digest(body.schema, body)) {
    fail("JOURNAL_EVENT_HASH_INVALID");
  }
  return snapshot(event, "JOURNAL_EVENT_NOT_CANONICAL");
}

function readJournal(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 2 || bytes[bytes.length - 1] !== 0x0a) {
    fail("JOURNAL_PARTIAL_TAIL");
  }
  const lines = bytes.toString("utf8").slice(0, -1).split("\n");
  const events = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { fail("JOURNAL_JSON_INVALID"); }
    const checked = verifyEvent(event, index + 1, previous);
    events.push(checked);
    previous = checked.eventHash;
  }
  return events;
}

function readJournalState(file) {
  const bytes = readFileSync(file);
  if (bytes.length < 1) fail("JOURNAL_EMPTY");
  const newline = bytes.lastIndexOf(0x0a);
  const completeBytes = newline < 0 ? Buffer.alloc(0)
    : bytes.subarray(0, newline + 1);
  const partialTail = bytes.subarray(newline + 1);
  if (completeBytes.length === 0) {
    return { events: [], completeByteLength: 0,
      partialTail: Buffer.from(partialTail) };
  }
  const lines = completeBytes.toString("utf8").slice(0, -1).split("\n");
  const events = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { fail("JOURNAL_JSON_INVALID"); }
    const checked = verifyEvent(event, index + 1, previous);
    events.push(checked);
    previous = checked.eventHash;
  }
  return { events, completeByteLength: completeBytes.length,
    partialTail: Buffer.from(partialTail) };
}

function pendingIntentFile(directory, programId, sequence) {
  const key = createHash("sha256").update(programId, "utf8").digest("hex");
  return path.join(directory, `${key}.${sequence}.pending.json`);
}

function writePrivateOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset,
        bytes.length - offset);
      if (written < 1) fail("PENDING_INTENT_WRITE_INCOMPLETE");
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let directoryDescriptor;
  try {
    directoryDescriptor = openSync(path.dirname(file), "r");
    fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
}

function readPendingIntent(file) {
  let metadata;
  try { metadata = lstatSync(file); } catch { fail("PENDING_INTENT_MISSING"); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 2 || metadata.size > 256 * 1024) {
    fail("PENDING_INTENT_NOT_PRIVATE_REGULAR_FILE");
  }
  const bytes = readFileSync(file);
  if (bytes.at(-1) !== 0x0a) fail("PENDING_INTENT_PARTIAL");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PENDING_INTENT_INVALID_JSON"); }
  return snapshot(value, "PENDING_INTENT_NOT_CANONICAL");
}

function eventFor(events, eventType, predicate = () => true) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.eventType === eventType && predicate(event.payload)) return event;
  }
  return null;
}

function appendOneEvent(target, events, clock, record, pending,
  writeJournalChunk) {
  let recordedAt;
  try { recordedAt = clock(); } catch { fail("CLOCK_FAILED"); }
  assertInstant(recordedAt, "CLOCK_RESULT_INVALID");
  const body = {
    schema:
      OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS.journalEvent,
    schemaVersion: "1.0.0",
    sequence: events.length + 1,
    previousEventHash: events.at(-1)?.eventHash ?? null,
    recordedAt,
    eventType: record.eventType,
    payload: snapshot(record.payload, "EVENT_PAYLOAD_NOT_CANONICAL"),
  };
  const event = { ...body, eventHash: digest(body.schema, body) };
  const bytes = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
  const intent = {
    schema: "outsider/durable-outcome-emergency-journal-pending-intent/v1",
    schemaVersion: "1.0.0",
    programId: pending.programId,
    interventionId: pending.interventionId,
    emergencyRequestHash: pending.emergencyRequestHash,
    emergencyAuthorizationHash: pending.emergencyAuthorizationHash,
    stoppedDriverLeaseHash: pending.stoppedDriverLeaseHash,
    sequence: event.sequence,
    previousEventHash: event.previousEventHash,
    eventHash: event.eventHash,
    journalDevice: String(target.device),
    journalInode: String(target.inode),
    journalOffset: lstatSync(target.file).size,
    eventByteLength: bytes.length,
    eventBytesHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    eventBytesBase64: bytes.toString("base64"),
  };
  const intentPath = pendingIntentFile(pending.directory,
    pending.programId, event.sequence);
  if (existsSync(intentPath)) {
    if (canonicalizeStrict(readPendingIntent(intentPath))
      !== canonicalizeStrict(intent)) fail("PENDING_INTENT_CONFLICT");
  } else {
    writePrivateOnce(intentPath, intent);
  }
  let descriptor;
  try {
    descriptor = openSync(target.file,
      constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600
      || metadata.dev !== target.device || metadata.ino !== target.inode) {
      fail("JOURNAL_FILE_CHANGED_BEFORE_APPEND");
    }
    if (metadata.size !== intent.journalOffset) {
      fail("JOURNAL_OFFSET_CHANGED_BEFORE_APPEND");
    }
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeJournalChunk(descriptor, bytes, offset,
        bytes.length - offset);
      if (written < 1) fail("JOURNAL_APPEND_INCOMPLETE");
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const replay = readJournal(target.file);
  const actual = replay[events.length];
  if (canonicalizeStrict(actual) !== canonicalizeStrict(event)) {
    fail("JOURNAL_CONCURRENT_WRITER_DETECTED");
  }
  return replay;
}

function recoverPendingTail(target, state, pending, writeJournalChunk) {
  const sequence = state.events.length + 1;
  const intentPath = pendingIntentFile(pending.directory,
    pending.programId, sequence);
  if (state.partialTail.length === 0 && !existsSync(intentPath)) {
    return state.events;
  }
  const intent = readPendingIntent(intentPath);
  const encoded = Buffer.from(intent.eventBytesBase64 ?? "", "base64");
  const encodedHash
    = `sha256:${createHash("sha256").update(encoded).digest("hex")}`;
  if (intent.schema
      !== "outsider/durable-outcome-emergency-journal-pending-intent/v1"
    || intent.schemaVersion !== "1.0.0"
    || intent.programId !== pending.programId
    || intent.interventionId !== pending.interventionId
    || intent.emergencyRequestHash !== pending.emergencyRequestHash
    || intent.emergencyAuthorizationHash
      !== pending.emergencyAuthorizationHash
    || intent.stoppedDriverLeaseHash !== pending.stoppedDriverLeaseHash
    || intent.sequence !== sequence
    || intent.previousEventHash !== (state.events.at(-1)?.eventHash ?? null)
    || intent.journalDevice !== String(target.device)
    || intent.journalInode !== String(target.inode)
    || intent.journalOffset !== state.completeByteLength
    || intent.eventByteLength !== encoded.length
    || intent.eventBytesHash !== encodedHash
    || encoded.toString("base64") !== intent.eventBytesBase64
    || state.partialTail.length >= encoded.length
    || !encoded.subarray(0, state.partialTail.length).equals(
      state.partialTail)) {
    fail("PENDING_INTENT_PARTIAL_TAIL_MISMATCH");
  }
  let pendingEvent;
  try {
    pendingEvent = JSON.parse(encoded.toString("utf8").slice(0, -1));
  } catch { fail("PENDING_INTENT_EVENT_INVALID_JSON"); }
  const checked = verifyEvent(pendingEvent, sequence,
    state.events.at(-1)?.eventHash ?? null);
  if (checked.eventHash !== intent.eventHash
    || encoded.at(-1) !== 0x0a) fail("PENDING_INTENT_EVENT_INVALID");
  let descriptor;
  try {
    descriptor = openSync(target.file,
      constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600
      || metadata.dev !== target.device || metadata.ino !== target.inode
      || metadata.size !== state.completeByteLength
        + state.partialTail.length) {
      fail("JOURNAL_CHANGED_BEFORE_PARTIAL_RECOVERY");
    }
    let offset = state.partialTail.length;
    while (offset < encoded.length) {
      const written = writeJournalChunk(descriptor, encoded, offset,
        encoded.length - offset);
      if (written < 1) fail("JOURNAL_PARTIAL_RECOVERY_INCOMPLETE");
      offset += written;
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const replay = readJournal(target.file);
  if (replay[sequence - 1]?.eventHash !== intent.eventHash) {
    fail("JOURNAL_PARTIAL_RECOVERY_REPLAY_MISMATCH");
  }
  return replay;
}

function acceptedProgram(events) {
  const accepted = eventFor(events, "PROGRAM_ACCEPTED");
  if (accepted === null) fail("PROGRAM_ACCEPTED_EVENT_MISSING");
  const program = verifyOutcomeProgramV1(accepted.payload?.program);
  if (program.programHash !== accepted.payload?.program?.programHash) {
    fail("PROGRAM_REPLAY_INVALID");
  }
  return program;
}

function latestOpenInconclusive(events) {
  const inconclusive = eventFor(events, "NODE_WITNESS_INCONCLUSIVE");
  if (inconclusive === null) return null;
  const completed = eventFor(events, "NODE_WITNESS_COMPLETED", (payload) =>
    payload?.nodeId === inconclusive.payload?.nodeId);
  if (completed !== null && completed.sequence > inconclusive.sequence) {
    return null;
  }
  return inconclusive;
}

function interventionPayload(request, requestHash, authorization, stopLease) {
  return {
    interventionId: request.interventionId,
    requestHash,
    requestId: request.requestId,
    programId: request.programId,
    programHash: request.programHash,
    authorizedAt: authorization.authorizedAt,
    authorizationEvidenceHash: authorization.authorizationEvidenceHash,
    emergencyAuthorizationHash: authorization.authorizationHash,
    diagnosisEvidenceHash: request.diagnosisEvidenceHash,
    stoppedDriverLeaseHash: stopLease.leaseHash,
    stoppedDriverLease: {
      issuedByModule: true,
      driverIdentityHash: stopLease.driverIdentityHash,
      stoppedObservedAt: stopLease.stoppedObservedAt,
      journalEventCount: stopLease.journalEventCount,
      journalHeadHash: stopLease.journalHeadHash,
    },
    expectedPreInterventionJournal: {
      eventCount: request.expectedEventCount,
      headHash: request.expectedJournalHeadHash,
    },
    productDefect: {
      confirmed: true,
      code: request.productDefectCode,
      blockedNodeId: request.blockedNodeId,
      blockedOperationId: request.blockedOperationId,
      blockedObservationOccurrence: request.blockedObservationOccurrence,
      blockedReason: request.blockedReason,
    },
    operatorIntervention: {
      occurred: true,
      minimumOutsiderStaffTouchCount: 1,
      exactOutsiderStaffTouchCountKnown: false,
      humanQueueCreated: false,
      zeroTouchMilestoneFailed: true,
    },
    truthBoundary: {
      witnessSuccessAsserted: false,
      witnessCompletionEventWritten: false,
      outcomeSuccessAsserted: false,
      adapterDefectIsIndependentOutcomeEvidence: false,
    },
    concurrencyBoundary:
      "MODULE_ISSUED_STOP_HANDOFF_BOUND_TO_EXACT_LEGACY_JOURNAL_HEAD_V1",
  };
}

function validateExistingIntervention(events, request, requestHash) {
  const existing = eventFor(events, "EMERGENCY_FAIL_CLOSE_REQUESTED_V1");
  if (existing === null) return null;
  if (existing.payload?.interventionId !== request.interventionId
    || existing.payload?.requestHash !== requestHash
    || existing.payload?.programHash !== request.programHash) {
    fail("DIFFERENT_INTERVENTION_ALREADY_RECORDED");
  }
  return existing;
}

function validateInterventionDescendant(events, intervention, request,
  requestHash, authorization, program) {
  if (intervention.payload?.interventionId !== request.interventionId
    || intervention.payload?.requestHash !== requestHash
    || intervention.payload?.requestId !== request.requestId
    || intervention.payload?.programId !== request.programId
    || intervention.payload?.programHash !== request.programHash
    || intervention.payload?.emergencyAuthorizationHash
      !== authorization.authorizationHash
    || intervention.payload?.authorizationEvidenceHash
      !== authorization.authorizationEvidenceHash
    || intervention.payload?.stoppedDriverLeaseHash
      !== request.stoppedDriverLeaseHash
    || intervention.payload?.truthBoundary?.witnessSuccessAsserted !== false
    || intervention.payload?.truthBoundary?.witnessCompletionEventWritten
      !== false
    || intervention.payload?.truthBoundary?.outcomeSuccessAsserted !== false
    || intervention.payload?.operatorIntervention?.occurred !== true
    || intervention.payload?.operatorIntervention
      ?.minimumOutsiderStaffTouchCount !== 1) {
    fail("INTERVENTION_PROVENANCE_INVALID");
  }
  const tail = events.slice(intervention.sequence);
  let cursor = 0;
  if (tail.length > 0
    && tail[cursor]?.eventType !== "ZERO_INTERNAL_OPS_TELEMETRY") {
    fail("INTERVENTION_DESCENDANT_TELEMETRY_MISSING");
  }
  if (tail[cursor]?.eventType === "ZERO_INTERNAL_OPS_TELEMETRY") {
    const telemetry = tail[cursor].payload;
    if (telemetry?.outsiderStaffTouchCount !== null
      || telemetry?.minimumOutsiderStaffTouchCount !== 1
      || telemetry?.exactOutsiderStaffTouchCountKnown !== false
      || telemetry?.measurementObserved !== false
      || telemetry?.zeroInternalOpsObserved !== false
      || telemetry?.source
        !== "EMERGENCY_OPERATOR_INTERVENTION_PROVEN_COUNT_UNKNOWN_V1") {
      fail("INTERVENTION_DESCENDANT_TELEMETRY_INVALID");
    }
    cursor += 1;
  }
  if (tail.length > cursor
    && tail[cursor]?.eventType !== "CLOSURE_STARTED") {
    fail("INTERVENTION_DESCENDANT_CLOSURE_MISSING");
  }
  let closurePayload = null;
  if (tail[cursor]?.eventType === "CLOSURE_STARTED") {
    const closure = tail[cursor].payload;
    if (closure?.outcomeState !== "FAILED"
      || closure?.detail?.phase !== "OPERATOR_PRODUCT_DEFECT_FAIL_CLOSE"
      || closure?.detail?.interventionId !== request.interventionId
      || closure?.detail?.productDefectCode !== request.productDefectCode
      || closure?.detail?.diagnosisEvidenceHash
        !== request.diagnosisEvidenceHash
      || closure?.detail?.witnessSuccessAsserted !== false) {
      fail("INTERVENTION_DESCENDANT_CLOSURE_INVALID");
    }
    closurePayload = closure;
    cursor += 1;
  }
  const prefix = events.slice(0, intervention.sequence - 1);
  const requirementIndex = new Map(program.requirements.map((value, index) =>
    [value.requirementId, index]));
  const obligationIndex = new Map(program.obligations.map((value, index) =>
    [value.obligationId, index]));
  const bindingFor = (requirementId) => eventFor(prefix, "ADAPTER_BOUND",
    (payload) => payload?.requirementId === requirementId)?.payload ?? null;
  const reserved = new Set(prefix.filter((event) =>
    event.eventType === "RESERVATION_CONFIRMED")
    .map((event) => event.payload?.requirementId));
  const obligationRequested = new Set();
  const obligationClosed = new Set(prefix.filter((event) =>
    event.eventType === "OBLIGATION_CLOSED")
    .map((event) => event.payload?.obligationId));
  const releaseRequested = new Set();
  const released = new Set(prefix.filter((event) =>
    event.eventType === "RESERVATION_RELEASED")
    .map((event) => event.payload?.requirementId));
  const obligationApplies = (obligation) => {
    if (["ON_SUCCESS", "OUTCOME_SUCCEEDED"].includes(obligation.trigger)) {
      return false;
    }
    if (["ON_FAILURE", "OUTCOME_FAILED"].includes(obligation.trigger)) {
      return true;
    }
    if (obligation.trigger !== "AFTER_NODE") return true;
    const nodeId = obligation.nodeId;
    const witness = eventFor(prefix, "NODE_WITNESS_COMPLETED", (payload) =>
      payload?.nodeId === nodeId)?.payload?.observation?.status ?? null;
    const routeStatus = (route) => eventFor(prefix,
      "NODE_EFFECT_COMPLETED", (payload) => payload?.nodeId === nodeId
        && payload?.route === route)?.payload?.result?.status ?? null;
    return witness === "SATISFIED" || witness === "NOT_SATISFIED"
      || (routeStatus("PRIMARY") === "FAILED"
        && routeStatus("RECOVERY") === "FAILED");
  };
  let lastObligationIndex = -1;
  let lastRequirementIndex = -1;
  let releasePhase = false;
  for (; cursor < tail.length; cursor += 1) {
    const event = tail[cursor];
    if (!EMERGENCY_CLEANUP_EVENTS.has(event.eventType)
      || (event.eventType === "PROGRAM_FAILED_CLOSED"
        && cursor !== tail.length - 1)
      || (event.eventType === "PROGRAM_FAILED_CLOSED"
        && (event.payload?.outcomeState !== "FAILED"
          || event.payload?.zeroInternalOpsObserved !== false))) {
      fail("INTERVENTION_DESCENDANT_EVENT_FORBIDDEN");
    }
    const payload = event.payload;
    if (event.eventType.startsWith("OBLIGATION_")) {
      if (releasePhase) fail("INTERVENTION_CLEANUP_ORDER_INVALID");
      const obligation = program.obligations.find((value) =>
        value.obligationId === payload?.obligationId);
      const index = obligationIndex.get(payload?.obligationId);
      if (obligation === undefined || index < lastObligationIndex
        || obligationClosed.has(obligation.obligationId)) {
        fail("INTERVENTION_OBLIGATION_ID_OR_ORDER_INVALID");
      }
      lastObligationIndex = index;
      const requirementId = obligation.targetRequirementId;
      const expectedOperationId = operationId(program.programHash,
        "CLOSE_OBLIGATION", obligation.obligationId);
      if (event.eventType === "OBLIGATION_CLOSE_REQUESTED") {
        if (obligationRequested.has(obligation.obligationId)
          || payload.requirementId !== requirementId
          || payload.adapterId !== bindingFor(requirementId)?.adapterId
          || payload.operationId !== expectedOperationId) {
          fail("INTERVENTION_OBLIGATION_REQUEST_INVALID");
        }
        obligationRequested.add(obligation.obligationId);
      } else if (event.eventType === "OBLIGATION_CLOSE_PROGRESS") {
        if (!obligationRequested.has(obligation.obligationId)
          || payload.requirementId !== requirementId
          || payload.operationId !== expectedOperationId
          || payload.adapterState === null
          || payload.adapterState === undefined) {
          fail("INTERVENTION_OBLIGATION_PROGRESS_INVALID");
        }
      } else if (event.eventType === "OBLIGATION_CLOSED") {
        const applies = obligationApplies(obligation);
        if (!["CLOSED", "NOT_APPLICABLE"].includes(payload.status)
          || (applies && payload.status !== "CLOSED")
          || (!applies && payload.status !== "NOT_APPLICABLE")
          || (payload.status === "CLOSED"
            && !obligationRequested.has(obligation.obligationId))
          || (payload.status === "NOT_APPLICABLE"
            && payload.receipt !== null)) {
          fail("INTERVENTION_OBLIGATION_CLOSE_INVALID");
        }
        obligationClosed.add(obligation.obligationId);
      }
      continue;
    }
    if (event.eventType.startsWith("RESERVATION_")) {
      releasePhase = true;
      if (obligationClosed.size !== program.obligations.length) {
        fail("INTERVENTION_RELEASE_BEFORE_OBLIGATIONS_CLOSED");
      }
      const requirementId = payload?.requirementId;
      const index = requirementIndex.get(requirementId);
      const expectedOperationId = operationId(program.programHash,
        "RELEASE", requirementId);
      if (index === undefined || index < lastRequirementIndex
        || !reserved.has(requirementId) || released.has(requirementId)) {
        fail("INTERVENTION_RELEASE_ID_OR_ORDER_INVALID");
      }
      lastRequirementIndex = index;
      if (event.eventType === "RESERVATION_RELEASE_REQUESTED") {
        if (releaseRequested.has(requirementId)
          || payload.adapterId !== bindingFor(requirementId)?.adapterId
          || payload.operationId !== expectedOperationId
          || payload.disposition !== "FAILED") {
          fail("INTERVENTION_RELEASE_REQUEST_INVALID");
        }
        releaseRequested.add(requirementId);
      } else if (!releaseRequested.has(requirementId)
        || !["RELEASED", "CLOSED"].includes(payload.status)) {
        fail("INTERVENTION_RELEASE_RESULT_INVALID");
      } else {
        released.add(requirementId);
      }
      continue;
    }
    if (event.eventType === "PROGRAM_FAILED_CLOSED") {
      const everyReservedReleased = [...reserved].every((requirementId) =>
        released.has(requirementId));
      if (obligationClosed.size !== program.obligations.length
        || !everyReservedReleased || closurePayload === null
        || canonicalizeStrict(payload.detail)
          !== canonicalizeStrict(closurePayload.detail)) {
        fail("INTERVENTION_TERMINAL_CLEANUP_INCOMPLETE");
      }
    }
  }
}

function matchingTelemetry(events, intervention) {
  return eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY", (_payload) => true)
    ?.sequence > intervention.sequence
    ? eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY") : null;
}

function matchingClosure(events, intervention) {
  return eventFor(events, "CLOSURE_STARTED", (_payload) => true)?.sequence
    > intervention.sequence ? eventFor(events, "CLOSURE_STARTED") : null;
}

function validateFreshPreconditions(events, request) {
  if (events.length !== request.expectedEventCount
    || events.at(-1)?.eventHash !== request.expectedJournalHeadHash) {
    fail("JOURNAL_PRECONDITION_MISMATCH");
  }
  if (events.some((event) => TERMINAL_EVENTS.has(event.eventType))) {
    fail("PROGRAM_ALREADY_TERMINAL");
  }
  if (eventFor(events, "PROGRAM_COMMITTED") === null) {
    fail("PROGRAM_NOT_COMMITTED");
  }
  if (eventFor(events, "CLOSURE_STARTED") !== null
    || eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY") !== null) {
    fail("CLOSURE_ALREADY_STARTED_OUTSIDE_INTERVENTION");
  }
  const blocked = latestOpenInconclusive(events);
  if (blocked === null
    || blocked.payload?.nodeId !== request.blockedNodeId
    || blocked.payload?.operationId !== request.blockedOperationId
    || blocked.payload?.observationOccurrence
      !== request.blockedObservationOccurrence
    || blocked.payload?.observation?.status !== "INCONCLUSIVE"
    || blocked.payload?.observation?.reason !== request.blockedReason) {
    fail("BLOCKED_WITNESS_PRECONDITION_MISMATCH");
  }
}

function validatePostResume(target, request, intervention, rawResult) {
  const result = snapshot(rawResult, "RESUME_RESULT_NOT_CANONICAL");
  if (result === null || typeof result !== "object"
    || result.programId !== request.programId
    || result.programHash !== request.programHash
    || !["PAUSED_RETRYABLE", "FAILED_CLOSED"].includes(result.state)
    || result.telemetry?.outsiderStaffTouchCount !== null
    || result.telemetry?.zeroInternalOpsObserved !== false) {
    fail("RESUME_RESULT_INVALID");
  }
  const events = readJournal(target.file);
  const durableIntervention = eventFor(events,
    "EMERGENCY_FAIL_CLOSE_REQUESTED_V1");
  if (durableIntervention?.eventHash !== intervention.eventHash
    || eventFor(events, "CLOSURE_STARTED") === null
    || eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY")?.payload
      ?.zeroInternalOpsObserved !== false
    || eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY")?.payload
      ?.minimumOutsiderStaffTouchCount !== 1
    || events.some((event) => event.sequence > intervention.sequence
      && event.eventType === "NODE_WITNESS_COMPLETED"
      && event.payload?.nodeId === request.blockedNodeId)
    || eventFor(events, "PROGRAM_SUCCEEDED") !== null) {
    fail("POST_RESUME_TRUTH_BOUNDARY_VIOLATED");
  }
  const terminal = eventFor(events, "PROGRAM_FAILED_CLOSED");
  if (terminal === null) {
    if (result.state !== "PAUSED_RETRYABLE") {
      fail("POST_RESUME_STATE_MISMATCH");
    }
    return result;
  }
  if (result.state !== "FAILED_CLOSED") fail("POST_RESUME_STATE_MISMATCH");
  const program = acceptedProgram(events);
  for (const obligation of program.obligations) {
    if (eventFor(events, "OBLIGATION_CLOSED", (payload) =>
      payload?.obligationId === obligation.obligationId) === null) {
      fail("TERMINAL_OBLIGATION_NOT_CLOSED");
    }
  }
  const reservedRequirementIds = new Set(events
    .filter((event) => event.eventType === "RESERVATION_CONFIRMED")
    .map((event) => event.payload?.requirementId));
  for (const requirementId of reservedRequirementIds) {
    if (eventFor(events, "RESERVATION_RELEASED", (payload) =>
      payload?.requirementId === requirementId) === null) {
      fail("TERMINAL_RESERVATION_NOT_RELEASED");
    }
  }
  return result;
}

/**
 * Create a fail-close controller over one v1 execution directory.
 *
 * outcomeConfirmationReplay and emergencyAuthorizationReplay are distinct:
 * the original outcome confirmation does not authorize a later fail-close.
 * stoppedDriverLeaseReplay must return a module-issued stop handoff bound to
 * the exact frozen legacy journal head. resumeProgram resumes the original
 * orchestrator/composition rather than implementing provider calls here.
 */
export function createDurableOutcomeEmergencyFailCloseV1(options = {}) {
  if (options === null || typeof options !== "object"
    || typeof options.directory !== "string" || options.directory.length < 1
    || typeof options.outcomeConfirmationReplay !== "function"
    || typeof options.emergencyAuthorizationReplay !== "function"
    || typeof options.stoppedDriverLeaseReplay !== "function"
    || typeof options.writerExclusionReplay !== "function"
    || typeof options.resumeProgram !== "function") fail("OPTIONS_INVALID");
  const directory = path.resolve(options.directory);
  const pendingDirectory = path.join(directory,
    ".emergency-fail-close-pending-intents-v1");
  mkdirSync(pendingDirectory, { recursive: true, mode: 0o700 });
  const clock = options.clock ?? (() => new Date().toISOString());
  const writeJournalChunk = options.writeJournalChunk
    ?? ((descriptor, bytes, offset, length) =>
      writeSync(descriptor, bytes, offset, length));
  if (typeof clock !== "function" || typeof writeJournalChunk !== "function") {
    fail("CLOCK_OR_JOURNAL_WRITER_INVALID");
  }

  return Object.freeze({
    async failClose(input, runOptions = {}) {
      const prepared = prepareDurableOutcomeEmergencyFailCloseRequestV1(input);
      const { request, requestHash } = prepared;
      const confirmation = snapshot(await options.outcomeConfirmationReplay({
        requestId: request.requestId,
        programId: request.programId,
        programHash: request.programHash,
      }), "CONFIRMATION_REPLAY_NOT_CANONICAL");
      if (confirmation?.confirmed !== true
        || confirmation.requestId !== request.requestId
        || confirmation.programId !== request.programId
        || confirmation.programHash !== request.programHash) {
        fail("CONFIRMATION_REPLAY_MISMATCH");
      }
      const target = checkedJournalFile(directory, request.programId);
      const initialJournal = readJournalState(target.file);
      let events = initialJournal.events;
      const program = acceptedProgram(events);
      if (program.programId !== request.programId
        || program.programHash !== request.programHash
        || program.orderId !== request.requestId) {
        fail("PROGRAM_REQUEST_BINDING_MISMATCH");
      }
      let intervention = validateExistingIntervention(
        events, request, requestHash);
      async function replayStopLease(interventionStarted) {
        return snapshot(await options.stoppedDriverLeaseReplay({
          leaseHash: request.stoppedDriverLeaseHash,
          requestId: request.requestId,
          programId: request.programId,
          programHash: request.programHash,
          journalEventCount: request.expectedEventCount,
          journalHeadHash: request.expectedJournalHeadHash,
          interventionStarted,
        }), "STOPPED_DRIVER_LEASE_NOT_CANONICAL");
      }
      async function assertWriterExcluded() {
        const excluded = snapshot(await options.writerExclusionReplay({
          requestId: request.requestId,
          programId: request.programId,
          programHash: request.programHash,
          leaseHash: request.stoppedDriverLeaseHash,
        }), "WRITER_EXCLUSION_REPLAY_NOT_CANONICAL");
        if (excluded?.legacyWriterProcessesAbsent !== true) {
          fail("LEGACY_WRITER_EXCLUSION_NOT_ESTABLISHED");
        }
      }
      function validateStopLease(stopLeaseValue) {
        if (stopLeaseValue?.stopped !== true
          || stopLeaseValue.moduleIssued !== true
        || stopLeaseValue.leaseHash !== request.stoppedDriverLeaseHash
        || stopLeaseValue.requestId !== request.requestId
        || stopLeaseValue.programId !== request.programId
        || stopLeaseValue.programHash !== request.programHash
        || stopLeaseValue.journalEventCount !== request.expectedEventCount
        || stopLeaseValue.journalHeadHash !== request.expectedJournalHeadHash
        || typeof stopLeaseValue.driverIdentityHash !== "string"
        || !HASH.test(stopLeaseValue.driverIdentityHash)
        || typeof stopLeaseValue.stoppedObservedAt !== "string") {
          fail("STOPPED_DRIVER_LEASE_REPLAY_MISMATCH");
        }
        assertInstant(stopLeaseValue.stoppedObservedAt,
          "STOPPED_DRIVER_LEASE_TIME_INVALID");
        return stopLeaseValue;
      }
      let stopLease = initialJournal.partialTail.length === 0
        ? validateStopLease(await replayStopLease(intervention !== null))
        : null;
      const authorization = snapshot(
        await options.emergencyAuthorizationReplay({
          interventionId: request.interventionId,
          requestId: request.requestId,
          programId: request.programId,
          programHash: request.programHash,
          emergencyRequestHash: requestHash,
          journalEventCount: request.expectedEventCount,
          journalHeadHash: request.expectedJournalHeadHash,
          stoppedDriverLeaseHash: request.stoppedDriverLeaseHash,
        }), "EMERGENCY_AUTHORIZATION_NOT_CANONICAL");
      if (authorization?.authorized !== true
        || authorization.moduleIssued !== true
        || authorization.interventionId !== request.interventionId
        || authorization.requestId !== request.requestId
        || authorization.programId !== request.programId
        || authorization.programHash !== request.programHash
        || authorization.emergencyRequestHash !== requestHash
        || authorization.journalEventCount !== request.expectedEventCount
        || authorization.journalHeadHash !== request.expectedJournalHeadHash
        || authorization.stoppedDriverLeaseHash
          !== request.stoppedDriverLeaseHash
        || typeof authorization.authorizationHash !== "string"
        || !HASH.test(authorization.authorizationHash)
        || typeof authorization.authorizationEvidenceHash !== "string"
        || !HASH.test(authorization.authorizationEvidenceHash)) {
        fail("EMERGENCY_AUTHORIZATION_REPLAY_MISMATCH");
      }
      assertInstant(authorization.authorizedAt,
        "EMERGENCY_AUTHORIZATION_TIME_INVALID");
      const pending = {
        directory: pendingDirectory,
        programId: request.programId,
        interventionId: request.interventionId,
        emergencyRequestHash: requestHash,
        emergencyAuthorizationHash: authorization.authorizationHash,
        stoppedDriverLeaseHash: request.stoppedDriverLeaseHash,
      };
      if (initialJournal.partialTail.length > 0 || existsSync(
        pendingIntentFile(pendingDirectory, request.programId,
          initialJournal.events.length + 1))) {
        await assertWriterExcluded();
        events = recoverPendingTail(target, initialJournal, pending,
          writeJournalChunk);
        await assertWriterExcluded();
        intervention = validateExistingIntervention(
          events, request, requestHash);
        stopLease = validateStopLease(
          await replayStopLease(intervention !== null));
      }
      if (intervention !== null) {
        validateInterventionDescendant(events, intervention, request,
          requestHash, authorization, program);
      }
      if (intervention === null) {
        validateFreshPreconditions(events, request);
        stopLease = await replayStopLease(false);
        events = appendOneEvent(target, events, clock, {
          eventType: "EMERGENCY_FAIL_CLOSE_REQUESTED_V1",
          payload: interventionPayload(
            request, requestHash, authorization, stopLease),
        }, pending, writeJournalChunk);
        intervention = eventFor(events,
          "EMERGENCY_FAIL_CLOSE_REQUESTED_V1");
        await replayStopLease(true);
        validateInterventionDescendant(events, intervention, request,
          requestHash, authorization, program);
      }
      let telemetry = matchingTelemetry(events, intervention);
      if (telemetry === null) {
        if (matchingClosure(events, intervention) !== null) {
          fail("INTERVENTION_SEQUENCE_INVALID");
        }
        await replayStopLease(true);
        events = appendOneEvent(target, events, clock, {
          eventType: "ZERO_INTERNAL_OPS_TELEMETRY",
          payload: {
            outsiderStaffTouchCount: null,
            minimumOutsiderStaffTouchCount: 1,
            exactOutsiderStaffTouchCountKnown: false,
            humanQueueCreated: false,
            measurementObserved: false,
            zeroInternalOpsObserved: false,
            source:
              "EMERGENCY_OPERATOR_INTERVENTION_PROVEN_COUNT_UNKNOWN_V1",
          },
        }, pending, writeJournalChunk);
        telemetry = matchingTelemetry(events, intervention);
        await replayStopLease(true);
        validateInterventionDescendant(events, intervention, request,
          requestHash, authorization, program);
      }
      if (telemetry.payload?.outsiderStaffTouchCount !== null
        || telemetry.payload?.minimumOutsiderStaffTouchCount !== 1
        || telemetry.payload?.exactOutsiderStaffTouchCountKnown !== false
        || telemetry.payload?.measurementObserved !== false
        || telemetry.payload?.zeroInternalOpsObserved !== false) {
        fail("INTERVENTION_TELEMETRY_INVALID");
      }
      let closure = matchingClosure(events, intervention);
      if (closure === null) {
        await replayStopLease(true);
        events = appendOneEvent(target, events, clock, {
          eventType: "CLOSURE_STARTED",
          payload: {
            outcomeState: "FAILED",
            detail: {
              phase: "OPERATOR_PRODUCT_DEFECT_FAIL_CLOSE",
              interventionId: request.interventionId,
              productDefectCode: request.productDefectCode,
              diagnosisEvidenceHash: request.diagnosisEvidenceHash,
              witnessSuccessAsserted: false,
            },
          },
        }, pending, writeJournalChunk);
        closure = matchingClosure(events, intervention);
        await replayStopLease(true);
        validateInterventionDescendant(events, intervention, request,
          requestHash, authorization, program);
      }
      if (closure.sequence <= telemetry.sequence
        || closure.payload?.outcomeState !== "FAILED"
        || closure.payload?.detail?.interventionId
          !== request.interventionId) {
        fail("INTERVENTION_CLOSURE_INVALID");
      }
      await replayStopLease(true);
      validateInterventionDescendant(events, intervention, request,
        requestHash, authorization, program);
      const result = await options.resumeProgram({
        requestId: request.requestId,
        programId: request.programId,
        programHash: request.programHash,
        interventionId: request.interventionId,
        interventionEventHash: intervention.eventHash,
        runOptions,
      });
      await replayStopLease(true);
      const validated = validatePostResume(
        target, request, intervention, result);
      validateInterventionDescendant(readJournal(target.file), intervention,
        request, requestHash, authorization, program);
      return validated;
    },
  });
}
