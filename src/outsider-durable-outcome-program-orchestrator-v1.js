/*
 * Outsider durable OutcomeProgram orchestrator v1.
 *
 * This is the production execution seam between a domain-neutral compiled
 * OutcomeProgram and provider-native adapters.  It deliberately knows nothing
 * about web deployment, meetings, transport, robots, or any other vertical.
 * Requirements are bound per order and reserved in topological parallel
 * waves, so a downstream witness can receive the staged route reservations;
 * only after all waves close does the orchestrator record COMMIT. Outcome
 * nodes run as a dependency DAG; an
 * explicit primary failure activates the already-reserved recovery route, and
 * the effective result is presented to the already-reserved independent
 * witness.  Finally, obligations and every reservation lifecycle are closed.
 *
 * Adapter calls receive deterministic operationId values.  An adapter MUST
 * reconcile/idempotently resume that operationId: a process may stop after a
 * provider accepted an operation but before the completion event was fsynced.
 * A returned INCONCLUSIVE witness read is itself fsynced as one occurrence and
 * pauses the program; a later resume gets a new read-only operationId, while a
 * thrown/ambiguous read retries the still-open occurrence with the same id.
 * Explicit execution preconditions require a fresh bound point observation
 * before each new route intent. An existing intent only reconciles through an
 * adapter that explicitly supports resumeOnly; a prior pass cannot authorize
 * a first effect after restart. Programs without that contract retain their
 * original lifecycle and adapter calls.
 * Adapter results persisted here must be public/redacted receipts, never
 * credentials or provider secrets.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { publishPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
import { publicDatasetHash as canonicalDigest } from './outsider-public-dataset.js';
import { verifyExecutableOutcomeProgram, OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA } from "./outsider-outcome-program-v1.js";
import { executionWindowAcceptance, normalizeExecutionWindows, nodeExecutionWindow } from './outsider-execution-windows.js';
import { normalizeEffectPreconditions, effectPreconditionGroups, EFFECT_PRECONDITIONS_SCHEMA_V2, effectPreconditionEvidenceBinding,
  projectEffectPreconditionObservation } from './outsider-effect-preconditions.js';
import { SCHEDULE_REVISION_SCHEMA_V2, resolveExecutionWindowLifecycle,
  assertExecutionWindowLifecycleReadiness } from './outsider-resource-graph-schedule-lifecycle.js';
import { normalizeReservedResourceReplacement, projectReservedResourceReplacement } from './outsider-reserved-resource-replacement.js';

const PREFIX = "OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS
  = Object.freeze({
    journalEvent: "outsider/durable-outcome-program-orchestrator-event/v1",
    projection: "outsider/durable-outcome-program-orchestrator-projection/v1",
  });

export const OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_ROLES
  = Object.freeze({
    primary: "PRIMARY",
    recovery: "RECOVERY",
    witness: "INDEPENDENT_WITNESS",
  });

export const OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_STATES
  = Object.freeze({
    forming: "FORMING",
    committed: "COMMITTED",
    executing: "EXECUTING",
    closing: "CLOSING",
    paused: "PAUSED_RETRYABLE",
    unavailable: "UNAVAILABLE",
    succeeded: "SUCCEEDED",
    failedClosed: "FAILED_CLOSED",
  });

const TERMINAL_EVENTS = new Map([
  ["PROGRAM_UNAVAILABLE", "UNAVAILABLE"],
  ["PROGRAM_SUCCEEDED", "SUCCEEDED"],
  ["PROGRAM_FAILED_CLOSED", "FAILED_CLOSED"],
]);

function fail(code, detail = null) {
  throw new TypeError(detail === null
    ? `${PREFIX}${code}` : `${PREFIX}${code}:${detail}`);
}

function sha256(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function snapshot(value, code = "VALUE_NOT_CANONICAL") {
  try {
    return JSON.parse(canonicalizeStrict(value));
  } catch (error) {
    fail(code, error instanceof Error ? error.message : "unknown");
  }
}

function assertIdentifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(code);
  return value;
}

function assertInstant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function operationId(programHash, phase, subject) {
  return `op_${createHash("sha256")
    .update(`${programHash}\0${phase}\0${subject}`, "utf8")
    .digest("hex").slice(0, 40)}`;
}

function adapterRegistryGet(registry, adapterId) {
  if (registry instanceof Map) return registry.get(adapterId);
  if (registry !== null && typeof registry === "object") {
    return registry[adapterId];
  }
  return undefined;
}

function journalPath(directory, programId) {
  const name = createHash("sha256").update(programId, "utf8").digest("hex");
  return path.join(directory, `${name}.events.jsonl`);
}

function verifyJournalEvent(event, sequence, previousEventHash) {
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
    || typeof body.eventType !== "string" || body.eventType.length === 0) {
    fail("JOURNAL_CHAIN_INVALID");
  }
  assertInstant(body.recordedAt, "JOURNAL_RECORDED_AT_INVALID");
  const expected = sha256(body.schema, body);
  if (event.eventHash !== expected) fail("JOURNAL_EVENT_HASH_INVALID");
  return event;
}

export function readOutcomeProgramJournal(file) {
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  if (bytes.length === 0) fail("JOURNAL_EMPTY");
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n")) fail("JOURNAL_PARTIAL_TAIL");
  const lines = text.slice(0, -1).split("\n");
  const events = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      fail("JOURNAL_JSON_INVALID");
    }
    verifyJournalEvent(event, index + 1, previous);
    events.push(event);
    previous = event.eventHash;
  }
  return events;
}

// Serialize just the journal publication, not independent provider operations.
// An awaited intent is durable before its external effect starts.
const journalWrites=new WeakMap();
function appendEvent(file, events, now, eventType, payload) {
  const publication=(journalWrites.get(events)??Promise.resolve()).then(async()=>{
    const body={schema:OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS.journalEvent,
      schemaVersion:'1.0.0',sequence:events.length+1,previousEventHash:events.at(-1)?.eventHash??null,
      recordedAt:assertInstant(now(),'CLOCK_RESULT_INVALID'),eventType,payload:snapshot(payload,'EVENT_PAYLOAD_NOT_CANONICAL')};
    const event={...body,eventHash:sha256(body.schema,body)};
    publishPrivateExecutionBytes(file,Buffer.from([...events,event].map(e=>canonicalizeStrict(e)).join('\n')+'\n'),{replace:true});
    events.push(event);return event;
  });
  journalWrites.set(events,publication);return publication;
}

function eventFor(events, eventType, predicate = () => true) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.eventType === eventType && predicate(event.payload)) return event;
  }
  return null;
}

function terminalState(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const state = TERMINAL_EVENTS.get(events[index].eventType);
    if (state) return state;
  }
  return null;
}

function acceptedProgram(events) {
  const accepted = eventFor(events, "PROGRAM_ACCEPTED");
  if (!accepted) fail("PROGRAM_ACCEPTED_EVENT_MISSING");
  return accepted.payload.program;
}

function buildProgramMaps(program) {
  const requirements = new Map(program.requirements.map((requirement) =>
    [requirement.requirementId, requirement]));
  const nodes = new Map(program.nodes.map((node) => [node.nodeId, node]));
  return { requirements, nodes };
}

function validateProgramExecutionReferences(program, maps) {
  const expectedRole = [
    ["primaryRequirementId", "PRIMARY"],
    ["recoveryRequirementId", "RECOVERY"],
    ["witnessRequirementId", "INDEPENDENT_WITNESS"],
  ];
  for (const node of program.nodes) {
    for (const [field, role] of expectedRole) {
      const requirementId = node[field];
      if (requirementId !== null
        && maps.requirements.get(requirementId)?.role !== role) {
        fail("NODE_REQUIREMENT_ROLE_MISMATCH", `${node.nodeId}:${field}`);
      }
    }
    if (node.kind === "EFFECT" && expectedRole.some(([field]) =>
      node[field] === null)) {
      fail("EFFECT_NODE_THREE_ROLE_REQUIREMENTS_MISSING", node.nodeId);
    }
    if (node.kind !== "EFFECT" && node.witnessRequirementId === null) {
      fail("NON_EFFECT_NODE_WITNESS_REQUIREMENT_MISSING", node.nodeId);
    }
  }
}

function selectedBinding(events, requirementId) {
  const native = activeNativeReplacement(events, requirementId);
  if (native) return { requirementId, adapterId: requirementId,
    providerRef: native.revision.contract.participants.find(row => row.requirementId === requirementId)?.replacement.providerRef
      ?? native.revision.contract.retainedWitness.providerRef,
    nativeReplacementHash: native.revision.revisionHash, acceptedConnectionHash: native.revision.contract.replacementConnectionHash };
  const revised = resourceRevision(events, requirementId);
  if (revised) return { requirementId, adapterId: revised.adapterId, providerRef: revised.providerRef,
    resourceRevisionHash: revised.resourceRevision.revisionHash,
    acceptedConnectionHash: revised.resourceRevision.acceptedConnectionHash };
  return eventFor(events, "ADAPTER_BOUND", (payload) =>
    payload.requirementId === requirementId)?.payload ?? null;
}

function reservation(events, requirementId) {
  const native = activeNativeReplacement(events, requirementId);
  if (native) return native.activation.reservations[requirementId] ?? null;
  const revised = resourceRevision(events, requirementId);
  if (revised) {
    const execution = executionRevision(events, requirementId);
    return eventFor(events, 'RESOURCE_REVISION_READY', payload => payload.requirementId === requirementId
      && payload.resourceRevisionHash === revised.resourceRevision.revisionHash
      && canonicalizeStrict(payload.executionRevision) === canonicalizeStrict(execution))?.payload.reservation ?? null;
  }
  const confirmed = eventFor(events, "RESERVATION_CONFIRMED", (payload) =>
    payload.requirementId === requirementId)?.payload.reservation
    ?? eventFor(events, "ON_DEMAND_WITNESS_READY", payload => payload.requirementId === requirementId)?.payload.reservation ?? null;
  if (confirmed === null) return null;
  const progress = eventFor(events, "OBLIGATION_CLOSE_PROGRESS", (payload) =>
    payload.requirementId === requirementId
      && payload.adapterState !== null)?.payload ?? null;
  return progress === null ? confirmed : {
    ...confirmed,
    adapterState: progress.adapterState,
  };
}

function reservationFailed(events, requirementId) {
  return eventFor(events, "RESERVATION_UNAVAILABLE", (payload) =>
    payload.requirementId === requirementId)?.payload ?? null;
}

function nodeRouteEvent(events, nodeId, route) {
  return eventFor(events, "NODE_EFFECT_COMPLETED", (payload) =>
    payload.nodeId === nodeId && payload.route === route);
}

function nodeRouteResult(events, nodeId, route) {
  return nodeRouteEvent(events, nodeId, route)?.payload.result ?? null;
}

function nodeWitnessEvent(events, nodeId) {
  return eventFor(events, "NODE_WITNESS_COMPLETED", (payload) =>
    payload.nodeId === nodeId
      && ["SATISFIED", "NOT_SATISFIED"].includes(
        payload.observation?.status));
}

function nodeWitnessResult(events, nodeId) {
  return nodeWitnessEvent(events, nodeId)?.payload.observation ?? null;
}

function witnessInconclusiveEvents(events, nodeId) {
  return events.filter((event) =>
    (event.eventType === "NODE_WITNESS_INCONCLUSIVE"
      && event.payload.nodeId === nodeId)
    // A v1 journal written before retryable occurrences were introduced may
    // contain INCONCLUSIVE under NODE_WITNESS_COMPLETED. Replay it as an
    // occurrence, never as terminal failure.
    || (event.eventType === "NODE_WITNESS_COMPLETED"
      && event.payload.nodeId === nodeId
      && event.payload.observation?.status === "INCONCLUSIVE"));
}

function latestWitnessInconclusive(events, nodeId) {
  const occurrences = witnessInconclusiveEvents(events, nodeId);
  return occurrences.length === 0 ? null : occurrences.at(-1);
}

function isNodeSatisfied(events, nodeId) {
  return nodeWitnessResult(events, nodeId)?.status === "SATISFIED";
}

function isA2ARecoveryTransaction(program, node) {
  return [OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(program?.schema)
    && node.kind === 'TRANSACTION' && node.recoveryRequirementId !== null;
}

function isA2ARecoveryRequirement(program, requirementId) {
  return program.nodes.some(node => isA2ARecoveryTransaction(program, node)
    && [node.primaryRequirementId, node.recoveryRequirementId].includes(requirementId));
}

function allowsOriginalRequirementContinuation(program, node) {
  return node?.kind === 'TRANSACTION' && node.recoveryRequirementId === null
    && program?.requirements.find(row => row.requirementId === node.primaryRequirementId)
      ?.constraints?.executionContinuationContract === 'AUTHORIZED_ORIGINAL_REQUIREMENT_CONTINUATION_V1';
}

function nodeHasTerminalFailure(events, nodeId) {
  if (eventFor(events, 'NATIVE_RESOURCE_REPLACEMENT_ABORTED', payload => payload.nodeId === nodeId)) return true;
  const primary = nodeRouteResult(events, nodeId, "PRIMARY");
  const recovery = nodeRouteResult(events, nodeId, "RECOVERY");
  const observation = nodeWitnessResult(events, nodeId);
  const program = eventFor(events, "PROGRAM_ACCEPTED")?.payload.program;
  const transactionFailed = ["outsider/execution-only-program/v3", OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(program?.schema)
    && program.nodes.some(node => node.nodeId === nodeId && node.kind === "TRANSACTION"
      && !isA2ARecoveryTransaction(program, node)
      && !(allowsOriginalRequirementContinuation(program, node) && primary?.effectNotDispatched === true))
    && primary?.status === "FAILED";
  return (primary?.status === "FAILED" && recovery?.status === "FAILED")
    || observation?.status === "NOT_SATISFIED" || transactionFailed;
}

function publicFailure(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
}

function validateReservation(result, requirement, program, nowValue) {
  const value = snapshot(result, "RESERVATION_RESULT_NOT_CANONICAL");
  // A metered/public observation API is usable without offering a capacity
  // lease. This explicit successor mode never fabricates a reserved witness.
  const onDemand = value?.status === "READY_ON_DEMAND"
    && requirement.role === "INDEPENDENT_WITNESS"
    && requirement.constraints?.admissionMode === "ON_DEMAND_OBSERVATION"
    && value.capacityReserved === false && value.providerReceipt !== null
    && value.providerReceipt !== undefined;
  // An execution-only successor can follow an existing paid order. This is
  // not a seller capacity reservation, and cannot enter a V1 result promise.
  const existingOrder = contextFreeExistingOrderAdmission(value, requirement, program);
  const pairedA2A = isA2ARecoveryRequirement(program, requirement.requirementId);
  const pricedPurchase = program.schema === OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA
    && requirement.constraints?.newPurchaseAuthorized === true
    && /^[1-9]\d{0,30}$/u.test(requirement.constraints.maximumAmountMinor ?? '')
    && value.providerReceipt?.checkoutPlanHash === requirement.constraints.checkoutPlanHash
    && value.providerReceipt?.quoteHash === requirement.constraints.quoteHash
    && value.providerReceipt?.currency === requirement.constraints.currency
    && value.providerReceipt?.maximumAmountMinor === requirement.constraints.maximumAmountMinor;
  const transactionReady = ["outsider/execution-only-program/v3", OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(program.schema)
    && program.commitmentMode === "EXECUTION_ONLY_NO_OUTCOME_PROMISE"
    && (requirement.role === "PRIMARY" || pairedA2A && requirement.role === "RECOVERY")
    && requirement.constraints?.admissionMode === "EXECUTION_PHASE_TRANSACTION"
    && (requirement.constraints.maximumAmountMinor === "0" || pricedPurchase)
    && value?.status === "READY_FOR_TRANSACTION" && value.capacityReserved === false
    && value.providerReceipt?.transactionSubmitted === false;
  if (pairedA2A && (!transactionReady || value.providerReceipt?.connectionHash !== requirement.constraints.connectionHash
    || requirement.constraints.skillSelectionHash !== undefined
      && value.providerReceipt?.skillSelectionHash !== requirement.constraints.skillSelectionHash)) return null;
  const nativeOrder = ["outsider/execution-only-program/v2", "outsider/execution-only-program/v3", OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(program.schema)
    && program.commitmentMode === "EXECUTION_ONLY_NO_OUTCOME_PROMISE"
    && requirement.role === "PRIMARY"
    && requirement.constraints?.admissionMode === "ZERO_TOTAL_NATIVE_ORDER_AFTER_CONFIRMATION"
    && requirement.constraints.newPurchaseAuthorized === true
    && requirement.constraints.maximumAmountMinor === "0"
    && value?.status === "NATIVE_ORDER_ACCEPTED" && value.capacityReserved === false
    && value.providerReceipt?.sellerOrderAccepted === true
    && value.providerReceipt.needsPayment === false && value.providerReceipt.outsiderCreatedOrder === true
    && value.providerReceipt.totalAmountMinor === "0"
    && value.providerReceipt.currency === requirement.constraints.currency
    && value.providerReceipt.checkoutPlanHash === requirement.constraints.checkoutPlanHash;
  if (value === null || typeof value !== "object"
    || (value.status !== "RESERVED" && !onDemand && !existingOrder && !nativeOrder && !transactionReady)
    || typeof value.reservationId !== "string"
    || value.reservationId.length === 0) return null;
  assertInstant(value.validUntil, "RESERVATION_VALID_UNTIL_INVALID");
  const obligationDeadlines = program.obligations
    .filter((item) => item.targetRequirementId === requirement.requirementId)
    .map((item) => Date.parse(item.deadline));
  const requiredUntil = Math.max(Date.parse(program.completionDeadline),
    ...obligationDeadlines);
  if (Date.parse(value.validUntil) < requiredUntil
    || Date.parse(value.validUntil) - Date.parse(nowValue)
      < requirement.minimumReservationMs
    || Date.parse(value.validUntil) <= Date.parse(nowValue)) return null;
  return {
    requirementId: requirement.requirementId,
    role: requirement.role,
    reservationId: value.reservationId,
    validUntil: value.validUntil,
    providerReceipt: value.providerReceipt ?? null,
    adapterState: value.adapterState ?? null,
    ...(onDemand ? { admissionMode: "ON_DEMAND_OBSERVATION", capacityReserved: false } : {}),
    ...(existingOrder ? { admissionMode: "EXISTING_ACCEPTED_ORDER", capacityReserved: false } : {}),
    ...(nativeOrder ? { admissionMode: "ZERO_TOTAL_NATIVE_ORDER_AFTER_CONFIRMATION", capacityReserved: false } : {}),
    ...(transactionReady ? { admissionMode: "EXECUTION_PHASE_TRANSACTION", capacityReserved: false } : {}),
  };
}

function contextFreeExistingOrderAdmission(value, requirement, program) {
  return ["outsider/execution-only-program/v2", "outsider/execution-only-program/v3", OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(program.schema)
    && program.commitmentMode === "EXECUTION_ONLY_NO_OUTCOME_PROMISE"
    && requirement.role === "PRIMARY" && requirement.constraints?.admissionMode === "EXISTING_ACCEPTED_ORDER"
    && value?.status === "EXISTING_ORDER_ACCEPTED" && value.capacityReserved === false
    && value.providerReceipt?.sellerOrderAccepted === true && value.providerReceipt.needsPayment === false
    && value.providerReceipt.orderRefHash === requirement.constraints.orderRefHash;
}

function validateEffectResult(result) {
  const value = snapshot(result, "EFFECT_RESULT_NOT_CANONICAL");
  if (value === null || typeof value !== "object"
    || !["SUCCEEDED", "FAILED"].includes(value.status)) {
    fail("EFFECT_RESULT_INVALID");
  }
  return value;
}

function validateObservation(result) {
  const value = snapshot(result, "WITNESS_RESULT_NOT_CANONICAL");
  if (value === null || typeof value !== "object"
    || !["SATISFIED", "NOT_SATISFIED", "INCONCLUSIVE"]
      .includes(value.status)) fail("WITNESS_RESULT_INVALID");
  return value;
}

function observationWithRecordedTime(result, recordedAt) {
  const value = validateObservation(result);
  if (value.observedAt !== undefined) {
    assertInstant(value.observedAt, "WITNESS_OBSERVED_AT_INVALID");
  }
  return {
    ...value,
    observedAt: value.observedAt ?? recordedAt,
  };
}

function persistedWitnessPause(events, program) {
  const candidates = [];
  for (const node of program.nodes) {
    const inconclusive = latestWitnessInconclusive(events, node.nodeId);
    if (inconclusive === null) continue;
    const terminal = nodeWitnessEvent(events, node.nodeId);
    if (terminal !== null && terminal.sequence > inconclusive.sequence) continue;
    const observation = inconclusive.payload.observation;
    candidates.push({
      sequence: inconclusive.sequence,
      value: {
        phase: "OBSERVE",
        subjectId: node.nodeId,
        operationId: inconclusive.payload.operationId,
        observationOccurrence:
          inconclusive.payload.observationOccurrence ?? null,
        observationStatus: "INCONCLUSIVE",
        reason: observation.reason ?? null,
        retryAfter: observation.retryAfter ?? null,
      },
    });
  }
  candidates.sort((left, right) => right.sequence - left.sequence);
  return candidates[0]?.value ?? null;
}

function preconditionEvents(events, nodeId, route, type = 'NODE_PRECONDITION_COMPLETED') {
  return events.filter(event => event.eventType === type && event.payload.nodeId === nodeId
    && event.payload.route === route);
}

function preconditionGroupEvents(events, nodeId, route, groupId, type = 'NODE_PRECONDITION_GROUP_COMPLETED') {
  return preconditionEvents(events, nodeId, route, type).filter(event => event.payload.groupId === groupId);
}

function currentPreconditionRound(events, nodeId, route) {
  const requested = preconditionEvents(events, nodeId, route, 'NODE_PRECONDITION_ROUND_REQUESTED').at(-1);
  const completed = preconditionEvents(events, nodeId, route, 'NODE_PRECONDITION_ROUND_COMPLETED').at(-1);
  return { requested, completed: completed?.payload.observationOccurrence === requested?.payload.observationOccurrence
    ? completed : null };
}

function multiSourcePreconditionProjection(events, node) {
  const contract = node.input.executionPreconditions;
  const primary = currentPreconditionRound(events, node.nodeId, 'PRIMARY');
  const recovery = currentPreconditionRound(events, node.nodeId, 'RECOVERY');
  return { schema: EFFECT_PRECONDITIONS_SCHEMA_V2, contractHash: canonicalDigest(contract),
    groups: contract.groups.map(({ groupId, observerRequirementId }) => ({ groupId, observerRequirementId })),
    primary: primary.completed?.payload.observation ?? null, recovery: recovery.completed?.payload.observation ?? null,
    observationOccurrences: { PRIMARY: primary.requested?.payload.observationOccurrence ?? 0,
      RECOVERY: recovery.requested?.payload.observationOccurrence ?? 0 },
    pointObservationOnly: true, simultaneousSatisfactionProven: false, continuousValidityClaimed: false };
}

function persistedPreconditionPause(events, program) {
  const candidates = [];
  for (const node of program.nodes) {
    if (!Object.hasOwn(node.input ?? {}, 'executionPreconditions')) continue;
    for (const route of ['PRIMARY', 'RECOVERY']) {
      if (eventFor(events, 'NODE_EFFECT_REQUESTED', payload => payload.nodeId === node.nodeId && payload.route === route)
        || nodeRouteResult(events, node.nodeId, route) !== null) continue;
      const paused = preconditionEvents(events, node.nodeId, route, 'NODE_PRECONDITION_PAUSED').at(-1);
      const cleared = preconditionEvents(events, node.nodeId, route, 'NODE_PRECONDITION_PAUSE_CLEARED').at(-1);
      if (node.input.executionPreconditions.schema === EFFECT_PRECONDITIONS_SCHEMA_V2) {
        const round = currentPreconditionRound(events, node.nodeId, route);
        if (paused && paused.sequence > Math.max(cleared?.sequence ?? 0, round.requested?.sequence ?? 0))
          candidates.push({ sequence: paused.sequence, value: paused.payload.retry });
        else if (round.requested) candidates.push({ sequence: round.completed?.sequence ?? round.requested.sequence,
          value: { phase: 'EXECUTION_PRECONDITION', subjectId: node.nodeId, route, reason: 'PRECONDITION_REFRESH_REQUIRED',
            retryAfter: round.completed?.payload.observation.observedAt ?? round.requested.recordedAt,
            operationId: round.requested.payload.operationId, observationOccurrence: round.requested.payload.observationOccurrence } });
        continue;
      }
      const completed = preconditionEvents(events, node.nodeId, route).at(-1);
      if (paused && paused.sequence > (cleared?.sequence ?? 0)
        && paused.sequence >= (completed?.sequence ?? 0)) candidates.push({ sequence: paused.sequence, value: paused.payload.retry });
      else if (completed?.payload.observation.status === 'SATISFIED') candidates.push({ sequence: completed.sequence,
        value: { phase: 'EXECUTION_PRECONDITION', subjectId: node.nodeId, route,
          reason: 'PRECONDITION_REFRESH_REQUIRED', retryAfter: completed.payload.observation.observedAt,
          operationId: completed.payload.operationId, observationOccurrence: completed.payload.observationOccurrence } });
    }
  }
  candidates.sort((left, right) => right.sequence - left.sequence);
  return candidates[0]?.value ?? null;
}

function projection(events, paused = null) {
  const program = acceptedProgram(events);
  const finalState = terminalState(events);
  const timing = eventFor(events, 'EXECUTION_TIMING_PAUSED'), schedule = eventFor(events, 'SCHEDULE_REVISION_ACCEPTED');
  const timingPause = finalState === null && (timing?.sequence ?? 0) > (schedule?.sequence ?? 0) ? timing.payload.retry : null;
  const effectivePause = paused ?? timingPause ?? persistedPreconditionPause(events, program) ?? persistedWitnessPause(events, program);
  let state = finalState;
  if (state === null) {
    if (effectivePause !== null) state = "PAUSED_RETRYABLE";
    else if (eventFor(events, "CLOSURE_STARTED")) state = "CLOSING";
    else if (eventFor(events, "NODE_EFFECT_REQUESTED")) state = "EXECUTING";
    else if (eventFor(events, "PROGRAM_COMMITTED")) state = "COMMITTED";
    else if (eventFor(events, "RESOURCE_FORMATION_PREPARED")) state = "RESOURCES_RESERVED_AWAITING_CONFIRMATION";
    else state = "FORMING";
  }
  const bindings = {};
  const reservations = {};
  const nodes = {};
  const obligations = {};
  const releases = {};
  for (const requirement of program.requirements) {
    bindings[requirement.requirementId]
      = selectedBinding(events, requirement.requirementId);
    reservations[requirement.requirementId]
      = reservation(events, requirement.requirementId);
    releases[requirement.requirementId]
      = eventFor(events, "RESERVATION_RELEASED", (payload) =>
        payload.requirementId === requirement.requirementId)?.payload ?? null;
  }
  for (const node of program.nodes) {
    const inconclusive = latestWitnessInconclusive(events, node.nodeId);
    nodes[node.nodeId] = {
      primary: nodeRouteResult(events, node.nodeId, "PRIMARY"),
      recovery: nodeRouteResult(events, node.nodeId, "RECOVERY"),
      witness: nodeWitnessResult(events, node.nodeId),
      latestInconclusive: inconclusive?.payload.observation ?? null,
      witnessObservationOccurrences:
        witnessInconclusiveEvents(events, node.nodeId).length
          + (nodeWitnessResult(events, node.nodeId) === null ? 0 : 1),
      ...(Object.hasOwn(node.input ?? {}, 'executionPreconditions') ? { executionPreconditions:
        node.input.executionPreconditions.schema === EFFECT_PRECONDITIONS_SCHEMA_V2 ? multiSourcePreconditionProjection(events, node) : {
        observerRequirementId: node.input.executionPreconditions.observerRequirementId,
        primary: preconditionEvents(events, node.nodeId, 'PRIMARY').at(-1)?.payload.observation ?? null,
        recovery: preconditionEvents(events, node.nodeId, 'RECOVERY').at(-1)?.payload.observation ?? null,
        observationOccurrences: { PRIMARY: preconditionEvents(events, node.nodeId, 'PRIMARY').length,
          RECOVERY: preconditionEvents(events, node.nodeId, 'RECOVERY').length },
      } } : {}),
    };
  }
  for (const obligation of program.obligations) {
    obligations[obligation.obligationId]
      = eventFor(events, "OBLIGATION_CLOSED", (payload) =>
        payload.obligationId === obligation.obligationId)?.payload ?? null;
  }
  const telemetry = eventFor(events, "ZERO_INTERNAL_OPS_TELEMETRY")?.payload
    ?? null;
  const resourceRevisions = events.filter(event => event.eventType === 'RESOURCE_REVISION_ACCEPTED').map(event => event.payload);
  const scheduleRevisions = events.filter(event => event.eventType === 'SCHEDULE_REVISION_ACCEPTED').map(event => event.payload);
  const nativeRevisions = events.filter(event => event.eventType === 'NATIVE_RESOURCE_REPLACEMENT_ACCEPTED').map(event => event.payload);
  const head = events[events.length - 1];
  return snapshot({
    schema:
      OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS.projection,
    schemaVersion: "1.0.0",
    programId: program.programId,
    programHash: program.programHash,
    state,
    committed: eventFor(events, "PROGRAM_COMMITTED") !== null,
    userOutcomePromiseIssued:
      eventFor(events, "PROGRAM_COMMITTED") !== null && program.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE",
    ...(program.commitmentMode ? { commitmentMode: program.commitmentMode } : {}),
    bindings,
    reservations,
    nodes,
    obligations,
    releases,
    ...(resourceRevisions.length ? { resourceRevisions, executionRevisions: Object.fromEntries(
      [...new Set(resourceRevisions.map(row => row.requirementId))].map(id => [id, executionRevision(events, id)])) } : {}),
    ...(nativeRevisions.length ? { nativeResourceReplacements: nativeRevisions.map(row => ({ revisionHash: row.revisionHash,
      componentId: row.componentId, nodeId: row.nodeId, contractHash: canonicalDigest(row.contract),
      state: eventFor(events, 'NATIVE_RESOURCE_REPLACEMENT_ACTIVATED', payload => payload.revisionHash === row.revisionHash) ? 'ACTIVATED'
        : eventFor(events, 'NATIVE_RESOURCE_REPLACEMENT_ABORTED', payload => payload.revisionHash === row.revisionHash) ? 'ABORTED'
          : 'WAITING_CAPACITY_TRANSITION', releaseIsCompensation: false, deliveredEffectsUndone: false })) } : {}),
    ...(scheduleRevisions.length ? { scheduleRevisions,
      effectiveExecutionWindows: Object.fromEntries([...executionWindowPlan(program, events)].map(([, window]) => {
        const { schema, requirementId, ...value } = window;
        return [requirementId, value];
      })) } : {}),
    telemetry,
    retry: effectivePause,
    eventCount: events.length,
    journalHeadHash: head.eventHash,
    humanQueueCreated: telemetry?.humanQueueCreated ?? null,
  });
}

function bindingFromOptions(bindings, requirementId) {
  if (bindings instanceof Map) return bindings.get(requirementId) ?? null;
  if (bindings && typeof bindings === "object") {
    return bindings[requirementId] ?? null;
  }
  return null;
}

function normalizeBinding(raw, requirementId) {
  const candidate = typeof raw === "string" ? { adapterId: raw } : raw;
  const value = snapshot(candidate, "ADAPTER_BINDING_NOT_CANONICAL");
  if (value === null || typeof value !== "object") return null;
  assertIdentifier(value.adapterId, "ADAPTER_ID_INVALID");
  return {
    requirementId,
    adapterId: value.adapterId,
    providerRef: value.providerRef ?? null,
  };
}

const resourceRevision = (events, requirementId) => eventFor(events, 'RESOURCE_REVISION_ACCEPTED',
  payload => payload.requirementId === requirementId)?.payload ?? null;
const executionRevision = (events, requirementId) => eventFor(events, 'EXECUTION_REQUIREMENT_REVISION_ACCEPTED',
  payload => payload.requirementId === requirementId)?.payload.executionRevision ?? null;
const exactFields = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const same = (left, right) => canonicalizeStrict(left) === canonicalizeStrict(right);

function revisionContext(context, requirementId) {
  const native = activeNativeReplacement(context.events, requirementId);
  if (native) {
    const requirement = context.maps.requirements.get(requirementId);
    const participant = native.revision.contract.participants.find(row => row.requirementId === requirementId);
    return { nativeResourceReplacement: { active: true, revisionHash: native.revision.revisionHash,
      contractHash: canonicalDigest(native.revision.contract) }, effectiveRequirement: { ...requirement,
      constraints: { ...requirement.constraints, connectionHash: native.revision.contract.replacementConnectionHash,
        ...(participant ? { quoteId: participant.replacement.quoteId } : {}) } } };
  }
  const revised = resourceRevision(context.events, requirementId);
  if (!revised) return {};
  const execution = executionRevision(context.events, requirementId);
  const requirement = context.maps.requirements.get(requirementId);
  return { resourceRevision: revised.resourceRevision, executionRevision: execution,
    effectiveRequirement: { ...requirement, constraints: { ...requirement.constraints,
      connectionHash: revised.resourceRevision.acceptedConnectionHash, inputContractHash: execution.inputContractHash } } };
}

function activeNativeReplacement(events, requirementId) {
  const revision = eventFor(events, 'NATIVE_RESOURCE_REPLACEMENT_ACCEPTED', payload =>
    payload.contract.participants.some(row => row.requirementId === requirementId)
      || payload.contract.retainedWitness.requirementId === requirementId)?.payload;
  if (!revision) return null;
  const activation = eventFor(events, 'NATIVE_RESOURCE_REPLACEMENT_ACTIVATED', payload => payload.revisionHash === revision.revisionHash)?.payload;
  return activation ? { revision, activation } : null;
}

function nativeReplacementHistory(events, revision) {
  return events.filter(event => ['NATIVE_REPLACEMENT_OPERATION_REQUESTED', 'NATIVE_REPLACEMENT_OPERATION_OBSERVED'].includes(event.eventType)
    && event.payload.contractHash === canonicalDigest(revision.contract)).map(event => ({ ...event.payload,
      kind: event.eventType === 'NATIVE_REPLACEMENT_OPERATION_REQUESTED' ? 'REQUESTED' : 'OBSERVED', recordedAt: event.recordedAt }));
}

async function acceptNativeResourceRevisions(context, runOptions) {
  const rows = snapshot(runOptions.nativeResourceRevisions ?? [], 'NATIVE_RESOURCE_REVISIONS_INVALID');
  const recorded = context.events.filter(event => event.eventType === 'NATIVE_RESOURCE_REPLACEMENT_ACCEPTED');
  if (!Array.isArray(rows) || rows.length > 64 || rows.length < recorded.length) fail('NATIVE_RESOURCE_REVISION_HISTORY_REQUIRED');
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    if (!exactFields(row, ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash', 'baselineProgramHash',
      'componentId', 'nodeId', 'acceptedAt', 'contract']) || row.baselineProgramHash !== context.program.programHash
      || ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash'].some(key => !HASH.test(row[key] ?? '')))
      fail('NATIVE_RESOURCE_REVISION_INVALID');
    const contract = normalizeReservedResourceReplacement(row.contract), node = context.maps.nodes.get(row.nodeId);
    assertInstant(row.acceptedAt, 'NATIVE_RESOURCE_REVISION_ACCEPTANCE_TIME_INVALID');
    if (ids.has(row.componentId) || contract.programHash !== context.program.programHash || contract.nodeId !== row.nodeId
      || contract.componentId !== row.componentId || node?.kind !== 'EFFECT'
      || context.program.commitmentMode !== 'EXECUTION_ONLY_NO_OUTCOME_PROMISE'
      || contract.completionDeadline !== context.program.completionDeadline
      || Date.parse(row.acceptedAt) >= Date.parse(contract.completionDeadline)
      || Date.parse(row.acceptedAt) > Date.parse(context.now()) || contract.participants.length !== 2
      || contract.participants.find(part => part.role === 'PRIMARY')?.requirementId !== node.primaryRequirementId
      || contract.participants.find(part => part.role === 'RECOVERY')?.requirementId !== node.recoveryRequirementId
      || contract.retainedWitness.requirementId !== node.witnessRequirementId
      || contract.acceptanceContractHash !== canonicalDigest(node.acceptance?.[0])
      || contract.executionWindowHash !== canonicalDigest((() => { const window = nodeExecutionWindow(node, context.program.completionDeadline);
        if (!window) return null; const { schema, requirementId, ...value } = window; return value; })()))
      fail('NATIVE_RESOURCE_REVISION_SCOPE_UNSUPPORTED');
    ids.add(row.componentId);
    for (const participant of [...contract.participants, contract.retainedWitness]) {
      const requirement = context.maps.requirements.get(participant.requirementId);
      const adapter = adapterRegistryGet(context.adapters, participant.requirementId);
      const providerRef = participant.replacement?.providerRef ?? participant.providerRef;
      if (requirement?.constraints.connectionHash !== contract.originalConnectionHash
        || requirement.constraints.inputHash !== contract.inputContractHash
        || participant.replacement && (requirement.capability !== 'CONNECTED_NATIVE_RESOURCE_V1'
          || requirement.constraints.maximumAmountMinor !== '0')
        || adapter?.nativeReplacement?.revisionHash !== row.revisionHash
        || adapter.nativeReplacement.contractHash !== canonicalDigest(contract)
        || adapter.nativeReplacement.replacementProviderRef !== providerRef
        || participant.replacement && ['acquireReplacement', 'releaseReplacedCapacity', 'releaseReplacementCapacity']
          .some(method => typeof adapter[method] !== 'function')) fail('NATIVE_RESOURCE_REVISION_ADAPTER_MISMATCH');
    }
    if (index < recorded.length) {
      if (!same(recorded[index].payload, row)) fail('NATIVE_RESOURCE_REVISION_HISTORY_CHANGED');
      continue;
    }
    if (!eventFor(context.events, 'PROGRAM_COMMITTED') || eventFor(context.events, 'CLOSURE_STARTED') || terminalState(context.events)
      || context.events.some(event => ['NODE_EFFECT_REQUESTED', 'NODE_EFFECT_COMPLETED', 'NODE_WITNESS_REQUESTED', 'NODE_WITNESS_COMPLETED']
        .includes(event.eventType) && event.payload.nodeId === row.nodeId)) fail('NATIVE_RESOURCE_REVISION_TARGET_ALREADY_STARTED');
    for (const participant of [...contract.participants, contract.retainedWitness]) {
      const original = reservation(context.events, participant.requirementId), expected = participant.old ?? participant;
      if (!original || original.reservationId !== expected.reservationId || original.validUntil !== expected.validUntil
        || original.providerReceipt?.providerRef !== expected.providerRef || canonicalDigest(original.providerReceipt) !== expected.receiptHash
        || participant.old && original.capacityReserved === false) fail('NATIVE_RESOURCE_REVISION_ORIGINAL_CAPACITY_CHANGED');
    }
  }
  for (let index = recorded.length; index < rows.length; index++) await appendEvent(context.file, context.events, context.now,
    'NATIVE_RESOURCE_REPLACEMENT_ACCEPTED', rows[index]);
}

async function advanceNativeResourceReplacements(context, closing = false) {
  const pauses = new Map();
  for (const event of context.events.filter(row => row.eventType === 'NATIVE_RESOURCE_REPLACEMENT_ACCEPTED')) {
    const revision = event.payload, contract = revision.contract, contractHash = canonicalDigest(contract);
    if (eventFor(context.events, 'NATIVE_RESOURCE_REPLACEMENT_ACTIVATED', payload => payload.revisionHash === revision.revisionHash)
      || eventFor(context.events, 'NATIVE_RESOURCE_REPLACEMENT_ABORTED', payload => payload.revisionHash === revision.revisionHash)) continue;
    let lastFailure = null;
    for (let pass = 0; pass < 3; pass++) {
      const window = context.executionWindows.get(revision.nodeId);
      const windowEnded = window?.latestStartAt && Date.parse(context.now()) > Date.parse(window.latestStartAt);
      const current = projectReservedResourceReplacement({ contract, events: nativeReplacementHistory(context.events, revision),
        observedAt: context.now(), closing: closing || !!windowEnded });
      if (current.state === 'READY_TO_ACTIVATE') {
        const retained = reservation(context.events, contract.retainedWitness.requirementId);
        await appendEvent(context.file, context.events, context.now, 'NATIVE_RESOURCE_REPLACEMENT_ACTIVATED', {
          revisionHash: revision.revisionHash, contractHash, nodeId: revision.nodeId,
          ...current.activation, reservations: { ...current.activation.reservations,
            [contract.retainedWitness.requirementId]: retained }, releaseIsCompensation: false, deliveredEffectsUndone: false });
        validateIndependentBindings(context.program, context.events);
        break;
      }
      if (current.state === 'ABORTED') {
        await appendEvent(context.file, context.events, context.now, 'NATIVE_RESOURCE_REPLACEMENT_ABORTED', {
          revisionHash: revision.revisionHash, contractHash, nodeId: revision.nodeId,
          reason: windowEnded && !closing ? 'TARGET_DISPATCH_WINDOW_PASSED' : current.reason,
          releaseIsCompensation: false, deliveredEffectsUndone: false });
        break;
      }
      let progress = false;
      for (const action of current.nextActions) {
        const adapter = adapterRegistryGet(context.adapters, action.requirementId);
        const payload = { contractHash, phase: action.phase, requirementId: action.requirementId, operationId: action.operationId };
        if (!action.previouslyRequested) await appendEvent(context.file, context.events, context.now,
          'NATIVE_REPLACEMENT_OPERATION_REQUESTED', payload);
        try {
          const method = { ACQUIRE_NEW: 'acquireReplacement', RELEASE_OLD: 'releaseReplacedCapacity', RELEASE_NEW: 'releaseReplacementCapacity' }[action.phase];
          const result = snapshot(await adapter[method]({ program: context.program, contract,
            requirement: context.maps.requirements.get(action.requirementId), operationId: action.operationId,
            nativeResourceReplacement: { revisionHash: revision.revisionHash, contractHash, active: false } }), 'NATIVE_REPLACEMENT_RESULT_INVALID');
          const previous = eventFor(context.events, 'NATIVE_REPLACEMENT_OPERATION_OBSERVED', value =>
            value.contractHash === contractHash && value.phase === action.phase && value.requirementId === action.requirementId)?.payload.result;
          if (previous === undefined || !same(previous, result)) {
            await appendEvent(context.file, context.events, context.now, 'NATIVE_REPLACEMENT_OPERATION_OBSERVED', { ...payload, result });
            progress = true;
          }
        } catch (error) { lastFailure = publicFailure(error); }
      }
      if (!progress) break;
    }
    if (!eventFor(context.events, 'NATIVE_RESOURCE_REPLACEMENT_ACTIVATED', payload => payload.revisionHash === revision.revisionHash)
      && !eventFor(context.events, 'NATIVE_RESOURCE_REPLACEMENT_ABORTED', payload => payload.revisionHash === revision.revisionHash)) {
      const state = projectReservedResourceReplacement({ contract, events: nativeReplacementHistory(context.events, revision), observedAt: context.now(), closing });
      pauses.set(revision.nodeId, { status: 'PAUSED', paused: { phase: 'NATIVE_RESOURCE_REPLACEMENT', subjectId: revision.nodeId,
        reason: state.state, revisionHash: revision.revisionHash,
        retryAfter: new Date(Math.min(Date.parse(context.program.completionDeadline), Date.parse(context.now()) + 60000)).toISOString(),
        ...(lastFailure ? { error: lastFailure } : {}) } });
    }
  }
  return pauses;
}

function scheduleTarget(program, revision, componentId) {
  if (revision.schema === SCHEDULE_REVISION_SCHEMA_V2) {
    const expected = resolveExecutionWindowLifecycle(program, componentId);
    if (!same(revision.targetBindings?.[componentId], expected)) fail('SCHEDULE_REVISION_TARGET_BINDING_CHANGED');
    return program.nodes.find(node => node.nodeId === expected.nodeId);
  }
  return program.nodes.find(node => node.primaryRequirementId === `${componentId}__agent_task`);
}

function executionWindowPlan(program, events) {
  const windows = new Map(program.nodes.map(node => [node.nodeId, nodeExecutionWindow(node, program.completionDeadline)])
    .filter(([, window]) => window !== null));
  for (const event of events.filter(row => row.eventType === 'SCHEDULE_REVISION_ACCEPTED')) {
    for (const [id, window] of Object.entries(event.payload.executionWindows)) {
      const node = scheduleTarget(program, event.payload, id);
      if (!node) fail('SCHEDULE_REVISION_TARGET_INVALID');
      windows.set(node.nodeId, executionWindowAcceptance(id, window));
    }
  }
  return windows;
}

function scheduleRevisionForNode(context, node) {
  return eventFor(context.events, 'SCHEDULE_REVISION_ACCEPTED', payload =>
    Object.keys(payload.executionWindows).some(id => scheduleTarget(context.program, payload, id)?.nodeId === node.nodeId))?.payload ?? null;
}

// Acceptance and dispatch share the resource store's cross-process lock.
// Journal every accepted plan, including intermediate plans, before using its
// final windows. Neither original program bytes nor operation ids are edited.
async function acceptScheduleRevisions(context, runOptions) {
  const rows = snapshot(runOptions.scheduleRevisions ?? [], 'SCHEDULE_REVISIONS_INVALID');
  if (!Array.isArray(rows) || rows.length > 256) fail('SCHEDULE_REVISIONS_INVALID');
  const recorded = context.events.filter(event => event.eventType === 'SCHEDULE_REVISION_ACCEPTED');
  if (rows.length < recorded.length) fail('SCHEDULE_REVISION_HISTORY_REQUIRED');
  const windows = executionWindowPlan(context.program, []), hashes = new Set();
  const requirementIds = context.program.requirements.filter(row => row.capability === 'A2A_AGENT_TASK_V1')
    .map(row => row.requirementId.replace(/__agent_task$/u, ''));
  for (const [index, row] of rows.entries()) {
    const declared = row?.schema === SCHEDULE_REVISION_SCHEMA_V2;
    if (!exactFields(row, ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash', 'baselineProgramHash',
      'acceptedAt', 'previousExecutionWindows', 'executionWindows', ...(declared ? ['schema', 'targetBindings'] : [])])
      || ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash'].some(key => !HASH.test(row[key] ?? ''))
      || row.baselineProgramHash !== context.program.programHash || hashes.has(row.revisionHash)) fail('SCHEDULE_REVISION_INVALID');
    if (declared && !exactFields(row.targetBindings, Object.keys(row.executionWindows ?? {}))) fail('SCHEDULE_REVISION_TARGET_BINDING_CHANGED');
    assertInstant(row.acceptedAt, 'SCHEDULE_REVISION_ACCEPTED_AT_INVALID');
    const acceptedTime = Date.parse(row.acceptedAt);
    if (acceptedTime >= Date.parse(context.program.completionDeadline) || acceptedTime > Date.parse(context.now()))
      fail('SCHEDULE_REVISION_ACCEPTED_AT_INVALID');
    const changed = normalizeExecutionWindows(row.executionWindows, { requirementIds: declared ? Object.keys(row.targetBindings) : requirementIds,
      completionDeadline: context.program.completionDeadline });
    if (!same(changed, row.executionWindows) || !exactFields(row.previousExecutionWindows, Object.keys(changed)))
      fail('SCHEDULE_REVISION_INVALID');
    if (index < recorded.length && !same(recorded[index].payload, row)) fail('SCHEDULE_REVISION_HISTORY_CHANGED');
    for (const [id, value] of Object.entries(changed)) {
      const lifecycle = declared ? resolveExecutionWindowLifecycle(context.program, id) : null;
      if (declared && !same(row.targetBindings[id], lifecycle)) fail('SCHEDULE_REVISION_TARGET_BINDING_CHANGED');
      const requirementId = lifecycle?.requirementId ?? `${id}__agent_task`, requirement = context.maps.requirements.get(requirementId);
      const nodes = context.program.nodes.filter(node => node.primaryRequirementId === requirementId);
      const node = declared ? context.maps.nodes.get(lifecycle.nodeId) : nodes[0];
      const criterion = context.program.outcome.acceptance?.find(item => item.criterionId === `${id}__contract`);
      if (!declared && (!['outsider/execution-only-program/v3', OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(context.program.schema)
        || context.program.commitmentMode !== 'EXECUTION_ONLY_NO_OUTCOME_PROMISE'
        || requirement?.role !== 'PRIMARY' || requirement.capability !== 'A2A_AGENT_TASK_V1'
        || requirement.constraints?.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
        || requirement.constraints.maximumAmountMinor !== '0' || requirement.constraints.reservedAgentCapacityRequired !== false
        || requirement.constraints.resourceInputRecipeHash || nodes.length !== 1 || node.kind !== 'TRANSACTION'
        || node.recoveryRequirementId !== null || criterion?.expected?.inputRecipe
        || !['A2A_TASK_ARTIFACT_AVAILABLE_V1', 'A2A_TASK_CHECKED_DATA_AVAILABLE_V2'].includes(criterion?.expected?.acceptanceContract)
        || !Array.isArray(node.acceptance) || !node.acceptance.includes(criterion.expected.acceptanceContract)))
        fail('SCHEDULE_REVISION_SCOPE_UNSUPPORTED');
      const original = windows.get(node.nodeId), { schema, requirementId: originalId, ...prior } = original ?? {};
      if (original && originalId !== id || !same(row.previousExecutionWindows[id], original ? prior : null)
        || value.latestStartAt && Date.parse(value.latestStartAt) < acceptedTime) fail('SCHEDULE_REVISION_CHAIN_INVALID');
      const readiness = reservation(context.events, requirementId);
      if (declared) assertExecutionWindowLifecycleReadiness(lifecycle, readiness);
      else if (readiness && (readiness.capacityReserved !== false || readiness.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
        || readiness.providerReceipt?.transactionSubmitted !== false)) fail('SCHEDULE_REVISION_RESERVED_CAPACITY_UNSUPPORTED');
      if (index >= recorded.length) {
        if (terminalState(context.events) !== null || eventFor(context.events, 'CLOSURE_STARTED')) fail('SCHEDULE_REVISION_EXECUTION_ENDED');
        if (context.events.some(event => ['NODE_EFFECT_REQUESTED', 'NODE_EFFECT_COMPLETED', 'NODE_WITNESS_REQUESTED',
          'NODE_WITNESS_COMPLETED', 'NODE_WITNESS_INCONCLUSIVE'].includes(event.eventType) && event.payload.nodeId === node.nodeId))
          fail('SCHEDULE_REVISION_TARGET_ALREADY_STARTED', node.nodeId);
      }
      windows.set(node.nodeId, executionWindowAcceptance(id, value));
    }
    hashes.add(row.revisionHash);
  }
  for (let index = recorded.length; index < rows.length; index++) await appendEvent(context.file, context.events, context.now,
    'SCHEDULE_REVISION_ACCEPTED', rows[index]);
  context.executionWindows = windows;
}

// The resource store owns proposal acceptance and holds its shared revision /
// dispatch lock around run(). This seam consumes only that accepted history.
// Every accepted version is journaled; only the final connection needs a local
// readiness check. No prior provider capacity or acceptance crosses the edit.
async function acceptResourceRevisions(context, runOptions) {
  const rows = snapshot(runOptions.resourceRevisions ?? [], 'RESOURCE_REVISIONS_INVALID');
  const executions = snapshot(runOptions.executionRevisions ?? {}, 'EXECUTION_REVISIONS_INVALID');
  if (!Array.isArray(rows) || rows.length > 256 || executions === null || typeof executions !== 'object'
    || Array.isArray(executions)) fail('RESOURCE_REVISIONS_INVALID');
  const recorded = context.events.filter(event => event.eventType === 'RESOURCE_REVISION_ACCEPTED');
  if (rows.length < recorded.length) fail('RESOURCE_REVISION_HISTORY_REQUIRED');
  const latest = new Map(), revisionHashes = new Set();
  const resourceHashFields = ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash', 'originalConnectionHash',
    'previousConnectionHash', 'acceptedConnectionHash', 'acceptedResourceHash', 'authorizationHash', 'placementHash'];
  const executionFields = ['revisionHash', 'revisionChainHash', 'effectiveExecutionContractHash', 'acceptedConnectionHash', 'inputContractHash'];
  const assertUnstarted = row => {
    if (terminalState(context.events) !== null || eventFor(context.events, 'CLOSURE_STARTED')
      || Date.parse(context.now()) >= Date.parse(context.program.completionDeadline)) fail('RESOURCE_REVISION_EXECUTION_ENDED');
    if (context.events.some(event => ['NODE_EFFECT_REQUESTED', 'NODE_EFFECT_COMPLETED', 'NODE_WITNESS_REQUESTED',
      'NODE_WITNESS_COMPLETED'].includes(event.eventType) && event.payload.nodeId === row.nodeId))
      fail('RESOURCE_REVISION_TARGET_ALREADY_STARTED', row.nodeId);
  };
  for (const [index, row] of rows.entries()) {
    if (!exactFields(row, ['componentId', 'nodeId', 'requirementId', 'adapterId', 'providerRef', 'resourceRevision'])
      || !exactFields(row.resourceRevision, [...resourceHashFields, 'resourceId', 'expiresAt'])
      || resourceHashFields.some(key => !HASH.test(row.resourceRevision[key] ?? ''))
      || !IDENTIFIER.test(row.resourceRevision.resourceId ?? '') || !IDENTIFIER.test(row.componentId ?? '')
      || typeof row.providerRef !== 'string' || !row.providerRef.length || row.providerRef.length > 256
      || row.adapterId !== row.requirementId || row.requirementId !== `${row.componentId}__agent_task`)
      fail('RESOURCE_REVISION_INVALID');
    const metadata = row.resourceRevision;
    assertInstant(metadata.expiresAt, 'RESOURCE_REVISION_EXPIRY_INVALID');
    const requirement = context.maps.requirements.get(row.requirementId), node = context.maps.nodes.get(row.nodeId);
    const criterion = context.program.outcome.acceptance?.find(item => item.criterionId === `${row.componentId}__contract`);
    if (!['outsider/execution-only-program/v3', OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(context.program.schema)
      || context.program.commitmentMode !== 'EXECUTION_ONLY_NO_OUTCOME_PROMISE'
      || requirement?.role !== 'PRIMARY' || requirement.capability !== 'A2A_AGENT_TASK_V1'
      || requirement.constraints?.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
      || requirement.constraints.maximumAmountMinor !== '0' || requirement.constraints.resourceInputRecipeHash
      || node?.kind !== 'TRANSACTION' || node.primaryRequirementId !== row.requirementId || node.recoveryRequirementId !== null
      || !['A2A_TASK_ARTIFACT_AVAILABLE_V1', 'A2A_TASK_CHECKED_DATA_AVAILABLE_V2'].includes(criterion?.expected?.acceptanceContract)
      || !Array.isArray(node.acceptance) || !node.acceptance.includes(criterion.expected.acceptanceContract)
      || criterion.expected.inputRecipe)
      fail('RESOURCE_REVISION_SCOPE_UNSUPPORTED');
    const previous = latest.get(row.requirementId);
    if (metadata.originalConnectionHash !== requirement.constraints.connectionHash
      || metadata.previousConnectionHash !== (previous?.resourceRevision.acceptedConnectionHash ?? metadata.originalConnectionHash)
      || metadata.acceptedConnectionHash !== metadata.acceptedResourceHash
      || metadata.acceptedConnectionHash === metadata.previousConnectionHash
      || Date.parse(metadata.expiresAt) < Date.parse(context.program.completionDeadline)
      || revisionHashes.has(metadata.revisionHash)) fail('RESOURCE_REVISION_CHAIN_INVALID');
    const originalBinding = eventFor(context.events, 'ADAPTER_BOUND', payload => payload.requirementId === row.requirementId)?.payload;
    if (originalBinding && originalBinding.adapterId !== row.adapterId) fail('RESOURCE_REVISION_ADAPTER_CHANGED');
    const originalReadiness = eventFor(context.events, 'RESERVATION_CONFIRMED', payload => payload.requirementId === row.requirementId)
      ?? eventFor(context.events, 'ON_DEMAND_WITNESS_READY', payload => payload.requirementId === row.requirementId);
    if (originalReadiness && (originalReadiness.payload.reservation.capacityReserved !== false
      || originalReadiness.payload.reservation.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
      || originalReadiness.payload.reservation.providerReceipt?.transactionSubmitted !== false
      || originalReadiness.payload.reservation.providerReceipt.connectionHash !== metadata.originalConnectionHash))
      fail('RESOURCE_REVISION_RESERVED_CAPACITY_UNSUPPORTED');
    if (index < recorded.length) {
      const { baselineProgramHash, ...accepted } = recorded[index].payload;
      if (baselineProgramHash !== context.program.programHash || !same(accepted, row)) fail('RESOURCE_REVISION_HISTORY_CHANGED');
    } else assertUnstarted(row);
    latest.set(row.requirementId, row); revisionHashes.add(metadata.revisionHash);
  }
  if (Object.keys(executions).sort().join(',') !== [...latest.keys()].sort().join(',')) fail('EXECUTION_REVISION_COVERAGE_INVALID');
  // Validate every final adapter and version before appending any new history.
  // A stale runtime must fail before NODE_EFFECT_REQUESTED is written.
  for (const [requirementId, row] of latest) {
    const execution = executions[requirementId], adapter = adapterRegistryGet(context.adapters, row.adapterId);
    const recipeHash = context.program.outcome.acceptance.find(item => item.criterionId === `${row.componentId}__contract`)
      .expected.executionInputRecipe?.recipeHash;
    if (!exactFields(execution, executionFields) || executionFields.some(key => !HASH.test(execution[key] ?? ''))
      || execution.acceptedConnectionHash !== row.resourceRevision.acceptedConnectionHash
      || recipeHash !== undefined && execution.inputContractHash !== recipeHash) fail('EXECUTION_REVISION_INVALID');
    if (adapter?.connectionHash !== execution.acceptedConnectionHash || adapter.providerRef !== row.providerRef)
      fail('RESOURCE_REVISION_ADAPTER_CONNECTION_MISMATCH');
    if (typeof adapter.reserve !== 'function') fail('RESOURCE_REVISION_READINESS_SURFACE_INVALID');
    const current = executionRevision(context.events, requirementId);
    if (current !== null && !same(current, execution) && context.events.some(event =>
      event.eventType === 'EXECUTION_REQUIREMENT_REVISION_ACCEPTED' && event.payload.requirementId === requirementId
        && same(event.payload.executionRevision, execution))) fail('EXECUTION_REVISION_STALE');
    if (current === null || !same(current, execution)) assertUnstarted(row);
  }
  for (let index = recorded.length; index < rows.length; index++) await appendEvent(context.file, context.events, context.now,
    'RESOURCE_REVISION_ACCEPTED', { ...rows[index], baselineProgramHash: context.program.programHash });
  for (const [requirementId] of latest) {
    const execution = executions[requirementId];
    if (!same(executionRevision(context.events, requirementId), execution)) await appendEvent(context.file, context.events, context.now,
      'EXECUTION_REQUIREMENT_REVISION_ACCEPTED', { requirementId, baselineProgramHash: context.program.programHash,
        executionRevision: execution });
  }
}

async function ensureResourceRevisionReadiness(context) {
  const requirements = context.program.requirements.filter(requirement => resourceRevision(context.events, requirement.requirementId));
  for (const requirement of requirements) {
    if (reservation(context.events, requirement.requirementId)) continue;
    const extra = revisionContext(context, requirement.requirementId);
    const { adapter, binding } = adapterForRequirement(context.adapters, context.events, requirement.requirementId);
    try {
      const result = await adapter.reserve({ program: context.program, requirement: extra.effectiveRequirement, ...extra,
        binding, dependencyReservations: Object.fromEntries((requirement.dependsOnRequirementIds ?? []).map(id => [id,
          reservation(context.events, id)])), operationId: operationId(context.program.programHash, 'RESERVE', requirement.requirementId) });
      const confirmed = validateReservation(result, extra.effectiveRequirement, context.program, context.now());
      if (result?.status !== 'READY_FOR_TRANSACTION' || confirmed?.capacityReserved !== false
        || confirmed.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
        || confirmed.providerReceipt?.connectionHash !== extra.resourceRevision.acceptedConnectionHash
        || !same(confirmed.providerReceipt.executionRevision ?? null, extra.executionRevision))
        fail('RESOURCE_REVISION_READINESS_INVALID');
      await appendEvent(context.file, context.events, context.now, 'RESOURCE_REVISION_READY', {
        requirementId: requirement.requirementId, resourceRevisionHash: extra.resourceRevision.revisionHash,
        executionRevision: extra.executionRevision, reservation: confirmed,
        observationScope: 'LOCAL_A2A_CONNECTION_READINESS', providerAcceptanceClaimed: false, capacityReserved: false });
    } catch (error) {
      return { status: 'PAUSED', paused: { phase: 'RESOURCE_REVISION_READINESS', subjectId: requirement.requirementId,
        error: publicFailure(error) } };
    }
  }
  return { status: 'READY' };
}

function adapterForRequirement(adapters, events, requirementId) {
  const binding = selectedBinding(events, requirementId);
  if (!binding) fail("ADAPTER_BINDING_MISSING", requirementId);
  const adapter = adapterRegistryGet(adapters, binding.adapterId);
  if (!adapter) fail("ADAPTER_NOT_REGISTERED", binding.adapterId);
  return { adapter, binding };
}

function validateBoundAdapterSurface(program, adapters, events) {
  for (const requirement of program.requirements) {
    const { adapter } = adapterForRequirement(
      adapters, events, requirement.requirementId);
    if (isA2ARecoveryRequirement(program, requirement.requirementId)
      && adapter.connectionHash !== requirement.constraints.connectionHash)
      fail('A2A_RECOVERY_ADAPTER_CONNECTION_MISMATCH', requirement.requirementId);
    if (typeof adapter.reserve !== "function"
      || typeof adapter.release !== "function") {
      fail("ADAPTER_RESERVATION_SURFACE_INVALID", requirement.requirementId);
    }
    if ((requirement.role === "PRIMARY" || requirement.role === "RECOVERY")
      && typeof adapter.execute !== "function") {
      fail("ADAPTER_EXECUTION_SURFACE_INVALID", requirement.requirementId);
    }
    if (requirement.role === "INDEPENDENT_WITNESS"
      && typeof adapter.observe !== "function") {
      fail("ADAPTER_WITNESS_SURFACE_INVALID", requirement.requirementId);
    }
  }
  for (const obligation of program.obligations) {
    const { adapter } = adapterForRequirement(
      adapters, events, obligation.targetRequirementId);
    if (typeof adapter.closeObligation !== "function") {
      fail("ADAPTER_OBLIGATION_SURFACE_INVALID", obligation.obligationId);
    }
  }
}

function validateIndependentBindings(program, events) {
  for (const node of program.nodes) {
    const requirementIds = [
      node.primaryRequirementId,
      node.recoveryRequirementId,
      node.witnessRequirementId,
    ].filter((requirementId) => requirementId !== null);
    const ids = requirementIds.map((requirementId) =>
      selectedBinding(events, requirementId).adapterId);
    if (new Set(ids).size !== ids.length) {
      fail("NODE_PROVIDER_ROLES_NOT_DISTINCT", node.nodeId);
    }
  }
}

async function ensureBindings(context, runOptions) {
  const missing = context.program.requirements.filter((requirement) =>
    selectedBinding(context.events, requirement.requirementId) === null);
  if (missing.length === 0) return { status: "READY" };
  const tasks = missing.map(async (requirement) => {
    const supplied = bindingFromOptions(
      runOptions.bindings, requirement.requirementId);
    if (supplied !== null) return supplied;
    if (typeof context.discover !== "function") return null;
    return context.discover({
      program: context.program,
      requirement,
      operationId: operationId(context.program.programHash,
        "DISCOVER", requirement.requirementId),
    });
  });
  const settled = await Promise.allSettled(tasks);
  let paused = null;
  for (let index = 0; index < missing.length; index += 1) {
    const requirement = missing[index];
    const result = settled[index];
    if (result.status === "rejected") {
      paused = {
        phase: "DISCOVERY",
        subjectId: requirement.requirementId,
        error: publicFailure(result.reason),
      };
      continue;
    }
    const binding = result.value === null
      ? null : normalizeBinding(result.value, requirement.requirementId);
    if (binding === null) {
      await appendEvent(context.file, context.events, context.now,
        "ADAPTER_UNAVAILABLE", {
          requirementId: requirement.requirementId,
          role: requirement.role,
        });
    } else {
      await appendEvent(context.file, context.events, context.now,
        "ADAPTER_BOUND", binding);
    }
  }
  if (paused !== null) return { status: "PAUSED", paused };
  const unavailable = context.program.requirements.find((requirement) =>
    selectedBinding(context.events, requirement.requirementId) === null);
  return unavailable
    ? { status: "UNAVAILABLE", subjectId: unavailable.requirementId }
    : { status: "READY" };
}

async function ensureReservations(context) {
  while (true) {
    const failed = context.program.requirements.find((requirement) =>
      reservationFailed(context.events, requirement.requirementId) !== null);
    if (failed) {
      return { status: "UNAVAILABLE", subjectId: failed.requirementId };
    }
    const pending = context.program.requirements.filter((requirement) =>
      reservation(context.events, requirement.requirementId) === null);
    if (pending.length === 0) return { status: "READY" };
    const ready = pending.filter((requirement) =>
      (requirement.dependsOnRequirementIds ?? []).every((requirementId) =>
        reservation(context.events, requirementId) !== null));
    if (ready.length === 0) fail("RESERVATION_REQUIREMENT_GRAPH_BLOCKED");

    const calls = [];
    for (const requirement of ready) {
      const { adapter, binding } = adapterForRequirement(
        context.adapters, context.events, requirement.requirementId);
      const op = operationId(context.program.programHash,
        "RESERVE", requirement.requirementId);
      const dependencyReservations = Object.fromEntries(
        (requirement.dependsOnRequirementIds ?? []).map((requirementId) => [
          requirementId,
          reservation(context.events, requirementId),
        ]));
      if (!eventFor(context.events, "RESERVATION_REQUESTED", (payload) =>
        payload.requirementId === requirement.requirementId)) {
        await appendEvent(context.file, context.events, context.now,
          "RESERVATION_REQUESTED", {
            requirementId: requirement.requirementId,
            role: requirement.role,
            adapterId: binding.adapterId,
            dependencyRequirementIds:
              requirement.dependsOnRequirementIds ?? [],
            operationId: op,
          });
      }
      calls.push(() => adapter.reserve({
        program: context.program,
        requirement,
        binding,
        dependencyReservations,
        operationId: op,
      }));
    }
    const settled = await Promise.allSettled(calls.map(call => Promise.resolve().then(call)));
    let paused = null;
    for (let index = 0; index < ready.length; index += 1) {
      const requirement = ready[index];
      const result = settled[index];
      if (result.status === "rejected") {
        paused = {
          phase: "RESERVE",
          subjectId: requirement.requirementId,
          error: publicFailure(result.reason),
        };
        continue;
      }
      const observedAt = context.now();
      const confirmed = validateReservation(
        result.value, requirement, context.program, observedAt);
      if (confirmed === null) {
        await appendEvent(context.file, context.events, () => observedAt,
          "RESERVATION_UNAVAILABLE", {
            requirementId: requirement.requirementId,
            role: requirement.role,
          });
      } else {
        await appendEvent(context.file, context.events, () => observedAt,
          confirmed.capacityReserved === false ? "ON_DEMAND_WITNESS_READY" : "RESERVATION_CONFIRMED", {
            requirementId: requirement.requirementId,
            role: requirement.role,
            reservation: confirmed,
          });
      }
    }
    if (paused !== null) return { status: "PAUSED", paused };
  }
}

function dependencyEvidenceForNode(context, node) {
  return node.dependsOn.map((nodeId) => {
    const primary = nodeRouteEvent(context.events, nodeId, "PRIMARY");
    const recovery = nodeRouteEvent(context.events, nodeId, "RECOVERY");
    const witness = nodeWitnessEvent(context.events, nodeId);
    return snapshot({
      nodeId,
      witness: witness?.payload.observation ?? null,
      witnessRecordedAt: witness?.recordedAt ?? null,
      primary: primary?.payload.result ?? null,
      primaryEffectRecordedAt: primary?.recordedAt ?? null,
      recovery: recovery?.payload.result ?? null,
      recoveryEffectRecordedAt: recovery?.recordedAt ?? null,
    }, "DEPENDENCY_EVIDENCE_NOT_CANONICAL");
  });
}

async function preconditionPause(context, node, route, details) {
  const contract = context.preconditions.get(node.nodeId);
  const retryIntervalMs = contract.schema === EFFECT_PRECONDITIONS_SCHEMA_V2
    ? Math.min(...contract.groups.filter(group => details.groupId === undefined || group.groupId === details.groupId)
      .map(group => group.retryIntervalMs)) : contract.retryIntervalMs;
  const retry = { phase: 'EXECUTION_PRECONDITION', subjectId: node.nodeId, route,
    retryAfter: new Date(Date.parse(context.now()) + retryIntervalMs).toISOString(), ...details };
  await appendEvent(context.file, context.events, context.now, 'NODE_PRECONDITION_PAUSED', {
    nodeId: node.nodeId, route, retry });
  return { status: 'PAUSED', paused: retry };
}

function preconditionObserver(context, node, contract) {
  const requirement = context.maps.requirements.get(contract.observerRequirementId);
  const binding = selectedBinding(context.events, contract.observerRequirementId);
  const adapter = binding && adapterRegistryGet(context.adapters, binding.adapterId);
  if (requirement?.role !== 'INDEPENDENT_WITNESS' || !binding || !adapter
    || typeof adapter.observePreconditions !== 'function')
    return { reason: 'PRECONDITION_OBSERVER_INTERFACE_UNAVAILABLE' };
  const effects = [node.primaryRequirementId, node.recoveryRequirementId].filter(Boolean)
    .map(id => selectedBinding(context.events, id));
  const observerProviderRef = binding.providerRef ?? adapter.providerRef ?? null;
  if (effects.some(effect => {
    if (!effect) return false;
    const effectAdapter = adapterRegistryGet(context.adapters, effect.adapterId);
    const effectProviderRef = effect.providerRef ?? effectAdapter?.providerRef ?? null;
    return effect.adapterId === binding.adapterId || effectAdapter === adapter
      || effectProviderRef !== null && observerProviderRef !== null && effectProviderRef === observerProviderRef;
  }))
    return { reason: 'PRECONDITION_OBSERVER_NOT_INDEPENDENT' };
  return { requirement, binding, adapter };
}

async function ensurePreconditionSurfaces(context) {
  for (const node of context.program.nodes) {
    const contract = context.preconditions.get(node.nodeId);
    if (!contract) continue;
    for (const group of contract.schema === EFFECT_PRECONDITIONS_SCHEMA_V2 ? effectPreconditionGroups(contract) : [{ groupId: null, contract }]) {
      const observer = preconditionObserver(context, node, group.contract);
      if (observer.reason) return preconditionPause(context, node, 'PRIMARY', { reason: observer.reason,
        ...(group.groupId === null ? {} : { groupId: group.groupId }) });
    }
    if ([node.primaryRequirementId, node.recoveryRequirementId].filter(Boolean).some(id => {
      const binding = selectedBinding(context.events, id);
      return !binding || adapterRegistryGet(context.adapters, binding.adapterId)?.supportsResumeOnly !== true;
    })) return preconditionPause(context, node, 'PRIMARY', { reason: 'PRECONDITION_RESUME_ONLY_REQUIRED' });
    const paused = preconditionEvents(context.events, node.nodeId, 'PRIMARY', 'NODE_PRECONDITION_PAUSED').at(-1);
    const cleared = preconditionEvents(context.events, node.nodeId, 'PRIMARY', 'NODE_PRECONDITION_PAUSE_CLEARED').at(-1);
    if (paused && paused.sequence > (cleared?.sequence ?? 0))
      await appendEvent(context.file, context.events, context.now, 'NODE_PRECONDITION_PAUSE_CLEARED', {
        nodeId: node.nodeId, route: 'PRIMARY', reason: 'OBSERVER_INTERFACE_AVAILABLE' });
  }
  return { status: 'READY' };
}

async function observeExecutionPreconditions(context, node, route, effectOperationId) {
  const contract = context.preconditions.get(node.nodeId);
  if (contract.schema === EFFECT_PRECONDITIONS_SCHEMA_V2)
    return observeMultipleExecutionPreconditions(context, node, route, effectOperationId);
  const observer = preconditionObserver(context, node, contract);
  if (observer.reason) return preconditionPause(context, node, route, { reason: observer.reason });
  const observationOccurrence = preconditionEvents(context.events, node.nodeId, route).length + 1;
  const op = operationId(context.program.programHash, `PRECONDITION_${route}_${observationOccurrence}`, node.nodeId);
  const binding = effectPreconditionEvidenceBinding({ programHash: context.program.programHash,
    nodeId: node.nodeId, route, operationId: op, contract });
  const requested = eventFor(context.events, 'NODE_PRECONDITION_REQUESTED', payload => payload.nodeId === node.nodeId
    && payload.route === route && payload.observationOccurrence === observationOccurrence);
  if (requested && (requested.payload.operationId !== op || !same(requested.payload.preconditionBinding, binding)))
    return preconditionPause(context, node, route, { reason: 'PRECONDITION_OPERATION_REPLAY_MISMATCH', operationId: op });
  if (!requested) await appendEvent(context.file, context.events, context.now, 'NODE_PRECONDITION_REQUESTED', {
    nodeId: node.nodeId, route, observerRequirementId: contract.observerRequirementId,
    operationId: op, effectOperationId, observationOccurrence, preconditionBinding: binding });
  const observationStartedAt = context.now();
  try {
    const rawObservation = await observer.adapter.observePreconditions({ program: context.program, node, route, contract,
      requirement: observer.requirement, binding: observer.binding,
      reservation: reservation(context.events, contract.observerRequirementId),
      preconditionBinding: binding, operationId: op, effectOperationId, observationOccurrence, observationStartedAt });
    const observedAt = context.now();
    const observation = projectEffectPreconditionObservation({ binding, observation: rawObservation, observationStartedAt, observedAt });
    await appendEvent(context.file, context.events, () => observedAt, 'NODE_PRECONDITION_COMPLETED', {
      nodeId: node.nodeId, route, observerRequirementId: contract.observerRequirementId,
      operationId: op, effectOperationId, observationOccurrence, observation });
    if (observation.status !== 'SATISFIED') return preconditionPause(context, node, route, {
      operationId: op, observationOccurrence, observationStatus: observation.status,
      reason: observation.reason, retryAfter: observation.retryAfter });
    return { status: 'READY', operationId: op, observationOccurrence, binding, rawObservation, observationStartedAt, observation };
  } catch {
    // A lost or malformed read never grants dispatch authority and never
    // publishes an adapter's raw error. Retry the unfinished occurrence.
    return preconditionPause(context, node, route, { operationId: op, observationOccurrence,
      reason: 'PRECONDITION_OBSERVATION_UNAVAILABLE' });
  }
}

async function observeMultipleExecutionPreconditions(context, node, route, effectOperationId) {
  const contract = context.preconditions.get(node.nodeId), parentPreconditionContractHash = canonicalDigest(contract);
  const observationOccurrence = preconditionEvents(context.events, node.nodeId, route, 'NODE_PRECONDITION_ROUND_REQUESTED').length + 1;
  const op = operationId(context.program.programHash, `PRECONDITION_ROUND_${route}_${observationOccurrence}`, node.nodeId);
  const observationStartedAt = context.now();
  await appendEvent(context.file, context.events, () => observationStartedAt, 'NODE_PRECONDITION_ROUND_REQUESTED', {
    nodeId: node.nodeId, route, effectOperationId, operationId: op, observationOccurrence, parentPreconditionContractHash });
  const groups = [];
  for (const group of effectPreconditionGroups(contract)) {
    const groupOccurrence = preconditionGroupEvents(context.events, node.nodeId, route, group.groupId).length + 1;
    const groupOp = operationId(context.program.programHash,
      `PRECONDITION_GROUP_${route}_${group.groupId}_${groupOccurrence}`, node.nodeId);
    const binding = effectPreconditionEvidenceBinding({ programHash: context.program.programHash,
      nodeId: node.nodeId, route, operationId: groupOp, contract: group.contract });
    const identity = { nodeId: node.nodeId, route, groupId: group.groupId,
      observerRequirementId: group.contract.observerRequirementId, operationId: groupOp,
      observationOccurrence: groupOccurrence, roundOccurrence: observationOccurrence, effectOperationId, parentPreconditionContractHash };
    const paused = async reason => {
      await appendEvent(context.file, context.events, context.now, 'NODE_PRECONDITION_GROUP_PAUSED', { ...identity, reason });
      groups.push({ ...group, operationId: groupOp, observationOccurrence: groupOccurrence, reason });
    };
    const observer = preconditionObserver(context, node, group.contract);
    if (observer.reason) { await paused(observer.reason); continue; }
    const requested = preconditionGroupEvents(context.events, node.nodeId, route, group.groupId, 'NODE_PRECONDITION_GROUP_REQUESTED')
      .find(event => event.payload.observationOccurrence === groupOccurrence);
    if (requested && (requested.payload.operationId !== groupOp || !same(requested.payload.preconditionBinding, binding)
      || requested.payload.parentPreconditionContractHash !== parentPreconditionContractHash
      || requested.payload.effectOperationId !== effectOperationId)) {
      await paused('PRECONDITION_OPERATION_REPLAY_MISMATCH'); continue;
    }
    if (!requested) await appendEvent(context.file, context.events, context.now, 'NODE_PRECONDITION_GROUP_REQUESTED', {
      ...identity, preconditionBinding: binding });
    const groupStartedAt = context.now();
    try {
      const received = await observer.adapter.observePreconditions({ program: context.program, node, route, contract: group.contract,
        requirement: observer.requirement, binding: observer.binding, reservation: reservation(context.events, group.contract.observerRequirementId),
        preconditionBinding: binding, operationId: groupOp, effectOperationId, observationOccurrence: groupOccurrence,
        observationStartedAt: groupStartedAt, preconditionGroupId: group.groupId, parentPreconditionContractHash,
        preconditionRoundOccurrence: observationOccurrence });
      // Freeze this actual read in memory as well as its safe journal evidence.
      // Another source cannot mutate a prior group's values before rechecking.
      const rawObservation = received === undefined ? undefined : snapshot(received, 'PRECONDITION_EVIDENCE_NOT_CANONICAL');
      const observedAt = context.now();
      const observation = projectEffectPreconditionObservation({ binding, observation: rawObservation,
        observationStartedAt: groupStartedAt, observedAt });
      await appendEvent(context.file, context.events, () => observedAt, 'NODE_PRECONDITION_GROUP_COMPLETED', { ...identity, observation });
      groups.push({ ...group, operationId: groupOp, observationOccurrence: groupOccurrence,
        binding, rawObservation, observationStartedAt: groupStartedAt });
    } catch {
      // Keep an unfinished group's original operation, but never keep a
      // successful sibling's old evidence as permission for another round.
      await paused('PRECONDITION_OBSERVATION_UNAVAILABLE');
    }
  }
  return { status: 'READY', multiSource: true, operationId: op, observationOccurrence,
    observationStartedAt, parentPreconditionContractHash, groups };
}

async function completePreconditionRound(context, node, route, checked, observedAt) {
  const groups = checked.groups.map(group => {
    let observation = null, reason = group.reason ?? 'PRECONDITION_OBSERVATION_UNAVAILABLE';
    if (group.binding) {
      try {
        observation = projectEffectPreconditionObservation({ binding: group.binding, observation: group.rawObservation,
          observationStartedAt: group.observationStartedAt, observedAt });
        reason = observation.reason;
      } catch { /* The final dispatch-time recheck also fails closed. */ }
    }
    return { groupId: group.groupId, observerRequirementId: group.contract.observerRequirementId,
      operationId: group.operationId, observationOccurrence: group.observationOccurrence,
      status: observation?.status ?? 'INCONCLUSIVE', reason, observation };
  });
  // Separate policies may read the same source predicate more than once.
  // Every valid read must satisfy the full conjunction: a high lower-bound
  // read and a low upper-bound read cannot manufacture an in-range value.
  const repeatedPredicates = new Map();
  checked.groups.forEach((group, index) => {
    for (const condition of group.contract.conditions) {
      const key = JSON.stringify([group.contract.observerRequirementId, condition.predicateId]);
      if (!repeatedPredicates.has(key)) repeatedPredicates.set(key, []);
      repeatedPredicates.get(key).push({ index, condition });
    }
  });
  const inconsistentGroups = new Set();
  for (const entries of repeatedPredicates.values()) {
    if (entries.length < 2) continue;
    const inconsistent = entries.some(({ index, condition }) => {
      // These statuses require a complete, typed and fresh source envelope.
      // Invalid or unavailable reads already prevent dispatch independently.
      if (!['SATISFIED', 'NOT_SATISFIED'].includes(groups[index].status)) return false;
      const fact = checked.groups[index].rawObservation.facts.find(row => row.predicateId === condition.predicateId);
      return entries.some(({ condition: required }) => fact.valueType !== required.valueType
        || !(required.operator === 'EQ' ? fact.value === required.value
          : required.operator === 'GTE' ? fact.value >= required.value : fact.value <= required.value));
    });
    if (inconsistent) for (const { index } of entries) inconsistentGroups.add(index);
  }
  const crossReadReason = 'SOURCE_OBSERVATIONS_DO_NOT_JOINTLY_SATISFY_CONDITIONS';
  for (const index of inconsistentGroups) {
    groups[index].status = 'INCONCLUSIVE';
    groups[index].reason = crossReadReason;
  }
  const failures = groups.filter(group => group.status !== 'SATISFIED');
  const status = failures.some(group => group.status === 'INCONCLUSIVE') ? 'INCONCLUSIVE'
    : failures.length ? 'NOT_SATISFIED' : 'SATISFIED';
  const retryAfter = failures.length ? new Date(Math.min(...failures.map(group => Date.parse(group.observation?.retryAfter
    ?? new Date(Date.parse(observedAt) + checked.groups.find(row => row.groupId === group.groupId).contract.retryIntervalMs).toISOString())))).toISOString() : null;
  const observation = { schema: 'outsider/effect-precondition-round-observation/v1', status,
    reason: inconsistentGroups.size ? crossReadReason : status === 'SATISFIED' ? 'ALL_GROUPS_SATISFIED' : status === 'NOT_SATISFIED'
      ? 'GROUP_CONDITIONS_NOT_SATISFIED' : 'GROUP_EVIDENCE_INCONCLUSIVE',
    contractHash: checked.parentPreconditionContractHash, observationOccurrence: checked.observationOccurrence,
    observationStartedAt: checked.observationStartedAt, observedAt, groups,
    evidenceHashes: [...new Set(groups.flatMap(group => group.observation?.evidenceHashes ?? []))],
    ...(retryAfter === null ? {} : { retryAfter }), pointObservationOnly: true,
    simultaneousSatisfactionProven: false, continuousValidityClaimed: false,
    atomicCheckAndAct: false, observerAuthorityExpanded: false };
  await appendEvent(context.file, context.events, () => observedAt, 'NODE_PRECONDITION_ROUND_COMPLETED', {
    nodeId: node.nodeId, route, operationId: checked.operationId,
    observationOccurrence: checked.observationOccurrence, observation });
  return observation;
}

