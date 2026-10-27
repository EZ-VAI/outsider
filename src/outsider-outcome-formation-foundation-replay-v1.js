/*
 * Outcome Formation foundation replay bridge v1.
 *
 * The formation engine intentionally accepts only nullable hash slots.  This
 * bridge is the stricter path into those slots: it accepts complete local
 * foundation records, invokes their existing exported verifiers, and derives
 * a binding only when the verified records also cross-bind to the verified
 * tender's frozen work-order / typed-graph / Episode / Attempt path.
 *
 * Verification here remains structural and HOLD-only.  In particular, the
 * autonomous work-order verifier does not replay its referenced external
 * sources, action admission never establishes authority, and the Attempt-set
 * verifier proves only its supplied immediate predecessor.  An exact network
 * witness replay can establish a witness-envelope reference but not standing
 * or outcome truth.  The legacy action-obligation verifier is deliberately
 * not invoked here because its filesystem reader does not yet provide a
 * descriptor-bound, no-follow replay path.  Supplying that input produces an
 * explicit blocker and never a Reality-obligation binding.
 * Recovery-capacity, rights/privacy, risk-capital, custody, adjudication, and
 * trust-policy replays remain null.  A caller cannot inject a naked foundation
 * hash or a `verified: true` flag.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyActionAdmissionRequest } from "./outsider-action-admission.js";
import { verifyAutonomousWorkOrderProjection }
  from "./outsider-autonomous-work-order.js";
import { verifyEpisodeAttemptSetComposition }
  from "./outsider-episode-attempt-set-composition.js";
import { verifyOutsiderOutcomeWitnessEnvelope }
  from "./outsider-network-outcome-witness.js";
import { createOutcomeFormationEvaluationV1 }
  from "./outsider-outcome-formation-engine-v1.js";
import { verifyOutcomeTenderV1 } from "./outsider-outcome-tender-v1.js";

const ArrayIsArray = Array.isArray;
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
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS
  = ObjectFreeze({
    replay: "outsider/outcome-formation-foundation-replay/v1",
    replayVerification:
      "outsider/outcome-formation-foundation-replay-verification/v1",
    boundEvaluation:
      "outsider/outcome-formation-foundation-bound-evaluation/v1",
    boundEvaluationVerification:
      "outsider/outcome-formation-foundation-bound-evaluation-verification/v1",
  });

export const OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY
  = deepFreeze({
    position:
      "LOCAL_FOUNDATION_RECORD_REPLAY_AND_CROSS_BINDING_BRIDGE_HOLD_ONLY",
    filesystemIoPerformedByBridgeDirectly: false,
    dependencyFilesystemIoPerformed: false,
    actionObligationVerifierInvoked: false,
    actionObligationReplayDisabledForUnsafeUnderlyingReader: true,
    actionObligationCallerPathRead: false,
    networkIoPerformed: false,
    callbackInvoked: false,
    nakedCallerFoundationHashesAccepted: false,
    callerVerifiedBooleansAccepted: false,
    dependencyRecordsRequiredForNonNullBindings: true,
    dependencyVerifiersInvoked: true,
    expectedWorkOrderHashDerivedFromVerifiedTender: true,
    typedGraphCrossBoundToVerifiedTender: true,
    episodeAndAttemptCrossBoundToVerifiedTender: true,
    actionClaimWayWorldCrossBindingToOrderAvailable: false,
    actionBeforeStateCrossBindingToOrderAvailable: false,
    actionGovernanceCrossBindingToOrderAvailable: false,
    actionAdmissionFullOrderSemanticBindingEstablished: false,
    attemptSetCensusCrossBoundToVerifiedActionAdmission: true,
    workOrderReferencedExternalSourcesReplayed: false,
    actionAdmissionSourceArtifactsRederived: true,
    attemptSetImmediatePredecessorOnly: true,
    attemptSetDurableExternalHeadVerified: false,
    externalOutcomeWitnessReplaySupported: true,
    witnessVerificationDoesNotEstablishOrganizationalIndependence: true,
    witnessVerificationDoesNotEstablishIndependentOutcomeTruth: true,
    realityObligationReferenceIntegrityReplaySupported: false,
    realityObligationSemanticCompositionRemainsUnresolved: true,
    recoveryCapacityReplayed: false,
    rightsPrivacyDecisionReplayed: false,
    riskCapitalReservationReplayed: false,
    custodyAuthorityReplayed: false,
    adjudicationAuthorityReplayed: false,
    externalTrustPolicyReplayed: false,
    externalLegalIdentityEstablished: false,
    outcomeDecidabilityEstablished: false,
    independentOutcomeTruthEstablished: false,
    sourceReplayMintsAuthority: false,
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
    custodyEstablished: false,
    moneyMovementEnabled: false,
    humanFallbackPermitted: false,
  });

const FOUNDATION_BINDING_FIELDS = ObjectFreeze([
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

const REPLAY_INPUT_FIELDS = ObjectFreeze([
  "expectedTenderHash",
  "tender",
  "autonomousWorkOrder",
  "actionAdmissionReplay",
  "attemptSetReplay",
  "networkOutcomeWitnessReplay",
  "actionObligationHoldCompositionInput",
]);

const BOUND_INPUT_FIELDS = ObjectFreeze([
  "formationId",
  "evaluatedAt",
  "expectedTenderHash",
  "tender",
  "ownerMandate",
  "providerAcceptance",
  "capacityReservationReceipt",
  "consumedNonceHashes",
  "untrustedCallerAssertions",
  "autonomousWorkOrder",
  "actionAdmissionReplay",
  "attemptSetReplay",
  "networkOutcomeWitnessReplay",
  "actionObligationHoldCompositionInput",
]);

function fail(code) {
  throw new TypeErrorConstructor(
    `OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_${code}`);
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
  if (depth > 128) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > 200_000) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > 400_000) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
      fail("ACCESSOR_FORBIDDEN");
    }
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

/*
 * Some existing source-replay verifiers intentionally accept non-JSON runtime
 * values (a registered adapter instance and bounded byte buffers).  The bridge
 * checks the enclosing record shape without trying to reinterpret or
 * canonicalize those opaque verifier inputs; the dependency verifier remains
 * the sole authority on their exact context.
 */
