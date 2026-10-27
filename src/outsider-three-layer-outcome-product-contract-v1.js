/*
 * Outsider three-layer outcome product contract v1.
 *
 * Layer 1 (Outcome OS) defines a hash-only, agent-neutral outcome envelope.
 * It does not require execution, recovery, or witness routes.
 *
 * Layer 2 (Formation / Recovery Options) binds any non-empty portfolio of
 * route options and reports role coverage.  A current recovery reference is
 * useful even when the portfolio is incomplete, but is never a guarantee.
 *
 * Layer 3 classifies readiness for an Outcome COMMIT.  This public contract
 * deliberately cannot issue COMMIT: caller-supplied hashes do not prove
 * authority, capacity, independence, capital, or obligation acceptance.  A
 * positive commitment remains the responsibility of an existing source-
 * replayed execution/commit runtime.  This module only identifies the exact
 * structural slots which that runtime must verify.
 *
 * No natural-language goal, address, credential, payment instrument, source
 * bytes, agent name, or provider name is accepted or projected.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";

const PREFIX = "OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const ROLES = Object.freeze([
  "PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS",
]);
const ROLE_SET = new Set(ROLES);

export const OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
  = Object.freeze({
    outcomeOs: "outsider/outcome-os-product/v1",
    formationRecoveryOptions:
      "outsider/formation-recovery-options-product/v1",
    outcomeCommitReadiness:
      "outsider/outcome-commit-readiness-classification/v1",
  });

export const OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS
  = Object.freeze({
    outcomeOs: "OUTCOME_OS",
    formationRecoveryOptions: "FORMATION_RECOVERY_OPTIONS",
    outcomeCommit: "OUTCOME_COMMIT",
  });

export const OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY
  = deepFreeze({
    position: "AGENT_NEUTRAL_THREE_LAYER_OUTCOME_PRODUCT_PUBLIC_CONTRACT",
    layerOneRequiresExecutionRoutes: false,
    layerOneRequiresRecoveryRoutes: false,
    layerOneRequiresWitnessRoutes: false,
    layerTwoAcceptsPartialPortfolios: true,
    layerTwoMinimumOptionCount: 1,
    layerTwoGuaranteeCreated: false,
    layerTwoOutcomePromiseIssued: false,
    layerThreeRequiresPrimaryRecoveryAndIndependentWitness: true,
    layerThreePositiveCommitEmittedByThisModule: false,
    positiveCommitAuthority:
      "EXISTING_SOURCE_REPLAYED_EXECUTION_AND_COMMIT_RUNTIME_ONLY",
    callerHashesEstablishStructuralReferencesOnly: true,
    structuralConformanceMintsAuthority: false,
    agentSpecificLogicEmbedded: false,
    providerSpecificLogicEmbedded: false,
    providerRegistrationRequired: false,
    naturalLanguageAccepted: false,
    directPiiAccepted: false,
    directPiiProjected: false,
    hashReferencesMayRemainLinkable: true,
    rawSourceBytesAccepted: false,
    credentialsAccepted: false,
    networkIoPerformed: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    outsiderStaffTouchLimit: 0,
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

export const OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_MANIFEST
  = deepFreeze({
    schema: "outsider/three-layer-outcome-product-contract-manifest/v1",
    schemaVersion: "1.0.0",
    layers: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS,
    schemas: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS,
    roles: ROLES,
    publicInterface: "HASH_AND_UTC_INSTANT_ONLY",
    positiveCommitEmitted: false,
    positiveCommitAuthority:
      "EXISTING_SOURCE_REPLAYED_EXECUTION_AND_COMMIT_RUNTIME_ONLY",
  });

const TYPED_GRAPH_FIELDS = Object.freeze([
  "principalEpochRefHash",
  "accountableDeploymentRefHash",
  "runtimeRefHash",
  "embodimentRefHash",
  "delegationRefHash",
  "episodeRefHash",
  "attemptRefHash",
]);

const OUTCOME_OS_INPUT_FIELDS = Object.freeze([
  "requestIdHash",
  "outcomeProgramHash",
  "outcomeDefinitionHash",
  "acceptancePredicateHash",
  "formationDeadline",
  "completionDeadline",
  "maximumLossConstraintHash",
  "typedGraphRefs",
]);

const OUTCOME_OS_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "productLayer", "requestIdHash",
  "outcomeProgramHash", "outcomeDefinitionHash", "acceptancePredicateHash",
  "formationDeadline", "completionDeadline", "maximumLossConstraintHash",
  "typedGraphRefs", "typedGraphRefHash", "sourceVerification",
  "sourceProgramReplayPerformed", "outcomeDefined", "executionRoutesRequired",
  "recoveryRoutesRequired", "witnessRoutesRequired", "guaranteeCreated",
  "outcomePromiseIssued", "directPiiProjected", "hashReferencesMayRemainLinkable",
  "decisionState", "authority", "actionReady", "executable", "boundary",
  "artifactHash",
]);

const PROGRAM_IMPORT_FIELDS = Object.freeze([
  "requestIdHash", "outcomeProgram", "maximumLossConstraintHash",
  "typedGraphRefs",
]);

const FORMATION_INPUT_FIELDS = Object.freeze([
  "outcomeOs", "observedAt", "recoveryTriggerPolicyRefHash", "routeOptions",
]);

const ROUTE_OPTION_FIELDS = Object.freeze([
  "optionRefHash", "role", "providerRefHash", "controllerRefHash",
  "failureDomainRefHash", "capabilityRefHash", "reservationRefHash",
  "reservationLifecycleHeadRefHash", "serviceWindowRefHash", "validFrom",
  "validUntil",
]);

const NORMALIZED_ROUTE_OPTION_FIELDS = Object.freeze([
  ...ROUTE_OPTION_FIELDS, "currentAtObservedAt", "coversOutcomeDeadline",
  "reservationReferencePairPresent",
]);

const FORMATION_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "productLayer", "outcomeOs",
  "observedAt", "recoveryTriggerPolicyRefHash", "routeOptions",
  "optionCount", "roleCoverage", "currentRoleCoverage",
  "declaredRecoveryOptionReferenceCurrent",
  "declaredRecoveryOptionReferenceBasis",
  "allOptionsCurrent", "allOptionsCoverOutcomeDeadline",
  "allReservationReferencePairsPresent", "partialPortfolioPermitted",
  "externalCapacityEstablished", "recoveryOptionHeld",
  "layerTwoPromotionPermitted", "attainedServiceProfile",
  "externalVerificationGapCodes", "guaranteeCreated", "outcomePromiseIssued",
  "directPiiProjected",
  "hashReferencesMayRemainLinkable", "decisionState", "authority",
  "actionReady", "executable", "boundary", "artifactHash",
]);

const SELECTION_FIELDS = Object.freeze([
  "primaryOptionRefHash", "recoveryOptionRefHash",
  "independentWitnessOptionRefHash",
]);

const COMMIT_REFERENCE_FIELDS = Object.freeze([
  "outcomeProgramVerificationRefHash",
  "authorityAdmissionRefHash",
  "primaryCapacityAdmissionRefHash",
  "recoveryCapacityAdmissionRefHash",
  "independentWitnessAdmissionRefHash",
  "obligationAcceptanceRefHash",
  "rightsPrivacyDecisionRefHash",
  "maximumLossCapitalReservationRefHash",
  "custodyPaymentAuthorityRefHash",
  "adjudicationAuthorityRefHash",
  "externalTrustPolicyRefHash",
  "executionAdmissionRefHash",
]);

const COMMIT_INPUT_FIELDS = Object.freeze([
  "formationRecoveryOptions", "observedAt", "selectedOptions",
  "commitReferences",
]);

const COMMIT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "productLayer",
  "formationRecoveryOptions", "observedAt", "selectedOptions",
  "commitReferences", "selectedRoleBindings", "referenceSlotsComplete",
  "prerequisiteGapCodes", "externalVerificationGapCodes", "readinessState",
  "highestAvailableLayer", "layerThreePromotionPermitted",
  "outcomeCommitIssued", "guaranteeCreated", "outcomePromiseIssued",
  "callerHashesAcceptedAsAuthority", "structuralConformanceMintsAuthority",
  "directPiiProjected", "hashReferencesMayRemainLinkable", "decisionState",
  "authority", "actionReady", "executable", "boundary", "artifactHash",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
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
  return value;
}

function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
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

function seal(schema, body) {
  return deepFreeze({ ...body, artifactHash: digest(schema, body) });
}

function typedGraphRefs(value) {
  exactObject(value, TYPED_GRAPH_FIELDS, "TYPED_GRAPH_REFS");
  return deepFreeze({
    principalEpochRefHash: hash(value.principalEpochRefHash,
      "PRINCIPAL_EPOCH_REF_HASH"),
    accountableDeploymentRefHash: hash(value.accountableDeploymentRefHash,
      "ACCOUNTABLE_DEPLOYMENT_REF_HASH"),
    runtimeRefHash: hash(value.runtimeRefHash, "RUNTIME_REF_HASH"),
    embodimentRefHash: hash(value.embodimentRefHash,
      "EMBODIMENT_REF_HASH", true),
    delegationRefHash: hash(value.delegationRefHash, "DELEGATION_REF_HASH"),
    episodeRefHash: hash(value.episodeRefHash, "EPISODE_REF_HASH"),
    attemptRefHash: hash(value.attemptRefHash, "ATTEMPT_REF_HASH"),
  });
}

function buildOutcomeOs(input, sourceVerification,
  sourceProgramReplayPerformed) {
  exactObject(input, OUTCOME_OS_INPUT_FIELDS, "OUTCOME_OS_INPUT");
  const formationDeadline = instant(input.formationDeadline,
    "FORMATION_DEADLINE");
  const completionDeadline = instant(input.completionDeadline,
    "COMPLETION_DEADLINE");
  if (Date.parse(completionDeadline) <= Date.parse(formationDeadline)) {
    fail("DEADLINE_ORDER_INVALID");
  }
  const graph = typedGraphRefs(input.typedGraphRefs);
  const body = {
    schema: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS.outcomeOs,
    schemaVersion: "1.0.0",
    recordClass: "AGENT_NEUTRAL_HASH_ONLY_OUTCOME_DEFINITION",
    productLayer:
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs,
    requestIdHash: hash(input.requestIdHash, "REQUEST_ID_HASH"),
    outcomeProgramHash: hash(input.outcomeProgramHash,
      "OUTCOME_PROGRAM_HASH", true),
    outcomeDefinitionHash: hash(input.outcomeDefinitionHash,
      "OUTCOME_DEFINITION_HASH"),
    acceptancePredicateHash: hash(input.acceptancePredicateHash,
      "ACCEPTANCE_PREDICATE_HASH"),
    formationDeadline,
    completionDeadline,
    maximumLossConstraintHash: hash(input.maximumLossConstraintHash,
      "MAXIMUM_LOSS_CONSTRAINT_HASH"),
    typedGraphRefs: graph,
    typedGraphRefHash: digest("outsider/outcome-os-typed-graph-refs/v1", graph),
    sourceVerification,
    sourceProgramReplayPerformed,
    outcomeDefined: true,
    executionRoutesRequired: false,
    recoveryRoutesRequired: false,
    witnessRoutesRequired: false,
    guaranteeCreated: false,
    outcomePromiseIssued: false,
    directPiiProjected: false,
    hashReferencesMayRemainLinkable: true,
    decisionState: "DEFINED_NO_GUARANTEE",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
  };
  return seal(body.schema, body);
}

/** Build Layer 1 from network-safe references only. */
export function prepareOutcomeOsV1(input = {}) {
  return buildOutcomeOs(input, "CALLER_SUPPLIED_HASH_REFERENCES_ONLY", false);
}