async function callNodeRoute(context, node, route, requirementId, continuation = null) {
  // A continuation is another explicitly accepted operation of this original
  // requirement. Its receipt never overwrites the first effect or runs through
  // an observation adapter. Legacy programs have no continuation contract.
  const completedType = continuation ? 'NODE_CONTINUATION_COMPLETED' : 'NODE_EFFECT_COMPLETED';
  const requestedType = continuation ? 'NODE_CONTINUATION_REQUESTED' : 'NODE_EFFECT_REQUESTED';
  const identifies = payload => payload.nodeId === node.nodeId && payload.route === route
    && (!continuation || payload.continuation?.continuationId === continuation.continuationId);
  const completed = continuation ? eventFor(context.events, completedType, identifies) : null;
  if (completed && !same(completed.payload.continuation, continuation)) fail('CONTINUATION_REPLAY_MISMATCH');
  const existing = continuation ? completed?.payload.result ?? null : nodeRouteResult(context.events, node.nodeId, route);
  if (existing !== null) return { status: "DONE", result: existing };
  const requirement = context.maps.requirements.get(requirementId);
  const { adapter, binding } = adapterForRequirement(
    context.adapters, context.events, requirementId);
  const revision = revisionContext(context, requirementId);
  if (isA2ARecoveryRequirement(context.program, requirementId)
    && (adapter.connectionHash !== requirement.constraints.connectionHash
      || binding.providerRef !== null && adapter.providerRef !== binding.providerRef))
    fail('A2A_RECOVERY_ADAPTER_CONNECTION_MISMATCH', requirementId);
  if (revision.resourceRevision && (adapter.connectionHash !== revision.resourceRevision.acceptedConnectionHash
    || adapter.providerRef !== binding.providerRef)) fail('RESOURCE_REVISION_ADAPTER_CONNECTION_MISMATCH');
  const op = operationId(context.program.programHash,
    continuation ? `CONTINUE_${continuation.continuationId}` : `EXECUTE_${route}`, node.nodeId);
  const requested = eventFor(context.events, requestedType, identifies);
  if (requested && continuation && !same(requested.payload.continuation, continuation)) fail('CONTINUATION_REPLAY_MISMATCH');
  const contract = context.preconditions.get(node.nodeId);
  if (contract && adapter.supportsResumeOnly !== true) return preconditionPause(context, node, route, {
    operationId: op, reason: requested ? 'PRECONDITION_EFFECT_RECONCILIATION_REQUIRED' : 'PRECONDITION_RESUME_ONLY_REQUIRED' });
  const window = context.executionWindows.get(node.nodeId);
  const schedule = scheduleRevisionForNode(context, node);
  if (requested && (Object.hasOwn(requested.payload, 'executionWindow')
    && !same(requested.payload.executionWindow, window ?? null)
    || (requested.payload.scheduleRevisionHash ?? null) !== (schedule?.revisionHash ?? null)))
    fail('EXECUTION_WINDOW_REPLAY_MISMATCH');
  const limitsAt = instant => ({ late: window?.latestStartAt && Date.parse(instant) > Date.parse(window.latestStartAt),
    expired: ([OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA].includes(context.program.schema) || Boolean(contract))
      && Date.parse(instant) >= Date.parse(context.program.completionDeadline) });
  let { late, expired } = limitsAt(context.now());
  const checkLimits = async () => {
    if ((late || expired) && !requested) {
      const result = { status: 'FAILED', reason: expired ? 'EXECUTION_COMPLETION_DEADLINE_PASSED' : 'EXECUTION_LATEST_START_MISSED',
        effectNotDispatched: true, providerCallPerformed: false, ...(window ? { executionWindow: window } : {}) };
      await appendEvent(context.file, context.events, context.now, completedType, {
        nodeId: node.nodeId, route, requirementId, operationId: op, result,
        ...(continuation ? { continuation } : {}) });
      return { status: 'DONE', result };
    }
    if ((late || expired) && adapter.supportsResumeOnly !== true) return { status: 'PAUSED', paused: {
      phase: `EXECUTE_${route}`, subjectId: node.nodeId, operationId: op,
      reason: expired ? 'EXECUTION_DEADLINE_RECONCILIATION_REQUIRED' : 'EXECUTION_WINDOW_RECONCILIATION_REQUIRED',
      retryAfter: new Date(Math.min(Date.parse(context.now()) + 60000,
        Date.parse(context.program.completionDeadline))).toISOString(), ...(window ? { executionWindow: window } : {}) } };
    return null;
  };
  const limited = await checkLimits();
  if (limited) return limited;
  let preconditionEvidence = requested?.payload.preconditionEvidence ?? null;
  if (!requested && contract) {
    const checked = await observeExecutionPreconditions(context, node, route, op);
    if (checked.status === 'PAUSED') return checked;
    const dispatchAt = context.now();
    ({ late, expired } = limitsAt(dispatchAt));
    const afterReadLimit = await checkLimits();
    if (afterReadLimit) return afterReadLimit;
    if (window && Date.parse(dispatchAt) < Date.parse(window.notBefore)) return { status: 'PAUSED', paused: {
      phase: 'EXECUTION_WINDOW', subjectId: node.nodeId, reason: 'EXECUTION_NOT_BEFORE',
      retryAfter: window.notBefore, executionWindow: window } };
    let observation;
    if (checked.multiSource) observation = await completePreconditionRound(context, node, route, checked, dispatchAt);
    else try {
      observation = projectEffectPreconditionObservation({ binding: checked.binding, observation: checked.rawObservation,
        observationStartedAt: checked.observationStartedAt, observedAt: dispatchAt });
    } catch {
      return preconditionPause(context, node, route, { operationId: checked.operationId,
        observationOccurrence: checked.observationOccurrence, reason: 'PRECONDITION_OBSERVATION_UNAVAILABLE' });
    }
    if (observation.status !== 'SATISFIED') return preconditionPause(context, node, route, {
      operationId: checked.operationId, observationOccurrence: checked.observationOccurrence,
      observationStatus: observation.status, reason: observation.reason, retryAfter: observation.retryAfter,
      ...(checked.multiSource ? { groupIds: observation.groups.filter(group => group.status !== 'SATISFIED').map(group => group.groupId) } : {}) });
    preconditionEvidence = { operationId: checked.operationId, observationOccurrence: checked.observationOccurrence, observation };
  }
  if (!requested) {
    await appendEvent(context.file, context.events, context.now,
      requestedType, {
        nodeId: node.nodeId,
        route,
        requirementId,
        adapterId: binding.adapterId,
        reservationId:
          reservation(context.events, requirementId).reservationId,
        operationId: op,
        ...(continuation ? { continuation } : {}),
        ...(preconditionEvidence ? { preconditionEvidence } : {}),
        ...(window ? { executionWindow: window } : {}),
        ...(schedule ? { scheduleRevisionHash: schedule.revisionHash } : {}),
        ...(revision.resourceRevision ? { resourceRevisionHash: revision.resourceRevision.revisionHash,
          executionRevision: revision.executionRevision, acceptedConnectionHash: revision.resourceRevision.acceptedConnectionHash } : {}),
      });
  }
  try {
    const execute = continuation ? adapter.executeContinuation : adapter.execute;
    if (typeof execute !== 'function') fail('CONTINUATION_EXECUTOR_REQUIRED');
    const result = validateEffectResult(await execute.call(adapter, {
      program: context.program,
      node,
      route,
      requirement,
      binding,
      reservation: reservation(context.events, requirementId),
      ...revision,
      operationId: op,
      ...(continuation ? { continuation } : {}),
      ...(preconditionEvidence ? { preconditionEvidence } : {}),
      ...(window ? { executionWindow: window } : {}),
      ...(schedule ? { scheduleRevision: { revisionHash: schedule.revisionHash, revisionChainHash: schedule.revisionChainHash,
        effectiveExecutionContractHash: schedule.effectiveExecutionContractHash } } : {}),
      ...(late || expired || contract && requested && adapter.supportsResumeOnly === true ? { resumeOnly: true } : {}),
      dependencyEvidence: dependencyEvidenceForNode(context, node),
      primaryFailure: route === "RECOVERY"
        ? nodeRouteResult(context.events, node.nodeId, "PRIMARY") : null,
    }));
    await appendEvent(context.file, context.events, context.now,
      completedType, {
        nodeId: node.nodeId,
        route,
        requirementId,
        operationId: op,
        result,
        ...(continuation ? { continuation } : {}),
      });
    return { status: "DONE", result };
  } catch (error) {
    return {
      status: "PAUSED",
      paused: {
        phase: `EXECUTE_${route}`,
        subjectId: node.nodeId,
        operationId: op,
        error: publicFailure(error),
      },
    };
  }
}