function exactContainer(value, fields, code) {
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
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
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

function actionReplay(value) {
  if (value === null) return null;
  return exactObject(value, ["request", "source"], "ACTION_REPLAY");
}

function attemptReplay(value) {
  if (value === null) return null;
  return exactObject(value, ["composition", "predecessor"],
    "ATTEMPT_SET_REPLAY");
}

function witnessReplay(value) {
  if (value === null) return null;
  return exactContainer(value, ["envelope", "context"], "WITNESS_REPLAY");
}

function emptyFoundationBindings() {
  const result = {};
  for (let index = 0; index < FOUNDATION_BINDING_FIELDS.length; index += 1) {
    result[FOUNDATION_BINDING_FIELDS[index]] = null;
  }
  return result;
}

function tenderAssessment(input) {
  const checked = verifyOutcomeTenderV1(input.tender, {
    expectedTenderHash: input.expectedTenderHash,
  });
  if (!checked.ok) {
    return {
      supplied: input.tender !== null,
      verifierInvoked: true,
      verifierOk: false,
      exactSchemaVerified: false,
      derivationAndSelfHashVerified: false,
      expectedHashMatched: false,
      tenderHash: null,
      workOrderHash: null,
      typedGraphHash: null,
      authorityEstablished: false,
      actionReady: false,
      errorCode: "TENDER_VERIFICATION_FAILED",
    };
  }
  return {
    supplied: true,
    verifierInvoked: true,
    verifierOk: true,
    exactSchemaVerified: true,
    derivationAndSelfHashVerified: true,
    expectedHashMatched: true,
    tenderHash: checked.tenderHash,
    workOrderHash: input.tender.workOrderHash,
    typedGraphHash: checked.typedGraphHash,
    authorityEstablished: false,
    actionReady: false,
    errorCode: null,
  };
}

function workOrderAssessment(input, tenderCheck) {
  if (input.autonomousWorkOrder === null) {
    return {
      supplied: false,
      verifierInvoked: false,
      verifierOk: false,
      structuralProjectionRederived: false,
      expectedWorkOrderHashDerivedFromTender: tenderCheck.verifierOk,
      exactWorkOrderHashMatchedTender: false,
      exactTypedGraphMatchedTender: false,
      promisedOutcomeRefMatchedTender: false,
      acceptanceCriteriaMatchedTender: false,
      consequenceChannelsMatchedTender: false,
      outcomeWitnessRequirementMatchedTenderEvidence: false,
      observationRequirementsCoveredByTenderEvidence: false,
      remedyReferencesCoveredByTenderRecovery: false,
      fullPromisedOutcomeObservationRecoveryCrossBinding: false,
      referencedExternalSourcesReplayed: false,
      foundationBindingAdmitted: false,
      workOrderHash: null,
      typedGraphHash: null,
      authorityEstablished: false,
      actionReady: false,
      errorCode: "AUTONOMOUS_WORK_ORDER_NOT_SUPPLIED",
    };
  }
  if (!tenderCheck.verifierOk) {
    return {
      supplied: true,
      verifierInvoked: false,
      verifierOk: false,
      structuralProjectionRederived: false,
      expectedWorkOrderHashDerivedFromTender: false,
      exactWorkOrderHashMatchedTender: false,
      exactTypedGraphMatchedTender: false,
      promisedOutcomeRefMatchedTender: false,
      acceptanceCriteriaMatchedTender: false,
      consequenceChannelsMatchedTender: false,
      outcomeWitnessRequirementMatchedTenderEvidence: false,
      observationRequirementsCoveredByTenderEvidence: false,
      remedyReferencesCoveredByTenderRecovery: false,
      fullPromisedOutcomeObservationRecoveryCrossBinding: false,
      referencedExternalSourcesReplayed: false,
      foundationBindingAdmitted: false,
      workOrderHash: null,
      typedGraphHash: null,
      authorityEstablished: false,
      actionReady: false,
      errorCode: "AUTONOMOUS_WORK_ORDER_TENDER_PREREQUISITE_FAILED",
    };
  }
  const checked = verifyAutonomousWorkOrderProjection(
    input.autonomousWorkOrder,
    { expectedWorkOrderHash: tenderCheck.workOrderHash });
  const exactWorkOrderHashMatchedTender = checked.ok
    && checked.workOrderHash === tenderCheck.workOrderHash;
  const exactTypedGraphMatchedTender = checked.ok
    && same(input.autonomousWorkOrder.typedGraph, input.tender.typedGraph);
  const promisedOutcomeRefMatchedTender = checked.ok
    && input.autonomousWorkOrder.promisedOutcome.promisedOutcomeRefHash
      === input.tender.exactOutcome.outcomeSpecRefHash;
  const acceptanceCriteriaMatchedTender = checked.ok
    && input.autonomousWorkOrder.promisedOutcome.acceptanceCriteriaHash
      === input.tender.exactOutcome.acceptanceCriteriaRefHash;
  const consequenceChannelsMatchedTender = checked.ok
    && same(input.autonomousWorkOrder.promisedOutcome.consequenceChannelHashes,
      input.tender.maximumConsequence.affectedChannelRefHashes);
  const evidenceRefs = [];
  if (checked.ok) {
    for (let index = 0;
      index < input.tender.evidenceRequirements.items.length; index += 1) {
      evidenceRefs.push(input.tender.evidenceRequirements.items[index]
        .evidenceRequirementRefHash);
    }
  }
  const hasEvidenceRef = (candidate) => {
    for (let index = 0; index < evidenceRefs.length; index += 1) {
      if (evidenceRefs[index] === candidate) return true;
    }
    return false;
  };
  const outcomeWitnessRequirementMatchedTenderEvidence = checked.ok
    && hasEvidenceRef(input.autonomousWorkOrder.promisedOutcome
      .outcomeWitnessRequirementHash);
  let observationRequirementsCoveredByTenderEvidence = checked.ok;
  if (checked.ok) {
    for (let index = 0;
      index < input.autonomousWorkOrder.observationPlan.horizons.length;
      index += 1) {
      if (!hasEvidenceRef(input.autonomousWorkOrder.observationPlan
        .horizons[index].observationRequirementHash)) {
        observationRequirementsCoveredByTenderEvidence = false;
      }
    }
  }
  const recoveryRefs = [];
  if (checked.ok) {
    for (let index = 0;
      index < input.tender.recoveryRequirements.items.length; index += 1) {
      recoveryRefs.push(input.tender.recoveryRequirements.items[index]
        .recoveryOutcomeRefHash);
    }
  }
  let remedyReferencesCoveredByTenderRecovery = checked.ok;
  if (checked.ok) {
    for (let index = 0;
      index < input.autonomousWorkOrder.remedyMenu.items.length; index += 1) {
      let found = false;
      for (let recoveryIndex = 0; recoveryIndex < recoveryRefs.length;
        recoveryIndex += 1) {
        if (recoveryRefs[recoveryIndex] === input.autonomousWorkOrder
          .remedyMenu.items[index].remedyTermsHash) found = true;
      }
      if (!found) remedyReferencesCoveredByTenderRecovery = false;
    }
  }
  const fullPromisedOutcomeObservationRecoveryCrossBinding
    = promisedOutcomeRefMatchedTender && acceptanceCriteriaMatchedTender
      && consequenceChannelsMatchedTender
      && outcomeWitnessRequirementMatchedTenderEvidence
      && observationRequirementsCoveredByTenderEvidence
      && remedyReferencesCoveredByTenderRecovery;
  const admitted = checked.ok && exactWorkOrderHashMatchedTender
    && exactTypedGraphMatchedTender
    && fullPromisedOutcomeObservationRecoveryCrossBinding;
  return {
    supplied: true,
    verifierInvoked: true,
    verifierOk: checked.ok === true,
    structuralProjectionRederived: checked.ok === true,
    expectedWorkOrderHashDerivedFromTender: true,
    exactWorkOrderHashMatchedTender,
    exactTypedGraphMatchedTender,
    promisedOutcomeRefMatchedTender,
    acceptanceCriteriaMatchedTender,
    consequenceChannelsMatchedTender,
    outcomeWitnessRequirementMatchedTenderEvidence,
    observationRequirementsCoveredByTenderEvidence,
    remedyReferencesCoveredByTenderRecovery,
    fullPromisedOutcomeObservationRecoveryCrossBinding,
    referencedExternalSourcesReplayed: false,
    foundationBindingAdmitted: admitted,
    workOrderHash: admitted ? checked.workOrderHash : null,
    typedGraphHash: admitted ? checked.typedGraphHash : null,
    authorityEstablished: false,
    actionReady: false,
    errorCode: admitted ? null : checked.ok
      ? "AUTONOMOUS_WORK_ORDER_TENDER_CROSS_BINDING_FAILED"
      : "AUTONOMOUS_WORK_ORDER_VERIFICATION_FAILED",
  };
}

function actionAssessment(input, tenderCheck) {
  const replay = input.actionAdmissionReplay;
  if (replay === null) {
    return {
      supplied: false,
      verifierInvoked: false,
      verifierOk: false,
      sourceArtifactsRederived: false,
      episodeHashMatchedTender: false,
      attemptHashMatchedTender: false,
      episodeAttemptCrossBindingEstablished: false,
      claimWayWorldCrossBindingToOrderEstablished: false,
      beforeStateCrossBindingToOrderEstablished: false,
      governanceCrossBindingToOrderEstablished: false,
      fullOrderSemanticBindingEstablished: false,
      foundationBindingScope: "NONE",
      censusHashExternallyVerified: false,
      foundationBindingAdmitted: false,
      actionAdmissionHash: null,
      authorityEstablished: false,
      admitted: false,
      actionReady: false,
      executable: false,
      errorCode: "ACTION_ADMISSION_REPLAY_NOT_SUPPLIED",
    };
  }
  if (!tenderCheck.verifierOk) {
    return {
      supplied: true,
      verifierInvoked: false,
      verifierOk: false,
      sourceArtifactsRederived: false,
      episodeHashMatchedTender: false,
      attemptHashMatchedTender: false,
      episodeAttemptCrossBindingEstablished: false,
      claimWayWorldCrossBindingToOrderEstablished: false,
      beforeStateCrossBindingToOrderEstablished: false,
      governanceCrossBindingToOrderEstablished: false,
      fullOrderSemanticBindingEstablished: false,
      foundationBindingScope: "NONE",
      censusHashExternallyVerified: false,
      foundationBindingAdmitted: false,
      actionAdmissionHash: null,
      authorityEstablished: false,
      admitted: false,
      actionReady: false,
      executable: false,
      errorCode: "ACTION_ADMISSION_TENDER_PREREQUISITE_FAILED",
    };
  }
  const expected = replay.request !== null
    && typeof replay.request === "object"
    ? replay.request.admissionRequestHash : null;
  const checked = verifyActionAdmissionRequest(replay.request, {
    source: replay.source,
    expectedAdmissionRequestHash: expected,
  });
  const episodeHashMatchedTender = checked.ok
    && replay.request.bindings.run.episodeHash
      === input.tender.typedGraph.episode.episodeHash;
  const attemptHashMatchedTender = checked.ok
    && replay.request.bindings.run.attemptHash
      === input.tender.typedGraph.attempt.attemptHash;
  const episodeAttemptCrossBindingEstablished = episodeHashMatchedTender
    && attemptHashMatchedTender;
  const held = checked.ok && checked.decisionState === "HOLD"
    && checked.authorityEstablished === false && checked.admitted === false
    && checked.actionReady === false && checked.executable === false;
  const admitted = held && episodeHashMatchedTender && attemptHashMatchedTender;
  return {
    supplied: true,
    verifierInvoked: true,
    verifierOk: checked.ok === true,
    sourceArtifactsRederived: checked.ok === true,
    episodeHashMatchedTender,
    attemptHashMatchedTender,
    episodeAttemptCrossBindingEstablished,
    claimWayWorldCrossBindingToOrderEstablished: false,
    beforeStateCrossBindingToOrderEstablished: false,
    governanceCrossBindingToOrderEstablished: false,
    fullOrderSemanticBindingEstablished: false,
    foundationBindingScope: admitted
      ? "EPISODE_ATTEMPT_ONLY_UNBOUND_ORDER_SEMANTICS" : "NONE",
    censusHashExternallyVerified: false,
    foundationBindingAdmitted: admitted,
    actionAdmissionHash: admitted ? checked.admissionRequestHash : null,
    authorityEstablished: false,
    admitted: false,
    actionReady: false,
    executable: false,
    errorCode: admitted ? null : checked.ok
      ? "ACTION_ADMISSION_TENDER_CROSS_BINDING_FAILED"
      : "ACTION_ADMISSION_VERIFICATION_FAILED",
  };
}

function attemptSetCrossChecks(input, workOrderCheck, actionCheck) {
  const composition = input.attemptSetReplay.composition;
  const graph = input.tender.typedGraph;
  const binding = composition.episodeBinding;
  const firstAttempt = composition.attempts[0];
  const workOrder = input.autonomousWorkOrder;
  const checks = {
    workOrderHashMatchedTender:
      binding.workOrderProjectionHash === input.tender.workOrderHash,
    principalEpochMatchedTender:
      binding.principalEpochProjectionHash
        === graph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentMatchedTender:
      binding.accountableDeploymentSubjectHash
        === graph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeMatchedTender:
      binding.runtimeInstanceHash === graph.runtime.runtimeInstanceHash,
    embodimentMatchedTender:
      binding.embodimentRevisionHash
        === graph.embodiment.embodimentRevisionHash,
    delegationMatchedTender:
      binding.delegationEdgeHash === graph.delegation.delegationEdgeHash,
    episodeMatchedTender: binding.episodeHash === graph.episode.episodeHash,
    episodeJoinMatchedTender:
      binding.networkCompleteEpisodeJoinHash
        === graph.episode.networkCompleteEpisodeJoinHash,
    genesisAttemptMatchedTender:
      binding.callerSuppliedGenesisObligationAttemptHash
        === graph.attempt.attemptHash
      && firstAttempt.attemptHash === graph.attempt.attemptHash,
    attemptActorMatchedTender:
      firstAttempt.attemptActorSubjectHash
        === graph.attempt.attemptActorSubjectHash,
    obligationReferencesMatchedVerifiedWorkOrder:
      workOrderCheck.foundationBindingAdmitted
      && binding.realityObligationGenesisHash
        === workOrder.contractReferences.realityObligationGenesisHash
      && binding.realityObligationStateHash
        === workOrder.contractReferences.realityObligationStateHash,
    censusMatchedVerifiedActionAdmission:
      actionCheck.foundationBindingAdmitted
      && binding.prospectiveCensusProjectionHash
        === input.actionAdmissionReplay.request.bindings.run.censusHash,
  };
  const keys = ReflectOwnKeys(checks);
  let all = true;
  for (let index = 0; index < keys.length; index += 1) {
    if (checks[keys[index]] !== true) all = false;
  }
  return { checks, all };
}

function attemptSetAssessment(input, tenderCheck, workOrderCheck, actionCheck) {
  const replay = input.attemptSetReplay;
  const empty = (supplied, invoked, errorCode) => ({
    supplied,
    verifierInvoked: invoked,
    verifierOk: false,
    compositionAndImmediatePredecessorRederived: false,
    workOrderHashMatchedTender: false,
    principalEpochMatchedTender: false,
    accountableDeploymentMatchedTender: false,
    runtimeMatchedTender: false,
    embodimentMatchedTender: false,
    delegationMatchedTender: false,
    episodeMatchedTender: false,
    episodeJoinMatchedTender: false,
    genesisAttemptMatchedTender: false,
    attemptActorMatchedTender: false,
    obligationReferencesMatchedVerifiedWorkOrder: false,
    censusMatchedVerifiedActionAdmission: false,
    fullTypedGraphEpisodeAttemptCrossBinding: false,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptCensusCompletenessEstablished: false,
    foundationBindingAdmitted: false,
    attemptSetCompositionHash: null,
    authorityEstablished: false,
    actionReady: false,
    errorCode,
  });
  if (replay === null) {
    return empty(false, false, "ATTEMPT_SET_REPLAY_NOT_SUPPLIED");
  }
  if (!tenderCheck.verifierOk) {
    return empty(true, false, "ATTEMPT_SET_TENDER_PREREQUISITE_FAILED");
  }
  const expectedHash = replay.composition !== null
    && typeof replay.composition === "object"
    ? replay.composition.compositionHash : null;
  const expectedPredecessorHash = replay.composition !== null
    && typeof replay.composition === "object"
    && replay.composition.appendOnlyLineage?.revision > 0
    ? replay.composition.appendOnlyLineage.predecessorCompositionHash : null;
  const checked = verifyEpisodeAttemptSetComposition(replay.composition, {
    predecessor: replay.predecessor,
    expectedCompositionHash: expectedHash,
    expectedPredecessorCompositionHash: expectedPredecessorHash,
  });
  if (!checked.ok) {
    return empty(true, true, "ATTEMPT_SET_VERIFICATION_FAILED");
  }
  const cross = attemptSetCrossChecks(input, workOrderCheck, actionCheck);
  const held = checked.decisionState === "HOLD" && checked.authority === "NONE"
    && checked.actionReady === false && checked.executable === false;
  const admitted = held && cross.all;
  return {
    supplied: true,
    verifierInvoked: true,
    verifierOk: true,
    compositionAndImmediatePredecessorRederived: true,
    ...cross.checks,
    fullTypedGraphEpisodeAttemptCrossBinding: cross.all,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptCensusCompletenessEstablished: false,
    foundationBindingAdmitted: admitted,
    attemptSetCompositionHash: admitted ? checked.compositionHash : null,
    authorityEstablished: false,
    actionReady: false,
    errorCode: admitted ? null : "ATTEMPT_SET_FOUNDATION_CROSS_BINDING_FAILED",
  };
}

function witnessAssessment(input, tenderCheck, workOrderCheck, actionCheck,
  attemptCheck) {
  const replay = input.networkOutcomeWitnessReplay;
  const empty = (supplied, invoked, errorCode) => ({
    supplied,
    verifierInvoked: invoked,
    verifierOk: false,
    sourceByteReplayComplete: false,
    secondTypedActorIdentityReplayed: false,
    independencePolicyVerifiedWithinScope: false,
    organizationalIndependenceEstablished: false,
    independentOutcomeTruthEstablished: false,
    claimWayWorldMatchedVerifiedActionAdmission: false,
    episodeMatchedTender: false,
    attemptMatchedTender: false,
    workOrderOutcomeCrossBindingEstablished: false,
    attemptSetCrossBindingEstablished: false,
    foundationBindingAdmitted: false,
    networkOutcomeWitnessHash: null,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    errorCode,
  });
  if (replay === null) {
    return empty(false, false, "NETWORK_OUTCOME_WITNESS_REPLAY_NOT_SUPPLIED");
  }
  const checked = verifyOutsiderOutcomeWitnessEnvelope(
    replay.envelope, replay.context);
  if (!checked.ok) {
    return empty(true, true, "NETWORK_OUTCOME_WITNESS_VERIFICATION_FAILED");
  }
  const target = replay.envelope.target;
  const actionBindings = input.actionAdmissionReplay?.request?.bindings;
  const claimWayWorldMatchedVerifiedActionAdmission
    = actionCheck.foundationBindingAdmitted
      && target.claimHash === actionBindings.claimWayWorld.claimHash
      && target.wayHash === actionBindings.claimWayWorld.wayHash
      && target.worldHash === actionBindings.claimWayWorld.worldHash;
  const episodeMatchedTender = tenderCheck.verifierOk
    && target.episodeHash === input.tender.typedGraph.episode.episodeHash;
  const attemptMatchedTender = tenderCheck.verifierOk
    && target.attemptHash === input.tender.typedGraph.attempt.attemptHash;
  const workOrderOutcomeCrossBindingEstablished
    = workOrderCheck.foundationBindingAdmitted;
  const attemptSetCrossBindingEstablished
    = attemptCheck.foundationBindingAdmitted;
  const held = checked.status === "HOLD" && checked.authority === "NONE"
    && checked.actionReady === false && checked.executable === false
    && checked.organizationalIndependenceEstablished === false
    && checked.independentOutcomeTruthEstablished === false
    && checked.causalAttributionEstablished === false
    && checked.obligationClosed === false;
  const admitted = held && claimWayWorldMatchedVerifiedActionAdmission
    && episodeMatchedTender && attemptMatchedTender
    && workOrderOutcomeCrossBindingEstablished
    && attemptSetCrossBindingEstablished;
  return {
    supplied: true,
    verifierInvoked: true,
    verifierOk: true,
    sourceByteReplayComplete: checked.sourceByteReplayComplete === true,
    secondTypedActorIdentityReplayed:
      checked.secondTypedActorIdentityReplayed === true,
    independencePolicyVerifiedWithinScope:
      checked.independencePolicyVerifiedWithinScope === true,
    organizationalIndependenceEstablished: false,
    independentOutcomeTruthEstablished: false,
    claimWayWorldMatchedVerifiedActionAdmission,
    episodeMatchedTender,
    attemptMatchedTender,
    workOrderOutcomeCrossBindingEstablished,
    attemptSetCrossBindingEstablished,
    foundationBindingAdmitted: admitted,
    networkOutcomeWitnessHash: admitted ? checked.envelopeHash : null,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    errorCode: admitted ? null
      : "NETWORK_OUTCOME_WITNESS_FOUNDATION_CROSS_BINDING_FAILED",
  };
}

function actionObligationAssessment(input) {
  const verifierInput = input.actionObligationHoldCompositionInput;
  const empty = (supplied, errorCode) => ({
    supplied,
    verifierInvoked: false,
    unsafeUnderlyingReaderBlocked: supplied,
    verifierReturnedOk: false,
    referenceIntegrityVerified: false,
    structuralCompositionVerified: false,
    semanticObligationVerificationEstablished: false,
    obligationLedgerSourceReplayComplete: false,
    admissionReplayMatchedCoreAction: false,
    claimWayWorldMatchedVerifiedActionAdmission: false,
    episodeMatchedTender: false,
    attemptMatchedTender: false,
    censusMatchedVerifiedAttemptSetAndAction: false,
    obligationGenesisMatchedVerifiedWorkOrder: false,
    obligationStateMatchedVerifiedWorkOrder: false,
    affectedPartyRootSourceReplayed: false,
    responsibilityGraphSourceReplayed: false,
    consequenceEnvelopeSourceProjectedFromEffect: false,
    foundationBindingAdmitted: false,
    realityObligationHash: null,
    authorityEstablished: false,
    admitted: false,
    actionReady: false,
    executable: false,
    errorCode,
  });
  if (verifierInput === null) {
    return empty(false,
      "ACTION_OBLIGATION_HOLD_COMPOSITION_INPUT_NOT_SUPPLIED");
  }
  /*
   * Do not inspect, canonicalize, stat, or open the supplied directory here.
   * The opaque input is retained only as a presence signal for this controlled
   * blocker and is never copied into the public receipt.
   */
  return empty(true,
    "ACTION_OBLIGATION_REPLAY_DISABLED_UNSAFE_SOURCE_READER");
}

function gapCodes(tenderCheck, workOrderCheck, actionCheck, attemptCheck,
  witnessCheck, obligationCheck) {
  const gaps = [];
  if (!tenderCheck.verifierOk) gaps.push("TENDER_VERIFICATION_FAILED");
  if (!workOrderCheck.supplied) {
    gaps.push("AUTONOMOUS_WORK_ORDER_NOT_SUPPLIED");
  } else if (!workOrderCheck.verifierOk) {
    gaps.push("AUTONOMOUS_WORK_ORDER_VERIFICATION_FAILED");
  } else if (!workOrderCheck.foundationBindingAdmitted) {
    if (!workOrderCheck.fullPromisedOutcomeObservationRecoveryCrossBinding) {
      gaps.push(
        "AUTONOMOUS_WORK_ORDER_OUTCOME_OBSERVATION_RECOVERY_TENDER_CROSS_BINDING_FAILED");
    } else {
      gaps.push("AUTONOMOUS_WORK_ORDER_TENDER_CROSS_BINDING_FAILED");
    }
  }
  if (!actionCheck.supplied) {
    gaps.push("ACTION_ADMISSION_REPLAY_NOT_SUPPLIED");
  } else if (!actionCheck.verifierOk) {
    gaps.push("ACTION_ADMISSION_VERIFICATION_FAILED");
  } else if (!actionCheck.foundationBindingAdmitted) {
    gaps.push("ACTION_ADMISSION_TENDER_EPISODE_ATTEMPT_CROSS_BINDING_FAILED");
  } else {
    gaps.push("ACTION_CLAIM_WAY_WORLD_ORDER_CROSS_BINDING_UNAVAILABLE");
    gaps.push("ACTION_BEFORE_STATE_ORDER_CROSS_BINDING_UNAVAILABLE");
    gaps.push("ACTION_GOVERNANCE_ORDER_CROSS_BINDING_UNAVAILABLE");
    gaps.push("ACTION_ADMISSION_FULL_ORDER_SEMANTIC_BINDING_UNPROVEN");
  }
  if (!attemptCheck.supplied) {
    gaps.push("ATTEMPT_SET_REPLAY_NOT_SUPPLIED");
  } else if (!attemptCheck.verifierOk) {
    gaps.push("ATTEMPT_SET_VERIFICATION_FAILED");
  } else if (!attemptCheck.foundationBindingAdmitted) {
    gaps.push("ATTEMPT_SET_WORK_ORDER_GRAPH_EPISODE_ATTEMPT_CROSS_BINDING_FAILED");
  }
  if (!witnessCheck.supplied) {
    gaps.push("NETWORK_OUTCOME_WITNESS_REPLAY_NOT_SUPPLIED");
  } else if (!witnessCheck.verifierOk) {
    gaps.push("NETWORK_OUTCOME_WITNESS_VERIFICATION_FAILED");
  } else if (!witnessCheck.foundationBindingAdmitted) {
    gaps.push("NETWORK_OUTCOME_WITNESS_ACTION_TENDER_CROSS_BINDING_FAILED");
  } else {
    gaps.push("INDEPENDENT_WITNESS_STANDING_AND_OUTCOME_TRUTH_UNPROVEN");
  }
  if (!obligationCheck.supplied) {
    gaps.push("ACTION_OBLIGATION_HOLD_COMPOSITION_INPUT_NOT_SUPPLIED");
  } else if (obligationCheck.unsafeUnderlyingReaderBlocked) {
    gaps.push("ACTION_OBLIGATION_REPLAY_DISABLED_UNSAFE_SOURCE_READER");
  } else if (!obligationCheck.referenceIntegrityVerified) {
    gaps.push("ACTION_OBLIGATION_REFERENCE_INTEGRITY_VERIFICATION_FAILED");
  } else if (!obligationCheck.foundationBindingAdmitted) {
    gaps.push("ACTION_OBLIGATION_FOUNDATION_CROSS_BINDING_FAILED");
  } else {
    gaps.push("REALITY_OBLIGATION_REFERENCE_INTEGRITY_ONLY_SEMANTICS_UNRESOLVED");
  }
  gaps.push("RECOVERY_CAPACITY_REPLAY_NOT_SUPPLIED");
  gaps.push("RIGHTS_PRIVACY_DECISION_REPLAY_NOT_SUPPLIED");
  gaps.push("RISK_CAPITAL_RESERVATION_REPLAY_NOT_SUPPLIED");
  gaps.push("CUSTODY_AUTHORITY_REPLAY_NOT_SUPPLIED");
  gaps.push("ADJUDICATION_AUTHORITY_REPLAY_NOT_SUPPLIED");
  gaps.push("EXTERNAL_TRUST_POLICY_REPLAY_NOT_SUPPLIED");
  gaps.push("OUTCOME_DECIDABILITY_UNPROVEN");
  gaps.push("EXTERNAL_LEGAL_IDENTITY_AND_AUTHORITY_UNPROVEN");
  gaps.push("SOURCE_REPLAY_BINDINGS_DO_NOT_MINT_AUTHORITY");
  return gaps;
}

function replayBody(input) {
  const tenderCheck = tenderAssessment(input);
  const workOrderCheck = workOrderAssessment(input, tenderCheck);
  const actionCheck = actionAssessment(input, tenderCheck);
  const attemptCheck = attemptSetAssessment(input, tenderCheck, workOrderCheck,
    actionCheck);
  const witnessCheck = witnessAssessment(input, tenderCheck, workOrderCheck,
    actionCheck, attemptCheck);
  const obligationCheck = actionObligationAssessment(input);
  const bindings = emptyFoundationBindings();
  bindings.autonomousWorkOrderHash = workOrderCheck.workOrderHash;
  bindings.actionAdmissionHash = actionCheck.actionAdmissionHash;
  bindings.attemptSetCompositionHash = attemptCheck.attemptSetCompositionHash;
  bindings.networkOutcomeWitnessHash = witnessCheck.networkOutcomeWitnessHash;
  bindings.realityObligationHash = obligationCheck.realityObligationHash;
  const allCoreFoundationRecordsRederivedAndCrossBound
    = workOrderCheck.foundationBindingAdmitted
      && actionCheck.foundationBindingAdmitted
      && attemptCheck.foundationBindingAdmitted;
  return {
    schema: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    recordClass:
      "FOUNDATION_RECORD_REPLAY_AND_TENDER_CROSS_BINDING_RECEIPT_HOLD_ONLY",
    tenderAssessment: tenderCheck,
    autonomousWorkOrderAssessment: workOrderCheck,
    actionAdmissionAssessment: actionCheck,
    attemptSetAssessment: attemptCheck,
    networkOutcomeWitnessAssessment: witnessCheck,
    actionObligationAssessment: obligationCheck,
    foundationBindings: bindings,
    foundationBindingsDerivedOnlyFromReplayedRecords: true,
    callerFoundationHashesAccepted: false,
    allCoreFoundationRecordsRederivedAndCrossBound,
    allRequiredFormationFoundationsReplayed: false,
    gapCodes: gapCodes(tenderCheck, workOrderCheck, actionCheck, attemptCheck,
      witnessCheck, obligationCheck),
    externalTrustStillRequired: true,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    result: allCoreFoundationRecordsRederivedAndCrossBound
      ? "CORE_FOUNDATION_RECORDS_REDERIVED_CROSS_BOUND_UNVERIFIED_HOLD"
      : "CORE_FOUNDATION_REPLAY_OR_CROSS_BINDING_GAP_HOLD",
    boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
  };
}

/**
 * Replay the currently supported local foundation records and derive the only
 * engine hash slots that v1 can justify.  The bridge performs no filesystem
 * I/O.  The action-obligation path is disabled until its source reader is
 * descriptor-bound and no-follow across the complete ancestor chain.
 */
export function createOutcomeFormationFoundationReplayV1(input) {
  rejectTree(input);
  exactContainer(input, REPLAY_INPUT_FIELDS, "REPLAY_INPUT");
  hash(input.expectedTenderHash, "EXPECTED_TENDER_HASH");
  actionReplay(input.actionAdmissionReplay);
  attemptReplay(input.attemptSetReplay);
  witnessReplay(input.networkOutcomeWitnessReplay);
  const body = replayBody(input);
  return deepFreeze({
    ...body,
    foundationReplayHash: digest(
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replay, body),
  });
}

function replayVerificationFailure() {
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replayVerification,
    ok: false,
    sourceRecordsReplayed: false,
    exactSchemaVerified: false,
    derivationVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    callerFoundationHashesUnableToMintBindings: false,
    holdBoundaryVerified: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    errorCode: "FOUNDATION_REPLAY_VERIFICATION_FAILED",
    boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
  });
}