/**
 * Compatibility path from the existing strict three-role OutcomeProgram.
 * OutcomeProgram is not a prerequisite for Layer 1; this importer merely lets
 * existing production programs enter the same public product vocabulary.
 */
export function importOutcomeProgramToOutcomeOsV1(input = {}) {
  exactObject(input, PROGRAM_IMPORT_FIELDS, "PROGRAM_IMPORT_INPUT");
  const program = verifyOutcomeProgramV1(input.outcomeProgram);
  return buildOutcomeOs({
    requestIdHash: input.requestIdHash,
    outcomeProgramHash: program.programHash,
    outcomeDefinitionHash: digest(
      "outsider/outcome-os-imported-outcome-definition/v1", program.outcome),
    acceptancePredicateHash: digest(
      "outsider/outcome-os-imported-acceptance-predicate/v1",
      program.outcome.acceptance),
    formationDeadline: program.formationDeadline,
    completionDeadline: program.completionDeadline,
    maximumLossConstraintHash: input.maximumLossConstraintHash,
    typedGraphRefs: input.typedGraphRefs,
  }, "OUTCOME_PROGRAM_V1_SOURCE_REPLAYED", true);
}

function checkedOutcomeOs(record) {
  exactObject(record, OUTCOME_OS_FIELDS, "OUTCOME_OS_ARTIFACT");
  if (record.schema
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS.outcomeOs
    || record.schemaVersion !== "1.0.0"
    || record.recordClass !== "AGENT_NEUTRAL_HASH_ONLY_OUTCOME_DEFINITION"
    || record.productLayer
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs
    || !["CALLER_SUPPLIED_HASH_REFERENCES_ONLY",
      "OUTCOME_PROGRAM_V1_SOURCE_REPLAYED"].includes(record.sourceVerification)
    || record.sourceProgramReplayPerformed
      !== (record.sourceVerification === "OUTCOME_PROGRAM_V1_SOURCE_REPLAYED")
    || record.outcomeDefined !== true || record.executionRoutesRequired !== false
    || record.recoveryRoutesRequired !== false
    || record.witnessRoutesRequired !== false || record.guaranteeCreated !== false
    || record.outcomePromiseIssued !== false
    || record.directPiiProjected !== false
    || record.hashReferencesMayRemainLinkable !== true
    || record.decisionState !== "DEFINED_NO_GUARANTEE"
    || record.authority !== "NONE" || record.actionReady !== false
    || record.executable !== false
    || !same(record.boundary,
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY)) {
    fail("OUTCOME_OS_FIXED_STATE_INVALID");
  }
  hash(record.requestIdHash, "REQUEST_ID_HASH");
  hash(record.outcomeProgramHash, "OUTCOME_PROGRAM_HASH", true);
  hash(record.outcomeDefinitionHash, "OUTCOME_DEFINITION_HASH");
  hash(record.acceptancePredicateHash, "ACCEPTANCE_PREDICATE_HASH");
  hash(record.maximumLossConstraintHash, "MAXIMUM_LOSS_CONSTRAINT_HASH");
  const formationDeadline = instant(record.formationDeadline,
    "FORMATION_DEADLINE");
  const completionDeadline = instant(record.completionDeadline,
    "COMPLETION_DEADLINE");
  if (Date.parse(completionDeadline) <= Date.parse(formationDeadline)) {
    fail("DEADLINE_ORDER_INVALID");
  }
  const graph = typedGraphRefs(record.typedGraphRefs);
  if (record.typedGraphRefHash
      !== digest("outsider/outcome-os-typed-graph-refs/v1", graph)) {
    fail("TYPED_GRAPH_REF_HASH_MISMATCH");
  }
  const body = { ...record };
  delete body.artifactHash;
  if (hash(record.artifactHash, "ARTIFACT_HASH")
      !== digest(record.schema, body)) fail("OUTCOME_OS_HASH_MISMATCH");
  return deepFreeze(JSON.parse(canonicalizeStrict(record)));
}

