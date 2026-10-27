/*
 * Recovery portfolio admission gate v1.
 *
 * Route proposal occurrence storage, candidate search ranking, and recovery
 * portfolio structure deliberately have different jobs.  This bridge closes
 * the gap between them without broadening any of their authority boundaries:
 *
 *   source-replayed route occurrence
 *     + append-only candidate evidence stream
 *     + frozen specification / all-in price / ETA / capacity gates
 *     -> portfolio-planning selection only
 *
 * A selected candidate is not executable, is not a held recovery option, and
 * is not Outcome truth.  In particular, a seller claim or generic server
 * acknowledgement is never treated as independent Outcome evidence.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  replayAgentNeutralRouteProposalRegistryV1,
} from "./outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  verifyRecoveryOptionPortfolioV2,
} from "./outsider-recovery-option-portfolio-v2.js";

const PREFIX = "OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_CANDIDATES = 1_000;
const MAX_EVIDENCE_EVENTS = 64;

export const OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_SCHEMAS
  = Object.freeze({
    evidenceEvent: "outsider/recovery-candidate-evidence-event/v1",
    selection: "outsider/recovery-portfolio-admission-selection/v1",
  });

export const OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1
  = `sha256:${createHash("sha256")
    .update("outsider/recovery-candidate-evidence/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_BOUNDARY
  = deepFreeze({
    position: "HARD_GATE_BETWEEN_REAL_ROUTE_EVIDENCE_AND_RECOVERY_PORTFOLIO",
    routeProposalRegistryFullySourceReplayed: true,
    candidateEvidenceHashChainFullyReplayed: true,
    candidateEvidenceRawExternalBytesReplayedByThisModule: false,
    referencedReplayReceiptPresenceIsExternalSourceTruth: false,
    routeOccurrenceMustExistInReplayedRegistry: true,
    recoveryOptionMustExistInVerifiedPortfolio: true,
    frozenSpecificationRequired: true,
    completeAllInPriceRequired: true,
    structuredDeadlineCompliantEtaRequired: true,
    resourceOwnerLifecycleCapacityEvidenceRequired: true,
    sellerClaimAcceptedAsIndependentOutcomeTruth: false,
    serverAcknowledgementAcceptedAsIndependentOutcomeTruth: false,
    sourceReplayReceiptAcceptedAsIndependentOutcomeTruth: false,
    upstreamSearchRankingMayOrderCandidateAcquisition: true,
    upstreamModelOrActuarialScoreMayBypassHardGate: false,
    selectionEffect: "RECOVERY_PORTFOLIO_PLANNING_ONLY",
    selectionReservesCapacity: false,
    selectionEstablishesHeldOption: false,
    selectionAuthorizesExecution: false,
    selectionAuthorizesPayment: false,
    authorityMinted: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitIssued: false,
    guaranteeCreated: false,
    directPiiAccepted: false,
    credentialsAccepted: false,
    paymentMaterialAccepted: false,
    networkIoPerformed: false,
    humanQueueCreated: false,
    outsiderStaffTouchLimit: 0,
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

const EVENT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "routeProposalRefHash",
  "recoveryOptionRefHash", "ordinal", "previousEventHash", "observedAt",
  "validUntil", "evidenceKind", "evidenceOccurrenceRefHash",
  "sourceOccurrenceRefHash", "sourceArtifactHash", "sourceReplayReceiptHash",
  "payload", "eventHash",
]);
const EVENT_INPUT_FIELDS = Object.freeze([
  "routeProposalRefHash", "recoveryOptionRefHash", "ordinal",
  "previousEventHash", "observedAt", "validUntil", "evidenceKind",
  "evidenceOccurrenceRefHash", "sourceOccurrenceRefHash",
  "sourceArtifactHash", "sourceReplayReceiptHash", "payload",
]);
const INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "routeProposalRegistryEvents",
  "recoveryPortfolio", "evaluatedAt", "frozenConstraints", "candidates",
]);
const CONSTRAINT_FIELDS = Object.freeze([
  "acceptancePredicateHash", "maximumLossConstraintHash", "currency",
  "maximumAllInMinorUnits", "completionDeadline",
]);
const CANDIDATE_FIELDS = Object.freeze([
  "routeProposalRefHash", "occurrenceRefHash", "recoveryOptionRefHash",
  "evidenceEvents",
]);
const SPECIFICATION_FIELDS = Object.freeze([
  "frozenPredicateHash", "evaluationRefHash", "status",
]);
const PRICE_FIELDS = Object.freeze([
  "constraintRefHash", "currency", "allInMinorUnits",
  "includesItemTaxShippingAndFees", "status",
]);
const ETA_FIELDS = Object.freeze([
  "completionDeadline", "estimatedCompletionAt", "status",
]);
const CAPACITY_FIELDS = Object.freeze([
  "capacityLifecycleRefHash", "capacityLifecycleHeadHash", "reservedFrom",
  "reservedUntil", "status", "sourceClass",
]);

const EVIDENCE_KINDS = Object.freeze([
  "SPECIFICATION", "ALL_IN_PRICE", "ETA", "CAPACITY",
]);
const SPECIFICATION_STATES = Object.freeze(["MATCH", "MISMATCH", "UNPROVEN"]);
const PRICE_STATES = Object.freeze(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
const ETA_STATES = Object.freeze(["STRUCTURED", "UNSTRUCTURED", "UNAVAILABLE"]);
const CAPACITY_STATES = Object.freeze(["RESERVED", "UNRESERVED", "UNAVAILABLE"]);
const CAPACITY_SOURCE_CLASSES = Object.freeze([
  "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY",
  "SELLER_SERVER_ACK_ONLY",
  "UNVERIFIED",
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

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== fields.length) {
    fail(`${code}_FIELDS_INVALID`);
  }
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseArray(value, maximum, code, allowEmpty = false) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum || (!allowEmpty && value.length === 0)
    || Reflect.ownKeys(value).length !== value.length + 1) fail(`${code}_INVALID`);
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

function instant(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UTC.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function oneOf(value, allowed, code) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function minorUnits(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0
    || value > 1_000_000_000_000) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function normalizePayload(kind, value) {
  if (kind === "SPECIFICATION") {
    exact(value, SPECIFICATION_FIELDS, "SPECIFICATION_PAYLOAD");
    return deepFreeze({
      frozenPredicateHash: hash(value.frozenPredicateHash,
        "FROZEN_PREDICATE_HASH"),
      evaluationRefHash: hash(value.evaluationRefHash,
        "SPECIFICATION_EVALUATION_REF_HASH"),
      status: oneOf(value.status, SPECIFICATION_STATES,
        "SPECIFICATION_STATUS"),
    });
  }
  if (kind === "ALL_IN_PRICE") {
    exact(value, PRICE_FIELDS, "PRICE_PAYLOAD");
    if (typeof value.currency !== "string" || !CURRENCY.test(value.currency)) {
      fail("PRICE_CURRENCY_INVALID");
    }
    const status = oneOf(value.status, PRICE_STATES, "PRICE_STATUS");
    const allInMinorUnits = minorUnits(value.allInMinorUnits,
      "ALL_IN_MINOR_UNITS", true);
    if (typeof value.includesItemTaxShippingAndFees !== "boolean"
      || (status === "COMPLETE"
        && (allInMinorUnits === null
          || value.includesItemTaxShippingAndFees !== true))
      || (status !== "COMPLETE"
        && value.includesItemTaxShippingAndFees !== false)
      || (status === "UNAVAILABLE" && allInMinorUnits !== null)) {
      fail("PRICE_COMPLETENESS_INVALID");
    }
    return deepFreeze({
      constraintRefHash: hash(value.constraintRefHash,
        "PRICE_CONSTRAINT_REF_HASH"),
      currency: value.currency,
      allInMinorUnits,
      includesItemTaxShippingAndFees: value.includesItemTaxShippingAndFees,
      status,
    });
  }
  if (kind === "ETA") {
    exact(value, ETA_FIELDS, "ETA_PAYLOAD");
    const status = oneOf(value.status, ETA_STATES, "ETA_STATUS");
    const estimatedCompletionAt = instant(value.estimatedCompletionAt,
      "ESTIMATED_COMPLETION_AT", true);
    if ((status === "STRUCTURED") !== (estimatedCompletionAt !== null)) {
      fail("ETA_STRUCTURE_INVALID");
    }
    return deepFreeze({
      completionDeadline: instant(value.completionDeadline,
        "ETA_COMPLETION_DEADLINE"),
      estimatedCompletionAt,
      status,
    });
  }
  if (kind === "CAPACITY") {
    exact(value, CAPACITY_FIELDS, "CAPACITY_PAYLOAD");
    const status = oneOf(value.status, CAPACITY_STATES, "CAPACITY_STATUS");
    const reservedFrom = instant(value.reservedFrom, "RESERVED_FROM", true);
    const reservedUntil = instant(value.reservedUntil, "RESERVED_UNTIL", true);
    const sourceClass = oneOf(value.sourceClass, CAPACITY_SOURCE_CLASSES,
      "CAPACITY_SOURCE_CLASS");
    if (status === "RESERVED") {
      if (reservedFrom === null || reservedUntil === null
        || Date.parse(reservedFrom) >= Date.parse(reservedUntil)) {
        fail("CAPACITY_RESERVATION_WINDOW_INVALID");
      }
    } else if (reservedFrom !== null || reservedUntil !== null) {
      fail("CAPACITY_RESERVATION_WINDOW_FORBIDDEN");
    }
    return deepFreeze({
      capacityLifecycleRefHash: hash(value.capacityLifecycleRefHash,
        "CAPACITY_LIFECYCLE_REF_HASH", true),
      capacityLifecycleHeadHash: hash(value.capacityLifecycleHeadHash,
        "CAPACITY_LIFECYCLE_HEAD_HASH", true),
      reservedFrom,
      reservedUntil,
      status,
      sourceClass,
    });
  }
  fail("EVIDENCE_KIND_INVALID");
}

function normalizeEvidenceEventInput(value) {
  exact(value, EVENT_INPUT_FIELDS, "EVIDENCE_EVENT_INPUT");
  const evidenceKind = oneOf(value.evidenceKind, EVIDENCE_KINDS,
    "EVIDENCE_KIND");
  const observedAt = instant(value.observedAt, "EVIDENCE_OBSERVED_AT");
  const validUntil = instant(value.validUntil, "EVIDENCE_VALID_UNTIL");
  if (Date.parse(observedAt) >= Date.parse(validUntil)) {
    fail("EVIDENCE_VALIDITY_WINDOW_INVALID");
  }
  if (!Number.isSafeInteger(value.ordinal) || value.ordinal < 1
    || value.ordinal > MAX_EVIDENCE_EVENTS) fail("EVIDENCE_ORDINAL_INVALID");
  return deepFreeze({
    routeProposalRefHash: hash(value.routeProposalRefHash,
      "ROUTE_PROPOSAL_REF_HASH"),
    recoveryOptionRefHash: hash(value.recoveryOptionRefHash,
      "RECOVERY_OPTION_REF_HASH"),
    ordinal: value.ordinal,
    previousEventHash: hash(value.previousEventHash,
      "PREVIOUS_EVIDENCE_EVENT_HASH"),
    observedAt,
    validUntil,
    evidenceKind,
    evidenceOccurrenceRefHash: hash(value.evidenceOccurrenceRefHash,
      "EVIDENCE_OCCURRENCE_REF_HASH"),
    sourceOccurrenceRefHash: hash(value.sourceOccurrenceRefHash,
      "SOURCE_OCCURRENCE_REF_HASH"),
    sourceArtifactHash: hash(value.sourceArtifactHash,
      "SOURCE_ARTIFACT_HASH"),
    sourceReplayReceiptHash: hash(value.sourceReplayReceiptHash,
      "SOURCE_REPLAY_RECEIPT_HASH"),
    payload: normalizePayload(evidenceKind, value.payload),
  });
}

/** Build one immutable event for a local adapter-owned evidence stream. */
export function createRecoveryCandidateEvidenceEventV1(input = {}) {
  const normalized = normalizeEvidenceEventInput(input);
  const body = {
    schema: OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_SCHEMAS.evidenceEvent,
    schemaVersion: "1.0.0",
    ...normalized,
  };
  return deepFreeze({ ...body, eventHash: digest(body.schema, body) });
}