/** Re-run all dependency verifiers from the supplied source records. */
export function verifyOutcomeFormationFoundationReplayV1(record, options) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactContainer(options, ["source", "expectedFoundationReplayHash"],
      "REPLAY_VERIFY_OPTIONS");
    hash(options.expectedFoundationReplayHash,
      "EXPECTED_FOUNDATION_REPLAY_HASH");
    const rebuilt = createOutcomeFormationFoundationReplayV1(options.source);
    if (!same(record, rebuilt)) fail("REPLAY_DERIVATION_OR_SELF_HASH_INVALID");
    if (rebuilt.foundationReplayHash
      !== options.expectedFoundationReplayHash) {
      fail("EXPECTED_FOUNDATION_REPLAY_HASH_MISMATCH");
    }
    return deepFreeze({
      schema:
        OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.replayVerification,
      ok: true,
      sourceRecordsReplayed: true,
      exactSchemaVerified: true,
      derivationVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      foundationReplayHash: rebuilt.foundationReplayHash,
      allCoreFoundationRecordsRederivedAndCrossBound:
        rebuilt.allCoreFoundationRecordsRederivedAndCrossBound,
      allRequiredFormationFoundationsReplayed: false,
      callerFoundationHashesUnableToMintBindings: true,
      holdBoundaryVerified: true,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
      errorCode: null,
      boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
    });
  } catch {
    return replayVerificationFailure();
  }
}

