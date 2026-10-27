/*
 * Provider-neutral owner-lifecycle capacity admission v1.
 *
 * This is the narrow bridge from the already source-replayed external
 * capacity-reservation protocol into seller-neutral route evidence.  It does
 * not accept a status field supplied by an adapter.  The exact owner-signed
 * receipt, every lifecycle occurrence, and the current signed head are
 * replayed again by the external protocol before one CAPACITY fact can be
 * labelled RESERVED for recovery-portfolio planning.
 *
 * RESERVED here is a bounded planning fact about a current source-declared
 * hold.  It does not establish legal owner authority, independent capacity
 * truth, execution authority, payment authority, Outcome truth, or COMMIT.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  createBuyerNativeRouteEvidenceV1,
  mapBuyerNativeRouteEvidenceToRecoveryCandidateV1,
  selectBuyerNativeRouteEvidenceRecoveryCandidatesV1,
  verifyBuyerNativeRouteEvidenceV1,
} from "./outsider-buyer-native-route-evidence-v1.js";
import {
  verifyExternalCapacityReservationProtocolV1,
} from "./outsider-external-capacity-reservation-protocol-v1.js";

const PREFIX = "OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INPUT_FIELDS = Object.freeze([
  "routeEvidence", "capacityVerificationInput",
]);
const SELECT_INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "routeProposalRegistryEvents",
  "recoveryPortfolio", "evaluatedAt", "frozenConstraints",
  "capacityAdmissionInputs",
]);

export const OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_SCHEMA
  = "outsider/owner-lifecycle-capacity-admission/v1";

export const OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_BOUNDARY
  = deepFreeze({
    position:
      "OWNER_SIGNED_CURRENT_HOLD_TO_SELLER_NEUTRAL_RECOVERY_PLANNING_EVIDENCE",
    providerNeutral: true,
    exactTypedGraphEpisodeAttemptReplayed: true,
    exactOwnerSignedReservationReceiptReplayed: true,
    completeOwnerLifecycleOccurrenceDenominatorReplayed: true,
    currentSignedLifecycleHeadRequired: true,
    expiryRequired: true,
    revocationOrReleaseDescendantClosesAdmission: true,
    ordinaryCartAccepted: false,
    atpAccepted: false,
    quoteAccepted: false,
    genericServerAcknowledgementAccepted: false,
    adapterDeclaredReservedStatusAcceptedWithoutRawReplay: false,
    sourceDeclaredHoldMayEnterRecoveryPortfolioPlanning: true,
    sourceDeclaredHoldEstablishesLegalOwnerAuthority: false,
    sourceDeclaredHoldEstablishesIndependentCapacityTruth: false,
    sourceDeclaredHoldAuthorizesExecution: false,
    sourceDeclaredHoldAuthorizesPayment: false,
    sourceDeclaredHoldEstablishesOutcomeTruth: false,
    sourceDeclaredHoldIssuesCommit: false,
    authorityMinted: false,
    externalCapacityEstablishedByThisModule: false,
    independentOutcomeTruthEstablished: false,
    outcomeCommitIssued: false,
    paymentPerformed: false,
    orderPerformed: false,
    networkIoPerformed: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "RECOVERY_PORTFOLIO_PLANNING_ONLY",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Buffer.isBuffer(value)
    || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
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
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function earlier(left, right) {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function assertUnreservedBase(capacity) {
  if (!["UNRESERVED", "UNAVAILABLE"].includes(capacity.status)
    || capacity.capacityLifecycleRefHash !== null
    || capacity.capacityLifecycleHeadHash !== null
    || capacity.reservedFrom !== null || capacity.reservedUntil !== null
    || capacity.sourceClass === "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY") {
    fail("BASE_ROUTE_CAPACITY_MUST_BE_UNRESERVED");
  }
}

/**
 * Replay the exact owner lifecycle and issue a descendant seller-neutral
 * route-evidence object whose CAPACITY fact is eligible for the existing
 * recovery planning gate.  No raw source bytes are projected.
 */
