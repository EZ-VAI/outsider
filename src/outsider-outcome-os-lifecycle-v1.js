/*
 * Outsider Outcome OS lifecycle v1.
 *
 * A minimal, pure, in-memory lifecycle core over one provider/agent-neutral,
 * hash-only OutcomeContract. Callers may persist exportEvents() in their own
 * durable store and reconstruct the runtime from those exact events.
 *
 * This is Layer 1. It does not require primary, recovery, or witness routes;
 * it performs no I/O; and no event creates authority, a guarantee, an outcome
 * promise, independent outcome truth, or COMMIT.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS,
  EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
} from "./outsider-episode-attempt-set-composition.js";
import {
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS,
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS,
  verifyThreeLayerOutcomeProductArtifactV1,
} from "./outsider-three-layer-outcome-product-contract-v1.js";

const PREFIX = "OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const CONTRACT_ID = /^contract_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_EVENTS = 100_000;

export const OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS = Object.freeze({
  event: "outsider/outcome-os-lifecycle-event/v1",
  head: "outsider/outcome-os-lifecycle-head/v1",
  receipt: "outsider/outcome-os-lifecycle-event-receipt/v1",
  result: "outsider/outcome-os-lifecycle-operation-result/v1",
  read: "outsider/outcome-os-lifecycle-read/v1",
  replay: "outsider/outcome-os-lifecycle-replay/v1",
});

export const OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES = Object.freeze([
  "CONTRACT_CREATED",
  "CONTRACT_OPENED",
  "ATTEMPT_EVIDENCE_APPENDED",
  "OBSERVED_CLOSED",
  "CONTRACT_EXPIRED",
  "CONTRACT_SUPERSEDED",
]);

export const OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_STATES = Object.freeze([
  "CREATED", "OPEN", "OBSERVED_CLOSED", "EXPIRED", "SUPERSEDED",
]);

export const OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_GENESIS
  = `sha256:${createHash("sha256")
    .update("outsider/outcome-os-lifecycle-event/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY = deepFreeze({
  position: "PURE_HASH_ONLY_OUTCOME_OS_LIFECYCLE_NO_COMMIT",
  productLayer:
    OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs,
  primaryRoleRequired: false,
  recoveryRoleRequired: false,
  independentWitnessRoleRequired: false,
  outcomeProgramRequired: false,
  typedGraphPath:
    "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
  eventTypes: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES,
  appendOnlyRevisionRequired: true,
  exactPredecessorAndSupersessionLinkRequired: true,
  supersessionChangesCurrentHeadOnly: true,
  supersessionDeletesHistory: false,
  exactOperationIdempotencyRequired: true,
  expectedHeadCasRequiredForNewAppend: true,
  callerMustPersistExportedEventsForDurability: true,
  storageIoPerformed: false,
  networkIoPerformed: false,
  rawEvidenceBytesAccepted: false,
  directPiiAccepted: false,
  directPiiProjected: false,
  hashReferencesMayRemainLinkable: true,
  attemptFoundationVocabularyReused: true,
  attemptMembershipSourceReplayVerified: false,
  attemptDispositionAcceptedAsOutcomeTruth: false,
  callerObservedClosureAcceptedAsIndependentOutcomeTruth: false,
  serverAcknowledgementAcceptedAsOutcomeTruth: false,
  modelRewardAcceptedAsOutcomeTruth: false,
  authorityMinted: false,
  outcomePromiseIssued: false,
  guaranteeCreated: false,
  outcomeCommitIssued: false,
  paymentPerformed: false,
  humanQueueCreated: false,
  outsiderStaffTouchLimit: 0,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
});

const CREATE_INPUT_FIELDS = Object.freeze([
  "contractId", "outcomeOs", "expectedOutcomeOsArtifactHash", "recordedAt",
  "idempotencyKeyHash",
]);
const APPEND_INPUT_FIELDS = Object.freeze([
  "eventType", "recordedAt", "idempotencyKeyHash", "expectedHeadHash",
  "payload",
]);
const SUPERSEDE_INPUT_FIELDS = Object.freeze([
  "recordedAt", "idempotencyKeyHash", "expectedHeadHash",
  "successorContractRefHash", "successorOutcomeOsArtifactHash",
  "supersessionReasonRefHash",
]);
const RUNTIME_OPTIONS_FIELDS = Object.freeze(["events"]);

const LINEAGE_FIELDS = Object.freeze([
  "revision", "predecessorEventHash", "supersedesEventHash", "appendOnly",
  "inPlaceMutationAllowed", "supersessionDeletesHistory",
]);
const EVENT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "contractId", "eventType",
  "appendOnlyLineage", "outcomeOsArtifactHash", "typedGraphRefHash",
  "recordedAt", "idempotencyKeyHash", "operationHash", "payload",
  "attemptEvidenceAcceptedAsOutcomeTruth",
  "observedClosureAcceptedAsIndependentOutcomeTruth", "directPiiProjected",
  "outcomePromiseIssued", "guaranteeCreated", "outcomeCommitIssued",
  "decisionState", "authority", "actionReady", "executable", "boundary",
  "eventHash",
]);

const CREATE_PAYLOAD_FIELDS = Object.freeze(["outcomeOs"]);
const OPEN_PAYLOAD_FIELDS = Object.freeze(["openInstructionRefHash"]);
const ATTEMPT_PAYLOAD_FIELDS = Object.freeze([
  "episodeRefHash", "attemptRefHash", "attemptSetCompositionRefHash",
  "attemptEvidenceRefHash", "occurrenceRefHash", "executionDisposition",
  "outcomeObservationStatus", "reportedOutcomeEvidenceRefHash",
  "attemptMembershipSourceReplayVerified",
]);
const CLOSE_PAYLOAD_FIELDS = Object.freeze([
  "observedAt", "observationStatus", "observationEvidenceRefHash",
  "observationSourceClass", "independentOutcomeTruthEstablished",
]);
const EXPIRE_PAYLOAD_FIELDS = Object.freeze([
  "expiredAt", "expiryEvidenceRefHash", "deadlineClockTrusted",
]);
const SUPERSEDE_PAYLOAD_FIELDS = Object.freeze([
  "successorContractRefHash", "successorOutcomeOsArtifactHash",
  "supersessionReasonRefHash",
]);

const OBSERVED_CLOSURE_STATUSES = Object.freeze([
  "OBSERVED_SATISFIED",
  "OBSERVED_NOT_SATISFIED",
  "OBSERVED_INCONCLUSIVE",
  "OBSERVED_UNAVAILABLE",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseArray(value, code) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > MAX_EVENTS
    || Reflect.ownKeys(value).length !== value.length + 1) {
    fail(`${code}_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function contractId(value) {
  if (typeof value !== "string" || !CONTRACT_ID.test(value)) {
    fail("CONTRACT_ID_INVALID");
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function oneOf(value, values, code) {
  if (!values.includes(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function frozenClone(value) {
  return deepFreeze(JSON.parse(canonicalizeStrict(value)));
}

function checkedOutcomeOs(value, expectedHash) {
  const artifact = verifyThreeLayerOutcomeProductArtifactV1(value);
  if (artifact.schema
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS.outcomeOs
    || artifact.productLayer
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs
    || artifact.artifactHash !== hash(expectedHash,
      "EXPECTED_OUTCOME_OS_ARTIFACT_HASH")
    || artifact.authority !== "NONE" || artifact.outcomePromiseIssued !== false
    || artifact.guaranteeCreated !== false) {
    fail("OUTCOME_OS_ARTIFACT_INVALID");
  }
  return artifact;
}

function normalizePayload(eventType, value, state = null) {
  if (eventType === "CONTRACT_CREATED") {
    exactObject(value, CREATE_PAYLOAD_FIELDS, "CREATE_PAYLOAD");
    return deepFreeze({
      outcomeOs: checkedOutcomeOs(value.outcomeOs,
        value.outcomeOs.artifactHash),
    });
  }
  if (eventType === "CONTRACT_OPENED") {
    exactObject(value, OPEN_PAYLOAD_FIELDS, "OPEN_PAYLOAD");
    return deepFreeze({
      openInstructionRefHash: hash(value.openInstructionRefHash,
        "OPEN_INSTRUCTION_REF_HASH"),
    });
  }
  if (eventType === "ATTEMPT_EVIDENCE_APPENDED") {
    exactObject(value, ATTEMPT_PAYLOAD_FIELDS, "ATTEMPT_PAYLOAD");
    if (value.attemptMembershipSourceReplayVerified !== false) {
      fail("ATTEMPT_MEMBERSHIP_OVERCLAIM");
    }
    const outcomeObservationStatus = oneOf(value.outcomeObservationStatus,
      EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
      "OUTCOME_OBSERVATION_STATUS");
    const reportedOutcomeEvidenceRefHash = hash(
      value.reportedOutcomeEvidenceRefHash,
      "REPORTED_OUTCOME_EVIDENCE_REF_HASH", true);
    if ((outcomeObservationStatus === "OBSERVED")
        !== (reportedOutcomeEvidenceRefHash !== null)) {
      fail("OBSERVED_STATUS_EVIDENCE_PRESENCE_MISMATCH");
    }
    const episodeRefHash = hash(value.episodeRefHash, "EPISODE_REF_HASH");
    if (state !== null && episodeRefHash !== state.outcomeOs
      .typedGraphRefs.episodeRefHash) fail("ATTEMPT_EPISODE_CROSSWALK_MISMATCH");
    return deepFreeze({
      episodeRefHash,
      attemptRefHash: hash(value.attemptRefHash, "ATTEMPT_REF_HASH"),
      attemptSetCompositionRefHash: hash(value.attemptSetCompositionRefHash,
        "ATTEMPT_SET_COMPOSITION_REF_HASH"),
      attemptEvidenceRefHash: hash(value.attemptEvidenceRefHash,
        "ATTEMPT_EVIDENCE_REF_HASH"),
      occurrenceRefHash: hash(value.occurrenceRefHash,
        "OCCURRENCE_REF_HASH"),
      executionDisposition: oneOf(value.executionDisposition,
        EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS, "EXECUTION_DISPOSITION"),
      outcomeObservationStatus,
      reportedOutcomeEvidenceRefHash,
      attemptMembershipSourceReplayVerified: false,
    });
  }
  if (eventType === "OBSERVED_CLOSED") {
    exactObject(value, CLOSE_PAYLOAD_FIELDS, "CLOSE_PAYLOAD");
    if (value.observationSourceClass !== "CALLER_REPORTED_HASH_REFERENCE"
      || value.independentOutcomeTruthEstablished !== false) {
      fail("OBSERVED_CLOSE_OVERCLAIM");
    }
    return deepFreeze({
      observedAt: instant(value.observedAt, "OBSERVED_AT"),
      observationStatus: oneOf(value.observationStatus,
        OBSERVED_CLOSURE_STATUSES, "OBSERVATION_STATUS"),
      observationEvidenceRefHash: hash(value.observationEvidenceRefHash,
        "OBSERVATION_EVIDENCE_REF_HASH"),
      observationSourceClass: "CALLER_REPORTED_HASH_REFERENCE",
      independentOutcomeTruthEstablished: false,
    });
  }
  if (eventType === "CONTRACT_EXPIRED") {
    exactObject(value, EXPIRE_PAYLOAD_FIELDS, "EXPIRE_PAYLOAD");
    if (value.deadlineClockTrusted !== false) fail("EXPIRY_CLOCK_OVERCLAIM");
    return deepFreeze({
      expiredAt: instant(value.expiredAt, "EXPIRED_AT"),
      expiryEvidenceRefHash: hash(value.expiryEvidenceRefHash,
        "EXPIRY_EVIDENCE_REF_HASH"),
      deadlineClockTrusted: false,
    });
  }
  if (eventType === "CONTRACT_SUPERSEDED") {
    exactObject(value, SUPERSEDE_PAYLOAD_FIELDS, "SUPERSEDE_PAYLOAD");
    return deepFreeze({
      successorContractRefHash: hash(value.successorContractRefHash,
        "SUCCESSOR_CONTRACT_REF_HASH"),
      successorOutcomeOsArtifactHash: hash(
        value.successorOutcomeOsArtifactHash,
        "SUCCESSOR_OUTCOME_OS_ARTIFACT_HASH"),
      supersessionReasonRefHash: hash(value.supersessionReasonRefHash,
        "SUPERSESSION_REASON_REF_HASH"),
    });
  }
  fail("EVENT_TYPE_INVALID");
}

function operationHash(contract, eventType, recordedAt,
  outcomeOsArtifactHash, typedGraphRefHash, payload) {
  return digest("outsider/outcome-os-lifecycle-operation/v1", {
    contractId: contract,
    eventType,
    recordedAt,
    outcomeOsArtifactHash,
    typedGraphRefHash,
    payload,
  });
}

function buildEvent(input, state = null) {
  const eventType = oneOf(input.eventType,
    OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES, "EVENT_TYPE");
  const revision = input.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    fail("REVISION_INVALID");
  }
  const predecessorEventHash = hash(input.predecessorEventHash,
    "PREDECESSOR_EVENT_HASH", true);
  const supersedesEventHash = hash(input.supersedesEventHash,
    "SUPERSEDES_EVENT_HASH", true);
  if (revision === 0) {
    if (eventType !== "CONTRACT_CREATED" || predecessorEventHash !== null
      || supersedesEventHash !== null) fail("GENESIS_LINEAGE_INVALID");
  } else if (eventType === "CONTRACT_CREATED"
    || predecessorEventHash === null || supersedesEventHash === null
    || predecessorEventHash !== supersedesEventHash) {
    fail("DESCENDANT_LINEAGE_INVALID");
  }
  const contract = contractId(input.contractId);
  const recordedAt = instant(input.recordedAt, "RECORDED_AT");
  const outcomeOsArtifactHash = hash(input.outcomeOsArtifactHash,
    "OUTCOME_OS_ARTIFACT_HASH");
  const typedGraphRefHash = hash(input.typedGraphRefHash,
    "TYPED_GRAPH_REF_HASH");
  const payload = normalizePayload(eventType, input.payload, state);
  const calculatedOperationHash = operationHash(contract, eventType,
    recordedAt, outcomeOsArtifactHash, typedGraphRefHash, payload);
  if (input.operationHash !== undefined
    && hash(input.operationHash, "OPERATION_HASH") !== calculatedOperationHash) {
    fail("OPERATION_HASH_MISMATCH");
  }
  const body = {
    schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    recordClass: "APPEND_ONLY_HASH_ONLY_OUTCOME_CONTRACT_EVENT",
    contractId: contract,
    eventType,
    appendOnlyLineage: deepFreeze({
      revision,
      predecessorEventHash,
      supersedesEventHash,
      appendOnly: true,
      inPlaceMutationAllowed: false,
      supersessionDeletesHistory: false,
    }),
    outcomeOsArtifactHash,
    typedGraphRefHash,
    recordedAt,
    idempotencyKeyHash: hash(input.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
    operationHash: calculatedOperationHash,
    payload,
    attemptEvidenceAcceptedAsOutcomeTruth: false,
    observedClosureAcceptedAsIndependentOutcomeTruth: false,
    directPiiProjected: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, eventHash: digest(body.schema, body) });
}

function verifyEvent(value, state = null) {
  exactObject(value, EVENT_FIELDS, "EVENT");
  exactObject(value.appendOnlyLineage, LINEAGE_FIELDS, "EVENT_LINEAGE");
  if (value.schema !== OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.event
    || value.schemaVersion !== "1.0.0"
    || value.recordClass !== "APPEND_ONLY_HASH_ONLY_OUTCOME_CONTRACT_EVENT"
    || value.appendOnlyLineage.appendOnly !== true
    || value.appendOnlyLineage.inPlaceMutationAllowed !== false
    || value.appendOnlyLineage.supersessionDeletesHistory !== false
    || value.attemptEvidenceAcceptedAsOutcomeTruth !== false
    || value.observedClosureAcceptedAsIndependentOutcomeTruth !== false
    || value.directPiiProjected !== false
    || value.outcomePromiseIssued !== false || value.guaranteeCreated !== false
    || value.outcomeCommitIssued !== false || value.decisionState !== "HOLD"
    || value.authority !== "NONE" || value.actionReady !== false
    || value.executable !== false
    || !same(value.boundary, OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY)) {
    fail("EVENT_FIXED_STATE_INVALID");
  }
  const rebuilt = buildEvent({
    contractId: value.contractId,
    eventType: value.eventType,
    revision: value.appendOnlyLineage.revision,
    predecessorEventHash: value.appendOnlyLineage.predecessorEventHash,
    supersedesEventHash: value.appendOnlyLineage.supersedesEventHash,
    outcomeOsArtifactHash: value.outcomeOsArtifactHash,
    typedGraphRefHash: value.typedGraphRefHash,
    recordedAt: value.recordedAt,
    idempotencyKeyHash: value.idempotencyKeyHash,
    operationHash: value.operationHash,
    payload: value.payload,
  }, state);
  if (!same(rebuilt, value)) fail("EVENT_DERIVATION_OR_HASH_INVALID");
  return rebuilt;
}

function emptyState() {
  return {
    contractId: null,
    state: null,
    outcomeOs: null,
    outcomeOsArtifactHash: null,
    typedGraphRefHash: null,
    latestEventHash: null,
    latestRecordedAt: null,
    attemptEvidenceEventCount: 0,
    observationStatus: null,
    observationEvidenceRefHash: null,
    successorContractRefHash: null,
    successorOutcomeOsArtifactHash: null,
    idempotency: new Map(),
    occurrenceRefs: new Set(),
  };
}

function applyEvent(state, event) {
  const revision = event.appendOnlyLineage.revision;
  if (state.idempotency.has(event.idempotencyKeyHash)) {
    fail("STORED_IDEMPOTENCY_KEY_DUPLICATE");
  }
  if (revision === 0) {
    if (state.state !== null || event.eventType !== "CONTRACT_CREATED") {
      fail("GENESIS_STATE_INVALID");
    }
    const outcomeOs = checkedOutcomeOs(event.payload.outcomeOs,
      event.outcomeOsArtifactHash);
    if (outcomeOs.typedGraphRefHash !== event.typedGraphRefHash
      || Date.parse(event.recordedAt)
        >= Date.parse(outcomeOs.completionDeadline)) {
      fail("GENESIS_OUTCOME_OS_BINDING_OR_TIME_INVALID");
    }
    state.contractId = event.contractId;
    state.state = "CREATED";
    state.outcomeOs = outcomeOs;
    state.outcomeOsArtifactHash = event.outcomeOsArtifactHash;
    state.typedGraphRefHash = event.typedGraphRefHash;
  } else {
    if (event.contractId !== state.contractId
      || event.outcomeOsArtifactHash !== state.outcomeOsArtifactHash
      || event.typedGraphRefHash !== state.typedGraphRefHash
      || event.appendOnlyLineage.predecessorEventHash !== state.latestEventHash
      || event.appendOnlyLineage.supersedesEventHash !== state.latestEventHash
      || Date.parse(event.recordedAt) < Date.parse(state.latestRecordedAt)) {
      fail("DESCENDANT_BINDING_LINEAGE_OR_TIME_INVALID");
    }
    if (event.eventType === "CONTRACT_OPENED") {
      if (state.state !== "CREATED"
        || Date.parse(event.recordedAt)
          >= Date.parse(state.outcomeOs.completionDeadline)) {
        fail("CONTRACT_OPEN_TRANSITION_INVALID");
      }
      state.state = "OPEN";
    } else if (event.eventType === "ATTEMPT_EVIDENCE_APPENDED") {
      if (state.state !== "OPEN"
        || Date.parse(event.recordedAt)
          >= Date.parse(state.outcomeOs.completionDeadline)) {
        fail("ATTEMPT_EVIDENCE_TRANSITION_INVALID");
      }
      if (state.occurrenceRefs.has(event.payload.occurrenceRefHash)) {
        fail("ATTEMPT_OCCURRENCE_REF_DUPLICATE");
      }
      state.occurrenceRefs.add(event.payload.occurrenceRefHash);
      state.attemptEvidenceEventCount += 1;
    } else if (event.eventType === "OBSERVED_CLOSED") {
      if (state.state !== "OPEN"
        || Date.parse(event.payload.observedAt) > Date.parse(event.recordedAt)
        || Date.parse(event.payload.observedAt)
          < Date.parse(state.latestRecordedAt)) {
        fail("OBSERVED_CLOSE_TRANSITION_INVALID");
      }
      state.state = "OBSERVED_CLOSED";
      state.observationStatus = event.payload.observationStatus;
      state.observationEvidenceRefHash =
        event.payload.observationEvidenceRefHash;
    } else if (event.eventType === "CONTRACT_EXPIRED") {
      if (!["CREATED", "OPEN"].includes(state.state)
        || event.payload.expiredAt !== event.recordedAt
        || Date.parse(event.recordedAt)
          < Date.parse(state.outcomeOs.completionDeadline)) {
        fail("CONTRACT_EXPIRE_TRANSITION_INVALID");
      }
      state.state = "EXPIRED";
    } else if (event.eventType === "CONTRACT_SUPERSEDED") {
      if (!["CREATED", "OPEN"].includes(state.state)
        || event.payload.successorOutcomeOsArtifactHash
          === state.outcomeOsArtifactHash) {
        fail("CONTRACT_SUPERSEDE_TRANSITION_INVALID");
      }
      state.state = "SUPERSEDED";
      state.successorContractRefHash =
        event.payload.successorContractRefHash;
      state.successorOutcomeOsArtifactHash =
        event.payload.successorOutcomeOsArtifactHash;
    } else {
      fail("DESCENDANT_EVENT_TYPE_INVALID");
    }
  }
  state.latestEventHash = event.eventHash;
  state.latestRecordedAt = event.recordedAt;
  state.idempotency.set(event.idempotencyKeyHash, {
    operationHash: event.operationHash,
    revision,
  });
}

function headFrom(events, state) {
  const last = events.at(-1);
  const body = {
    schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.head,
    schemaVersion: "1.0.0",
    contractId: state.contractId,
    state: state.state,
    currentRevision: last.appendOnlyLineage.revision,
    eventCount: events.length,
    headEventHash: last.eventHash,
    eventSetRoot: digest("outsider/outcome-os-lifecycle-event-set/v1",
      events.map((event) => event.eventHash)),
    outcomeOsArtifactHash: state.outcomeOsArtifactHash,
    typedGraphRefHash: state.typedGraphRefHash,
    attemptEvidenceEventCount: state.attemptEvidenceEventCount,
    observationStatus: state.observationStatus,
    observationEvidenceRefHash: state.observationEvidenceRefHash,
    successorContractRefHash: state.successorContractRefHash,
    successorOutcomeOsArtifactHash: state.successorOutcomeOsArtifactHash,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, headHash: digest(body.schema, body) });
}

function replayEvents(inputEvents) {
  denseArray(inputEvents, "EVENTS");
  if (inputEvents.length < 1) fail("CONTRACT_NOT_CREATED");
  const state = emptyState();
  const events = [];
  for (let revision = 0; revision < inputEvents.length; revision += 1) {
    const event = verifyEvent(inputEvents[revision], state);
    if (event.appendOnlyLineage.revision !== revision) {
      fail("REVISION_GAP_OR_REORDER");
    }
    applyEvent(state, event);
    events.push(event);
  }
  return { events: deepFreeze(events), state,
    head: headFrom(events, state) };
}

function receiptAt(events, revision) {
  const prefix = events.slice(0, revision + 1);
  const replayed = replayEvents(prefix);
  const event = replayed.events.at(-1);
  const body = {
    schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    contractId: event.contractId,
    eventType: event.eventType,
    revision,
    eventHash: event.eventHash,
    prefixHeadHash: replayed.head.headHash,
    idempotencyKeyHash: event.idempotencyKeyHash,
    operationHash: event.operationHash,
    appendOnlyEventObserved: true,
    authorityMinted: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(body.schema, body) });
}

function operationResult(events, revision, idempotentReplay) {
  const replayed = replayEvents(events);
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    receipt: receiptAt(replayed.events, revision),
    head: replayed.head,
    idempotentReplay,
    eventAppended: !idempotentReplay,
    storageIoPerformed: false,
    networkIoPerformed: false,
    authority: "NONE",
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
  });
}

function replayProjection(events) {
  const replayed = replayEvents(events);
  const body = {
    schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    ok: true,
    head: replayed.head,
    eventCount: replayed.events.length,
    fullSuppliedEventChainReplayed: true,
    revisionPredecessorAndSupersessionReplayed: true,
    idempotencyIndexReplayed: true,
    callerPersistedHistoryAssumedComplete: false,
    externalHeadAnchorEstablished: false,
    attemptEvidenceAcceptedAsOutcomeTruth: false,
    observedClosureAcceptedAsIndependentOutcomeTruth: false,
    storageIoPerformed: false,
    networkIoPerformed: false,
    authority: "NONE",
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, replayHash: digest(body.schema, body) });
}

/**
 * Create or reconstruct one in-memory lifecycle runtime. Persist only the
 * canonical events returned by exportEvents(); rehydration replays them all.
 */