function normalizeRouteOption(value, observedAt, completionDeadline) {
  exactObject(value, ROUTE_OPTION_FIELDS, "ROUTE_OPTION");
  if (!ROLE_SET.has(value.role)) fail("ROUTE_OPTION_ROLE_INVALID");
  const validFrom = instant(value.validFrom, "ROUTE_OPTION_VALID_FROM");
  const validUntil = instant(value.validUntil, "ROUTE_OPTION_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(validFrom)) {
    fail("ROUTE_OPTION_VALIDITY_EMPTY");
  }
  const reservationRefHash = hash(value.reservationRefHash,
    "ROUTE_OPTION_RESERVATION_REF_HASH", true);
  const reservationLifecycleHeadRefHash = hash(
    value.reservationLifecycleHeadRefHash,
    "ROUTE_OPTION_RESERVATION_LIFECYCLE_HEAD_REF_HASH", true);
  if ((reservationRefHash === null)
      !== (reservationLifecycleHeadRefHash === null)) {
    fail("ROUTE_OPTION_RESERVATION_REFERENCE_PAIR_REQUIRED");
  }
  return deepFreeze({
    optionRefHash: hash(value.optionRefHash, "ROUTE_OPTION_REF_HASH"),
    role: value.role,
    providerRefHash: hash(value.providerRefHash,
      "ROUTE_OPTION_PROVIDER_REF_HASH"),
    controllerRefHash: hash(value.controllerRefHash,
      "ROUTE_OPTION_CONTROLLER_REF_HASH"),
    failureDomainRefHash: hash(value.failureDomainRefHash,
      "ROUTE_OPTION_FAILURE_DOMAIN_REF_HASH"),
    capabilityRefHash: hash(value.capabilityRefHash,
      "ROUTE_OPTION_CAPABILITY_REF_HASH"),
    reservationRefHash,
    reservationLifecycleHeadRefHash,
    serviceWindowRefHash: hash(value.serviceWindowRefHash,
      "ROUTE_OPTION_SERVICE_WINDOW_REF_HASH"),
    validFrom,
    validUntil,
    currentAtObservedAt: Date.parse(validFrom) <= Date.parse(observedAt)
      && Date.parse(observedAt) < Date.parse(validUntil),
    coversOutcomeDeadline:
      Date.parse(validUntil) >= Date.parse(completionDeadline),
    reservationReferencePairPresent: reservationRefHash !== null,
  });
}

