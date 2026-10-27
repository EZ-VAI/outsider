/*
 * Outsider Outcome Formation Engine v1.
 *
 * This is a pure, deterministic, HOLD-only formation evaluator.  It joins a
 * structurally verified outcome tender to explicit one-use owner/provider
 * commitments and caller-pinned references to the existing Outsider work
 * order, action-admission, Attempt-set, outcome-witness and reality-obligation
 * layers.  A hash proves only that a caller supplied a syntactically valid
 * reference.  It does not prove the referenced artifact, identity, signature,
 * authority, capacity, capital, custody, adjudication, rights or independent
 * witness standing.
 *
 * Consequently v1 has no executable success state.  Its strongest result is
 * ALL_REQUIRED_REFERENCE_SLOTS_PRESENT_UNVERIFIED_HOLD.  It performs no I/O, sends
 * no tender, contacts no provider, moves no money and never routes unsupported
 * work to an internal human queue.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutcomeTenderV1 } from "./outsider-outcome-tender-v1.js";
import { verifyOneUseCommitmentsV1 } from "./outsider-one-use-commitments-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const NumberIsFinite = Number.isFinite;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const FORMATION_ID = /^formation_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CONTROLLED_ERROR
  = /^(?:OUTSIDER_OUTCOME_TENDER_V1|OUTSIDER_ONE_USE_COMMITMENTS_V1|OUTSIDER_OUTCOME_FORMATION_ENGINE_V1)_[A-Z0-9_]+$/u;

export const OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS = ObjectFreeze({
  evaluation: "outsider/outcome-formation-engine-evaluation/v1",
  verification: "outsider/outcome-formation-engine-evaluation-verification/v1",
});

export const OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES = ObjectFreeze({
  invalidTender: "INVALID_TENDER_HOLD",
  formationDeadlineExpired: "FORMATION_DEADLINE_EXPIRED_HOLD",
  oneUseBindingsMissing: "ONE_USE_BINDINGS_MISSING_HOLD",
  oneUseBindingsMismatched: "ONE_USE_BINDINGS_MISMATCHED_OR_INVALID_HOLD",
  capacityReceiptAbsent: "CAPACITY_RECEIPT_ABSENT_HOLD",
  evidencePathGap: "EVIDENCE_PATH_BINDINGS_GAP_HOLD",
  independentWitnessGap: "INDEPENDENT_WITNESS_BINDING_GAP_HOLD",
  recoveryPathGap: "RECOVERY_PATH_BINDINGS_GAP_HOLD",
  rightsGap: "RIGHTS_PRIVACY_BINDING_GAP_HOLD",
  riskGap: "RISK_CAPITAL_CUSTODY_ADJUDICATION_BINDINGS_GAP_HOLD",
  strongest: "ALL_REQUIRED_REFERENCE_SLOTS_PRESENT_UNVERIFIED_HOLD",
});

export const OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY = deepFreeze({
  position: "PURE_ZERO_INTERNAL_OPS_OUTCOME_FORMATION_EVALUATOR_HOLD_ONLY",
  filesystemIoPerformed: false,
  networkIoPerformed: false,
  providerDiscoveryPerformed: false,
  providerContactPerformed: false,
  tenderSent: false,
  capacityReservedByThisModule: false,
  signatureVerificationPerformed: false,
  externalReceiptReplayPerformed: false,
  externalReceiptAuthenticityEstablished: false,
  legalIdentityEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  providerAuthorityEstablished: false,
  independentWitnessStandingEstablished: false,
  rightsPrivacyClearanceEstablished: false,
  riskCapitalEstablished: false,
  custodyEstablished: false,
  adjudicationEstablished: false,
  callerHashesEstablishOnlyStructuralReferencePresence: true,
  callerBooleansAcceptedAsAuthority: false,
  structuralConformanceMintsAuthority: false,
  outcomeDecidabilityEstablished: false,
  pinnedOutcomeEvaluatorEstablished: false,
  pinnedMeasurementInstrumentEstablished: false,
  mandatoryResourceCoverageEstablished: false,
  mandatoryEvidenceCoverageEstablished: false,
  mandatoryRecoveryCoverageEstablished: false,
  strongestStateMeansReferenceSlotsOnly: true,
  capacityReservationIntervalCoverageEstablished: false,
  capacityActuallyProven: false,
  lifecycleNonRevocationSourceReplayed: false,
  trustedClockEstablished: false,
  externalRouteZeroInternalOpsEstablished: false,
  vendorNativeEvidenceAcceptedAsIndependentOutcomeTruth: false,
  serverAcknowledgementAcceptedAsCapacityTruth: false,
  modelRewardAcceptedAsOutcomeTruth: false,
  pseudoLabelsAcceptedAsOutcomeTruth: false,
  zeroInternalOpsRequired: true,
  outsiderStaffInterventionsAllowed: 0,
  internalManualSourcingAllowed: false,
  internalManualCoordinationAllowed: false,
  internalManualVerificationAllowed: false,
  internalManualRecoveryAllowed: false,
  humanQueueFallbackAllowed: false,
  unsupportedOrUnformedDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  realCommitStateAvailableInV1: false,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  enabledCapabilityCount: 0,
  provenAuthorityCount: 0,
  cEnabledSubsetAProven: true,
  consequenceReach: "NONE",
  price: null,
  priceEstablished: false,
  pricingPermitted: false,
  guarantee: null,
  guaranteeCreated: false,
  settlement: null,
  settlementPermitted: false,
  moneyMovementEnabled: false,
});

const FOUNDATION_FIELDS = ObjectFreeze([
  "autonomousWorkOrderHash",
  "actionAdmissionHash",
  "attemptSetCompositionHash",
  "networkOutcomeWitnessHash",
  "realityObligationHash",
  "recoveryCapacityReservationHash",
  "rightsPrivacyDecisionHash",
  "riskCapitalReservationHash",
  "custodyAuthorityHash",
  "adjudicationAuthorityHash",
  "externalTrustPolicyHash",
]);

const CALLER_ASSERTION_FIELDS = ObjectFreeze([
  "capacityReceiptAuthentic",
  "externalTrustEstablished",
  "authorityEstablished",
  "riskCapitalEstablished",
  "custodyEstablished",
  "adjudicationEstablished",
  "independentWitnessEstablished",
  "rightsPrivacyCleared",
  "actionReady",
  "priceAuthorityEstablished",
  "guaranteeAuthorityEstablished",
  "settlementAuthorityEstablished",
]);

const EVALUATE_INPUT_FIELDS = ObjectFreeze([
  "formationId",
  "evaluatedAt",
  "expectedTenderHash",
  "tender",
  "ownerMandate",
  "providerAcceptance",
  "capacityReservationReceipt",
  "consumedNonceHashes",
  "foundationBindings",
  "untrustedCallerAssertions",
]);

const TENDER_ASSESSMENT_FIELDS = ObjectFreeze([
  "expectedTenderHash",
  "observedTenderHash",
  "structuralVerificationOk",
  "expectedHashMatched",
  "formationDeadline",
  "formationDeadlineExpired",
  "trustedClockEstablished",
  "workOrderHash",
  "exactOutcomeHash",
  "evidencePlanHash",
  "remedyPlanHash",
  "outcomeDecidabilityEstablished",
  "mandatoryResourceCoverageEstablished",
  "mandatoryEvidenceCoverageEstablished",
  "mandatoryRecoveryCoverageEstablished",
  "authorizationEstablished",
  "verificationError",
]);

const ONE_USE_ASSESSMENT_FIELDS = ObjectFreeze([
  "ownerMandatePresent",
  "providerAcceptancePresent",
  "capacityReservationReceiptPresent",
  "structuralVerificationOk",
  "crossBoundToTender",
  "ownerMandateHash",
  "providerAcceptanceHash",
  "capacityReservationReceiptHash",
  "scopeHash",
  "evidencePlanHash",
  "remedyPlanHash",
  "commercialTermHash",
  "nonceGlobalFreshnessEstablished",
  "nonceConsumptionPersisted",
  "capacityReceiptState",
  "externalCapacityReceiptAuthenticityEstablished",
  "capacityReservationIntervalCoverageEstablished",
  "capacityActuallyProven",
  "lifecycleNonRevocationSourceReplayed",
  "authorityEstablished",
  "verificationError",
]);

const COVERAGE_FIELDS = ObjectFreeze([
  "autonomousWorkOrderReferenceMatchesTenderHash",
  "actionAdmissionReferencePresent",
  "attemptSetReferencePresent",
  "evidencePathReferenceSlotsPresent",
  "networkOutcomeWitnessReferenceSlotPresent",
  "independentWitnessStandingEstablished",
  "realityObligationReferencePresent",
  "recoveryCapacityReferencePresent",
  "recoveryPathReferenceSlotsPresent",
  "rightsPrivacyReferencePresent",
  "riskCapitalReferencePresent",
  "custodyAuthorityReferencePresent",
  "adjudicationAuthorityReferencePresent",
  "externalTrustPolicyReferencePresent",
  "riskAndStandingReferenceSlotsPresent",
  "allRequiredFoundationReferenceSlotsPresent",
  "referencePresenceEstablishesExternalAuthenticity",
]);

const OPERATIONAL_BOUNDARY_FIELDS = ObjectFreeze([
  "zeroInternalOps",
  "outsiderStaffInterventionsAllowed",
  "humanQueueFallbackAllowed",
  "failureDisposition",
  "providerDiscoveryPerformed",
  "providerContactPerformed",
  "manualRecoveryPerformed",
  "externalRouteZeroInternalOpsEstablished",
]);

const AUTHORITY_BOUNDARY_FIELDS = ObjectFreeze([
  "enabledCapabilities",
  "provenAuthorities",
  "enabledCapabilityCount",
  "provenAuthorityCount",
  "cEnabledSubsetAProven",
  "callerAssertionsAcceptedAsAuthority",
  "structuralReferencesMintAuthority",
  "authority",
  "actionReady",
  "executable",
  "consequenceReach",
]);

const ECONOMIC_BOUNDARY_FIELDS = ObjectFreeze([
  "commercialTermReferenceHash",
  "commercialTermReferenceIsPrice",
  "price",
  "priceEstablished",
  "pricingPermitted",
  "guarantee",
  "guaranteeCreated",
  "settlement",
  "settlementPermitted",
  "custodyEstablished",
  "moneyMovementEnabled",
]);

const EVALUATION_FIELDS = ObjectFreeze([
  "schema",
  "schemaVersion",
  "recordClass",
  "formationId",
  "evaluatedAt",
  "tenderAssessment",
  "oneUseAssessment",
  "foundationBindings",
  "foundationCoverage",
  "untrustedCallerAssertions",
  "callerAssertionsIgnoredForAuthority",
  "gapCodes",
  "primaryState",
  "strongestStateReached",
  "externalTrustStillRequired",
  "operationalBoundary",
  "authorityBoundary",
  "economicBoundary",
  "decisionState",
  "authority",
  "actionReady",
  "executable",
  "consequenceReach",
  "result",
  "boundary",
  "formationEvaluationHash",
]);

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_${code}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) {
    return value;
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return ObjectFreeze(value);
}

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (value === null || typeof value !== "object") return;
  if (depth > 64) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > 100_000) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > 200_000) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value) || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseArray(value, code) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function observedHash(value) {
  try {
    if (value !== null && typeof value === "object" && !isProxy(value)) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value, "tenderHash");
      if (descriptor && ObjectHasOwn(descriptor, "value")
        && typeof descriptor.value === "string" && RegExpTest(HASH, descriptor.value)) {
        return descriptor.value;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) fail(`${code}_INVALID`);
  return value;
}

function formationId(value) {
  if (typeof value !== "string" || !RegExpTest(FORMATION_ID, value)) {
    fail("FORMATION_ID_INVALID");
  }
  return value;
}

function boolean(value, code) {
  if (value !== true && value !== false) fail(`${code}_BOOLEAN_REQUIRED`);
  return value;
}

function controlledError(value) {
  if (value === null) return null;
  if (typeof value === "string" && RegExpTest(CONTROLLED_ERROR, value)) return value;
  return "OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_UNTRUSTED_DEPENDENCY_FAILURE";
}

function normalizedFoundationBindings(value) {
  exactObject(value, FOUNDATION_FIELDS, "FOUNDATION_BINDINGS");
  const result = {};
  for (let index = 0; index < FOUNDATION_FIELDS.length; index += 1) {
    const field = FOUNDATION_FIELDS[index];
    result[field] = nullableHash(value[field], `FOUNDATION_${field.toUpperCase()}`);
  }
  return result;
}

function normalizedCallerAssertions(value) {
  exactObject(value, CALLER_ASSERTION_FIELDS, "UNTRUSTED_CALLER_ASSERTIONS");
  const result = {};
  for (let index = 0; index < CALLER_ASSERTION_FIELDS.length; index += 1) {
    const field = CALLER_ASSERTION_FIELDS[index];
    result[field] = boolean(value[field], `CALLER_ASSERTION_${field.toUpperCase()}`);
  }
  return result;
}

function assessTender(tender, expectedTenderHash, evaluatedAt) {
  const observedTenderHash = observedHash(tender);
  const verification = verifyOutcomeTenderV1(tender, { expectedTenderHash });
  if (!verification.ok) {
    return {
      expectedTenderHash,
      observedTenderHash,
      structuralVerificationOk: false,
      expectedHashMatched: false,
      formationDeadline: null,
      formationDeadlineExpired: false,
      trustedClockEstablished: false,
      workOrderHash: null,
      exactOutcomeHash: null,
      evidencePlanHash: null,
      remedyPlanHash: null,
      outcomeDecidabilityEstablished: false,
      mandatoryResourceCoverageEstablished: false,
      mandatoryEvidenceCoverageEstablished: false,
      mandatoryRecoveryCoverageEstablished: false,
      authorizationEstablished: false,
      verificationError: controlledError(verification.error),
    };
  }
  const expired = DateParse(evaluatedAt) >= DateParse(tender.formationDeadline);
  return {
    expectedTenderHash,
    observedTenderHash: tender.tenderHash,
    structuralVerificationOk: true,
    expectedHashMatched: true,
    formationDeadline: tender.formationDeadline,
    formationDeadlineExpired: expired,
    trustedClockEstablished: false,
    workOrderHash: tender.workOrderHash,
    exactOutcomeHash: tender.exactOutcome.exactOutcomeHash,
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    outcomeDecidabilityEstablished: false,
    mandatoryResourceCoverageEstablished: false,
    mandatoryEvidenceCoverageEstablished: false,
    mandatoryRecoveryCoverageEstablished: false,
    authorizationEstablished: false,
    verificationError: null,
  };
}

function assessOneUse(input, tenderAssessment, evaluatedAt) {
  const ownerMandatePresent = input.ownerMandate !== null;
  const providerAcceptancePresent = input.providerAcceptance !== null;
  const capacityReservationReceiptPresent
    = input.capacityReservationReceipt !== null;
  const verification = verifyOneUseCommitmentsV1({
    expectedTenderHash: tenderAssessment.expectedTenderHash,
    ownerMandate: input.ownerMandate,
    providerAcceptance: input.providerAcceptance,
    capacityReservationReceipt: input.capacityReservationReceipt,
    observedAt: evaluatedAt,
    consumedNonceHashes: input.consumedNonceHashes,
  });
  if (!verification.ok) {
    return {
      ownerMandatePresent,
      providerAcceptancePresent,
      capacityReservationReceiptPresent,
      structuralVerificationOk: false,
      crossBoundToTender: false,
      ownerMandateHash: null,
      providerAcceptanceHash: null,
      capacityReservationReceiptHash: null,
      scopeHash: null,
      evidencePlanHash: null,
      remedyPlanHash: null,
      commercialTermHash: null,
      nonceGlobalFreshnessEstablished: false,
      nonceConsumptionPersisted: false,
      capacityReceiptState: capacityReservationReceiptPresent
        ? "PRESENT_UNVERIFIED_OR_MISMATCHED"
        : "ABSENT",
      externalCapacityReceiptAuthenticityEstablished: false,
      capacityReservationIntervalCoverageEstablished: false,
      capacityActuallyProven: false,
      lifecycleNonRevocationSourceReplayed: false,
      authorityEstablished: false,
      verificationError: controlledError(verification.error),
    };
  }
  const crossBoundToTender = tenderAssessment.structuralVerificationOk
    && verification.tenderHash === tenderAssessment.expectedTenderHash
    && verification.scopeHash === tenderAssessment.exactOutcomeHash
    && verification.evidencePlanHash === tenderAssessment.evidencePlanHash
    && verification.remedyPlanHash === tenderAssessment.remedyPlanHash;
  return {
    ownerMandatePresent,
    providerAcceptancePresent,
    capacityReservationReceiptPresent,
    structuralVerificationOk: true,
    crossBoundToTender,
    ownerMandateHash: verification.ownerMandateHash,
    providerAcceptanceHash: verification.providerAcceptanceHash,
    capacityReservationReceiptHash:
      verification.capacityReservationReceiptHash,
    scopeHash: verification.scopeHash,
    evidencePlanHash: verification.evidencePlanHash,
    remedyPlanHash: verification.remedyPlanHash,
    commercialTermHash: verification.commercialTermHash,
    nonceGlobalFreshnessEstablished: false,
    nonceConsumptionPersisted: false,
    capacityReceiptState:
      verification.capacityReceiptReferenceStructurallyPresent === true
      ? "STRUCTURALLY_PRESENT_AUTHENTICITY_UNKNOWN"
      : "ABSENT",
    externalCapacityReceiptAuthenticityEstablished: false,
    capacityReservationIntervalCoverageEstablished: false,
    capacityActuallyProven: false,
    lifecycleNonRevocationSourceReplayed: false,
    authorityEstablished: false,
    verificationError: crossBoundToTender
      ? null
      : "OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_ONE_USE_TENDER_CROSS_BINDING_MISMATCH",
  };
}

function coverage(tenderAssessment, bindings) {
  const autonomousWorkOrderReferenceMatchesTenderHash
    = tenderAssessment.structuralVerificationOk
      && bindings.autonomousWorkOrderHash !== null
      && bindings.autonomousWorkOrderHash === tenderAssessment.workOrderHash;
  const actionAdmissionReferencePresent = bindings.actionAdmissionHash !== null;
  const attemptSetReferencePresent = bindings.attemptSetCompositionHash !== null;
  const evidencePathReferenceSlotsPresent
    = autonomousWorkOrderReferenceMatchesTenderHash
    && actionAdmissionReferencePresent && attemptSetReferencePresent;
  const networkOutcomeWitnessReferenceSlotPresent
    = bindings.networkOutcomeWitnessHash !== null;
  const realityObligationReferencePresent
    = bindings.realityObligationHash !== null;
  const recoveryCapacityReferencePresent
    = bindings.recoveryCapacityReservationHash !== null;
  const recoveryPathReferenceSlotsPresent = realityObligationReferencePresent
    && recoveryCapacityReferencePresent;
  const rightsPrivacyReferencePresent
    = bindings.rightsPrivacyDecisionHash !== null;
  const riskCapitalReferencePresent
    = bindings.riskCapitalReservationHash !== null;
  const custodyAuthorityReferencePresent
    = bindings.custodyAuthorityHash !== null;
  const adjudicationAuthorityReferencePresent
    = bindings.adjudicationAuthorityHash !== null;
  const externalTrustPolicyReferencePresent
    = bindings.externalTrustPolicyHash !== null;
  const riskAndStandingReferenceSlotsPresent = riskCapitalReferencePresent
    && custodyAuthorityReferencePresent && adjudicationAuthorityReferencePresent
    && externalTrustPolicyReferencePresent;
  const allRequiredFoundationReferenceSlotsPresent
    = evidencePathReferenceSlotsPresent
      && networkOutcomeWitnessReferenceSlotPresent
      && recoveryPathReferenceSlotsPresent
      && rightsPrivacyReferencePresent && riskAndStandingReferenceSlotsPresent;
  return {
    autonomousWorkOrderReferenceMatchesTenderHash,
    actionAdmissionReferencePresent,
    attemptSetReferencePresent,
    evidencePathReferenceSlotsPresent,
    networkOutcomeWitnessReferenceSlotPresent,
    independentWitnessStandingEstablished: false,
    realityObligationReferencePresent,
    recoveryCapacityReferencePresent,
    recoveryPathReferenceSlotsPresent,
    rightsPrivacyReferencePresent,
    riskCapitalReferencePresent,
    custodyAuthorityReferencePresent,
    adjudicationAuthorityReferencePresent,
    externalTrustPolicyReferencePresent,
    riskAndStandingReferenceSlotsPresent,
    allRequiredFoundationReferenceSlotsPresent,
    referencePresenceEstablishesExternalAuthenticity: false,
  };
}

function gapCodes(tenderAssessment, oneUseAssessment, bindings, coverageValue) {
  const gaps = [];
  if (!tenderAssessment.structuralVerificationOk) gaps.push("TENDER_INVALID");
  if (tenderAssessment.formationDeadlineExpired) {
    gaps.push("FORMATION_DEADLINE_EXPIRED");
  }
  if (!oneUseAssessment.ownerMandatePresent
    || !oneUseAssessment.providerAcceptancePresent) {
    gaps.push("ONE_USE_BINDINGS_MISSING");
  } else if (!oneUseAssessment.structuralVerificationOk
    || !oneUseAssessment.crossBoundToTender) {
    gaps.push("ONE_USE_BINDINGS_MISMATCHED_OR_INVALID");
  }
  if (oneUseAssessment.capacityReceiptState === "ABSENT") {
    gaps.push("CAPACITY_RECEIPT_ABSENT");
  } else if (oneUseAssessment.capacityReceiptState
    === "PRESENT_UNVERIFIED_OR_MISMATCHED") {
    gaps.push("CAPACITY_RECEIPT_STRUCTURAL_VERIFICATION_FAILED");
  } else {
    gaps.push("CAPACITY_RECEIPT_AUTHENTICITY_UNKNOWN");
  }
  if (bindings.autonomousWorkOrderHash === null) {
    gaps.push("AUTONOMOUS_WORK_ORDER_BINDING_MISSING");
  } else if (!coverageValue.autonomousWorkOrderReferenceMatchesTenderHash) {
    gaps.push("AUTONOMOUS_WORK_ORDER_TENDER_MISMATCH");
  }
  if (!coverageValue.actionAdmissionReferencePresent) {
    gaps.push("ACTION_ADMISSION_BINDING_MISSING");
  }
  if (!coverageValue.attemptSetReferencePresent) {
    gaps.push("ATTEMPT_SET_BINDING_MISSING");
  }
  if (!coverageValue.evidencePathReferenceSlotsPresent) {
    gaps.push("EVIDENCE_PATH_BINDINGS_MISSING_OR_MISMATCHED");
  }
  if (!coverageValue.networkOutcomeWitnessReferenceSlotPresent) {
    gaps.push("INDEPENDENT_WITNESS_BINDING_MISSING");
  } else {
    gaps.push("INDEPENDENT_WITNESS_STANDING_UNPROVEN");
  }
  if (!coverageValue.realityObligationReferencePresent) {
    gaps.push("REALITY_OBLIGATION_BINDING_MISSING");
  }
  if (!coverageValue.recoveryCapacityReferencePresent) {
    gaps.push("RECOVERY_CAPACITY_BINDING_MISSING");
  }
  if (!coverageValue.recoveryPathReferenceSlotsPresent) {
    gaps.push("RECOVERY_PATH_BINDINGS_MISSING");
  }
  if (!coverageValue.rightsPrivacyReferencePresent) {
    gaps.push("RIGHTS_PRIVACY_BINDING_MISSING");
  } else {
    gaps.push("RIGHTS_PRIVACY_CLEARANCE_UNPROVEN");
  }
  if (!coverageValue.riskCapitalReferencePresent) {
    gaps.push("RISK_CAPITAL_BINDING_MISSING");
  } else {
    gaps.push("RISK_CAPITAL_AUTHENTICITY_AND_AVAILABILITY_UNPROVEN");
  }
  if (!coverageValue.custodyAuthorityReferencePresent) {
    gaps.push("CUSTODY_AUTHORITY_BINDING_MISSING");
  } else {
    gaps.push("CUSTODY_AUTHORITY_UNPROVEN");
  }
  if (!coverageValue.adjudicationAuthorityReferencePresent) {
    gaps.push("ADJUDICATION_AUTHORITY_BINDING_MISSING");
  } else {
    gaps.push("ADJUDICATION_AUTHORITY_UNPROVEN");
  }
  if (!coverageValue.externalTrustPolicyReferencePresent) {
    gaps.push("EXTERNAL_TRUST_POLICY_BINDING_MISSING");
  } else {
    gaps.push("EXTERNAL_TRUST_POLICY_NOT_REPLAYED");
  }
  gaps.push("NONCE_GLOBAL_FRESHNESS_UNPROVEN");
  gaps.push("OUTCOME_DECIDABILITY_UNPROVEN");
  gaps.push("MANDATORY_RESOURCE_COVERAGE_UNPROVEN");
  gaps.push("MANDATORY_EVIDENCE_COVERAGE_UNPROVEN");
  gaps.push("MANDATORY_RECOVERY_COVERAGE_UNPROVEN");
  gaps.push("TRUSTED_CLOCK_UNPROVEN");
  gaps.push("EXTERNAL_ROUTE_ZERO_INTERNAL_OPS_UNPROVEN");
  gaps.push("EXTERNAL_LEGAL_IDENTITY_AND_AUTHORITY_UNPROVEN");
  return gaps;
}

function primaryState(tenderAssessment, oneUseAssessment, coverageValue) {
  if (!tenderAssessment.structuralVerificationOk) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.invalidTender;
  }
  if (tenderAssessment.formationDeadlineExpired) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.formationDeadlineExpired;
  }
  if (!oneUseAssessment.ownerMandatePresent
    || !oneUseAssessment.providerAcceptancePresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.oneUseBindingsMissing;
  }
  if (!oneUseAssessment.structuralVerificationOk
    || !oneUseAssessment.crossBoundToTender) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.oneUseBindingsMismatched;
  }
  if (oneUseAssessment.capacityReceiptState !==
    "STRUCTURALLY_PRESENT_AUTHENTICITY_UNKNOWN") {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.capacityReceiptAbsent;
  }
  if (!coverageValue.evidencePathReferenceSlotsPresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.evidencePathGap;
  }
  if (!coverageValue.networkOutcomeWitnessReferenceSlotPresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.independentWitnessGap;
  }
  if (!coverageValue.recoveryPathReferenceSlotsPresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.recoveryPathGap;
  }
  if (!coverageValue.rightsPrivacyReferencePresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.rightsGap;
  }
  if (!coverageValue.riskAndStandingReferenceSlotsPresent) {
    return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.riskGap;
  }
  return OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.strongest;
}

function bodyFromAssessments(input) {
  const coverageValue = coverage(input.tenderAssessment,
    input.foundationBindings);
  const state = primaryState(input.tenderAssessment, input.oneUseAssessment,
    coverageValue);
  const strongestStateReached
    = state === OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_STATES.strongest;
  return {
    schema: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.evaluation,
    schemaVersion: "1.0.0",
    recordClass: "ZERO_INTERNAL_OPS_OUTCOME_FORMATION_EVALUATION_HOLD_ONLY",
    formationId: input.formationId,
    evaluatedAt: input.evaluatedAt,
    tenderAssessment: input.tenderAssessment,
    oneUseAssessment: input.oneUseAssessment,
    foundationBindings: input.foundationBindings,
    foundationCoverage: coverageValue,
    untrustedCallerAssertions: input.untrustedCallerAssertions,
    callerAssertionsIgnoredForAuthority: true,
    gapCodes: gapCodes(input.tenderAssessment, input.oneUseAssessment,
      input.foundationBindings, coverageValue),
    primaryState: state,
    strongestStateReached,
    externalTrustStillRequired: true,
    operationalBoundary: {
      zeroInternalOps: true,
      outsiderStaffInterventionsAllowed: 0,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
      providerDiscoveryPerformed: false,
      providerContactPerformed: false,
      manualRecoveryPerformed: false,
      externalRouteZeroInternalOpsEstablished: false,
    },
    authorityBoundary: {
      enabledCapabilities: [],
      provenAuthorities: [],
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      cEnabledSubsetAProven: true,
      callerAssertionsAcceptedAsAuthority: false,
      structuralReferencesMintAuthority: false,
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
    },
    economicBoundary: {
      commercialTermReferenceHash: input.oneUseAssessment.commercialTermHash,
      commercialTermReferenceIsPrice: false,
      price: null,
      priceEstablished: false,
      pricingPermitted: false,
      guarantee: null,
      guaranteeCreated: false,
      settlement: null,
      settlementPermitted: false,
      custodyEstablished: false,
      moneyMovementEnabled: false,
    },
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    result: state,
    boundary: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY,
  };
}

/**
 * Evaluate one formation snapshot.  Dependency verifiers are called locally;
 * no callback, trust registry, filesystem, clock or network capability is
 * accepted.  `evaluatedAt` is caller pinned and therefore replayable.
 */