function replaySourceFromBoundInput(input) {
  return {
    expectedTenderHash: input.expectedTenderHash,
    tender: input.tender,
    autonomousWorkOrder: input.autonomousWorkOrder,
    actionAdmissionReplay: input.actionAdmissionReplay,
    attemptSetReplay: input.attemptSetReplay,
    networkOutcomeWitnessReplay: input.networkOutcomeWitnessReplay,
    actionObligationHoldCompositionInput:
      input.actionObligationHoldCompositionInput,
  };
}

/**
 * High-level safe path into Outcome Formation Engine v1.  There is no caller
 * supplied `foundationBindings` field: the bridge derives it from verifier
 * results and the engine remains unverified HOLD even when all three currently
 * supported core records cross-bind.
 */
export function createOutcomeFormationFoundationBoundEvaluationV1(input) {
  rejectTree(input);
  exactContainer(input, BOUND_INPUT_FIELDS, "BOUND_EVALUATION_INPUT");
  instant(input.evaluatedAt, "EVALUATED_AT");
  const replay = createOutcomeFormationFoundationReplayV1(
    replaySourceFromBoundInput(input));
  const evaluation = createOutcomeFormationEvaluationV1({
    formationId: input.formationId,
    evaluatedAt: input.evaluatedAt,
    expectedTenderHash: input.expectedTenderHash,
    tender: input.tender,
    ownerMandate: input.ownerMandate,
    providerAcceptance: input.providerAcceptance,
    capacityReservationReceipt: input.capacityReservationReceipt,
    consumedNonceHashes: input.consumedNonceHashes,
    foundationBindings: replay.foundationBindings,
    untrustedCallerAssertions: input.untrustedCallerAssertions,
  });
  const body = {
    schema:
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.boundEvaluation,
    schemaVersion: "1.0.0",
    recordClass:
      "REPLAY_DERIVED_FOUNDATION_BOUND_FORMATION_EVALUATION_HOLD_ONLY",
    foundationReplay: replay,
    formationEvaluation: evaluation,
    foundationBindingsDerivedOnlyFromReplayedRecords: true,
    callerFoundationHashesAccepted: false,
    allRequiredFormationFoundationsReplayed: false,
    externalTrustStillRequired: true,
    strongestOutcome:
      replay.allCoreFoundationRecordsRederivedAndCrossBound
        ? "CORE_FOUNDATIONS_REPLAY_BOUND_UNVERIFIED_HOLD"
        : "FOUNDATION_REPLAY_GAP_HOLD",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    price: null,
    guarantee: null,
    settlement: null,
    result: "FOUNDATION_REPLAY_BOUND_FORMATION_EVALUATION_CREATED_HOLD",
    boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    foundationBoundEvaluationHash: digest(
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS.boundEvaluation,
      body),
  });
}