function roleCoverage(options, onlyCurrent = false) {
  return deepFreeze(Object.fromEntries(ROLES.map((role) => [role,
    options.filter((option) => option.role === role
      && (!onlyCurrent || option.currentAtObservedAt)).length])));
}

/** Build Layer 2 from one or more typed route options. */
export function prepareFormationRecoveryOptionsV1(input = {}) {
  exactObject(input, FORMATION_INPUT_FIELDS, "FORMATION_INPUT");
  const outcomeOs = checkedOutcomeOs(input.outcomeOs);
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  if (!Array.isArray(input.routeOptions) || input.routeOptions.length < 1
    || input.routeOptions.length > 64) fail("ROUTE_OPTIONS_INVALID");
  const options = input.routeOptions.map((option) => normalizeRouteOption(
    option, observedAt, outcomeOs.completionDeadline)).sort((left, right) =>
    left.optionRefHash.localeCompare(right.optionRefHash));
  if (new Set(options.map((option) => option.optionRefHash)).size
      !== options.length) fail("ROUTE_OPTION_REF_HASH_DUPLICATE");
  const coverage = roleCoverage(options);
  const currentCoverage = roleCoverage(options, true);
  const declaredRecoveryOptionReferenceCurrent = options.some((option) =>
    option.role === "RECOVERY" && option.currentAtObservedAt
      && option.coversOutcomeDeadline);
  const body = {
    schema: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
      .formationRecoveryOptions,
    schemaVersion: "1.0.0",
    recordClass: "AGENT_NEUTRAL_PARTIAL_FORMATION_AND_RECOVERY_PORTFOLIO",
    productLayer: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS
      .formationRecoveryOptions,
    outcomeOs,
    observedAt,
    recoveryTriggerPolicyRefHash: hash(input.recoveryTriggerPolicyRefHash,
      "RECOVERY_TRIGGER_POLICY_REF_HASH"),
    routeOptions: deepFreeze(options),
    optionCount: options.length,
    roleCoverage: coverage,
    currentRoleCoverage: currentCoverage,
    declaredRecoveryOptionReferenceCurrent,
    declaredRecoveryOptionReferenceBasis:
      declaredRecoveryOptionReferenceCurrent
        ? "CALLER_DECLARED_CURRENT_RECOVERY_REFERENCE_COVERS_OUTCOME_DEADLINE"
        : "NO_CALLER_DECLARED_CURRENT_RECOVERY_REFERENCE_COVERS_OUTCOME_DEADLINE",
    allOptionsCurrent: options.every((option) => option.currentAtObservedAt),
    allOptionsCoverOutcomeDeadline:
      options.every((option) => option.coversOutcomeDeadline),
    allReservationReferencePairsPresent:
      options.every((option) => option.reservationReferencePairPresent),
    partialPortfolioPermitted: true,
    externalCapacityEstablished: false,
    recoveryOptionHeld: false,
    layerTwoPromotionPermitted: false,
    attainedServiceProfile:
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs,
    externalVerificationGapCodes: deepFreeze([
      "RECOVERY_OPTION_AUTHORITY_SOURCE_REPLAY_REQUIRED",
      "RECOVERY_OPTION_CAPACITY_LIFECYCLE_SOURCE_REPLAY_REQUIRED",
    ]),
    guaranteeCreated: false,
    outcomePromiseIssued: false,
    directPiiProjected: false,
    hashReferencesMayRemainLinkable: true,
    decisionState: "DECLARED_OPTION_REFERENCES_BOUND_UNVERIFIED_HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
  };
  return seal(body.schema, body);
}