export function createOutcomeFormationEvaluationV1(input) {
  rejectTree(input);
  exactObject(input, EVALUATE_INPUT_FIELDS, "EVALUATE_INPUT");
  const normalizedFormationId = formationId(input.formationId);
  const evaluatedAt = instant(input.evaluatedAt, "EVALUATED_AT");
  const expectedTenderHash = hash(input.expectedTenderHash,
    "EXPECTED_TENDER_HASH");
  denseArray(input.consumedNonceHashes, "CONSUMED_NONCE_HASHES");
  for (let index = 0; index < input.consumedNonceHashes.length; index += 1) {
    hash(input.consumedNonceHashes[index], "CONSUMED_NONCE_HASH");
  }
  const foundationBindings = normalizedFoundationBindings(
    input.foundationBindings);
  const untrustedCallerAssertions = normalizedCallerAssertions(
    input.untrustedCallerAssertions);
  const tenderAssessment = assessTender(input.tender, expectedTenderHash,
    evaluatedAt);
  const oneUseAssessment = assessOneUse(input, tenderAssessment, evaluatedAt);
  const body = bodyFromAssessments({
    formationId: normalizedFormationId,
    evaluatedAt,
    tenderAssessment,
    oneUseAssessment,
    foundationBindings,
    untrustedCallerAssertions,
  });
  return deepFreeze({
    ...body,
    formationEvaluationHash: digest(
      OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.evaluation, body),
  });
}

