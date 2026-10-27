/*
 * Optional resource-side admission observation for the Outsider Outcome OS.
 *
 * A resource owner, API gateway, booking surface, or commerce platform may
 * report whether one exact route occurrence was admitted, queued, throttled,
 * or rejected.  This is useful routing evidence and a resource-local veto;
 * it is not a mandatory path through Outsider and cannot create principal
 * authority, reserve capacity, prove an Outcome, or issue COMMIT.
 *
 * The module accepts only hashes, bounded enums, integers, and UTC instants.
 * Provider names, URLs, credentials, payment material, and personal data stay
 * at the source adapter.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { replayOutcomeOsLifecycleV1 }
  from "./outsider-outcome-os-lifecycle-v1.js";

const PREFIX = "OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_SCHEMA
  = "outsider/resource-admission-observation/v1";

export const OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_DISPOSITIONS
  = Object.freeze(["ADMITTED", "QUEUED", "THROTTLED", "REJECTED"]);

export const OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_PRESSURE_BANDS
  = Object.freeze(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);

export const OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_SOURCE_STATUSES
  = Object.freeze(["VERIFIED", "UNVERIFIED", "INVALID"]);

export const OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_BOUNDARY = deepFreeze({
  position: "OPTIONAL_RESOURCE_ADMISSION_NODE_INPUT",
  mandatoryForOutcomeOs: false,
  resourceOwnerRetainsAdmissionControl: true,
  admissionReceiptMayVetoExactRoute: true,
  positiveAdmissionCreatesPrincipalAuthority: false,
  positiveAdmissionReservesCapacity: false,
  positiveAdmissionProvesOutcome: false,
  queueReceiptReservesCapacity: false,
  sourceReportIsIndependentOutcomeTruth: false,
  callerVerificationClaimAcceptedAsExternalTruth: false,
  structuralConformanceMintsAuthority: false,
  providerIdentityProjected: false,
  arbitraryUrlAccepted: false,
  directPiiAccepted: false,
  credentialsAccepted: false,
  paymentMaterialAccepted: false,
  networkIoPerformed: false,
  paymentPerformed: false,
  humanQueueCreated: false,
  outsiderStaffTouchLimit: 0,
  authority: "NONE",
  actionReady: false,
  executable: false,
  outcomeCommitIssued: false,
  guaranteeCreated: false,
});

const INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "evaluatedAt", "observation",
]);
const OBSERVATION_FIELDS = Object.freeze([
  "recordedAt", "validUntil", "retryAt", "occurrenceRefHash",
  "resourceNodeRefHash", "routeOptionRefHash", "policyRefHash",
  "sourceReceiptRefHash", "sourceVerificationRefHash",
  "sourceVerificationStatus", "disposition", "capacityPressureBand",
  "queuePosition", "concurrencyLimit",
]);
const OUTPUT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "contractId",
  "outcomeOsArtifactHash", "typedGraphRefHash", "outcomeLifecycleHeadHash",
  "evaluatedAt", "observation", "observationCurrent", "sourceStatus",
  "resourceRouteDecision", "routeLocalVeto", "positiveAdmissionObserved",
  "queueObserved", "capacityReserved", "authorityMinted",
  "outcomeTruthEstablished", "outcomePromiseIssued", "outcomeCommitIssued",
  "decisionState", "authority", "actionReady", "executable", "boundary",
  "artifactHash",
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

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function boundedInteger(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function member(value, allowed, code) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function normalizeObservation(value) {
  exactObject(value, OBSERVATION_FIELDS, "OBSERVATION");
  const normalized = {
    recordedAt: instant(value.recordedAt, "RECORDED_AT"),
    validUntil: instant(value.validUntil, "VALID_UNTIL"),
    retryAt: instant(value.retryAt, "RETRY_AT", true),
    occurrenceRefHash: hash(value.occurrenceRefHash, "OCCURRENCE_REF_HASH"),
    resourceNodeRefHash: hash(value.resourceNodeRefHash,
      "RESOURCE_NODE_REF_HASH"),
    routeOptionRefHash: hash(value.routeOptionRefHash,
      "ROUTE_OPTION_REF_HASH"),
    policyRefHash: hash(value.policyRefHash, "POLICY_REF_HASH"),
    sourceReceiptRefHash: hash(value.sourceReceiptRefHash,
      "SOURCE_RECEIPT_REF_HASH"),
    sourceVerificationRefHash: hash(value.sourceVerificationRefHash,
      "SOURCE_VERIFICATION_REF_HASH", true),
    sourceVerificationStatus: member(value.sourceVerificationStatus,
      OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_SOURCE_STATUSES,
      "SOURCE_VERIFICATION_STATUS"),
    disposition: member(value.disposition,
      OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_DISPOSITIONS,
      "DISPOSITION"),
    capacityPressureBand: member(value.capacityPressureBand,
      OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_PRESSURE_BANDS,
      "CAPACITY_PRESSURE_BAND"),
    queuePosition: boundedInteger(value.queuePosition, "QUEUE_POSITION", true),
    concurrencyLimit: boundedInteger(value.concurrencyLimit,
      "CONCURRENCY_LIMIT", true),
  };

  if (Date.parse(normalized.validUntil) < Date.parse(normalized.recordedAt)) {
    fail("VALIDITY_INTERVAL_INVALID");
  }
  if (normalized.retryAt !== null
    && Date.parse(normalized.retryAt) < Date.parse(normalized.recordedAt)) {
    fail("RETRY_AT_BEFORE_RECORDED_AT");
  }
  if (normalized.sourceVerificationStatus === "VERIFIED"
    && normalized.sourceVerificationRefHash === null) {
    fail("VERIFIED_SOURCE_REFERENCE_REQUIRED");
  }
  if (normalized.sourceVerificationStatus !== "VERIFIED"
    && normalized.sourceVerificationRefHash !== null) {
    fail("UNVERIFIED_SOURCE_REFERENCE_FORBIDDEN");
  }
  if (normalized.disposition === "QUEUED"
    && normalized.queuePosition === null) fail("QUEUE_POSITION_REQUIRED");
  if (normalized.disposition !== "QUEUED"
    && normalized.queuePosition !== null) fail("QUEUE_POSITION_FORBIDDEN");
  if (["THROTTLED", "REJECTED"].includes(normalized.disposition)
    && normalized.retryAt === null) fail("RETRY_AT_REQUIRED");
  if (["ADMITTED", "QUEUED"].includes(normalized.disposition)
    && normalized.retryAt !== null) fail("RETRY_AT_FORBIDDEN");
  return deepFreeze(normalized);
}

function lifecycleBinding(events) {
  if (!Array.isArray(events) || isProxy(events)
    || Object.getPrototypeOf(events) !== Array.prototype
    || events.length === 0) fail("OUTCOME_LIFECYCLE_EVENTS_INVALID");
  const replay = replayOutcomeOsLifecycleV1(events);
  if (replay.head.state !== "OPEN") fail("OUTCOME_LIFECYCLE_NOT_OPEN");
  return replay.head;
}

/**
 * Classify one source-bound resource admission observation.
 *
 * A verified negative response is safe to use as a route-local veto because
 * the resource node controls its own door.  A verified positive response is
 * useful routing evidence only: admission is neither a capacity reservation
 * nor authority to carry out the principal's requested Outcome.
 */