function checkedFormation(record) {
  exactObject(record, FORMATION_FIELDS, "FORMATION_ARTIFACT");
  if (record.schema
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
        .formationRecoveryOptions
    || record.schemaVersion !== "1.0.0"
    || record.recordClass
      !== "AGENT_NEUTRAL_PARTIAL_FORMATION_AND_RECOVERY_PORTFOLIO"
    || record.productLayer
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS
        .formationRecoveryOptions
    || record.partialPortfolioPermitted !== true
    || record.externalCapacityEstablished !== false
    || record.recoveryOptionHeld !== false
    || record.layerTwoPromotionPermitted !== false
    || record.attainedServiceProfile
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs
    || record.guaranteeCreated !== false || record.outcomePromiseIssued !== false
    || record.directPiiProjected !== false
    || record.hashReferencesMayRemainLinkable !== true
    || record.decisionState
      !== "DECLARED_OPTION_REFERENCES_BOUND_UNVERIFIED_HOLD"
    || record.authority !== "NONE" || record.actionReady !== false
    || record.executable !== false
    || !same(record.boundary,
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY)) {
    fail("FORMATION_FIXED_STATE_INVALID");
  }
  const rebuilt = prepareFormationRecoveryOptionsV1({
    outcomeOs: checkedOutcomeOs(record.outcomeOs),
    observedAt: record.observedAt,
    recoveryTriggerPolicyRefHash: record.recoveryTriggerPolicyRefHash,
    routeOptions: record.routeOptions.map((option) => {
      exactObject(option, NORMALIZED_ROUTE_OPTION_FIELDS,
        "NORMALIZED_ROUTE_OPTION");
      return Object.fromEntries(ROUTE_OPTION_FIELDS.map((field) =>
        [field, option[field]]));
    }),
  });
  if (!same(rebuilt, record)) fail("FORMATION_HASH_OR_CONTENT_INVALID");
  return rebuilt;
}