function validateTenderAssessment(value) {
  exactObject(value, TENDER_ASSESSMENT_FIELDS, "TENDER_ASSESSMENT");
  hash(value.expectedTenderHash, "TENDER_ASSESSMENT_EXPECTED_HASH");
  nullableHash(value.observedTenderHash, "TENDER_ASSESSMENT_OBSERVED_HASH");
  boolean(value.structuralVerificationOk, "TENDER_ASSESSMENT_STRUCTURAL_OK");
  boolean(value.expectedHashMatched, "TENDER_ASSESSMENT_PIN_MATCHED");
  if (value.formationDeadline !== null) {
    instant(value.formationDeadline, "TENDER_ASSESSMENT_FORMATION_DEADLINE");
  }
  boolean(value.formationDeadlineExpired, "TENDER_ASSESSMENT_DEADLINE_EXPIRED");
  if (value.trustedClockEstablished !== false
    || value.outcomeDecidabilityEstablished !== false
    || value.mandatoryResourceCoverageEstablished !== false
    || value.mandatoryEvidenceCoverageEstablished !== false
    || value.mandatoryRecoveryCoverageEstablished !== false) {
    fail("TENDER_SEMANTIC_COVERAGE_OVERCLAIMED");
  }
  nullableHash(value.workOrderHash, "TENDER_ASSESSMENT_WORK_ORDER_HASH");
  nullableHash(value.exactOutcomeHash, "TENDER_ASSESSMENT_OUTCOME_HASH");
  nullableHash(value.evidencePlanHash, "TENDER_ASSESSMENT_EVIDENCE_HASH");
  nullableHash(value.remedyPlanHash, "TENDER_ASSESSMENT_REMEDY_HASH");
  if (value.authorizationEstablished !== false) fail("TENDER_AUTHORITY_INVALID");
  if (controlledError(value.verificationError) !== value.verificationError) {
    fail("TENDER_VERIFICATION_ERROR_INVALID");
  }
}