function replayCandidate(candidate, context) {
  exact(candidate, CANDIDATE_FIELDS, "CANDIDATE");
  const routeProposalRefHash = hash(candidate.routeProposalRefHash,
    "CANDIDATE_ROUTE_PROPOSAL_REF_HASH");
  const occurrenceRefHash = hash(candidate.occurrenceRefHash,
    "CANDIDATE_OCCURRENCE_REF_HASH");
  const recoveryOptionRefHash = hash(candidate.recoveryOptionRefHash,
    "CANDIDATE_RECOVERY_OPTION_REF_HASH");
  const events = denseArray(candidate.evidenceEvents, MAX_EVIDENCE_EVENTS,
    "CANDIDATE_EVIDENCE_EVENTS");
  let previous = OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1;
  let lastObservedAt = null;
  const occurrenceIds = new Set();
  const latest = new Map();
  for (let index = 0; index < events.length; index += 1) {
    exact(events[index], EVENT_FIELDS, "EVIDENCE_EVENT");
    const { eventHash, schema, schemaVersion, ...input } = events[index];
    if (schema
        !== OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_SCHEMAS.evidenceEvent
      || schemaVersion !== "1.0.0") fail("EVIDENCE_EVENT_SCHEMA_INVALID");
    const rebuilt = createRecoveryCandidateEvidenceEventV1(input);
    if (!same(events[index], rebuilt) || eventHash !== rebuilt.eventHash
      || input.ordinal !== index + 1 || input.previousEventHash !== previous
      || input.routeProposalRefHash !== routeProposalRefHash
      || input.recoveryOptionRefHash !== recoveryOptionRefHash
      || input.sourceArtifactHash !== routeProposalRefHash) {
      fail("EVIDENCE_EVENT_REPLAY_INVALID");
    }
    if (lastObservedAt !== null
      && Date.parse(input.observedAt) < Date.parse(lastObservedAt)) {
      fail("EVIDENCE_EVENT_TIME_ROLLBACK");
    }
    if (occurrenceIds.has(input.evidenceOccurrenceRefHash)) {
      fail("EVIDENCE_OCCURRENCE_DUPLICATE");
    }
    occurrenceIds.add(input.evidenceOccurrenceRefHash);
    latest.set(input.evidenceKind, rebuilt);
    lastObservedAt = input.observedAt;
    previous = eventHash;
  }

  const gaps = [];
  const registeredAt = context.registeredPairs.get(
    `${routeProposalRefHash}\0${occurrenceRefHash}`) ?? null;
  const registered = registeredAt !== null
    && Date.parse(registeredAt) <= Date.parse(context.evaluatedAt);
  if (!registered) gaps.push("ROUTE_PROPOSAL_OCCURRENCE_NOT_SOURCE_REPLAYED");
  const option = context.recoveryOptions.get(recoveryOptionRefHash);
  if (option === undefined) gaps.push("RECOVERY_OPTION_NOT_IN_VERIFIED_PORTFOLIO");

  for (const kind of EVIDENCE_KINDS) {
    if (!latest.has(kind)) gaps.push(`${kind}_EVIDENCE_MISSING`);
  }
  for (const event of latest.values()) {
    if (Date.parse(event.observedAt) > Date.parse(context.evaluatedAt)) {
      gaps.push(`${event.evidenceKind}_EVIDENCE_FROM_FUTURE`);
    }
    if (Date.parse(event.validUntil) <= Date.parse(context.evaluatedAt)) {
      gaps.push(`${event.evidenceKind}_EVIDENCE_STALE`);
    }
    if (option !== undefined
      && Date.parse(event.validUntil) < Date.parse(option.latestSafeExerciseAt)) {
      gaps.push(`${event.evidenceKind}_EVIDENCE_EXPIRES_BEFORE_EXERCISE_CUTOFF`);
    }
  }

  const specification = latest.get("SPECIFICATION")?.payload ?? null;
  const price = latest.get("ALL_IN_PRICE")?.payload ?? null;
  const eta = latest.get("ETA")?.payload ?? null;
  const capacity = latest.get("CAPACITY")?.payload ?? null;
  if (specification !== null) {
    if (specification.frozenPredicateHash
      !== context.constraints.acceptancePredicateHash) {
      gaps.push("SPECIFICATION_NOT_BOUND_TO_FROZEN_PREDICATE");
    }
    if (specification.status !== "MATCH") {
      gaps.push(specification.status === "MISMATCH"
        ? "FROZEN_SPECIFICATION_MISMATCH" : "FROZEN_SPECIFICATION_UNPROVEN");
    }
  }
  if (price !== null) {
    if (price.constraintRefHash
        !== context.constraints.maximumLossConstraintHash
      || price.currency !== context.constraints.currency) {
      gaps.push("ALL_IN_PRICE_NOT_BOUND_TO_FROZEN_BUDGET");
    }
    if (price.status !== "COMPLETE"
      || price.includesItemTaxShippingAndFees !== true
      || price.allInMinorUnits === null) {
      gaps.push("ALL_IN_PRICE_INCOMPLETE");
    } else if (price.allInMinorUnits
      > context.constraints.maximumAllInMinorUnits) {
      gaps.push("ALL_IN_PRICE_EXCEEDS_FROZEN_BUDGET");
    }
  }
  if (eta !== null) {
    if (eta.completionDeadline !== context.constraints.completionDeadline) {
      gaps.push("ETA_NOT_BOUND_TO_FROZEN_DEADLINE");
    }
    if (eta.status !== "STRUCTURED" || eta.estimatedCompletionAt === null) {
      gaps.push("STRUCTURED_ETA_UNPROVEN");
    } else if (Date.parse(eta.estimatedCompletionAt)
      > Date.parse(context.constraints.completionDeadline)) {
      gaps.push("ETA_EXCEEDS_FROZEN_DEADLINE");
    }
  }
  if (capacity !== null) {
    if (capacity.status !== "RESERVED") {
      gaps.push("CAPACITY_NOT_RESERVED");
    }
    if (capacity.sourceClass
      !== "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY") {
      gaps.push("CAPACITY_OWNER_LIFECYCLE_SOURCE_REPLAY_REQUIRED");
    }
    if (capacity.capacityLifecycleRefHash === null
      || capacity.capacityLifecycleHeadHash === null) {
      gaps.push("CAPACITY_LIFECYCLE_REFERENCE_MISSING");
    }
    if (capacity.status === "RESERVED"
      && (Date.parse(capacity.reservedFrom) > Date.parse(context.evaluatedAt)
        || Date.parse(capacity.reservedUntil)
          < Date.parse(context.constraints.completionDeadline))) {
      gaps.push("CAPACITY_WINDOW_DOES_NOT_COVER_OUTCOME");
    }
  }
  if (context.portfolio.failureDomainPromotionEligible !== true) {
    gaps.push("RECOVERY_FAILURE_DOMAIN_NOT_PROMOTION_ELIGIBLE");
  }
  if (context.portfolio.exerciseWindowOpen !== true) {
    gaps.push("RECOVERY_EXERCISE_WINDOW_CLOSED");
  }
  if (option !== undefined
    && Date.parse(context.evaluatedAt) >= Date.parse(option.latestSafeExerciseAt)) {
    gaps.push("RECOVERY_EXERCISE_WINDOW_CLOSED");
  }

  const uniqueGaps = [...new Set(gaps)].sort();
  const admitted = uniqueGaps.length === 0;
  const body = {
    routeProposalRefHash,
    occurrenceRefHash,
    recoveryOptionRefHash,
    evidenceEventCount: events.length,
    evidenceOccurrenceCount: occurrenceIds.size,
    evidenceHeadHash: previous,
    evidenceEventSetRoot: digest(
      "outsider/recovery-candidate-evidence-event-set/v1",
      events.map((event) => event.eventHash)),
    latestEvidenceRefHashes: deepFreeze(Object.fromEntries(
      EVIDENCE_KINDS.map((kind) => [kind,
        latest.get(kind)?.eventHash ?? null]))),
    gates: deepFreeze({
      routeOccurrenceSourceReplayed: registered,
      recoveryOptionPortfolioBound: option !== undefined,
      frozenSpecificationSatisfied: specification?.status === "MATCH"
        && specification.frozenPredicateHash
          === context.constraints.acceptancePredicateHash,
      completeAllInPriceWithinBudget: price?.status === "COMPLETE"
        && price.includesItemTaxShippingAndFees === true
        && price.constraintRefHash
          === context.constraints.maximumLossConstraintHash
        && price.currency === context.constraints.currency
        && price.allInMinorUnits <= context.constraints.maximumAllInMinorUnits,
      structuredEtaWithinDeadline: eta?.status === "STRUCTURED"
        && eta.completionDeadline === context.constraints.completionDeadline
        && Date.parse(eta.estimatedCompletionAt)
          <= Date.parse(context.constraints.completionDeadline),
      ownerLifecycleCapacityCurrentAndCoveringOutcome:
        capacity?.status === "RESERVED"
        && capacity.sourceClass
          === "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY"
        && capacity.capacityLifecycleRefHash !== null
        && capacity.capacityLifecycleHeadHash !== null
        && Date.parse(capacity.reservedFrom) <= Date.parse(context.evaluatedAt)
        && Date.parse(capacity.reservedUntil)
          >= Date.parse(context.constraints.completionDeadline),
      distinctFailureDomainAndExerciseWindow:
        context.portfolio.failureDomainPromotionEligible === true
        && context.portfolio.exerciseWindowOpen === true
        && option !== undefined
        && Date.parse(context.evaluatedAt)
          < Date.parse(option.latestSafeExerciseAt),
    }),
    admissionDecision: admitted
      ? "ADMITTED_TO_RECOVERY_PORTFOLIO_PLANNING"
      : "REJECTED_FROM_RECOVERY_PORTFOLIO",
    admittedToRecoveryPortfolioPlanning: admitted,
    selectedForRecoveryPortfolioPlanning: false,
    allInMinorUnits: admitted ? price.allInMinorUnits : null,
    estimatedCompletionAt: admitted ? eta.estimatedCompletionAt : null,
    gapCodes: deepFreeze(uniqueGaps),
    capacityEstablishedByThisModule: false,
    recoveryOptionHeld: false,
    independentOutcomeTruthEstablished: false,
    authorityMinted: false,
    outcomeCommitIssued: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, assessmentHash: digest(
    "outsider/recovery-portfolio-candidate-assessment/v1", body) });
}