function boundVerificationFailure() {
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS
        .boundEvaluationVerification,
    ok: false,
    sourceRecordsReplayed: false,
    engineEvaluationRederived: false,
    exactSchemaVerified: false,
    derivationVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    holdBoundaryVerified: false,
    callerFoundationHashesUnableToMintBindings: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    errorCode: "FOUNDATION_BOUND_EVALUATION_VERIFICATION_FAILED",
    boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
  });
}

/** Re-run the bridge and the engine, then verify the caller's exact pin. */
export function verifyOutcomeFormationFoundationBoundEvaluationV1(
  record, options) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactContainer(options, ["source", "expectedFoundationBoundEvaluationHash"],
      "BOUND_VERIFY_OPTIONS");
    hash(options.expectedFoundationBoundEvaluationHash,
      "EXPECTED_FOUNDATION_BOUND_EVALUATION_HASH");
    const rebuilt = createOutcomeFormationFoundationBoundEvaluationV1(
      options.source);
    if (!same(record, rebuilt)) {
      fail("BOUND_EVALUATION_DERIVATION_OR_SELF_HASH_INVALID");
    }
    if (rebuilt.foundationBoundEvaluationHash
      !== options.expectedFoundationBoundEvaluationHash) {
      fail("EXPECTED_FOUNDATION_BOUND_EVALUATION_HASH_MISMATCH");
    }
    return deepFreeze({
      schema:
        OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_SCHEMAS
          .boundEvaluationVerification,
      ok: true,
      sourceRecordsReplayed: true,
      engineEvaluationRederived: true,
      exactSchemaVerified: true,
      derivationVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      foundationBoundEvaluationHash: rebuilt.foundationBoundEvaluationHash,
      holdBoundaryVerified: true,
      callerFoundationHashesUnableToMintBindings: true,
      allRequiredFormationFoundationsReplayed: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
      errorCode: null,
      boundary: OUTSIDER_OUTCOME_FORMATION_FOUNDATION_REPLAY_V1_BOUNDARY,
    });
  } catch {
    return boundVerificationFailure();
  }
}