async function continueOriginalRequirement(context, node) {
  const requirement = context.maps.requirements.get(node.primaryRequirementId);
  if (requirement?.constraints?.executionContinuationContract !== 'AUTHORIZED_ORIGINAL_REQUIREMENT_CONTINUATION_V1')
    return { status: 'DONE' };
  const { adapter, binding } = adapterForRequirement(context.adapters, context.events, node.primaryRequirementId);
  if (typeof adapter.pendingContinuation !== 'function' || typeof adapter.executeContinuation !== 'function'
    || adapter.supportsResumeOnly !== true) fail('CONTINUATION_ADAPTER_REQUIRED');
  const processed = new Set();
  for (let index = 0; index < 16; index++) {
    const open = context.events.find(event => event.eventType === 'NODE_CONTINUATION_REQUESTED'
      && event.payload.nodeId === node.nodeId && !context.events.some(done => done.eventType === 'NODE_CONTINUATION_COMPLETED'
        && done.payload.nodeId === node.nodeId
        && done.payload.continuation?.continuationId === event.payload.continuation?.continuationId));
    let continuation;
    try { continuation = open?.payload.continuation ?? await adapter.pendingContinuation({
      program: context.program, node, requirement, binding }); }
    catch (error) { return { status: 'PAUSED', paused: { phase: 'EXECUTION_CONTINUATION', subjectId: node.nodeId,
      reason: 'CONTINUATION_STATE_UNAVAILABLE', error: publicFailure(error) } }; }
    if (continuation == null) return { status: 'DONE' };
    continuation = snapshot(continuation, 'CONTINUATION_NOT_CANONICAL');
    if (Object.keys(continuation).sort().join(',') !== 'authorizationHash,continuationId,inputHash'
      || !IDENTIFIER.test(continuation.continuationId ?? '')
      || !HASH.test(continuation.authorizationHash ?? '') || !HASH.test(continuation.inputHash ?? ''))
      fail('CONTINUATION_BINDING_INVALID');
    if (processed.has(continuation.continuationId)) return { status: 'DONE' };
    processed.add(continuation.continuationId);
    const result = await callNodeRoute(context, node, 'PRIMARY', node.primaryRequirementId, continuation);
    if (result.status === 'PAUSED') return result;
  }
  return { status: 'PAUSED', paused: { phase: 'EXECUTION_CONTINUATION', subjectId: node.nodeId,
    reason: 'CONTINUATION_BATCH_YIELD', retryAfter: context.now() } };
}