function validateOneUseAssessment(value) {
  exactObject(value, ONE_USE_ASSESSMENT_FIELDS, "ONE_USE_ASSESSMENT");
  for (const field of ["ownerMandatePresent", "providerAcceptancePresent",
    "capacityReservationReceiptPresent", "structuralVerificationOk",
    "crossBoundToTender", "nonceGlobalFreshnessEstablished",
    "nonceConsumptionPersisted",
    "externalCapacityReceiptAuthenticityEstablished",
    "capacityReservationIntervalCoverageEstablished", "capacityActuallyProven",
    "lifecycleNonRevocationSourceReplayed",
    "authorityEstablished"]) boolean(value[field], `ONE_USE_${field.toUpperCase()}`);
  for (const field of ["ownerMandateHash", "providerAcceptanceHash",
    "capacityReservationReceiptHash", "scopeHash", "evidencePlanHash",
    "remedyPlanHash", "commercialTermHash"]) {
    nullableHash(value[field], `ONE_USE_${field.toUpperCase()}`);
  }
  for (const field of ["nonceGlobalFreshnessEstablished",
    "nonceConsumptionPersisted",
    "externalCapacityReceiptAuthenticityEstablished",
    "capacityReservationIntervalCoverageEstablished", "capacityActuallyProven",
    "lifecycleNonRevocationSourceReplayed", "authorityEstablished"]) {
    if (value[field] !== false) fail("ONE_USE_EXTERNAL_FACT_OVERCLAIMED");
  }
  if (!["ABSENT", "PRESENT_UNVERIFIED_OR_MISMATCHED",
    "STRUCTURALLY_PRESENT_AUTHENTICITY_UNKNOWN"].includes(
    value.capacityReceiptState)) fail("CAPACITY_RECEIPT_STATE_INVALID");
  if (controlledError(value.verificationError) !== value.verificationError) {
    fail("ONE_USE_VERIFICATION_ERROR_INVALID");
  }
}

