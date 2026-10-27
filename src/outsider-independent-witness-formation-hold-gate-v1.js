/*
 * Independent witness attachment for the injected temporary-network HOLD gate.
 *
 * This additive composition leaves the frozen injected formation slice v1
 * untouched.  It verifies that predecessor by content hash, independently
 * replays witness-owned reservation/result/revocation source bytes, and binds
 * them to the exact primary and evidence slots.  A signed witness receipt can
 * therefore become present without being promoted to independent control or
 * outcome truth.  Atomic commitment remains closed.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS,
  verifyIndependentOutcomeWitnessLifecycleV1,
} from "./outsider-independent-outcome-witness-lifecycle-v1.js";
import {
  OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS,
} from "./outsider-injected-temporary-network-formation-slice-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_SCHEMAS
  = Object.freeze({
    gate: "outsider/independent-witness-formation-hold-gate/v1",
  });

export const OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_BOUNDARY
  = Object.freeze({
    position:
      "SIGNED_WITNESS_LIFECYCLE_ATTACHED_TO_TEMPORARY_NETWORK_HOLD_GATE",
    frozenPredecessorMutated: false,
    witnessRawSourceBytesProjected: false,
    witnessSourceReplayRequired: true,
    exactPrimaryAndWitnessSlotBindingRequired: true,
    signedReceiptPresenceCanBeEstablished: true,
    signedReceiptPresenceEstablishesIndependentControl: false,
    signedReceiptPresenceEstablishesOutcomeTruth: false,
    structuralDistinctnessProvesIndependentControl: false,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
    modelRewardAcceptedAsOutcomeTruth: false,
    liveIoPerformed: false,
    paymentPerformed: false,
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
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
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

function verifyPredecessor(record, expectedHash, tenderHash) {
  if (record === null || typeof record !== "object" || Array.isArray(record)
    || isProxy(record)) fail("PREDECESSOR_OBJECT_INVALID");
  canonicalizeStrict(record);
  if (record.schema
      !== OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS
        .formation
    || record.tenderHash !== tenderHash
    || record.formationHash !== expectedHash
    || record.atomicCommitmentGateSatisfied !== false
    || record.atomicCommit !== false || record.userOutcomePromiseIssued !== false
    || record.independentWitnessReceiptPresent !== false
    || record.independentWitnessOutcomeTruthEstablished !== false
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.actionReady !== false || record.executable !== false
    || !Array.isArray(record.slots)) fail("PREDECESSOR_BOUNDARY_INVALID");
  const body = { ...record };
  delete body.formationHash;
  if (digest(record.schema, body) !== expectedHash) {
    fail("PREDECESSOR_HASH_MISMATCH");
  }
  return record;
}

const INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "predecessorFormation",
  "expectedPredecessorFormationHash", "witnessLifecycleSource",
  "expectedWitnessReplayHash", "observedAt",
]);

export function attachIndependentWitnessToFormationHoldV1(input = {}) {
  exactObject(input, INPUT_FIELDS, "INPUT");
  const expectedTenderHash = hash(input.expectedTenderHash,
    "EXPECTED_TENDER_HASH");
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender,
    { expectedTenderHash });
  if (!tenderCheck.ok || tenderCheck.authority !== "NONE") {
    fail("TENDER_REPLAY_FAILED");
  }
  const expectedPredecessorFormationHash = hash(
    input.expectedPredecessorFormationHash,
    "EXPECTED_PREDECESSOR_FORMATION_HASH");
  const predecessor = verifyPredecessor(input.predecessorFormation,
    expectedPredecessorFormationHash, expectedTenderHash);

  const witnessReplay = verifyIndependentOutcomeWitnessLifecycleV1(
    input.witnessLifecycleSource);
  if (!witnessReplay.ok
    || witnessReplay.replayHash !== hash(input.expectedWitnessReplayHash,
      "EXPECTED_WITNESS_REPLAY_HASH")
    || witnessReplay.tenderHash !== expectedTenderHash
    || witnessReplay.primaryAttemptHash
      !== input.tender.typedGraph.attempt.attemptHash
    || witnessReplay.observedAt !== observedAt
    || witnessReplay.decisionState !== "HOLD"
    || witnessReplay.authority !== "NONE"
    || witnessReplay.independentControlEstablished !== false
    || witnessReplay.independentOutcomeTruthEstablished !== false) {
    fail("WITNESS_REPLAY_INVALID");
  }
  const primarySlots = predecessor.slots.filter((slot) =>
    slot.role === "PRIMARY" && slot.endpointReturnedSignedSources === true);
  const witnessSlots = predecessor.slots.filter((slot) =>
    slot.role === "INDEPENDENT_WITNESS"
      && slot.endpointReturnedSignedSources === true);
  if (primarySlots.length !== 1 || witnessSlots.length !== 1
    || primarySlots[0].providerRefHash !== witnessReplay.primaryProviderRefHash
    || witnessSlots[0].providerRefHash !== witnessReplay.witnessProviderRefHash
    || primarySlots[0].providerRefHash === witnessSlots[0].providerRefHash) {
    fail("FORMATION_SLOT_TO_WITNESS_SOURCE_BINDING_INVALID");
  }
  const evidenceMatches = input.tender.evidenceRequirements.items.filter(
    (row) => row.evidenceRequirementId === witnessReplay.evidenceRequirementId
      && row.sourceControl === "INDEPENDENT_OF_PROVIDER"
      && row.mandatory === true);
  if (evidenceMatches.length !== 1) {
    fail("WITNESS_EVIDENCE_REQUIREMENT_BINDING_INVALID");
  }

  const resultReceiptPresent = witnessReplay.resultReceiptPresent === true;
  const observationResponsibilityCurrent
    = witnessReplay.reservationCurrent === true;
  const gapCodes = predecessor.gapCodes.filter((code) =>
    code !== "INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT");
  if (!resultReceiptPresent) {
    gapCodes.push("INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT");
  }
  if (!observationResponsibilityCurrent) {
    gapCodes.push("WITNESS_OBSERVATION_RESERVATION_REVOKED_OR_EXPIRED");
  }
  gapCodes.push("WITNESS_OWNER_IDENTITY_AND_OPERATIONAL_INDEPENDENCE_UNPROVEN");
  gapCodes.push("WITNESS_SOURCE_DECLARATION_NOT_PROMOTED_TO_OUTCOME_TRUTH");

  const body = {
    schema:
      OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_SCHEMAS.gate,
    schemaVersion: "1.0.0",
    recordClass: "INDEPENDENT_WITNESS_SOURCE_REPLAY_ATTACHED_FORMATION_HOLD",
    tenderHash: expectedTenderHash,
    primaryAttemptHash: witnessReplay.primaryAttemptHash,
    predecessorFormationHash: expectedPredecessorFormationHash,
    witnessReplayHash: witnessReplay.replayHash,
    observedAt,
    exactPrimaryAndWitnessFormationSlotsBound: true,
    exactTenderOutcomeCriteriaAttemptOwnerWindowNonceAndExpiryReplayed: true,
    witnessObservationResponsibilityReservationPresent: true,
    witnessObservationResponsibilityCurrent: observationResponsibilityCurrent,
    witnessReservationRevoked: witnessReplay.reservationRevoked,
    witnessReservationExpired: witnessReplay.reservationExpired,
    independentWitnessResultReceiptPresent: resultReceiptPresent,
    independentWitnessReceiptPresent: resultReceiptPresent,
    witnessSourceSignatureContinuityVerified: true,
    witnessSourceDeclaredObservation:
      witnessReplay.witnessSourceDeclaredObservation,
    acceptedEvidenceSourceClass: witnessReplay.acceptedEvidenceSourceClass,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
    modelRewardAcceptedAsOutcomeTruth: false,
    structuralControllerAndProviderSeparationObserved: true,
    structuralDistinctnessProvesIndependentControl: false,
    witnessOwnerIdentityExternallyEstablished: false,
    independentWitnessControlEstablished: false,
    independentWitnessCapacityReserved: false,
    independentWitnessOutcomeTruthEstablished: false,
    recoveryOutcomeTruthEstablished: false,
    externalResourceOwnerTrustEstablished:
      predecessor.externalResourceOwnerTrustEstablished,
    primaryCapacityReserved: predecessor.primaryCapacityReserved,
    recoveryCapacityReserved: predecessor.recoveryCapacityReserved,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    disposition: predecessor.disposition,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    gapCodes,
    liveIoPerformed: false,
    paymentPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    rawWitnessSourceBytesProjected: false,
    witnessReplaySchema:
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.replay,
    boundary: OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_BOUNDARY,
  };
  return Object.freeze({
    ...body,
    gateHash: digest(
      OUTSIDER_INDEPENDENT_WITNESS_FORMATION_HOLD_GATE_V1_SCHEMAS.gate,
      body),
  });
}

export const composeIndependentWitnessFormationHoldGateV1
  = attachIndependentWitnessToFormationHoldV1;