async function callNodeWitness(context, node, effectiveRoute, effectResult) {
  const existing = nodeWitnessResult(context.events, node.nodeId);
  if (existing !== null) return { status: "DONE", result: existing };
  const requirementId = node.witnessRequirementId;
  const requirement = context.maps.requirements.get(requirementId);
  const { adapter, binding } = adapterForRequirement(
    context.adapters, context.events, requirementId);
  const observationOccurrence
    = witnessInconclusiveEvents(context.events, node.nodeId).length + 1;
  const expectedOperationId = operationId(context.program.programHash,
    `OBSERVE_${observationOccurrence}`, node.nodeId);
  const requested = eventFor(context.events, "NODE_WITNESS_REQUESTED",
    (payload) => payload.nodeId === node.nodeId
      && (payload.observationOccurrence === observationOccurrence
        // Compatibility with the first v1 occurrence written before the
        // explicit occurrence field existed.
        || (observationOccurrence === 1
          && payload.observationOccurrence === undefined)));
  const op = requested?.payload.operationId ?? expectedOperationId;
  if (requested !== null && op !== expectedOperationId
    && requested.payload.observationOccurrence !== undefined) {
    fail("WITNESS_OPERATION_REPLAY_MISMATCH", node.nodeId);
  }
  if (requested === null) {
    await appendEvent(context.file, context.events, context.now,
      "NODE_WITNESS_REQUESTED", {
        nodeId: node.nodeId,
        effectiveRoute,
        requirementId,
        adapterId: binding.adapterId,
        reservationId:
          reservation(context.events, requirementId).reservationId,
        observationOccurrence,
        operationId: op,
      });
  }
  try {
    const rawObservation = await adapter.observe({
      program: context.program,
      node,
      effectiveRoute,
      effectResult,
      acceptance: node.acceptance,
      requirement,
      binding,
      reservation: reservation(context.events, requirementId),
      operationId: op,
      observationOccurrence,
    });
    const recordedAt = context.now();
    const observation = observationWithRecordedTime(
      rawObservation, recordedAt);
    if (observation.status === "INCONCLUSIVE") {
      await appendEvent(context.file, context.events, () => recordedAt,
        "NODE_WITNESS_INCONCLUSIVE", {
          nodeId: node.nodeId,
          effectiveRoute,
          requirementId,
          observationOccurrence,
          operationId: op,
          observation,
        });
      return {
        status: "PAUSED",
        paused: {
          phase: "OBSERVE",
          subjectId: node.nodeId,
          operationId: op,
          observationOccurrence,
          observationStatus: "INCONCLUSIVE",
          reason: observation.reason ?? null,
          retryAfter: observation.retryAfter ?? null,
        },
      };
    }
    await appendEvent(context.file, context.events, () => recordedAt,
      "NODE_WITNESS_COMPLETED", {
        nodeId: node.nodeId,
        effectiveRoute,
        requirementId,
        observationOccurrence,
        operationId: op,
        observation,
      });
    return { status: "DONE", result: observation };
  } catch (error) {
    return {
      status: "PAUSED",
      paused: {
        phase: "OBSERVE",
        subjectId: node.nodeId,
        operationId: op,
        observationOccurrence,
        error: publicFailure(error),
      },
    };
  }
}