function validateDerivedClosedShapes(record) {
  exactObject(record.foundationCoverage, COVERAGE_FIELDS, "FOUNDATION_COVERAGE");
  for (let index = 0; index < COVERAGE_FIELDS.length; index += 1) {
    boolean(record.foundationCoverage[COVERAGE_FIELDS[index]],
      `COVERAGE_${COVERAGE_FIELDS[index].toUpperCase()}`);
  }
  exactObject(record.operationalBoundary, OPERATIONAL_BOUNDARY_FIELDS,
    "OPERATIONAL_BOUNDARY");
  exactObject(record.authorityBoundary, AUTHORITY_BOUNDARY_FIELDS,
    "AUTHORITY_BOUNDARY");
  exactObject(record.economicBoundary, ECONOMIC_BOUNDARY_FIELDS,
    "ECONOMIC_BOUNDARY");
  denseArray(record.authorityBoundary.enabledCapabilities,
    "ENABLED_CAPABILITIES");
  denseArray(record.authorityBoundary.provenAuthorities, "PROVEN_AUTHORITIES");
  denseArray(record.gapCodes, "GAP_CODES");
  for (let index = 0; index < record.gapCodes.length; index += 1) {
    if (typeof record.gapCodes[index] !== "string"
      || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(record.gapCodes[index])) {
      fail("GAP_CODE_INVALID");
    }
  }
}