function normalizeConstraints(value, outcomeOs) {
  exact(value, CONSTRAINT_FIELDS, "FROZEN_CONSTRAINTS");
  if (typeof value.currency !== "string" || !CURRENCY.test(value.currency)) {
    fail("FROZEN_CURRENCY_INVALID");
  }
  const normalized = deepFreeze({
    acceptancePredicateHash: hash(value.acceptancePredicateHash,
      "ACCEPTANCE_PREDICATE_HASH"),
    maximumLossConstraintHash: hash(value.maximumLossConstraintHash,
      "MAXIMUM_LOSS_CONSTRAINT_HASH"),
    currency: value.currency,
    maximumAllInMinorUnits: minorUnits(value.maximumAllInMinorUnits,
      "MAXIMUM_ALL_IN_MINOR_UNITS"),
    completionDeadline: instant(value.completionDeadline,
      "COMPLETION_DEADLINE"),
  });
  if (normalized.acceptancePredicateHash !== outcomeOs.acceptancePredicateHash
    || normalized.maximumLossConstraintHash
      !== outcomeOs.maximumLossConstraintHash
    || normalized.completionDeadline !== outcomeOs.completionDeadline) {
    fail("FROZEN_CONSTRAINTS_OUTCOME_OS_BINDING_INVALID");
  }
  return normalized;
}