async function executeNode(context, node) {
  if (isNodeSatisfied(context.events, node.nodeId)
    || nodeHasTerminalFailure(context.events, node.nodeId)) {
    return { status: "DONE" };
  }
  const window = context.executionWindows.get(node.nodeId);
  if (window && Date.parse(context.now()) < Date.parse(window.notBefore)
    && !eventFor(context.events, 'NODE_EFFECT_REQUESTED', payload => payload.nodeId === node.nodeId)
    && !eventFor(context.events, 'NODE_WITNESS_REQUESTED', payload => payload.nodeId === node.nodeId)) {
    return { status: 'PAUSED', paused: { phase: 'EXECUTION_WINDOW', subjectId: node.nodeId,
      reason: 'EXECUTION_NOT_BEFORE', retryAfter: window.notBefore, executionWindow: window } };
  }
  if (node.kind === "TRANSACTION") {
    // Dependencies are satisfied by executeDag before this provider write.
    // Only a V4 A2A transaction can have a preaccepted, non-reserved substitute.
    let primary = nodeRouteResult(context.events, node.nodeId, "PRIMARY");
    if (primary === null) {
      const called = await callNodeRoute(context, node, "PRIMARY", node.primaryRequirementId);
      if (called.status === "PAUSED") return called;
      primary = called.result;
    }
    let route = 'PRIMARY', effectiveResult = primary;
    const continuableFailure = primary.status === 'FAILED' && primary.effectNotDispatched === true
      && allowsOriginalRequirementContinuation(context.program, node);
    if (primary.status === 'FAILED' && !continuableFailure) {
      if (!isA2ARecoveryTransaction(context.program, node)) return { status: 'DONE' };
      const called = await callNodeRoute(context, node, 'RECOVERY', node.recoveryRequirementId);
      if (called.status === 'PAUSED') return called;
      route = 'RECOVERY'; effectiveResult = called.result;
    }
    if (effectiveResult.status === 'FAILED' && !continuableFailure) return { status: 'DONE' };
    const continuation = await continueOriginalRequirement(context, node);
    if (continuation.status === 'PAUSED') return continuation;
    return callNodeWitness(context, node, route, { ...effectiveResult,
      effectRecordedAt: nodeRouteEvent(context.events, node.nodeId, route)?.recordedAt ?? null });
  }
  if (node.kind !== "EFFECT") {
    const dependencyEvidence = dependencyEvidenceForNode(context, node);
    if (node.witnessRequirementId === null) {
      fail("NON_EFFECT_NODE_WITNESS_REQUIREMENT_MISSING", node.nodeId);
    }
    return callNodeWitness(context, node, node.kind, {
      status: "SUCCEEDED",
      source: "SATISFIED_DEPENDENCIES",
      dependencyEvidence,
    });
  }
  if (node.primaryRequirementId === null
    || node.recoveryRequirementId === null
    || node.witnessRequirementId === null) {
    fail("EFFECT_NODE_THREE_ROLE_REQUIREMENTS_MISSING", node.nodeId);
  }
  let primary = nodeRouteResult(context.events, node.nodeId, "PRIMARY");
  if (primary === null) {
    const called = await callNodeRoute(context, node, "PRIMARY",
      node.primaryRequirementId);
    if (called.status === "PAUSED") return called;
    primary = called.result;
  }
  let effectiveRoute = "PRIMARY";
  let effectiveResult = primary;
  if (primary.status === "FAILED") {
    const called = await callNodeRoute(context, node, "RECOVERY",
      node.recoveryRequirementId);
    if (called.status === "PAUSED") return called;
    effectiveRoute = "RECOVERY";
    effectiveResult = called.result;
  }
  if (effectiveResult.status === "FAILED") return { status: "DONE" };
  const effectiveEvent = nodeRouteEvent(context.events, node.nodeId,
    effectiveRoute);
  return callNodeWitness(context, node, effectiveRoute, {
    ...effectiveResult,
    effectRecordedAt: effectiveEvent?.recordedAt ?? null,
  });
}