function nullableSelection(value, code) {
  return hash(value, code, true);
}

function selectedOption(options, refHash, role, observedAt, gaps) {
  if (refHash === null) {
    gaps.push(`${role}_OPTION_SELECTION_MISSING`);
    return null;
  }
  const matches = options.filter((option) =>
    option.optionRefHash === refHash && option.role === role);
  if (matches.length !== 1) {
    gaps.push(`${role}_OPTION_SELECTION_NOT_BOUND_TO_ROLE`);
    return null;
  }
  const option = matches[0];
  if (!(Date.parse(option.validFrom) <= Date.parse(observedAt)
      && Date.parse(observedAt) < Date.parse(option.validUntil))) {
    gaps.push(`${role}_OPTION_NOT_CURRENT`);
  }
  if (!option.coversOutcomeDeadline) {
    gaps.push(`${role}_OPTION_DOES_NOT_COVER_OUTCOME_DEADLINE`);
  }
  if (!option.reservationReferencePairPresent) {
    gaps.push(`${role}_RESERVATION_REFERENCE_PAIR_MISSING`);
  }
  return option;
}

function normalizedCommitReferences(value, gaps) {
  exactObject(value, COMMIT_REFERENCE_FIELDS, "COMMIT_REFERENCES");
  return deepFreeze(Object.fromEntries(COMMIT_REFERENCE_FIELDS.map((field) => {
    const normalized = hash(value[field], field.toUpperCase(), true);
    if (normalized === null) gaps.push(`${field.replace(/RefHash$/u, "")
      .replace(/([a-z])([A-Z])/gu, "$1_$2").toUpperCase()}_MISSING`);
    return [field, normalized];
  })));
}

