/*
 * Agent-neutral Outcome OS ingestion v1.
 *
 * Replaceable clients submit only content-addressed route, Attempt, and
 * observation references. This module compiles them into the existing Layer 1
 * lifecycle append input and replays the canonical lifecycle before returning
 * events for caller-owned persistence.
 *
 * A client name, brand, model, device, IP address, or transport identity is not
 * accepted by the contract and therefore cannot become an Outcome or frozen
 * typed-graph identity. No submission creates authority, independent Outcome
 * truth, capacity, a promise, a guarantee, or COMMIT.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS,
  EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
} from "./outsider-episode-attempt-set-composition.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
  replayOutcomeOsLifecycleV1,
} from "./outsider-outcome-os-lifecycle-v1.js";

const PREFIX = "OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_EVENTS = 100_000;

export const OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SCHEMAS
  = Object.freeze({
    compilation: "outsider/agent-neutral-outcome-os-ingestion-compilation/v1",
    result: "outsider/agent-neutral-outcome-os-ingestion-result/v1",
  });

export const OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SUBMISSION_TYPES
  = Object.freeze([
    "ROUTE_PROPOSAL_REFERENCE",
    "ATTEMPT_REFERENCE",
    "OBSERVATION_REFERENCE",
  ]);

export const OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_BOUNDARY
  = deepFreeze({
    position: "AGENT_NEUTRAL_HASH_REFERENCE_TO_OUTCOME_OS_LIFECYCLE",
    acceptedSubmissionTypes:
      OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SUBMISSION_TYPES,
    routeProposalLifecycleMapping:
      "CONTRACT_OPENED_OPEN_INSTRUCTION_REFERENCE_ONLY",
    routeProposalAcceptedAsSelectedRoute: false,
    routeProposalAcceptedAsExecutableCapability: false,
    routeProposalAcceptedAsCapacity: false,
    attemptReferenceAcceptedAsAttemptMembershipTruth: false,
    attemptReferenceAcceptedAsOutcomeTruth: false,
    observationReferenceAcceptedAsIndependentOutcomeTruth: false,
    agentClientIdentityAccepted: false,
    agentBrandAccepted: false,
    agentModelAccepted: false,
    transportIdentityAccepted: false,
    agentIdentityMayBecomeOutcomeIdentity: false,
    agentIdentityMayBecomeTypedGraphIdentity: false,
    rawNaturalLanguageAccepted: false,
    rawEvidenceBytesAccepted: false,
    arbitraryUrlsAccepted: false,
    directPiiAccepted: false,
    credentialsAccepted: false,
    paymentMaterialAccepted: false,
    lifecycleSourceReplayRequired: true,
    lifecycleNativeIdempotencyPreserved: true,
    occurrenceDeduplicationPreserved: true,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

const SUBMISSION_FIELDS = Object.freeze([
  "submissionType", "recordedAt", "idempotencyKeyHash", "expectedHeadHash",
  "reference",
]);
const ROUTE_REFERENCE_FIELDS = Object.freeze(["routeProposalRefHash"]);
const ATTEMPT_REFERENCE_FIELDS = Object.freeze([
  "episodeRefHash", "attemptRefHash", "attemptSetCompositionRefHash",
  "attemptEvidenceRefHash", "occurrenceRefHash", "executionDisposition",
  "outcomeObservationStatus", "reportedOutcomeEvidenceRefHash",
]);
const OBSERVATION_REFERENCE_FIELDS = Object.freeze([
  "observedAt", "observationStatus", "observationEvidenceRefHash",
]);
const INGEST_INPUT_FIELDS = Object.freeze(["events", "submission"]);

const OBSERVATION_STATUSES = Object.freeze([
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

function denseEvents(value) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < 1 || value.length > MAX_EVENTS
    || Reflect.ownKeys(value).length !== value.length + 1) {
    fail("EVENTS_INVALID");
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail("EVENTS_INVALID");
  }
  return value;
}

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
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

function frozenClone(value) {
  return deepFreeze(JSON.parse(canonicalizeStrict(value)));
}

function compileLifecycleAppendInput(submission) {
  const common = {
    recordedAt: instant(submission.recordedAt, "RECORDED_AT"),
    idempotencyKeyHash: hash(submission.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
    expectedHeadHash: hash(submission.expectedHeadHash, "EXPECTED_HEAD_HASH"),
  };
  if (submission.submissionType === "ROUTE_PROPOSAL_REFERENCE") {
    exactObject(submission.reference, ROUTE_REFERENCE_FIELDS,
      "ROUTE_PROPOSAL_REFERENCE");
    return {
      eventType: "CONTRACT_OPENED",
      ...common,
      payload: {
        openInstructionRefHash: hash(submission.reference.routeProposalRefHash,
          "ROUTE_PROPOSAL_REF_HASH"),
      },
    };
  }
  if (submission.submissionType === "ATTEMPT_REFERENCE") {
    const value = exactObject(submission.reference, ATTEMPT_REFERENCE_FIELDS,
      "ATTEMPT_REFERENCE");
    const observationStatus = oneOf(value.outcomeObservationStatus,
      EPISODE_ATTEMPT_OUTCOME_OBSERVATION_STATUSES,
      "OUTCOME_OBSERVATION_STATUS");
    const evidence = hash(value.reportedOutcomeEvidenceRefHash,
      "REPORTED_OUTCOME_EVIDENCE_REF_HASH", true);
    if ((observationStatus === "OBSERVED") !== (evidence !== null)) {
      fail("OBSERVED_STATUS_EVIDENCE_PRESENCE_MISMATCH");
    }
    return {
      eventType: "ATTEMPT_EVIDENCE_APPENDED",
      ...common,
      payload: {
        episodeRefHash: hash(value.episodeRefHash, "EPISODE_REF_HASH"),
        attemptRefHash: hash(value.attemptRefHash, "ATTEMPT_REF_HASH"),
        attemptSetCompositionRefHash: hash(value.attemptSetCompositionRefHash,
          "ATTEMPT_SET_COMPOSITION_REF_HASH"),
        attemptEvidenceRefHash: hash(value.attemptEvidenceRefHash,
          "ATTEMPT_EVIDENCE_REF_HASH"),
        occurrenceRefHash: hash(value.occurrenceRefHash,
          "OCCURRENCE_REF_HASH"),
        executionDisposition: oneOf(value.executionDisposition,
          EPISODE_ATTEMPT_EXECUTION_DISPOSITIONS, "EXECUTION_DISPOSITION"),
        outcomeObservationStatus: observationStatus,
        reportedOutcomeEvidenceRefHash: evidence,
        attemptMembershipSourceReplayVerified: false,
      },
    };
  }
  if (submission.submissionType === "OBSERVATION_REFERENCE") {
    const value = exactObject(submission.reference,
      OBSERVATION_REFERENCE_FIELDS, "OBSERVATION_REFERENCE");
    return {
      eventType: "OBSERVED_CLOSED",
      ...common,
      payload: {
        observedAt: instant(value.observedAt, "OBSERVED_AT"),
        observationStatus: oneOf(value.observationStatus,
          OBSERVATION_STATUSES, "OBSERVATION_STATUS"),
        observationEvidenceRefHash: hash(value.observationEvidenceRefHash,
          "OBSERVATION_EVIDENCE_REF_HASH"),
        observationSourceClass: "CALLER_REPORTED_HASH_REFERENCE",
        independentOutcomeTruthEstablished: false,
      },
    };
  }
  fail("SUBMISSION_TYPE_INVALID");
}

/** Compile a hash-only client submission into an existing lifecycle input. */
export function compileAgentNeutralOutcomeOsSubmissionV1(input = {}) {
  exactObject(input, SUBMISSION_FIELDS, "SUBMISSION");
  oneOf(input.submissionType,
    OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SUBMISSION_TYPES,
    "SUBMISSION_TYPE");
  const lifecycleAppendInput = deepFreeze(compileLifecycleAppendInput(input));
  const body = {
    schema:
      OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SCHEMAS.compilation,
    schemaVersion: "1.0.0",
    recordClass: "AGENT_NEUTRAL_HASH_REFERENCE_COMPILATION",
    submissionType: input.submissionType,
    lifecycleAppendInput,
    agentClientIdentityProjected: false,
    agentBrandProjected: false,
    typedGraphIdentityDerivedFromAgent: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, compilationHash: digest(body.schema, body) });
}