async function executeDag(context) {
  const waiting = new Map(context.nativeReplacementPauses ?? []);
  while (true) {
    const unfinished = context.program.nodes.filter((node) =>
      !isNodeSatisfied(context.events, node.nodeId)
      && !nodeHasTerminalFailure(context.events, node.nodeId));
    if (unfinished.length === 0) break;
    const ready = unfinished.filter((node) => !waiting.has(node.nodeId) && node.dependsOn.every(
      (dependency) => isNodeSatisfied(context.events, dependency)));
    if (ready.length === 0) break;
    const results = await Promise.all(ready.map((node) =>
      executeNode(context, node)));
    for (let index = 0; index < results.length; index++) {
      if (results[index].status === 'PAUSED') waiting.set(ready[index].nodeId, results[index]);
    }
    // A local device or supplier can be offline while unrelated cloud steps
    // become ready. Continue those branches in the SAME confirmed program;
    // retry a waiting operation only on the next original Node wake.
    if (context.program.nodes.some((node) =>
      nodeHasTerminalFailure(context.events, node.nodeId))) break;
  }
  if (context.executionWindows.size && context.program.nodes.some(node => nodeHasTerminalFailure(context.events, node.nodeId)))
    return { status: 'DONE', succeeded: false };
  if (waiting.size) {
    if (!context.executionWindows.size && !context.preconditions.size && !context.nativeReplacementPauses?.size) return waiting.values().next().value;
    // One later window cannot suppress an existing provider's nearer retry.
    // This returns timing to the original Node's nextWakeAt mechanism; there
    // is no timer, detached worker or second order scheduler here.
    const now = Date.parse(context.now()), deadline = Date.parse(context.program.completionDeadline);
    const candidates = [...waiting.values()].map(result => ({ ...result, paused: { ...result.paused,
      retryAfter: new Date(Math.min(deadline, Number.isFinite(Date.parse(result.paused.retryAfter))
        ? Math.max(now, Date.parse(result.paused.retryAfter)) : now + 60000)).toISOString() } }));
    candidates.sort((a, b) => a.paused.retryAfter.localeCompare(b.paused.retryAfter));
    return candidates[0];
  }
  const succeeded = context.program.nodes.every((node) =>
    isNodeSatisfied(context.events, node.nodeId));
  return { status: "DONE", succeeded };
}