export function observeResourceAdmissionV1(input = {}) {
  exactObject(input, INPUT_FIELDS, "INPUT");
  const evaluatedAt = instant(input.evaluatedAt, "EVALUATED_AT");
  const observation = normalizeObservation(input.observation);
  const head = lifecycleBinding(input.outcomeLifecycleEvents);

  if (Date.parse(observation.recordedAt) > Date.parse(evaluatedAt)) {
    fail("OBSERVATION_FROM_FUTURE");
  }
  const observationCurrent
    = Date.parse(evaluatedAt) <= Date.parse(observation.validUntil);
  const sourceVerified = observation.sourceVerificationStatus === "VERIFIED";
  const negative = ["THROTTLED", "REJECTED"]
    .includes(observation.disposition);
  const routeLocalVeto = observationCurrent && sourceVerified && negative;
  const positiveAdmissionObserved = observationCurrent && sourceVerified
    && observation.disposition === "ADMITTED";
  const queueObserved = observationCurrent && sourceVerified
    && observation.disposition === "QUEUED";

  let resourceRouteDecision = "SOURCE_UNVERIFIED_HOLD";
  if (observation.sourceVerificationStatus === "INVALID") {
    resourceRouteDecision = "SOURCE_INVALID_HOLD";
  } else if (sourceVerified && !observationCurrent) {
    resourceRouteDecision = "STALE_OBSERVATION_HOLD";
  } else if (routeLocalVeto) {
    resourceRouteDecision = observation.disposition === "REJECTED"
      ? "ROUTE_REJECTED" : "ROUTE_THROTTLED";
  } else if (positiveAdmissionObserved) {
    resourceRouteDecision = "ROUTE_ADMISSION_OBSERVED";
  } else if (queueObserved) {
    resourceRouteDecision = "ROUTE_QUEUE_OBSERVED";
  }

  const body = {
    schema: OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_SCHEMA,
    schemaVersion: "1.0.0",
    recordClass: "OPTIONAL_RESOURCE_LOCAL_ADMISSION_OBSERVATION",
    contractId: head.contractId,
    outcomeOsArtifactHash: head.outcomeOsArtifactHash,
    typedGraphRefHash: head.typedGraphRefHash,
    outcomeLifecycleHeadHash: head.headHash,
    evaluatedAt,
    observation,
    observationCurrent,
    sourceStatus: observation.sourceVerificationStatus,
    resourceRouteDecision,
    routeLocalVeto,
    positiveAdmissionObserved,
    queueObserved,
    capacityReserved: false,
    authorityMinted: false,
    outcomeTruthEstablished: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
    decisionState: routeLocalVeto ? "UNAVAILABLE_ROUTE" : "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, artifactHash: digest(body.schema, body) });
}

export function verifyResourceAdmissionObservationV1(value) {
  exactObject(value, OUTPUT_FIELDS, "ARTIFACT");
  const { artifactHash, ...body } = value;
  if (artifactHash !== digest(value.schema, body)) {
    fail("ARTIFACT_HASH_INVALID");
  }
  if (value.schema !== OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_SCHEMA
    || value.schemaVersion !== "1.0.0"
    || value.recordClass !== "OPTIONAL_RESOURCE_LOCAL_ADMISSION_OBSERVATION"
    || value.capacityReserved !== false || value.authorityMinted !== false
    || value.outcomeTruthEstablished !== false
    || value.outcomePromiseIssued !== false
    || value.outcomeCommitIssued !== false || value.authority !== "NONE"
    || value.actionReady !== false || value.executable !== false
    || canonicalizeStrict(value.boundary)
      !== canonicalizeStrict(OUTSIDER_RESOURCE_ADMISSION_OBSERVER_V1_BOUNDARY)) {
    fail("FIXED_BOUNDARY_INVALID");
  }
  return true;
}