function verificationFailure(error) {
  const message = error instanceof Error
    && typeof error.message === "string"
    && /^OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_[A-Z0-9_]+$/u.test(error.message)
    ? error.message
    : "OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_UNTRUSTED_FAILURE";
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.verification,
    ok: false,
    exactSchemaVerified: false,
    derivationVerified: false,
    sourceReplayPerformed: false,
    dependencyRecordsReverified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    holdBoundaryVerified: false,
    evaluatorZeroInternalOpsVerified: false,
    callerAssertionsUnableToMintAuthority: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    error: message,
    boundary: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY,
  });
}

/**
 * Verify exact shape, deterministic source replay, self-hash and caller pin.
 *
 * The original exact evaluation input is mandatory.  An output-only verifier
 * would let an attacker alter a nested assessment, recompute the public hash,
 * and present the poisoned assessment as a valid derivation.  Rebuilding from
 * `options.source` re-runs the tender and one-use dependency verifiers and
 * makes that substitution fail closed.
 */
export function verifyOutcomeFormationEvaluationV1(record, options) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["expectedFormationEvaluationHash", "source"],
      "VERIFY_OPTIONS");
    exactObject(record, EVALUATION_FIELDS, "EVALUATION");
    formationId(record.formationId);
    instant(record.evaluatedAt, "EVALUATED_AT");
    validateTenderAssessment(record.tenderAssessment);
    validateOneUseAssessment(record.oneUseAssessment);
    normalizedFoundationBindings(record.foundationBindings);
    normalizedCallerAssertions(
      record.untrustedCallerAssertions);
    validateDerivedClosedShapes(record);
    const expectedHash = hash(options.expectedFormationEvaluationHash,
      "EXPECTED_FORMATION_EVALUATION_HASH");
    const rebuilt = createOutcomeFormationEvaluationV1(options.source);
    if (!same(record, rebuilt)) fail("SOURCE_REPLAY_MISMATCH");
    if (record.formationEvaluationHash !== expectedHash) {
      fail("EXPECTED_FORMATION_EVALUATION_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_SCHEMAS.verification,
      ok: true,
      exactSchemaVerified: true,
      derivationVerified: true,
      sourceReplayPerformed: true,
      dependencyRecordsReverified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      formationEvaluationHash: record.formationEvaluationHash,
      primaryState: record.primaryState,
      strongestStateReached: record.strongestStateReached,
      holdBoundaryVerified: true,
      evaluatorZeroInternalOpsVerified: true,
      callerAssertionsUnableToMintAuthority: true,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
      error: null,
      boundary: OUTSIDER_OUTCOME_FORMATION_ENGINE_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}

export const evaluateOutcomeFormationV1 = createOutcomeFormationEvaluationV1;
export const verifyOutsiderOutcomeFormationEvaluationV1
  = verifyOutcomeFormationEvaluationV1;