function obligationApplies(obligation, succeeded, events) {
  if (["ON_SUCCESS", "OUTCOME_SUCCEEDED"].includes(obligation.trigger)) {
    return succeeded;
  }
  if (["ON_FAILURE", "OUTCOME_FAILED"].includes(obligation.trigger)) {
    return !succeeded;
  }
  if (obligation.trigger === "AFTER_NODE") {
    return obligation.nodeId !== null
      && (isNodeSatisfied(events, obligation.nodeId)
        || nodeHasTerminalFailure(events, obligation.nodeId));
  }
  return true;
}

async function closeObligations(context, succeeded) {
  for (const obligation of context.program.obligations) {
    if (eventFor(context.events, "OBLIGATION_CLOSED", (payload) =>
      payload.obligationId === obligation.obligationId)) continue;
    const applies = obligationApplies(obligation, succeeded, context.events);
    if (!applies) {
      await appendEvent(context.file, context.events, context.now,
        "OBLIGATION_CLOSED", {
          obligationId: obligation.obligationId,
          status: "NOT_APPLICABLE",
          receipt: null,
        });
      continue;
    }
    const requirementId = obligation.targetRequirementId;
    const requirement = context.maps.requirements.get(requirementId);
    const { adapter, binding } = adapterForRequirement(
      context.adapters, context.events, requirementId);
    const op = operationId(context.program.programHash,
      "CLOSE_OBLIGATION", obligation.obligationId);
    if (!eventFor(context.events, "OBLIGATION_CLOSE_REQUESTED", (payload) =>
      payload.obligationId === obligation.obligationId)) {
      await appendEvent(context.file, context.events, context.now,
        "OBLIGATION_CLOSE_REQUESTED", {
          obligationId: obligation.obligationId,
          requirementId,
          adapterId: binding.adapterId,
          operationId: op,
        });
    }
    try {
      const result = snapshot(await adapter.closeObligation({
        program: context.program,
        requirement,
        obligation,
        outcomeSucceeded: succeeded,
        binding,
        reservation: reservation(context.events, requirementId),
        ...revisionContext(context, requirementId),
        operationId: op,
      }), "OBLIGATION_RESULT_NOT_CANONICAL");
      if (result?.adapterState !== undefined
        && result.adapterState !== null) {
        await appendEvent(context.file, context.events, context.now,
          "OBLIGATION_CLOSE_PROGRESS", {
            obligationId: obligation.obligationId,
            requirementId,
            operationId: op,
            status: result.status ?? null,
            adapterState: result.adapterState,
          });
      }
      if (result?.status !== "CLOSED") fail("OBLIGATION_NOT_CLOSED");
      await appendEvent(context.file, context.events, context.now,
        "OBLIGATION_CLOSED", {
          obligationId: obligation.obligationId,
          status: "CLOSED",
          receipt: result.receipt ?? null,
        });
    } catch (error) {
      return {
        status: "PAUSED",
        paused: {
          phase: "CLOSE_OBLIGATION",
          subjectId: obligation.obligationId,
          operationId: op,
          error: publicFailure(error),
        },
      };
    }
  }
  return { status: "DONE" };
}

async function releaseReservations(context, disposition) {
  for (const requirement of context.program.requirements) {
    const confirmed = reservation(context.events, requirement.requirementId);
    const requested = eventFor(context.events, "RESERVATION_REQUESTED", (payload) =>
      payload.requirementId === requirement.requirementId);
    if (confirmed === null && requested === null) continue;
    if (eventFor(context.events, "RESERVATION_RELEASED", (payload) =>
      payload.requirementId === requirement.requirementId)) continue;
    const { adapter, binding } = adapterForRequirement(
      context.adapters, context.events, requirement.requirementId);
    // An asynchronous reservation may acquire capacity after formation has
    // expired, without ever becoming an admitted reservation. Adapters which
    // track that effect explicitly must reconcile it in this same closure.
    const unconfirmed = confirmed === null;
    if (unconfirmed && typeof adapter.closePendingReservation !== "function") continue;
    const op = operationId(context.program.programHash,
      "RELEASE", requirement.requirementId);
    if (!eventFor(context.events, "RESERVATION_RELEASE_REQUESTED", (payload) =>
      payload.requirementId === requirement.requirementId)) {
      await appendEvent(context.file, context.events, context.now,
        "RESERVATION_RELEASE_REQUESTED", {
          requirementId: requirement.requirementId,
          adapterId: binding.adapterId,
          operationId: op,
          disposition,
          ...(unconfirmed ? { unconfirmedReservation: true,
            reservationOperationId: requested.payload.operationId } : {}),
        });
    }
    try {
      const result = snapshot(await adapter[unconfirmed ? "closePendingReservation" : "release"]({
        program: context.program,
        requirement,
        binding,
        reservation: confirmed,
        ...revisionContext(context, requirement.requirementId),
        disposition,
        operationId: op,
        ...(unconfirmed ? { reservationOperationId: requested.payload.operationId } : {}),
      }), "RELEASE_RESULT_NOT_CANONICAL");
      if (result?.status !== "RELEASED" && result?.status !== "CLOSED") {
        fail("RESERVATION_NOT_RELEASED");
      }
      await appendEvent(context.file, context.events, context.now,
        "RESERVATION_RELEASED", {
          requirementId: requirement.requirementId,
          status: result.status,
          receipt: result.receipt ?? null,
          ...(unconfirmed ? { unconfirmedReservation: true } : {}),
        });
    } catch (error) {
      return {
        status: "PAUSED",
        paused: {
          phase: "RELEASE",
          subjectId: requirement.requirementId,
          operationId: op,
          error: publicFailure(error),
        },
      };
    }
  }
  return { status: "DONE" };
}

async function recordTelemetry(context) {
  if (eventFor(context.events, "ZERO_INTERNAL_OPS_TELEMETRY")) return;
  const measurementInjected = typeof context.measureOperations === "function";
  const raw = measurementInjected
    ? await context.measureOperations({ program: context.program }) : {
      outsiderStaffTouchCount: null,
      humanQueueCreated: null,
      source: "UNOBSERVED_NO_MEASUREMENT_SOURCE",
    };
  const value = snapshot(raw, "OPERATIONS_TELEMETRY_NOT_CANONICAL");
  const staffTouchCount = value?.outsiderStaffTouchCount;
  const humanQueueCreated = value?.humanQueueCreated;
  if ((staffTouchCount !== null
      && (!Number.isSafeInteger(staffTouchCount) || staffTouchCount < 0))
    || (humanQueueCreated !== null
      && typeof humanQueueCreated !== "boolean")
    || typeof value?.source !== "string" || value.source.length < 1
    || Buffer.byteLength(value.source, "utf8") > 256) {
    fail("OPERATIONS_TELEMETRY_INVALID");
  }
  await appendEvent(context.file, context.events, context.now,
    "ZERO_INTERNAL_OPS_TELEMETRY", {
      outsiderStaffTouchCount: staffTouchCount,
      humanQueueCreated,
      measurementObserved: measurementInjected
        && staffTouchCount !== null && humanQueueCreated !== null,
      zeroInternalOpsObserved:
        measurementInjected && staffTouchCount === 0
          && humanQueueCreated === false,
      source: value.source,
    });
}

