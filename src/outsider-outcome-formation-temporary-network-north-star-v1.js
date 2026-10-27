/*
 * Outcome Formation temporary-supply-network North Star v1.
 *
 * This module freezes the product invariants for future supply-network
 * integrations.  The network is composed per order from externally controlled
 * resources; Outsider owns no provider inventory and supplies no hidden human
 * fallback.  One-use consent is the default.  A standing relationship is a
 * separate, explicit, revocable opt-in and never turns into Outsider ownership.
 *
 * This contract is structural.  Its verifier is HOLD-only and cannot establish
 * capacity, authority, action readiness, or money movement.  It deliberately
 * does not prohibit a later version from admitting action after independent
 * authority and all other required foundations have actually been proven.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const JSONParse = JSON.parse;
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
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
  = ObjectFreeze({
    source:
      "outsider/outcome-formation-temporary-network-north-star-source/v1",
    contract:
      "outsider/outcome-formation-temporary-network-north-star/v1",
    verification:
      "outsider/outcome-formation-temporary-network-north-star-verification/v1",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY
  = deepFreeze({
    position:
      "PER_ORDER_EPHEMERAL_EXTERNAL_RESOURCE_NETWORK_INVARIANT_CONTRACT",
    invariantContractOnly: true,
    integrationImplementationInspected: false,
    integrationBehaviorVerified: false,
    filesystemIoPerformed: false,
    networkIoPerformed: false,
    providerDiscoveryPerformed: false,
    providerContactPerformed: false,
    providerInventoryCreated: false,
    callbackInvoked: false,
    structuralConformanceMintsAuthority: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEnablesAction: false,
    structuralConformanceEnablesMoneyMovement: false,
    currentVerifierDecisionState: "HOLD",
    currentVerifierAuthority: "NONE",
    currentVerifierActionReady: false,
    currentVerifierExecutable: false,
    futureSeparatelyProvenAuthorityPathPrecluded: false,
    futureSeparatelyAdmittedActionPathPrecluded: false,
    futureAuthorityDecisionOutOfScope: true,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    cEnabledSubsetAProven: true,
    consequenceReach: "NONE",
    priceEstablished: false,
    guaranteeCreated: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    humanFallbackPermitted: false,
  });

const REQUIRED_SOURCE = deepFreeze({
  schema:
    OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS.source,
  schemaVersion: "1.0.0",
  contractClass:
    "TEMPORARY_SUPPLY_NETWORK_NORTH_STAR_INVARIANTS",
  networkClass: "PER_ORDER_EPHEMERAL_EXTERNAL_RESOURCE_NETWORK",
  topology: {
    formationUnit: "ONE_TENDER_ONE_NETWORK",
    scopeBinding:
      "TENDER_OWNER_MANDATE_PROVIDER_ONE_USE_ACCEPTANCES_EPISODE_ATTEMPT",
    typedGraphModel:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    resourceCardinality: "ONE_OR_MORE_AS_REQUIRED_BY_TENDER",
    crossTenderReuseAllowed: false,
    networkPersistsAfterOrderClosure: false,
    networkDissolutionErasesEpisodeAttemptHistory: false,
    networkDissolutionErasesOpenObligations: false,
    evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure: true,
    providerStandingRelationshipSeparateFromNetwork: true,
  },
  supplyOwnership: {
    supplySource: "EXTERNALLY_AVAILABLE_RESOURCES",
    outsiderOwnedProviderInventoryAllowed: false,
    outsiderExclusiveProviderPoolRequired: false,
    providerRegistrationRequiredForOneUseTender: false,
    externalResourceOwnerRetainsControl: true,
    standingParticipationTransfersOwnershipToOutsider: false,
  },
  consentLifecycle: {
    defaultEngagement: "EXPLICIT_ONE_USE",
    explicitOwnerMandateRequired: true,
    explicitProviderAcceptanceRequired: true,
    silenceAcceptedAsConsent: false,
    oneUseNonceRequired: true,
    completionCreatesStandingCapacity: false,
    autoEnrollmentAllowed: false,
    postFulfillmentStandingInvitationMayBeAutomated: true,
    invitationAloneCreatesStandingCapacity: false,
    separateStandingOptInRequired: true,
    standingGrantRevocable: true,
    standingGrantValidityWindowRequired: true,
    standingGrantScopeRegionTimeCapacityResponsibilityBound: true,
    standingGrantCommercialTermsBound: true,
  },
  zeroInternalOps: {
    outsiderStaffTouchesAllowed: 0,
    manualDiscoveryAllowed: false,
    manualContactAllowed: false,
    manualCoordinationAllowed: false,
    manualVerificationAllowed: false,
    manualRecoveryAllowed: false,
    humanQueueFallbackAllowed: false,
    anyOutsiderStaffTouchIsFormationFailure: true,
    staffTouchFailureMustBeRecordedAgainstTender: true,
    unsupportedOrUnformedDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  },
  commitmentGate: {
    userOutcomePromiseFormationMode: "ATOMIC_ALL_REQUIRED_GATES",
    explicitResourceOwnerAuthorityRequired: true,
    everyMandatoryPrimaryResourceCapacityRequired: true,
    everyMandatoryRecoveryResourceCapacityRequired: true,
    everyMandatoryIndependentEvidenceResourceCapacityRequired: true,
    maximumConsequenceAndLiabilityEnvelopeRequired: true,
    promisedFinancialRemedyRequiresProvenFundingCapacity: true,
    lawfulTransactionPathRequired: true,
    externalRouteZeroInternalOpsRequired: true,
    partialPromiseOnIncompleteFormationAllowed: false,
    manualOverrideAllowed: false,
    beforeFormationDeadlineDisposition: "CONTINUE_AUTOMATED_FORMATION",
    atFormationDeadlineDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  },
  domainBoundary: {
    coreFormationLogic: "DOMAIN_AGNOSTIC_TYPED_CONTRACT_CORE",
    controlledOutcomeKindCodeRequired: true,
    controlledResourceClassCodeRequired: true,
    controlledOutcomeKindCodePattern: "^[A-Z][A-Z0-9_]{0,63}$",
    controlledResourceClassCodePattern: "^[A-Z][A-Z0-9_]{0,63}$",
    fixedDomainCatalogRequired: false,
    domainSpecificAdapterAllowed: true,
    domainSpecificSemanticsConfinedToTypedContractsAndAdapters: true,
    domainSpecificCoreFormationBranchingAllowed: false,
    domainSpecificHumanWorkflowAllowed: false,
  },
  authorityBoundary: {
    structuralConformanceMintsAuthority: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEnablesAction: false,
    structuralConformanceEnablesMoneyMovement: false,
    cEnabledSubsetAProvenRequired: true,
    consequenceReachWithinCommittedEvidenceAndDurableResponsibilityRequired:
      true,
    futureSeparatelyProvenAuthorityDecisionOutOfScope: true,
    futureSeparatelyAdmittedActionPermanentlyForbidden: false,
  },
});

const REQUIRED_SOURCE_CANONICAL = canonicalizeStrict(REQUIRED_SOURCE);

function fail(code) {
  throw new TypeErrorConstructor(
    `OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_${code}`);
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
  if (depth > 32) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > 1_024) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > 4_096) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
      fail("ACCESSOR_FORBIDDEN");
    }
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
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
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(code);
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

function normalizeSource(source) {
  rejectTree(source);
  let canonical;
  try {
    canonical = canonicalizeStrict(source);
  } catch {
    fail("SOURCE_INVALID");
  }
  if (canonical !== REQUIRED_SOURCE_CANONICAL) fail("SOURCE_INVARIANT_MISMATCH");
  return JSONParse(canonical);
}

/** Return a fresh reference to the immutable, exact v1 North Star source. */
export function createOutcomeFormationTemporaryNetworkNorthStarSourceV1() {
  return REQUIRED_SOURCE;
}

