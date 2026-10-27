/*
 * Reserved temporary-network formation slice v2.
 *
 * Additive Gate 4 composition over the frozen injected formation v1. This
 * layer replays, rather than trusts, the v1 content hash, one exact external
 * capacity-reservation lifecycle for each supplied role, and the independent
 * witness lifecycle/HOLD gate. It requires a bijection among PRIMARY,
 * RECOVERY, INDEPENDENT_WITNESS and the tender's RESOURCE, RECOVERY, EVIDENCE
 * slots before reporting structural completion.
 *
 * Source-declared reservation currentness is projected separately from real
 * capacity truth. No seller/owner self-signature establishes legal identity,
 * owner authority, operational independence, outcome truth, action authority,
 * price, guarantee, settlement, or atomic commitment. A witness capacity
 * reservation cannot substitute for a witness result; a signed witness result
 * may be present without being accepted as independent outcome truth.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  attachIndependentWitnessToFormationHoldV1,
} from "./outsider-independent-witness-formation-hold-gate-v1.js";
import { verifyIndependentOutcomeWitnessLifecycleV1 }
  from "./outsider-independent-outcome-witness-lifecycle-v1.js";
import { verifyExternalCapacityReservationForFormationCoordinatorV1 }
  from "./outsider-external-capacity-reservation-protocol-v1.js";
import {
  OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS,
} from "./outsider-injected-temporary-network-formation-slice-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const ROLE_TO_KIND = Object.freeze({
  PRIMARY: "RESOURCE",
  RECOVERY: "RECOVERY",
  INDEPENDENT_WITNESS: "EVIDENCE",
});
const ROLES = Object.freeze(Object.keys(ROLE_TO_KIND));

export const OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_SCHEMAS
  = Object.freeze({
    formation: "outsider/reserved-temporary-network-formation-slice/v2",
    verification:
      "outsider/reserved-temporary-network-formation-slice-verification/v2",
  });

export const OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_BOUNDARY
  = Object.freeze({
    position:
      "THREE_SLOT_SOURCE_DECLARED_RESERVATION_AND_WITNESS_GATE_HOLD_ONLY",
    frozenInjectedFormationV1Mutated: false,
    frozenInjectedFormationV1ContentHashReplayed: true,
    exactCapacityReservationRawSourcesReplayed: true,
    exactThreeRoleToTenderSlotBijectionRequired: true,
    exactTenderTypedGraphEpisodeAttemptBound: true,
    exactProviderOfferOwnerSlotQuantityWindowNonceAndExpiryBound: true,
    witnessLifecycleRawSourcesReplayedThroughHoldGate: true,
    sourceDeclaredReservationsProjectedSeparately: true,
    signedOfferIsCapacityReservation: false,
    witnessReservationSubstitutesForOutcomeTruth: false,
    witnessResultReceiptMayBePresent: true,
    witnessResultReceiptEstablishesOutcomeTruth: false,
    structuralDistinctnessEstablishesOperationalIndependence: false,
    selfSignedOwnerSourceEstablishesOwnerAuthority: false,
    missingRevokedOrExpiredBeforeDeadlineDisposition:
      "CONTINUE_AUTOMATED_FORMATION_HOLD",
    missingRevokedOrExpiredAtOrAfterDeadlineDisposition:
      "DECLINE_NOT_HUMAN_QUEUE",
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    liveIoPerformed: false,
    networkIoPerformed: false,
    paymentPerformed: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    independentWitnessControlEstablished: false,
    independentWitnessOutcomeTruthEstablished: false,
    recoveryOutcomeTruthEstablished: false,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function role(value) {
  if (!Object.hasOwn(ROLE_TO_KIND, value)) fail("CAPACITY_ROLE_INVALID");
  return value;
}

function verifyPredecessor(record, expectedHash, tenderHash) {
  if (record === null || typeof record !== "object" || Array.isArray(record)
    || isProxy(record)) fail("PREDECESSOR_OBJECT_INVALID");
  canonicalizeStrict(record);
  if (record.schema
      !== OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS
        .formation
    || record.formationHash !== expectedHash
    || record.tenderHash !== tenderHash
    || !Array.isArray(record.slots) || record.slots.length > ROLES.length
    || record.atomicCommitmentGateSatisfied !== false
    || record.atomicCommit !== false || record.userOutcomePromiseIssued !== false
    || record.externalResourceOwnerTrustEstablished !== false
    || record.primaryCapacityReserved !== false
    || record.recoveryCapacityReserved !== false
    || record.independentWitnessOutcomeTruthEstablished !== false
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.actionReady !== false || record.executable !== false) {
    fail("PREDECESSOR_BOUNDARY_INVALID");
  }
  const body = { ...record };
  delete body.formationHash;
  if (digest(record.schema, body) !== expectedHash) {
    fail("PREDECESSOR_CONTENT_HASH_MISMATCH");
  }
  const seen = new Set();
  for (const slot of record.slots) {
    if (slot === null || typeof slot !== "object" || Array.isArray(slot)) {
      fail("PREDECESSOR_SLOT_INVALID");
    }
    const selectedRole = role(slot.role);
    if (seen.has(selectedRole)) fail("PREDECESSOR_ROLE_DUPLICATE");
    seen.add(selectedRole);
    if (slot.requirementKind !== ROLE_TO_KIND[selectedRole]
      || typeof slot.requirementId !== "string"
      || !HASH.test(slot.providerRefHash)
      || !HASH.test(slot.oneUseResponseHash)
      || slot.endpointReturnedSignedSources !== true
      || slot.capacityReserved !== false || slot.authority !== "NONE") {
      fail("PREDECESSOR_SLOT_BOUNDARY_INVALID");
    }
  }
  return { record, roles: seen };
}

function mandatoryRequirement(tender, kind, requirementId) {
  const collection = kind === "RESOURCE"
    ? tender.resourceRequirements.items
    : kind === "EVIDENCE"
      ? tender.evidenceRequirements.items : tender.recoveryRequirements.items;
  const field = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId" : "recoveryRequirementId";
  const matches = collection.filter((item) =>
    item[field] === requirementId && item.mandatory === true);
  if (matches.length !== 1) fail("MANDATORY_TENDER_SLOT_BINDING_INVALID");
  return matches[0];
}

const INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "predecessorFormation",
  "expectedPredecessorFormationHash", "capacityReservationSlots",
  "witnessHoldGate", "witnessHoldGateInput", "expectedWitnessHoldGateHash",
  "observedAt",
]);
const CAPACITY_SLOT_FIELDS = Object.freeze([
  "role", "verificationInput", "expectedVerificationHash",
]);
const WITNESS_GATE_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "predecessorFormation",
  "expectedPredecessorFormationHash", "witnessLifecycleSource",
  "expectedWitnessReplayHash", "observedAt",
]);

function build(input) {
  exactObject(input, INPUT_FIELDS, "INPUT");
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const expectedTenderHash = hash(input.expectedTenderHash,
    "EXPECTED_TENDER_HASH");
  const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender,
    { expectedTenderHash });
  if (!tenderCheck.ok || tenderCheck.authority !== "NONE") {
    fail("TENDER_REPLAY_FAILED");
  }
  const predecessorHash = hash(input.expectedPredecessorFormationHash,
    "EXPECTED_PREDECESSOR_FORMATION_HASH");
  const predecessor = verifyPredecessor(input.predecessorFormation,
    predecessorHash, expectedTenderHash);

  exactObject(input.witnessHoldGateInput, WITNESS_GATE_INPUT_FIELDS,
    "WITNESS_HOLD_GATE_INPUT");
  if (!same(input.witnessHoldGateInput.tender, input.tender)
    || input.witnessHoldGateInput.expectedTenderHash !== expectedTenderHash
    || !same(input.witnessHoldGateInput.predecessorFormation,
      input.predecessorFormation)
    || input.witnessHoldGateInput.expectedPredecessorFormationHash
      !== predecessorHash
    || input.witnessHoldGateInput.observedAt !== observedAt) {
    fail("WITNESS_HOLD_GATE_INPUT_CROSS_BINDING_INVALID");
  }
  const rebuiltWitnessGate = attachIndependentWitnessToFormationHoldV1(
    input.witnessHoldGateInput);
  const expectedWitnessHoldGateHash = hash(input.expectedWitnessHoldGateHash,
    "EXPECTED_WITNESS_HOLD_GATE_HASH");
  if (rebuiltWitnessGate.gateHash !== expectedWitnessHoldGateHash
    || !same(rebuiltWitnessGate, input.witnessHoldGate)
    || rebuiltWitnessGate.tenderHash !== expectedTenderHash
    || rebuiltWitnessGate.predecessorFormationHash !== predecessorHash
    || rebuiltWitnessGate.observedAt !== observedAt
    || rebuiltWitnessGate.atomicCommitmentGateSatisfied !== false
    || rebuiltWitnessGate.independentWitnessControlEstablished !== false
    || rebuiltWitnessGate.independentWitnessOutcomeTruthEstablished !== false
    || rebuiltWitnessGate.authority !== "NONE") {
    fail("WITNESS_HOLD_GATE_REBUILD_OR_BOUNDARY_INVALID");
  }
  const witnessReplay = verifyIndependentOutcomeWitnessLifecycleV1(
    input.witnessHoldGateInput.witnessLifecycleSource);
  if (!witnessReplay.ok
    || witnessReplay.replayHash
      !== input.witnessHoldGateInput.expectedWitnessReplayHash
    || witnessReplay.tenderHash !== expectedTenderHash
    || witnessReplay.primaryAttemptHash
      !== input.tender.typedGraph.attempt.attemptHash
    || witnessReplay.observedAt !== observedAt
    || witnessReplay.independentControlEstablished !== false
    || witnessReplay.independentOutcomeTruthEstablished !== false
    || witnessReplay.capacityReserved !== false
    || witnessReplay.authority !== "NONE") {
    fail("WITNESS_LIFECYCLE_REPLAY_INVALID");
  }

  if (!Array.isArray(input.capacityReservationSlots)
    || input.capacityReservationSlots.length > ROLES.length) {
    fail("CAPACITY_RESERVATION_SLOTS_INVALID");
  }
  const slots = [];
  const seen = new Set();
  for (const slotInput of input.capacityReservationSlots) {
    exactObject(slotInput, CAPACITY_SLOT_FIELDS, "CAPACITY_SLOT_INPUT");
    const selectedRole = role(slotInput.role);
    if (seen.has(selectedRole)) fail("CAPACITY_ROLE_DUPLICATE");
    seen.add(selectedRole);
    const checked = verifyExternalCapacityReservationForFormationCoordinatorV1(
      slotInput.verificationInput);
    if (!checked.ok
      || checked.verificationHash !== hash(slotInput.expectedVerificationHash,
        "EXPECTED_CAPACITY_VERIFICATION_HASH")
      || checked.tenderHash !== expectedTenderHash
      || checked.typedGraphHash !== input.tender.typedGraph.typedGraphHash
      || checked.episodeHash !== input.tender.typedGraph.episode.episodeHash
      || checked.attemptHash !== input.tender.typedGraph.attempt.attemptHash
      || checked.observedAt !== observedAt
      || checked.requirementKind !== ROLE_TO_KIND[selectedRole]
      || checked.resourceOwnerAuthorityEstablished !== false
      || checked.externalCapacityEstablished !== false
      || checked.capacityReserved !== false || checked.authority !== "NONE") {
      fail("CAPACITY_RESERVATION_REPLAY_OR_GRAPH_BINDING_INVALID");
    }
    mandatoryRequirement(input.tender, checked.requirementKind,
      checked.requirementId);
    const predecessorMatches = input.predecessorFormation.slots.filter(
      (candidate) => candidate.role === selectedRole
        && candidate.requirementKind === checked.requirementKind
        && candidate.requirementId === checked.requirementId
        && candidate.providerRefHash === checked.providerRefHash
        && candidate.oneUseResponseHash === checked.offerResponseHash);
    if (predecessorMatches.length !== 1) {
      fail("CAPACITY_TO_PREDECESSOR_SLOT_BIJECTION_INVALID");
    }
    slots.push(Object.freeze({
      role: selectedRole,
      requirementKind: checked.requirementKind,
      requirementId: checked.requirementId,
      requirementObjectHash: checked.requirementObjectHash,
      providerRefHash: checked.providerRefHash,
      resourceOwnerRefHash: checked.resourceOwnerRefHash,
      ownerSourceHash: checked.ownerSourceHash,
      offerResponseHash: checked.offerResponseHash,
      offerLifecycleHeadHash: checked.offerLifecycleHeadHash,
      reservationRequestHash: checked.reservationRequestHash,
      reservationNonceHash: checked.reservationNonceHash,
      quantity: checked.quantity,
      unitCode: checked.unitCode,
      serviceFrom: checked.serviceFrom,
      serviceUntil: checked.serviceUntil,
      lifecycleState: checked.lifecycleState,
      sourceDeclaredCapacityReservationCurrent:
        checked.sourceDeclaredCapacityReservationCurrent,
      capacityReservationVerificationHash: checked.verificationHash,
      exactTenderGraphProviderOfferOwnerSlotQuantityWindowNonceBound: true,
      resourceOwnerAuthorityEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      authority: "NONE",
    }));
  }
  slots.sort((left, right) => ROLES.indexOf(left.role) - ROLES.indexOf(right.role));
  const missingRoles = ROLES.filter((item) => !seen.has(item));
  const exactThreeSlotBijectionVerified = slots.length === ROLES.length
    && missingRoles.length === 0 && predecessor.roles.size === ROLES.length;

  const primary = slots.find((item) => item.role === "PRIMARY") ?? null;
  const witness = slots.find(
    (item) => item.role === "INDEPENDENT_WITNESS") ?? null;
  const witnessCrossBindingVerified = primary !== null && witness !== null
    && primary.providerRefHash === witnessReplay.primaryProviderRefHash
    && witness.providerRefHash === witnessReplay.witnessProviderRefHash
    && witness.resourceOwnerRefHash === witnessReplay.witnessOwnerRefHash
    && witness.requirementId === witnessReplay.evidenceRequirementId;
  if (primary !== null && witness !== null && !witnessCrossBindingVerified) {
    fail("CAPACITY_SLOTS_TO_WITNESS_LIFECYCLE_BINDING_INVALID");
  }

  const allSourceDeclaredReservationsCurrent
    = exactThreeSlotBijectionVerified && slots.every((item) =>
      item.sourceDeclaredCapacityReservationCurrent === true);
  const witnessObservationResponsibilityCurrent
    = rebuiltWitnessGate.witnessObservationResponsibilityCurrent === true;
  const sourceDeclaredGate4EvidenceComplete
    = allSourceDeclaredReservationsCurrent
      && witnessCrossBindingVerified
      && witnessObservationResponsibilityCurrent;
  const deadlineReached = Date.parse(observedAt)
    >= Date.parse(input.tender.formationDeadline);
  const disposition = deadlineReached
    ? "DECLINE_NOT_HUMAN_QUEUE"
    : "CONTINUE_AUTOMATED_FORMATION_HOLD";
  const gapCodes = [];
  if (!exactThreeSlotBijectionVerified) {
    gapCodes.push("EXACT_THREE_SLOT_RESERVATION_BIJECTION_INCOMPLETE");
  }
  for (const item of slots) {
    if (!item.sourceDeclaredCapacityReservationCurrent) {
      gapCodes.push(`${item.role}_SOURCE_DECLARED_RESERVATION_${item.lifecycleState}`);
    }
  }
  if (!witnessCrossBindingVerified) {
    gapCodes.push("WITNESS_RESERVATION_CROSS_BINDING_INCOMPLETE");
  }
  if (!witnessObservationResponsibilityCurrent) {
    gapCodes.push("WITNESS_OBSERVATION_RESPONSIBILITY_NOT_CURRENT");
  }
  if (!witnessReplay.resultReceiptPresent) {
    gapCodes.push("INDEPENDENT_WITNESS_RESULT_RECEIPT_NOT_PRESENT");
  } else {
    gapCodes.push("WITNESS_RESULT_PRESENT_BUT_INDEPENDENCE_AND_TRUTH_UNPROVEN");
  }
  gapCodes.push("INDEPENDENT_RESOURCE_OWNER_TRUST_ROOT_NOT_ESTABLISHED");
  gapCodes.push("EXTERNAL_CAPACITY_TRUTH_NOT_ESTABLISHED");
  gapCodes.push("WITNESS_OPERATIONAL_INDEPENDENCE_NOT_ESTABLISHED");
  gapCodes.push("INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED");
  gapCodes.push("ATOMIC_COMMIT_PREMISES_INCOMPLETE");

  const body = {
    schema:
      OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_SCHEMAS.formation,
    schemaVersion: "2.0.0",
    recordClass:
      "THREE_SLOT_SOURCE_DECLARED_RESERVATIONS_WITH_WITNESS_HOLD_GATE",
    lineage: {
      revision: 2,
      predecessorSchema: input.predecessorFormation.schema,
      predecessorFormationHash: predecessorHash,
      frozenPredecessorMutated: false,
    },
    tenderHash: expectedTenderHash,
    typedGraphHash: input.tender.typedGraph.typedGraphHash,
    episodeHash: input.tender.typedGraph.episode.episodeHash,
    attemptHash: input.tender.typedGraph.attempt.attemptHash,
    observedAt,
    formationDeadline: input.tender.formationDeadline,
    deadlineReached,
    requiredRoles: ROLES,
    missingRoles,
    slots,
    exactPredecessorContentHashReplayed: true,
    exactThreeSlotBijectionVerified,
    exactTenderGraphEpisodeAttemptBound: true,
    allSuppliedCapacityReservationRawSourcesReplayed:
      slots.length === input.capacityReservationSlots.length,
    allRequiredCapacityReservationRawSourcesReplayed:
      exactThreeSlotBijectionVerified,
    allSourceDeclaredReservationsCurrent,
    sourceDeclaredPrimaryReservationCurrent:
      primary?.sourceDeclaredCapacityReservationCurrent ?? false,
    sourceDeclaredRecoveryReservationCurrent:
      slots.find((item) => item.role === "RECOVERY")
        ?.sourceDeclaredCapacityReservationCurrent ?? false,
    sourceDeclaredWitnessResourceReservationCurrent:
      witness?.sourceDeclaredCapacityReservationCurrent ?? false,
    witnessHoldGateHash: rebuiltWitnessGate.gateHash,
    witnessReplayHash: witnessReplay.replayHash,
    witnessCapacityAndObservationLifecycleCrossBindingVerified:
      witnessCrossBindingVerified,
    witnessObservationResponsibilityCurrent,
    independentWitnessResultReceiptPresent: witnessReplay.resultReceiptPresent,
    witnessSourceDeclaredObservation:
      witnessReplay.witnessSourceDeclaredObservation,
    signedOfferIsCapacityReservation: false,
    witnessCapacityReservationSubstitutesForOutcomeTruth: false,
    witnessResultReceiptAcceptedAsOutcomeTruth: false,
    sourceDeclaredGate4EvidenceComplete,
    structuralCompletionMintsAuthorityOrCapacity: false,
    selfSignedOwnerSourceEstablishesOwnerAuthority: false,
    independentResourceOwnerTrustRootEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    independentWitnessCapacityReserved: false,
    independentWitnessControlEstablished: false,
    independentWitnessOutcomeTruthEstablished: false,
    recoveryOutcomeTruthEstablished: false,
    maximumLossBoundEstablished: false,
    fundingAndCapitalSufficiencyEstablished: false,
    lawfulTransactionAndPaymentPathEstablished: false,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    disposition,
    gapCodes,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    liveIoPerformed: false,
    networkIoPerformed: false,
    paymentPerformed: false,
    price: null,
    pricePresent: false,
    guarantee: null,
    guaranteeEstablished: false,
    settlement: null,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    boundary: OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_BOUNDARY,
  };
  return Object.freeze({ ...body, formationHash: digest(
    OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_SCHEMAS.formation,
    body) });
}

export function createReservedTemporaryNetworkFormationSliceV2(input = {}) {
  return build(input);
}

export function verifyReservedTemporaryNetworkFormationSliceV2(
  input = {}, expectedFormationHash = null) {
  try {
    const rebuilt = build(input);
    if (rebuilt.formationHash !== hash(expectedFormationHash,
      "EXPECTED_FORMATION_HASH")) fail("FORMATION_HASH_MISMATCH");
    return rebuilt;
  } catch (error) {
    const errorCode = error instanceof Error
      && /^OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_[A-Z0-9_]+$/u
        .test(String(error.message))
      ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
    return Object.freeze({
      schema:
        OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_SCHEMAS
          .verification,
      schemaVersion: "2.0.0",
      ok: false,
      errorCode,
      exactThreeSlotBijectionVerified: false,
      allSourceDeclaredReservationsCurrent: false,
      independentResourceOwnerTrustRootEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      independentWitnessControlEstablished: false,
      independentWitnessOutcomeTruthEstablished: false,
      atomicCommitmentGateSatisfied: false,
      atomicCommit: false,
      userOutcomePromiseIssued: false,
      humanQueueCreated: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: OUTSIDER_RESERVED_TEMPORARY_NETWORK_FORMATION_SLICE_V2_BOUNDARY,
    });
  }
}