/**
 * Replay all supplied histories, hard-gate every candidate, and choose one
 * admitted recovery candidate deterministically.  Price is considered only
 * after every non-price hard gate passes; no learned score can buy admission.
 */
export function selectRecoveryPortfolioCandidatesV1(input = {}) {
  exact(input, INPUT_FIELDS, "INPUT");
  const portfolio = verifyRecoveryOptionPortfolioV2(input.recoveryPortfolio);
  const registry = replayAgentNeutralRouteProposalRegistryV1({
    outcomeLifecycleEvents: input.outcomeLifecycleEvents,
    registryEvents: input.routeProposalRegistryEvents,
  });
  if (registry.head.outcomeOsArtifactHash !== portfolio.outcomeOs.artifactHash
    || registry.head.typedGraphRefHash
      !== portfolio.outcomeOs.typedGraphRefHash) {
    fail("REGISTRY_PORTFOLIO_BINDING_INVALID");
  }
  const evaluatedAt = instant(input.evaluatedAt, "EVALUATED_AT");
  if (Date.parse(evaluatedAt) < Date.parse(portfolio.observedAt)) {
    fail("EVALUATED_AT_BEFORE_PORTFOLIO_OBSERVATION");
  }
  if (Date.parse(evaluatedAt) >= Date.parse(portfolio.outcomeOs.completionDeadline)) {
    fail("EVALUATED_AT_NOT_BEFORE_OUTCOME_DEADLINE");
  }
  const constraints = normalizeConstraints(input.frozenConstraints,
    portfolio.outcomeOs);
  const candidates = denseArray(input.candidates, MAX_CANDIDATES,
    "CANDIDATES");
  const registeredPairs = new Map(input.routeProposalRegistryEvents.map(
    (event) => [`${event.routeProposalRefHash}\0${event.occurrenceRefHash}`,
      event.recordedAt]));
  const recoveryOptions = new Map(portfolio.recoveryOptions.map(
    (option) => [option.optionRefHash, option]));
  const context = { registry, portfolio, evaluatedAt, constraints,
    registeredPairs, recoveryOptions };
  const assessed = candidates.map((candidate) => replayCandidate(candidate,
    context));
  if (new Set(assessed.map((item) => item.occurrenceRefHash)).size
    !== assessed.length) fail("CANDIDATE_OCCURRENCE_DUPLICATE");
  const admitted = assessed.filter((item) =>
    item.admittedToRecoveryPortfolioPlanning).sort((left, right) =>
    left.allInMinorUnits - right.allInMinorUnits
      || left.estimatedCompletionAt.localeCompare(right.estimatedCompletionAt)
      || left.recoveryOptionRefHash.localeCompare(right.recoveryOptionRefHash));
  const selected = admitted[0] ?? null;
  const assessments = assessed.map((item) => {
    if (selected === null || item.assessmentHash !== selected.assessmentHash) {
      return item;
    }
    const { assessmentHash: ignored, ...body } = item;
    const selectedBody = { ...body,
      selectedForRecoveryPortfolioPlanning: true };
    return deepFreeze({ ...selectedBody, assessmentHash: digest(
      "outsider/recovery-portfolio-candidate-assessment/v1", selectedBody) });
  }).sort((left, right) => left.recoveryOptionRefHash.localeCompare(
    right.recoveryOptionRefHash));
  const body = {
    schema: OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_SCHEMAS.selection,
    schemaVersion: "1.0.0",
    recordClass: "SOURCE_REPLAYED_HARD_GATED_RECOVERY_PORTFOLIO_SELECTION",
    evaluatedAt,
    outcomeOsArtifactHash: portfolio.outcomeOs.artifactHash,
    outcomeLifecycleHeadHash: registry.head.currentOutcomeLifecycleHeadHash,
    routeProposalRegistryHeadHash: registry.head.headHash,
    recoveryPortfolioArtifactHash: portfolio.artifactHash,
    frozenConstraints: constraints,
    candidateCount: assessments.length,
    admittedCandidateCount: admitted.length,
    rejectedCandidateCount: assessments.length - admitted.length,
    assessments: deepFreeze(assessments),
    selectionPolicy:
      "ALL_HARD_GATES_THEN_LOWEST_ALL_IN_PRICE_THEN_EARLIEST_ETA_THEN_HASH",
    selectedRecoveryOptionRefHash: selected?.recoveryOptionRefHash ?? null,
    selectedRouteProposalRefHash: selected?.routeProposalRefHash ?? null,
    selectedOccurrenceRefHash: selected?.occurrenceRefHash ?? null,
    portfolioPlanningSelectionMade: selected !== null,
    capacityEstablishedByThisModule: false,
    recoveryOptionHeld: false,
    independentOutcomeTruthEstablished: false,
    authorityMinted: false,
    outcomePromiseIssued: false,
    outcomeCommitIssued: false,
    guaranteeCreated: false,
    decisionState: selected === null
      ? "UNAVAILABLE_RECOVERY_ROUTE" : "PORTFOLIO_PLANNING_HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_RECOVERY_PORTFOLIO_ADMISSION_GATE_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, artifactHash: digest(body.schema, body) });
}

export function verifyRecoveryPortfolioCandidateSelectionV1(record, input) {
  const rebuilt = selectRecoveryPortfolioCandidatesV1(input);
  if (!same(record, rebuilt)) fail("SELECTION_ARTIFACT_REPLAY_INVALID");
  return rebuilt;
}