/**
 * Classify Layer-3 readiness without issuing COMMIT. Hash presence is never
 * accepted as proof; source replay and trusted admissions remain external.
 */
export function classifyOutcomeCommitReadinessV1(input = {}) {
  exactObject(input, COMMIT_INPUT_FIELDS, "COMMIT_INPUT");
  const formation = checkedFormation(input.formationRecoveryOptions);
  const observedAt = instant(input.observedAt, "COMMIT_OBSERVED_AT");
  exactObject(input.selectedOptions, SELECTION_FIELDS, "SELECTED_OPTIONS");
  const selectedOptions = deepFreeze({
    primaryOptionRefHash: nullableSelection(
      input.selectedOptions.primaryOptionRefHash,
      "PRIMARY_OPTION_REF_HASH"),
    recoveryOptionRefHash: nullableSelection(
      input.selectedOptions.recoveryOptionRefHash,
      "RECOVERY_OPTION_REF_HASH"),
    independentWitnessOptionRefHash: nullableSelection(
      input.selectedOptions.independentWitnessOptionRefHash,
      "INDEPENDENT_WITNESS_OPTION_REF_HASH"),
  });
  const gaps = [];
  if (formation.outcomeOs.outcomeProgramHash === null) {
    gaps.push("OUTCOME_PROGRAM_HASH_MISSING");
  }
  if (Date.parse(observedAt) < Date.parse(formation.observedAt)) {
    gaps.push("CLASSIFICATION_TIME_BEFORE_PORTFOLIO_OBSERVATION");
  }
  const primary = selectedOption(formation.routeOptions,
    selectedOptions.primaryOptionRefHash, "PRIMARY", observedAt, gaps);
  const recovery = selectedOption(formation.routeOptions,
    selectedOptions.recoveryOptionRefHash, "RECOVERY", observedAt, gaps);
  const witness = selectedOption(formation.routeOptions,
    selectedOptions.independentWitnessOptionRefHash,
    "INDEPENDENT_WITNESS", observedAt, gaps);
  if (primary && recovery
    && (primary.providerRefHash === recovery.providerRefHash
      || primary.controllerRefHash === recovery.controllerRefHash
      || primary.failureDomainRefHash === recovery.failureDomainRefHash)) {
    gaps.push("PRIMARY_RECOVERY_FAILURE_DOMAIN_SEPARATION_UNESTABLISHED");
  }
  if (witness && [primary, recovery].some((option) => option
    && (witness.providerRefHash === option.providerRefHash
      || witness.controllerRefHash === option.controllerRefHash
      || witness.failureDomainRefHash === option.failureDomainRefHash))) {
    gaps.push("INDEPENDENT_WITNESS_FAILURE_DOMAIN_SEPARATION_UNESTABLISHED");
  }
  if (Date.parse(observedAt)
      >= Date.parse(formation.outcomeOs.formationDeadline)) {
    gaps.push("FORMATION_DEADLINE_REACHED");
  }
  const commitReferences = normalizedCommitReferences(
    input.commitReferences, gaps);
  const prerequisiteGapCodes = deepFreeze([...new Set(gaps)].sort());
  const referenceSlotsComplete = prerequisiteGapCodes.length === 0;
  const externalVerificationGapCodes = deepFreeze([
    "ADJUDICATION_AUTHORITY_SOURCE_REPLAY_REQUIRED",
    "AUTHORITY_AND_RIGHTS_SOURCE_REPLAY_REQUIRED",
    "CAPITAL_AND_CUSTODY_SOURCE_REPLAY_REQUIRED",
    "INDEPENDENT_WITNESS_CONTROL_AND_CAPACITY_SOURCE_REPLAY_REQUIRED",
    "OBLIGATION_ACCEPTANCE_SOURCE_REPLAY_REQUIRED",
    "PRIMARY_AND_RECOVERY_CAPACITY_LIFECYCLE_SOURCE_REPLAY_REQUIRED",
  ]);
  const body = {
    schema: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
      .outcomeCommitReadiness,
    schemaVersion: "1.0.0",
    recordClass:
      "HASH_ONLY_OUTCOME_COMMIT_READINESS_NON_AUTHORITY_CLASSIFICATION",
    productLayer: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS
      .outcomeCommit,
    formationRecoveryOptions: formation,
    observedAt,
    selectedOptions,
    commitReferences,
    selectedRoleBindings: deepFreeze({
      PRIMARY: primary?.optionRefHash ?? null,
      RECOVERY: recovery?.optionRefHash ?? null,
      INDEPENDENT_WITNESS: witness?.optionRefHash ?? null,
    }),
    referenceSlotsComplete,
    prerequisiteGapCodes,
    externalVerificationGapCodes,
    readinessState: referenceSlotsComplete
      ? "REFERENCE_SLOTS_COMPLETE_EXTERNAL_SOURCE_REPLAY_REQUIRED_HOLD"
      : "COMMIT_PREREQUISITES_INCOMPLETE_HOLD",
    highestAvailableLayer: formation.attainedServiceProfile,
    layerThreePromotionPermitted: false,
    outcomeCommitIssued: false,
    guaranteeCreated: false,
    outcomePromiseIssued: false,
    callerHashesAcceptedAsAuthority: false,
    structuralConformanceMintsAuthority: false,
    directPiiProjected: false,
    hashReferencesMayRemainLinkable: true,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY,
  };
  return seal(body.schema, body);
}