/**
 * Replay the supplied lifecycle, append one compiled client submission, and
 * return exact canonical events for caller-owned durable persistence.
 */
export function ingestAgentNeutralOutcomeOsSubmissionV1(input = {}) {
  exactObject(input, INGEST_INPUT_FIELDS, "INGEST_INPUT");
  const events = frozenClone(denseEvents(input.events));
  replayOutcomeOsLifecycleV1(events);
  const compilation = compileAgentNeutralOutcomeOsSubmissionV1(
    input.submission);
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events });
  const lifecycleResult = runtime.append(compilation.lifecycleAppendInput);
  const exportedEvents = runtime.exportEvents();
  const replay = replayOutcomeOsLifecycleV1(exportedEvents);
  if (replay.head.headHash !== lifecycleResult.head.headHash) {
    fail("POST_APPEND_REPLAY_HEAD_MISMATCH");
  }
  const body = {
    schema: OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    recordClass: "SOURCE_REPLAYED_AGENT_NEUTRAL_OUTCOME_OS_INGESTION",
    submissionType: compilation.submissionType,
    compilationHash: compilation.compilationHash,
    lifecycleReceipt: lifecycleResult.receipt,
    lifecycleHead: lifecycleResult.head,
    exportedEvents,
    idempotentReplay: lifecycleResult.idempotentReplay,
    eventAppended: lifecycleResult.eventAppended,
    fullSuppliedLifecycleReplayed: true,
    postAppendLifecycleReplayed: true,
    agentClientIdentityProjected: false,
    typedGraphIdentityDerivedFromAgent: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    guaranteeCreated: false,
    outcomeCommitIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, ingestionHash: digest(body.schema, body) });
}