async function closeAndFinish(context, outcomeState, detail = null) {
  if (!eventFor(context.events, "CLOSURE_STARTED")) {
    await appendEvent(context.file, context.events, context.now,
      "CLOSURE_STARTED", { outcomeState, detail });
  }
  const replacementCleanup = await advanceNativeResourceReplacements(context, true);
  if (replacementCleanup.size) return replacementCleanup.values().next().value;
  if (outcomeState !== "UNAVAILABLE") {
    const obligations = await closeObligations(
      context, outcomeState === "SUCCEEDED");
    if (obligations.status === "PAUSED") return obligations;
  }
  const released = await releaseReservations(context, outcomeState);
  if (released.status === "PAUSED") return released;
  await recordTelemetry(context);
  const telemetry = eventFor(
    context.events, "ZERO_INTERNAL_OPS_TELEMETRY").payload;
  const zeroInternalOpsObserved = telemetry.measurementObserved === true
    && telemetry.outsiderStaffTouchCount === 0
    && telemetry.humanQueueCreated === false
    && telemetry.zeroInternalOpsObserved === true;
  let terminalEvent = "PROGRAM_FAILED_CLOSED";
  if (outcomeState === "UNAVAILABLE") terminalEvent = "PROGRAM_UNAVAILABLE";
  else if (outcomeState === "SUCCEEDED"
    && zeroInternalOpsObserved) terminalEvent = "PROGRAM_SUCCEEDED";
  await appendEvent(context.file, context.events, context.now, terminalEvent, {
    outcomeState,
    detail,
    zeroInternalOpsObserved,
  });
  return { status: "DONE" };
}

function validateProgramShape(program) {
  const normalized = verifyExecutableOutcomeProgram(program);
  if (normalized.programHash !== program.programHash
    || !HASH.test(normalized.programHash)) fail("PROGRAM_HASH_INVALID");
  return normalized;
}

// Internal recovery seam: retain checked, closed components of this exact
// program while reopening only selected nodes. No adapter is invoked and the
// original journal stays immutable. The caller publishes the returned bytes
// atomically with its original-order recovery record.
export function planOutcomeProgramReworkInheritance({ directory, programId, resetNodeIds }) {
  const events = readOutcomeProgramJournal(journalPath(directory, programId)), program = validateProgramShape(acceptedProgram(events));
  const source = projection(events), reset = new Set(resetNodeIds ?? []);
  if (!['SUCCEEDED','FAILED_CLOSED'].includes(source.state) || !reset.size
    || reset.size !== resetNodeIds.length || [...reset].some(id => !program.nodes.some(node => node.nodeId === id))) fail('REWORK_SOURCE_INVALID');
  if (events.some(row => /(?:REVISION|REPLACEMENT).*ACCEPTED/u.test(row.eventType))) fail('REWORK_REVISED_SOURCE_UNSUPPORTED');
  const retained = program.nodes.filter(node => !reset.has(node.nodeId));
  if (!retained.length || retained.some(node => !isNodeSatisfied(events, node.nodeId)
    || node.dependsOn.some(id => reset.has(id)))) fail('REWORK_RETAINED_NODE_NOT_COMPLETE_OR_DEPENDENT');
  const resources = nodes => new Set(nodes.flatMap(node => [node.primaryRequirementId,node.recoveryRequirementId,node.witnessRequirementId,
    node.input?.executionPreconditions?.observerRequirementId].filter(Boolean)));
  const retainedResources = resources(retained), resetResources = resources(program.nodes.filter(node => reset.has(node.nodeId)));
  if ([...retainedResources].some(id => resetResources.has(id))) fail('REWORK_SHARED_RESOURCE_UNSUPPORTED');
  if ([...retainedResources].some(id => !['CLOSED','RELEASED'].includes(source.releases[id]?.status))) fail('REWORK_RETAINED_RESOURCE_NOT_CLOSED');
  const obligations = new Set(program.obligations.filter(row => retainedResources.has(row.targetRequirementId)).map(row => row.obligationId));
  if ([...obligations].some(id => !['CLOSED','NOT_APPLICABLE'].includes(source.obligations[id]?.status))) fail('REWORK_RETAINED_OBLIGATION_NOT_CLOSED');
  const commit = events.findIndex(row => row.eventType === 'PROGRAM_COMMITTED');
  if (commit < 0 || events.slice(0,commit+1).some(row => row.eventType === 'NODE_EFFECT_REQUESTED')) fail('REWORK_COMMITTED_PREFIX_REQUIRED');
  const retainedIds = new Set(retained.map(node => node.nodeId));
  const inherited = events.slice(commit+1).filter(row => row.eventType.startsWith('NODE_') && retainedIds.has(row.payload.nodeId)
    || ['RESERVATION_RELEASE_REQUESTED','RESERVATION_RELEASED'].includes(row.eventType) && retainedResources.has(row.payload.requirementId)
    || ['OBLIGATION_CLOSE_REQUESTED','OBLIGATION_CLOSED'].includes(row.eventType) && obligations.has(row.payload.obligationId));
  const provenance = { sourceJournalHeadHash: source.journalHeadHash, programHash: program.programHash,
    resetNodeIds: [...reset].sort(), retainedNodeIds: [...retainedIds].sort(), retainedRequirementIds: [...retainedResources].sort(),
    sourceEventHashes: inherited.map(row => row.eventHash), newResourceAuthorityGranted: false };
  const output = events.slice(0,commit+1);
  for (const row of [{eventType:'REWORK_COMPONENTS_INHERITED',recordedAt:events.at(-1).recordedAt,payload:provenance},...inherited]) {
    const body = { schema: OUTSIDER_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR_V1_SCHEMAS.journalEvent, schemaVersion:'1.0.0',
      sequence:output.length+1, previousEventHash:output.at(-1).eventHash, recordedAt:row.recordedAt,eventType:row.eventType,payload:row.payload };
    output.push({...body,eventHash:sha256(body.schema,body)});
  }
  return { ...provenance, source, journal: output.map(row=>canonicalizeStrict(row)).join('\n')+'\n' };
}

/**
 * Create one single-writer orchestrator instance.
 *
 * adapters: Map/object keyed by adapterId. All adapters implement reserve and
 * release. reserve receives dependencyReservations keyed by requirement id.
 * Optional closePendingReservation reconciles a requested but unconfirmed
 * reservation during closure. It receives reservationOperationId and the
 * stable release operationId; it must never initiate a new reservation.
 * PRIMARY/RECOVERY implement execute; INDEPENDENT_WITNESS implements observe;
 * obligation target adapters implement closeObligation.
 * Explicit executionPreconditions additionally require observePreconditions
 * on the selected witness and supportsResumeOnly on every possible executor.
 *
 * discover is optional when run(..., { bindings }) supplies every per-order
 * requirement binding.  Both paths may select only a registered adapter.
 */
export function createDurableOutcomeProgramOrchestratorV1(options = {}) {
  if (options === null || typeof options !== "object") fail("OPTIONS_INVALID");
  if (typeof options.directory !== "string" || options.directory.length === 0) {
    fail("DIRECTORY_INVALID");
  }
  if (options.adapters === null || typeof options.adapters !== "object") {
    fail("ADAPTERS_INVALID");
  }
  const directory = path.resolve(options.directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const now = options.clock ?? (() => new Date().toISOString());
  if (typeof now !== "function") fail("CLOCK_INVALID");
  const active = new Set();

  async function run(programInput, runOptions = {}) {
    const supplied = programInput === null
      ? null : validateProgramShape(snapshot(programInput, "PROGRAM_INVALID"));
    const programId = supplied?.programId
      ?? assertIdentifier(runOptions.programId, "PROGRAM_ID_INVALID");
    const file = journalPath(directory, programId);
    if (active.has(file)) fail("PROGRAM_ALREADY_RUNNING", programId);
    active.add(file);
    try {
      const events = readOutcomeProgramJournal(file);
      if (events.length === 0) {
        if (supplied === null) fail("PROGRAM_NOT_FOUND", programId);
        await appendEvent(file, events, now, "PROGRAM_ACCEPTED", {
          program: supplied,
        });
        await appendEvent(file, events, now, "FORMATION_STARTED", {
          requirementCount: supplied.requirements.length,
          nodeCount: supplied.nodes.length,
        });
      }
      const program = acceptedProgram(events);
      if (supplied !== null
        && canonicalizeStrict(supplied) !== canonicalizeStrict(program)) {
        fail("PROGRAM_REPLAY_MISMATCH", programId);
      }
      const context = {
        program,
        executionWindows: executionWindowPlan(program, []),
        preconditions: new Map(program.nodes.filter(node => Object.hasOwn(node.input ?? {}, 'executionPreconditions'))
          .map(node => [node.nodeId, normalizeEffectPreconditions(node.input.executionPreconditions, { program, node })])),
        maps: buildProgramMaps(program),
        events,
        file,
        now,
        adapters: options.adapters,
        discover: options.discover,
        measureOperations: options.measureOperations,
      };
      validateProgramExecutionReferences(program, context.maps);
      await acceptResourceRevisions(context, runOptions);
      await acceptScheduleRevisions(context, runOptions);
      await acceptNativeResourceRevisions(context, runOptions);
      const finished = terminalState(events);
      if (finished !== null) return projection(events);
      if (runOptions.prepareOnly === true && eventFor(events, "PROGRAM_COMMITTED")) return projection(events);
      if (runOptions.confirmProgramHash !== undefined && !eventFor(events, "RESOURCE_FORMATION_PREPARED")) fail("PROGRAM_NOT_PREPARED");
      if (runOptions.prepareOnly === true && !eventFor(events, "USER_CONFIRMATION_REQUIRED")) {
        await appendEvent(file, events, now, "USER_CONFIRMATION_REQUIRED", { programId });
      }
      const existingClosure = eventFor(events, "CLOSURE_STARTED");
      if (existingClosure !== null) {
        const closed = await closeAndFinish(context,
          existingClosure.payload.outcomeState,
          existingClosure.payload.detail);
        return projection(events, closed.paused ?? null);
      }
      if (runOptions.cancelRequested === true) {
        const closed = await closeAndFinish(context, eventFor(events, 'PROGRAM_COMMITTED') ? 'FAILED' : 'UNAVAILABLE',
          { phase: 'CUSTOMER_REQUESTED_STOP' });
        return projection(events, closed.paused ?? null);
      }

      if (!eventFor(events, "PROGRAM_COMMITTED")) {
        if (Date.parse(now()) >= Date.parse(program.formationDeadline)) {
          const closed = await closeAndFinish(context, "UNAVAILABLE", {
            phase: "FORMATION_DEADLINE",
          });
          return projection(events, closed.paused ?? null);
        }
        const bound = await ensureBindings(context, runOptions);
        if (bound.status === "PAUSED") return projection(events, bound.paused);
        if (bound.status === "UNAVAILABLE") {
          const closed = await closeAndFinish(context, "UNAVAILABLE", {
            phase: "DISCOVERY", subjectId: bound.subjectId,
          });
          return projection(events, closed.paused ?? null);
        }
        validateIndependentBindings(program, events);
        validateBoundAdapterSurface(program, options.adapters, events);
        const preconditionSurfaces = await ensurePreconditionSurfaces(context);
        if (preconditionSurfaces.status === 'PAUSED') return projection(events, preconditionSurfaces.paused);
        const revised = await ensureResourceRevisionReadiness(context);
        if (revised.status === 'PAUSED') return projection(events, revised.paused);
        const reserved = await ensureReservations(context);
        if (reserved.status === "PAUSED") {
          return projection(events, reserved.paused);
        }
        if (reserved.status === "UNAVAILABLE") {
          const closed = await closeAndFinish(context, "UNAVAILABLE", {
            phase: "RESERVATION", subjectId: reserved.subjectId,
          });
          return projection(events, closed.paused ?? null);
        }
        if (Date.parse(now()) >= Date.parse(program.formationDeadline)) {
          const closed = await closeAndFinish(context, "UNAVAILABLE", {
            phase: "FORMATION_DEADLINE",
          });
          return projection(events, closed.paused ?? null);
        }
        // Replayed reservation receipts cannot outlive their original lease.
        // Confirmation never silently acquires a replacement or changes terms.
        const expired = program.requirements.find(requirement =>
          Date.parse(reservation(events, requirement.requirementId).validUntil) <= Date.parse(now()));
        if (expired) {
          const closed = await closeAndFinish(context, "UNAVAILABLE", { phase: "PREPARED_RESERVATION_EXPIRED", subjectId: expired.requirementId });
          return projection(events, closed.paused ?? null);
        }
        if (eventFor(events, "USER_CONFIRMATION_REQUIRED")) {
          if (!eventFor(events, "RESOURCE_FORMATION_PREPARED")) {
            await appendEvent(file, events, now, "RESOURCE_FORMATION_PREPARED", {
              programHash: program.programHash,
              reservedRequirementIds: program.requirements.map(item => item.requirementId),
              validUntil: program.requirements.map(item => reservation(events, item.requirementId).validUntil).sort()[0],
              // This is execution capacity, NOT proof of commercial quote,
              // external underwriting, owner authority or a capital promise.
              commercialTermsEstablished: false,
            });
          }
          if (runOptions.prepareOnly === true || runOptions.confirmProgramHash === undefined) return projection(events);
          if (runOptions.confirmProgramHash !== program.programHash) fail("PREPARED_CONFIRMATION_HASH_MISMATCH");
          await appendEvent(file, events, now, "USER_CONFIRMED_PREPARED_RESOURCES", { programHash: program.programHash });
        }
        await appendEvent(file, events, now, "PROGRAM_COMMITTED", {
          ...(program.commitmentMode ? { commitmentMode: program.commitmentMode, userOutcomePromiseIssued: false } : {}),
          committedRequirementIds:
            program.requirements.map((item) => item.requirementId),
          primaryRecoveryAndIndependentWitnessReserved: program.requirements.every(item => reservation(events, item.requirementId).capacityReserved !== false),
        });
      } else {
        validateIndependentBindings(program, events);
        validateBoundAdapterSurface(program, options.adapters, events);
      }

      if (Date.parse(now()) >= Date.parse(program.completionDeadline)) {
        const closed = await closeAndFinish(context, "FAILED", {
          phase: "COMPLETION_DEADLINE",
        });
        return projection(events, closed.paused ?? null);
      }

      const revised = await ensureResourceRevisionReadiness(context);
      if (revised.status === 'PAUSED') return projection(events, revised.paused);
      context.nativeReplacementPauses = await advanceNativeResourceReplacements(context);
      const execution = await executeDag(context);
      if (execution.status === "PAUSED") {
        const previousTiming = eventFor(events, 'EXECUTION_TIMING_PAUSED');
        if ((context.executionWindows.size || context.preconditions.size || context.nativeReplacementPauses?.size) && ((previousTiming?.sequence ?? 0) < (eventFor(events, 'SCHEDULE_REVISION_ACCEPTED')?.sequence ?? 0)
          || canonicalizeStrict(previousTiming?.payload.retry ?? null) !== canonicalizeStrict(execution.paused)))
          await appendEvent(file, events, now, 'EXECUTION_TIMING_PAUSED', { retry: execution.paused });
        return projection(events, execution.paused);
      }
      const outcomeState = execution.succeeded ? "SUCCEEDED" : "FAILED";
      const closed = await closeAndFinish(context, outcomeState,
        execution.succeeded ? null : { phase: "EXECUTION_OR_WITNESS" });
      return projection(events, closed.paused ?? null);
    } finally {
      active.delete(file);
    }
  }

  return Object.freeze({
    prepare(program, runOptions = {}) {
      return run(program, { ...runOptions, prepareOnly: true });
    },
    confirmPrepared(programId, programHash, runOptions = {}) {
      return run(null, { ...runOptions, programId, prepareOnly: false, confirmProgramHash: programHash });
    },
    run(program, runOptions = {}) {
      return run(program, runOptions);
    },
    resume(programId, runOptions = {}) {
      return run(null, { ...runOptions, programId });
    },
    inspect(programId) {
      assertIdentifier(programId, "PROGRAM_ID_INVALID");
      const events = readOutcomeProgramJournal(journalPath(directory, programId));
      if (events.length === 0) fail("PROGRAM_NOT_FOUND", programId);
      return projection(events);
    },
  });
}