/**
 * Seal the exact source contract.  No caller-selected policy field exists:
 * changing any leaf requires a new, reviewable schema version.
 */
export function createOutcomeFormationTemporaryNetworkNorthStarV1(source) {
  const normalized = normalizeSource(source);
  const body = {
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
        .contract,
    sourceSchema: normalized.schema,
    schemaVersion: normalized.schemaVersion,
    contractClass: normalized.contractClass,
    networkClass: normalized.networkClass,
    topology: normalized.topology,
    supplyOwnership: normalized.supplyOwnership,
    consentLifecycle: normalized.consentLifecycle,
    zeroInternalOps: normalized.zeroInternalOps,
    commitmentGate: normalized.commitmentGate,
    domainBoundary: normalized.domainBoundary,
    authorityBoundary: normalized.authorityBoundary,
    boundary:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    northStarInvariantHash: digest(
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
        .contract,
      body),
  });
}

function verificationFailure(error) {
  let controlledError
    = "OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_UNTRUSTED_FAILURE";
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(
        /^OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_[A-Z0-9_]+$/u,
        error.message)) {
      controlledError = error.message;
    }
  } catch {
    controlledError
      = "OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_UNTRUSTED_FAILURE";
  }
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
        .verification,
    ok: false,
    exactSourceVerified: false,
    sourceRebuilt: false,
    derivationVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    permanentInvariantContractVerified: false,
    domainAgnosticCoreContractVerified: false,
    integrationBehaviorVerified: false,
    structuralConformanceMintsAuthority: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEnablesAction: false,
    structuralConformanceEnablesMoneyMovement: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    cEnabledSubsetAProven: true,
    consequenceReach: "NONE",
    error: controlledError,
    boundary:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY,
  });
}

/** Rebuild the contract from the full source and verify the caller's hash pin. */
export function verifyOutcomeFormationTemporaryNetworkNorthStarV1(
  record, options) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["source", "expectedNorthStarInvariantHash"],
      "VERIFY_OPTIONS");
    const expectedHash = hash(options.expectedNorthStarInvariantHash,
      "EXPECTED_NORTH_STAR_INVARIANT_HASH_INVALID");
    const rebuilt = createOutcomeFormationTemporaryNetworkNorthStarV1(
      options.source);
    if (!same(record, rebuilt)) fail("SOURCE_REPLAY_MISMATCH");
    if (rebuilt.northStarInvariantHash !== expectedHash) {
      fail("EXPECTED_NORTH_STAR_INVARIANT_HASH_MISMATCH");
    }
    return deepFreeze({
      schema:
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_SCHEMAS
          .verification,
      ok: true,
      exactSourceVerified: true,
      sourceRebuilt: true,
      derivationVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      northStarInvariantHash: rebuilt.northStarInvariantHash,
      permanentInvariantContractVerified: true,
      domainAgnosticCoreContractVerified: true,
      integrationBehaviorVerified: false,
      structuralConformanceMintsAuthority: false,
      structuralConformanceEstablishesCapacity: false,
      structuralConformanceEnablesAction: false,
      structuralConformanceEnablesMoneyMovement: false,
      futureSeparatelyProvenAuthorityDecisionOutOfScope: true,
      futureSeparatelyAdmittedActionPermanentlyForbidden: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      cEnabledSubsetAProven: true,
      consequenceReach: "NONE",
      error: null,
      boundary:
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_NORTH_STAR_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