function checkedCommitClassification(record) {
  exactObject(record, COMMIT_FIELDS, "COMMIT_CLASSIFICATION_ARTIFACT");
  if (record.schema
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
        .outcomeCommitReadiness
    || record.schemaVersion !== "1.0.0"
    || record.recordClass
      !== "HASH_ONLY_OUTCOME_COMMIT_READINESS_NON_AUTHORITY_CLASSIFICATION"
    || record.productLayer
      !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeCommit
    || record.layerThreePromotionPermitted !== false
    || record.outcomeCommitIssued !== false || record.guaranteeCreated !== false
    || record.outcomePromiseIssued !== false
    || record.callerHashesAcceptedAsAuthority !== false
    || record.structuralConformanceMintsAuthority !== false
    || record.directPiiProjected !== false
    || record.hashReferencesMayRemainLinkable !== true
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.actionReady !== false || record.executable !== false
    || !same(record.boundary,
      OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_BOUNDARY)) {
    fail("COMMIT_CLASSIFICATION_FIXED_STATE_INVALID");
  }
  const rebuilt = classifyOutcomeCommitReadinessV1({
    formationRecoveryOptions: checkedFormation(record.formationRecoveryOptions),
    observedAt: record.observedAt,
    selectedOptions: record.selectedOptions,
    commitReferences: record.commitReferences,
  });
  if (!same(rebuilt, record)) {
    fail("COMMIT_CLASSIFICATION_HASH_OR_CONTENT_INVALID");
  }
  return rebuilt;
}

/** Verify one public artifact without turning its hashes into authority. */
export function verifyThreeLayerOutcomeProductArtifactV1(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)
    || Buffer.isBuffer(record) || isProxy(record)) fail("ARTIFACT_INVALID");
  if (record.schema
      === OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS.outcomeOs) {
    return checkedOutcomeOs(record);
  }
  if (record.schema
      === OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
        .formationRecoveryOptions) return checkedFormation(record);
  if (record.schema
      === OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_SCHEMAS
        .outcomeCommitReadiness) return checkedCommitClassification(record);
  fail("ARTIFACT_SCHEMA_UNSUPPORTED");
}