export function createOutcomeOsLifecycleRuntimeV1(options = { events: [] }) {
  exactObject(options, RUNTIME_OPTIONS_FIELDS, "RUNTIME_OPTIONS");
  denseArray(options.events, "RUNTIME_EVENTS");
  let events = options.events.length === 0
    ? deepFreeze([]) : replayEvents(options.events).events;

  function create(input = {}) {
    exactObject(input, CREATE_INPUT_FIELDS, "CREATE_INPUT");
    const contract = contractId(input.contractId);
    const outcomeOs = checkedOutcomeOs(input.outcomeOs,
      input.expectedOutcomeOsArtifactHash);
    const recordedAt = instant(input.recordedAt, "RECORDED_AT");
    const payload = deepFreeze({ outcomeOs });
    const opHash = operationHash(contract, "CONTRACT_CREATED", recordedAt,
      outcomeOs.artifactHash, outcomeOs.typedGraphRefHash, payload);
    const key = hash(input.idempotencyKeyHash, "IDEMPOTENCY_KEY_HASH");
    if (events.length > 0) {
      const replayed = replayEvents(events);
      const existing = replayed.state.idempotency.get(key);
      if (existing === undefined || existing.revision !== 0
        || existing.operationHash !== opHash) {
        fail("CREATE_IDEMPOTENCY_CONFLICT_OR_ALREADY_CREATED");
      }
      return operationResult(events, 0, true);
    }
    const event = buildEvent({
      contractId: contract,
      eventType: "CONTRACT_CREATED",
      revision: 0,
      predecessorEventHash: null,
      supersedesEventHash: null,
      outcomeOsArtifactHash: outcomeOs.artifactHash,
      typedGraphRefHash: outcomeOs.typedGraphRefHash,
      recordedAt,
      idempotencyKeyHash: key,
      operationHash: opHash,
      payload,
    });
    replayEvents([event]);
    events = deepFreeze([event]);
    return operationResult(events, 0, false);
  }

  function append(input = {}) {
    exactObject(input, APPEND_INPUT_FIELDS, "APPEND_INPUT");
    if (events.length === 0) fail("CONTRACT_NOT_CREATED");
    const before = replayEvents(events);
    const eventType = oneOf(input.eventType,
      OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES.filter((type) =>
        type !== "CONTRACT_CREATED"), "APPEND_EVENT_TYPE");
    const recordedAt = instant(input.recordedAt, "RECORDED_AT");
    const payload = normalizePayload(eventType, input.payload, before.state);
    const key = hash(input.idempotencyKeyHash, "IDEMPOTENCY_KEY_HASH");
    const opHash = operationHash(before.state.contractId, eventType, recordedAt,
      before.state.outcomeOsArtifactHash, before.state.typedGraphRefHash,
      payload);
    const existing = before.state.idempotency.get(key);
    if (existing !== undefined) {
      if (existing.operationHash !== opHash) {
        fail("IDEMPOTENCY_KEY_OPERATION_CONFLICT");
      }
      return operationResult(events, existing.revision, true);
    }
    if (hash(input.expectedHeadHash, "EXPECTED_HEAD_HASH")
        !== before.head.headHash) fail("EXPECTED_HEAD_HASH_MISMATCH");
    const revision = events.length;
    const event = buildEvent({
      contractId: before.state.contractId,
      eventType,
      revision,
      predecessorEventHash: before.state.latestEventHash,
      supersedesEventHash: before.state.latestEventHash,
      outcomeOsArtifactHash: before.state.outcomeOsArtifactHash,
      typedGraphRefHash: before.state.typedGraphRefHash,
      recordedAt,
      idempotencyKeyHash: key,
      operationHash: opHash,
      payload,
    }, before.state);
    const next = deepFreeze([...events, event]);
    replayEvents(next);
    events = next;
    return operationResult(events, revision, false);
  }

  function supersede(input = {}) {
    exactObject(input, SUPERSEDE_INPUT_FIELDS, "SUPERSEDE_INPUT");
    return append({
      eventType: "CONTRACT_SUPERSEDED",
      recordedAt: input.recordedAt,
      idempotencyKeyHash: input.idempotencyKeyHash,
      expectedHeadHash: input.expectedHeadHash,
      payload: {
        successorContractRefHash: input.successorContractRefHash,
        successorOutcomeOsArtifactHash:
          input.successorOutcomeOsArtifactHash,
        supersessionReasonRefHash: input.supersessionReasonRefHash,
      },
    });
  }

  function read() {
    if (events.length === 0) fail("CONTRACT_NOT_CREATED");
    const replayed = replayEvents(events);
    return deepFreeze({
      schema: OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_SCHEMAS.read,
      schemaVersion: "1.0.0",
      head: replayed.head,
      latestReceipt: receiptAt(events, events.length - 1),
      rawEventsProjected: false,
      authority: "NONE",
      outcomePromiseIssued: false,
      outcomeCommitIssued: false,
    });
  }

  function replay() {
    if (events.length === 0) fail("CONTRACT_NOT_CREATED");
    return replayProjection(events);
  }

  function exportEvents() {
    return frozenClone(events);
  }

  return Object.freeze({ create, append, supersede, read, replay,
    exportEvents });
}

/** Replay a caller-supplied event history without retaining runtime state. */
export function replayOutcomeOsLifecycleV1(events) {
  return replayProjection(events);
}