export function admitOwnerLifecycleCapacityToRouteEvidenceV1(input = {}) {
  exact(input, INPUT_FIELDS, "INPUT");
  const base = verifyBuyerNativeRouteEvidenceV1(input.routeEvidence);
  assertUnreservedBase(base.facts.capacity);

  const checked = verifyExternalCapacityReservationProtocolV1(
    input.capacityVerificationInput);
  if (!checked.ok
    || checked.lifecycleState !== "CAPACITY_RESERVED"
    || checked.sourceDeclaredCapacityReservationCurrent !== true
    || checked.exactOfferAndRequestReplayed !== true
    || checked.ownerSourceSelfSignatureVerified !== true
    || checked.ownerSourceAndReservationKeyContinuityVerified !== true
    || checked.reservationReceiptSignatureVerified !== true
    || checked.exactProviderSlotQuantityAndTimeWindowVerified !== true
    || checked.oneUseReservationNonceBound !== true
    || checked.lifecycleOccurrenceDenominatorReplayed !== true
    || checked.lifecycleHeadSignatureVerified !== true
    || checked.lifecycleHeadCurrentAtObservedAt !== true) {
    fail("CURRENT_OWNER_LIFECYCLE_RESERVATION_REPLAY_REQUIRED");
  }
  /* The protocol rebuilds the exact request before returning ok.  The request
     carries the discovery-route binding even though the closed verification
     projection intentionally omits that identifier. */
  const reservationRouteRefHash = hash(
    input.capacityVerificationInput?.request?.discoveryRouteObjectHash,
    "RESERVATION_DISCOVERY_ROUTE_REF_HASH");
  if (base.routeProposalRefHash !== reservationRouteRefHash) {
    fail("ROUTE_PROPOSAL_TO_RESERVATION_ROUTE_BINDING_INVALID");
  }
  if (Date.parse(checked.observedAt) < Date.parse(base.observedAt)
    || Date.parse(checked.observedAt) >= Date.parse(base.validUntil)) {
    fail("BASE_ROUTE_EVIDENCE_NOT_CURRENT_AT_RESERVATION_OBSERVATION");
  }
  const validUntil = earlier(base.validUntil, checked.serviceUntil);
  if (Date.parse(checked.observedAt) >= Date.parse(validUntil)) {
    fail("RESERVATION_VALIDITY_WINDOW_EMPTY");
  }
  const eventHashes = input.capacityVerificationInput
    ?.expectedLifecycleEventSourceHashes;
  if (!Array.isArray(eventHashes) || eventHashes.length < 1) {
    fail("LIFECYCLE_EVENT_SOURCE_HASHES_REQUIRED");
  }
  const currentLifecycleOccurrenceRefHash = hash(eventHashes.at(-1),
    "CURRENT_LIFECYCLE_OCCURRENCE_REF_HASH");
  const compositeReplayReceiptHash = digest(
    "outsider/owner-lifecycle-capacity-composite-source-replay/v1", {
      baseRouteEvidenceHash: base.evidenceHash,
      baseSourceReplayReceiptHash: base.sourceReplayReceiptHash,
      capacityVerificationHash: checked.verificationHash,
    });
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: base.routeProposalRefHash,
    occurrenceRefHash: base.occurrenceRefHash,
    recoveryOptionRefHash: base.recoveryOptionRefHash,
    observedAt: checked.observedAt,
    validUntil,
    sourceReplayReceiptHash: compositeReplayReceiptHash,
    facts: {
      specification: base.facts.specification,
      allInPrice: base.facts.allInPrice,
      eta: base.facts.eta,
      capacity: {
        sourceOccurrenceRefHash: currentLifecycleOccurrenceRefHash,
        capacityLifecycleRefHash: checked.reservationReceiptSourceHash,
        capacityLifecycleHeadHash: checked.lifecycleHeadSourceHash,
        reservedFrom: checked.observedAt,
        reservedUntil: checked.serviceUntil,
        status: "RESERVED",
        sourceClass: "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY",
      },
    },
  });
  const body = {
    schema: OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_SCHEMA,
    schemaVersion: "1.0.0",
    recordClass:
      "OWNER_LIFECYCLE_SOURCE_REPLAYED_CAPACITY_PLANNING_ADMISSION",
    typedGraphHash: checked.typedGraphHash,
    episodeHash: checked.episodeHash,
    attemptHash: checked.attemptHash,
    routeProposalRefHash: base.routeProposalRefHash,
    occurrenceRefHash: base.occurrenceRefHash,
    recoveryOptionRefHash: base.recoveryOptionRefHash,
    baseRouteEvidenceHash: base.evidenceHash,
    capacityVerificationHash: checked.verificationHash,
    reservationReceiptSourceHash: checked.reservationReceiptSourceHash,
    lifecycleHeadSourceHash: checked.lifecycleHeadSourceHash,
    currentLifecycleOccurrenceRefHash,
    lifecycleOccurrenceCount: checked.lifecycleOccurrenceCount,
    admittedAt: checked.observedAt,
    reservationExpiresAt: checked.serviceUntil,
    capacityEvidenceState: "CAPACITY_RESERVED",
    ownerLifecycleSourceReplayed: true,
    revocationOrReleaseDescendantRequiredToChangeCurrentState: true,
    capacityFactAdmittedToRecoveryPortfolioPlanning: true,
    routeEvidence,
    rawSourceBytesProjected: false,
    providerIdentifierProjected: false,
    resourceOwnerIdentifierProjected: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablishedByThisModule: false,
    independentOutcomeTruthEstablished: false,
    authorityMinted: false,
    outcomeCommitIssued: false,
    paymentPerformed: false,
    orderPerformed: false,
    decisionState: "RECOVERY_PORTFOLIO_PLANNING_HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, admissionHash: digest(body.schema, body) });
}

/** Feed only a rebuilt admission into the existing recovery-gate shape. */
export function mapOwnerLifecycleCapacityAdmissionToRecoveryCandidateV1(
  input = {}) {
  const admission = admitOwnerLifecycleCapacityToRouteEvidenceV1(input);
  return mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(
    admission.routeEvidence);
}

/**
 * Compose many exact capacity admissions with the existing hard gate.  This
 * helper changes no gate semantics; it merely prevents callers from supplying
 * an unverified RESERVED fact directly on this path.
 */
export function selectOwnerLifecycleCapacityAdmissionsForRecoveryV1(
  input = {}) {
  exact(input, SELECT_INPUT_FIELDS, "SELECT_INPUT");
  if (!Array.isArray(input.capacityAdmissionInputs)
    || isProxy(input.capacityAdmissionInputs)
    || Object.getPrototypeOf(input.capacityAdmissionInputs) !== Array.prototype
    || input.capacityAdmissionInputs.length < 1
    || input.capacityAdmissionInputs.length > 1_000) {
    fail("CAPACITY_ADMISSION_INPUTS_INVALID");
  }
  const routeEvidence = input.capacityAdmissionInputs.map((item) =>
    admitOwnerLifecycleCapacityToRouteEvidenceV1(item).routeEvidence);
  return selectBuyerNativeRouteEvidenceRecoveryCandidatesV1({
    outcomeLifecycleEvents: input.outcomeLifecycleEvents,
    routeProposalRegistryEvents: input.routeProposalRegistryEvents,
    recoveryPortfolio: input.recoveryPortfolio,
    evaluatedAt: input.evaluatedAt,
    frozenConstraints: input.frozenConstraints,
    routeEvidence,
  });
}
