/*
 * Pure, immutable, HOLD-only outcome-tender compiler v1.
 *
 * The caller supplies an already-normalized, machine-readable outcome.  This
 * module does not invoke a model, discover or contact providers, perform I/O,
 * price work, reserve capacity, execute, settle, or establish authority.  It
 * creates one public-safe-by-shape tender whose authorization fields are only
 * content-addressed references to existing Outsider contracts.
 *
 * No free-form string is accepted.  The public projection is restricted to
 * opaque aliases, SHA-256 references, canonical UTC timestamps, bounded
 * numbers, booleans, and controlled public taxonomy codes.  Private subjects,
 * locations, authorization material, and policy contents remain behind
 * caller-provided references.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIs = Object.is;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringSplit = Function.prototype.call.bind(String.prototype.split);
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TENDER_ID = /^tender_[a-f0-9]{32}$/u;
const CONDITION_ID = /^condition_[a-f0-9]{32}$/u;
const RESOURCE_ID = /^resource_[a-f0-9]{32}$/u;
const EVIDENCE_ID = /^evidence_[a-f0-9]{32}$/u;
const RECOVERY_ID = /^recovery_[a-f0-9]{32}$/u;
const PUBLIC_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const FORBIDDEN_PUBLIC_CODE = new SetConstructor([
  "ADDRESS", "API_KEY", "AUTH_TOKEN", "BIRTHDATE", "COOKIE", "CREDENTIAL",
  "CVV", "DOB", "EMAIL", "LOGIN", "PASSWORD", "PHONE", "PRIVATE_KEY",
  "SECRET", "SESSION", "SSN", "TOKEN",
]);

export const OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS = ObjectFreeze({
  tender: "outsider/outcome-formation-public-authorization-scoped-tender/v1",
  typedGraph: "outsider/autonomous-work-order-typed-graph/v1",
  exactOutcome: "outsider/outcome-formation-exact-outcome/v1",
  resourceRequirements: "outsider/outcome-formation-resource-requirements/v1",
  evidenceRequirements: "outsider/outcome-formation-evidence-requirements/v1",
  recoveryRequirements: "outsider/outcome-formation-recovery-requirements/v1",
  verification: "outsider/outcome-formation-public-tender-verification/v1",
});

export const OUTSIDER_OUTCOME_TENDER_V1_LIMITS = ObjectFreeze({
  maximumFormationWindowMs: 24 * 60 * 60 * 1_000,
  maximumOutcomeWindowMs: 365 * 24 * 60 * 60 * 1_000,
  maximumConditions: 64,
  maximumResourceRequirements: 64,
  maximumEvidenceRequirements: 64,
  maximumRecoveryRequirements: 32,
  maximumAffectedChannels: 256,
  maximumRecoveryAttemptsPerRequirement: 16,
});

export const OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY = deepFreeze({
  position: "OUTCOME_FORMATION_PUBLIC_AUTHORIZATION_SCOPED_TENDER_HOLD_ONLY",
  normalizedMachineReadableInputRequired: true,
  freeFormIntentAccepted: false,
  modelOrLlmInvocationPerformed: false,
  filesystemIoPerformed: false,
  networkIoPerformed: false,
  providerDiscoveryPerformed: false,
  providerContactPerformed: false,
  publicProjectionSafeByClosedShape: true,
  freeFormTextIncluded: false,
  rawPrivateSourceIncluded: false,
  piiIncluded: false,
  secretsIncluded: false,
  credentialsIncluded: false,
  contactTargetsIncluded: false,
  localPathsIncluded: false,
  urlsIncluded: false,
  paymentInstructionsIncluded: false,
  providerIdentityIncluded: false,
  opaqueReferencePreimagePrivacyVerified: false,
  opaqueReferencesRequireDomainSeparatedHighEntropyPreimages: true,
  existingTypedGraphReferencesPreserved: true,
  createsIdentity: false,
  createsDelegation: false,
  createsEpisode: false,
  createsAttempt: false,
  authorizationReferencesAreCallerPinnedOnly: true,
  authorizationSourceReplayPerformed: false,
  authorizationEstablished: false,
  callerAssertionsAcceptedAsAuthority: false,
  publicPublicationRightsEstablished: false,
  sendableTenderEstablished: false,
  formationStarted: false,
  capacityReserved: false,
  pricePresent: false,
  pricingPermitted: false,
  quoteCreated: false,
  guaranteeCreated: false,
  executionPermitted: false,
  settlementPermitted: false,
  custodyEstablished: false,
  moneyMovementEnabled: false,
  externalOutcomeEstablished: false,
  vendorDoneAcceptedAsOutcomeTruth: false,
  vendorNativeEvidenceAcceptedAsIndependentOutcomeTruth: false,
  zeroInternalOpsRequired: true,
  internalHumanFallbackPermitted: false,
  unsupportedOrUnformedDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  enabledCapabilityCount: 0,
  provenAuthorityCount: 0,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
});

const VALUE_KINDS = ObjectFreeze(["BOOLEAN", "INTEGER", "STATE_CODE"]);
const COMPARATORS = ObjectFreeze([
  "EQUAL", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL",
]);
const EVIDENCE_SOURCE_CONTROLS = ObjectFreeze([
  "INDEPENDENT_OF_PROVIDER",
  "RESOURCE_OWNER_CONTROLLED",
  "VENDOR_NATIVE_AUXILIARY_ONLY",
]);
const OBSERVATION_MODES = ObjectFreeze(["AT_COMPLETION", "LONGITUDINAL"]);
const RECOVERY_ROUTE_POLICIES = ObjectFreeze([
  "ALTERNATE_RESOURCE_REQUIRED", "REPERFORM_ALLOWED",
]);

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_OUTCOME_TENDER_V1_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
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
  if (budget.nodes > 20_000) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > 100_000) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
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

function denseArray(value, code, minimum, maximum) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < minimum || value.length > maximum) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  const instance = createHash("sha256");
  HashUpdate(instance, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(instance, "hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function opaqueId(value, pattern, code) {
  if (typeof value !== "string" || !RegExpTest(pattern, value)) fail(`${code}_INVALID`);
  return value;
}

function publicCode(value, code) {
  if (typeof value !== "string" || !RegExpTest(PUBLIC_CODE, value)) {
    fail(`${code}_INVALID`);
  }
  if (SetHas(FORBIDDEN_PUBLIC_CODE, value)) fail(`${code}_PRIVATE_SEMANTIC_FORBIDDEN`);
  const segments = StringSplit(value, "_");
  for (let index = 0; index < segments.length; index += 1) {
    if (SetHas(FORBIDDEN_PUBLIC_CODE, segments[index])) {
      fail(`${code}_PRIVATE_SEMANTIC_FORBIDDEN`);
    }
  }
  return value;
}

function timestamp(value, code) {
  const parsed = typeof value === "string" ? DateParse(value) : NaN;
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || !NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || ObjectIs(value, -0)
    || value < minimum || value > maximum) fail(`${code}_INVALID`);
  return value;
}

function contains(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function oneOf(value, values, code) {
  if (!contains(values, value)) fail(`${code}_INVALID`);
  return value;
}

function normalizeLineage(value) {
  exactObject(value, ["revision", "predecessorTenderHash", "supersedesTenderHash"],
    "LINEAGE");
  const revision = safeInteger(value.revision, 0, Number.MAX_SAFE_INTEGER,
    "LINEAGE_REVISION");
  const predecessorTenderHash = nullableHash(value.predecessorTenderHash,
    "PREDECESSOR_TENDER_HASH");
  const supersedesTenderHash = nullableHash(value.supersedesTenderHash,
    "SUPERSEDES_TENDER_HASH");
  if (revision === 0) {
    if (predecessorTenderHash !== null || supersedesTenderHash !== null) {
      fail("GENESIS_LINEAGE_MUST_NOT_REFERENCE_PREDECESSOR");
    }
  } else if (predecessorTenderHash === null || supersedesTenderHash === null
    || predecessorTenderHash !== supersedesTenderHash) {
    fail("DESCENDANT_REQUIRES_EXACT_PREDECESSOR_SUPERSESSION_LINK");
  }
  return {
    revision,
    predecessorTenderHash,
    supersedesTenderHash,
    appendOnlyDeclaration: true,
    predecessorSourceReplayVerified: false,
    inPlaceMutationAllowed: false,
  };
}

function normalizePrincipalEpoch(value) {
  exactObject(value, ["principalRefHash", "epochRefHash",
    "principalEpochProjectionHash"], "PRINCIPAL_EPOCH");
  return {
    principalRefHash: hash(value.principalRefHash, "PRINCIPAL_REF_HASH"),
    epochRefHash: hash(value.epochRefHash, "PRINCIPAL_EPOCH_REF_HASH"),
    principalEpochProjectionHash: hash(value.principalEpochProjectionHash,
      "PRINCIPAL_EPOCH_PROJECTION_HASH"),
  };
}

function normalizeAccountableDeployment(value) {
  exactObject(value, ["deploymentLineageRefHash", "deploymentRevisionHash",
    "accountableDeploymentSubjectHash"], "ACCOUNTABLE_DEPLOYMENT");
  return {
    deploymentLineageRefHash: hash(value.deploymentLineageRefHash,
      "DEPLOYMENT_LINEAGE_REF_HASH"),
    deploymentRevisionHash: hash(value.deploymentRevisionHash,
      "DEPLOYMENT_REVISION_HASH"),
    accountableDeploymentSubjectHash: hash(value.accountableDeploymentSubjectHash,
      "ACCOUNTABLE_DEPLOYMENT_SUBJECT_HASH"),
  };
}

function normalizeRuntime(value) {
  exactObject(value, ["runtimeInstanceRefHash", "runtimeInstanceHash"], "RUNTIME");
  return {
    runtimeInstanceRefHash: hash(value.runtimeInstanceRefHash,
      "RUNTIME_INSTANCE_REF_HASH"),
    runtimeInstanceHash: hash(value.runtimeInstanceHash, "RUNTIME_INSTANCE_HASH"),
  };
}

function normalizeEmbodiment(value) {
  exactObject(value, ["present", "deviceLineageRefHash", "embodimentRevisionHash"],
    "EMBODIMENT");
  if (typeof value.present !== "boolean") fail("EMBODIMENT_PRESENT_INVALID");
  const deviceLineageRefHash = nullableHash(value.deviceLineageRefHash,
    "DEVICE_LINEAGE_REF_HASH");
  const embodimentRevisionHash = nullableHash(value.embodimentRevisionHash,
    "EMBODIMENT_REVISION_HASH");
  if (value.present !== (deviceLineageRefHash !== null)
    || value.present !== (embodimentRevisionHash !== null)) {
    fail("EMBODIMENT_REFERENCE_STATE_INVALID");
  }
  return { present: value.present, deviceLineageRefHash, embodimentRevisionHash };
}

function normalizeDelegation(value) {
  exactObject(value, ["delegationEvidenceRefHash", "delegationEdgeHash"],
    "DELEGATION");
  return {
    delegationEvidenceRefHash: hash(value.delegationEvidenceRefHash,
      "DELEGATION_EVIDENCE_REF_HASH"),
    delegationEdgeHash: hash(value.delegationEdgeHash, "DELEGATION_EDGE_HASH"),
  };
}

function normalizeEpisode(value) {
  exactObject(value, ["episodeHash", "networkCompleteEpisodeJoinHash"], "EPISODE");
  return {
    episodeHash: hash(value.episodeHash, "EPISODE_HASH"),
    networkCompleteEpisodeJoinHash: hash(value.networkCompleteEpisodeJoinHash,
      "NETWORK_COMPLETE_EPISODE_JOIN_HASH"),
  };
}

function normalizeAttempt(value) {
  exactObject(value, ["attemptHash", "attemptActorSubjectHash"], "ATTEMPT");
  return {
    attemptHash: hash(value.attemptHash, "ATTEMPT_HASH"),
    attemptActorSubjectHash: hash(value.attemptActorSubjectHash,
      "ATTEMPT_ACTOR_SUBJECT_HASH"),
  };
}

function normalizeTypedGraph(value) {
  exactObject(value, ["principalEpoch", "accountableDeployment", "runtime",
    "embodiment", "delegation", "episode", "attempt"], "TYPED_GRAPH");
  const body = {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.typedGraph,
    graphPath:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    principalEpoch: normalizePrincipalEpoch(value.principalEpoch),
    accountableDeployment: normalizeAccountableDeployment(value.accountableDeployment),
    runtime: normalizeRuntime(value.runtime),
    embodiment: normalizeEmbodiment(value.embodiment),
    delegation: normalizeDelegation(value.delegation),
    episode: normalizeEpisode(value.episode),
    attempt: normalizeAttempt(value.attempt),
    ipAddressAcceptedAsIdentity: false,
    deviceAddressAcceptedAsIdentity: false,
    baseModelAcceptedAsIdentity: false,
    globalScoreCreated: false,
  };
  return {
    ...body,
    typedGraphHash: digest(OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.typedGraph, body),
  };
}

function normalizeAuthorization(value, graph) {
  exactObject(value, ["actorIdentityEnvelopeHash", "delegationEvidenceRefHash",
    "delegationEdgeHash", "authorityScopeRefHash",
    "resourceOwnerAuthorizationRefHash", "rightsPrivacyPolicyRefHash"],
  "AUTHORIZATION_BINDING");
  const result = {
    actorIdentityEnvelopeHash: hash(value.actorIdentityEnvelopeHash,
      "ACTOR_IDENTITY_ENVELOPE_HASH"),
    delegationEvidenceRefHash: hash(value.delegationEvidenceRefHash,
      "AUTHORIZATION_DELEGATION_EVIDENCE_REF_HASH"),
    delegationEdgeHash: hash(value.delegationEdgeHash,
      "AUTHORIZATION_DELEGATION_EDGE_HASH"),
    authorityScopeRefHash: hash(value.authorityScopeRefHash,
      "AUTHORITY_SCOPE_REF_HASH"),
    resourceOwnerAuthorizationRefHash: hash(value.resourceOwnerAuthorizationRefHash,
      "RESOURCE_OWNER_AUTHORIZATION_REF_HASH"),
    rightsPrivacyPolicyRefHash: hash(value.rightsPrivacyPolicyRefHash,
      "RIGHTS_PRIVACY_POLICY_REF_HASH"),
  };
  if (result.delegationEvidenceRefHash
      !== graph.delegation.delegationEvidenceRefHash
    || result.delegationEdgeHash !== graph.delegation.delegationEdgeHash) {
    fail("AUTHORIZATION_DELEGATION_TYPED_GRAPH_MISMATCH");
  }
  return {
    ...result,
    exactDelegationReferencesMatchTypedGraph: true,
    referencesOnly: true,
    sourceReplayPerformedByThisCompiler: false,
    authorityEstablished: false,
    callerAssertionsAcceptedAsAuthority: false,
  };
}

function normalizeTarget(value, comparator) {
  exactObject(value, ["valueKind", "booleanValue", "integerValue", "stateCode",
    "unitCode"], "OUTCOME_TARGET");
  const valueKind = oneOf(value.valueKind, VALUE_KINDS, "OUTCOME_TARGET_VALUE_KIND");
  let booleanValue = null;
  let integerValue = null;
  let stateCode = null;
  let unitCode = null;
  if (valueKind === "BOOLEAN") {
    if (typeof value.booleanValue !== "boolean" || value.integerValue !== null
      || value.stateCode !== null || value.unitCode !== null
      || comparator !== "EQUAL") fail("BOOLEAN_TARGET_INVALID");
    booleanValue = value.booleanValue;
  } else if (valueKind === "INTEGER") {
    if (!NumberIsSafeInteger(value.integerValue) || ObjectIs(value.integerValue, -0)
      || value.booleanValue !== null || value.stateCode !== null
      || value.unitCode === null) fail("INTEGER_TARGET_INVALID");
    integerValue = value.integerValue;
    unitCode = publicCode(value.unitCode, "OUTCOME_TARGET_UNIT_CODE");
  } else {
    if (value.booleanValue !== null || value.integerValue !== null
      || value.stateCode === null || value.unitCode !== null
      || comparator !== "EQUAL") fail("STATE_CODE_TARGET_INVALID");
    stateCode = publicCode(value.stateCode, "OUTCOME_TARGET_STATE_CODE");
  }
  return { valueKind, booleanValue, integerValue, stateCode, unitCode };
}

function normalizeCondition(value, maximumWindowMs) {
  exactObject(value, ["conditionId", "metricCode", "comparator", "target",
    "observationWindowMs", "conditionRefHash", "mandatory"],
  "OUTCOME_CONDITION");
  const comparator = oneOf(value.comparator, COMPARATORS,
    "OUTCOME_CONDITION_COMPARATOR");
  if (value.mandatory !== true) fail("OUTCOME_CONDITION_MUST_BE_MANDATORY");
  return {
    conditionId: opaqueId(value.conditionId, CONDITION_ID, "CONDITION_ID"),
    metricCode: publicCode(value.metricCode, "OUTCOME_METRIC_CODE"),
    comparator,
    target: normalizeTarget(value.target, comparator),
    observationWindowMs: safeInteger(value.observationWindowMs, 0,
      maximumWindowMs, "OUTCOME_OBSERVATION_WINDOW_MS"),
    conditionRefHash: hash(value.conditionRefHash, "OUTCOME_CONDITION_REF_HASH"),
    mandatory: true,
  };
}

function sortedUniqueRows(value, idField, code) {
  ArraySort(value, (left, right) => (
    left[idField] < right[idField] ? -1 : left[idField] > right[idField] ? 1 : 0
  ));
  for (let index = 1; index < value.length; index += 1) {
    if (value[index][idField] === value[index - 1][idField]) fail(`${code}_DUPLICATE`);
  }
  return value;
}

function normalizeExactOutcome(value, compiledAtMs) {
  exactObject(value, ["outcomeKindCode", "outcomeSpecRefHash", "subjectRefHash",
    "acceptanceCriteriaRefHash", "conditions", "deadline"], "EXACT_OUTCOME");
  const deadline = timestamp(value.deadline, "OUTCOME_DEADLINE");
  const deadlineMs = DateParse(deadline);
  if (deadlineMs <= compiledAtMs
    || deadlineMs - compiledAtMs > OUTSIDER_OUTCOME_TENDER_V1_LIMITS
      .maximumOutcomeWindowMs) fail("OUTCOME_DEADLINE_WINDOW_INVALID");
  denseArray(value.conditions, "OUTCOME_CONDITIONS", 1,
    OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumConditions);
  const conditions = [];
  const maximumWindowMs = deadlineMs - compiledAtMs;
  for (let index = 0; index < value.conditions.length; index += 1) {
    append(conditions, normalizeCondition(value.conditions[index], maximumWindowMs));
  }
  sortedUniqueRows(conditions, "conditionId", "OUTCOME_CONDITION_ID");
  const body = {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.exactOutcome,
    outcomeKindCode: publicCode(value.outcomeKindCode, "OUTCOME_KIND_CODE"),
    outcomeSpecRefHash: hash(value.outcomeSpecRefHash, "OUTCOME_SPEC_REF_HASH"),
    subjectRefHash: hash(value.subjectRefHash, "OUTCOME_SUBJECT_REF_HASH"),
    acceptanceCriteriaRefHash: hash(value.acceptanceCriteriaRefHash,
      "ACCEPTANCE_CRITERIA_REF_HASH"),
    conditions,
    deadline,
    exactNormalizedConditionsIncluded: true,
    freeFormOutcomeTextIncluded: false,
  };
  return {
    ...body,
    exactOutcomeHash: digest(OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.exactOutcome, body),
  };
}

function normalizeResourceRequirements(value, formationDeadlineMs, outcomeDeadlineMs) {
  denseArray(value, "RESOURCE_REQUIREMENTS", 1,
    OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumResourceRequirements);
  const items = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["resourceRequirementId", "resourceClassCode",
      "capabilityRefHash", "quantity", "unitCode", "regionRefHash", "requiredBy",
      "mandatory"], "RESOURCE_REQUIREMENT");
    const requiredBy = timestamp(row.requiredBy, "RESOURCE_REQUIRED_BY");
    const requiredByMs = DateParse(requiredBy);
    if (requiredByMs < formationDeadlineMs || requiredByMs > outcomeDeadlineMs) {
      fail("RESOURCE_REQUIRED_BY_OUTSIDE_FORMATION_OUTCOME_WINDOW");
    }
    if (row.mandatory !== true) fail("RESOURCE_REQUIREMENT_MUST_BE_MANDATORY");
    append(items, {
      resourceRequirementId: opaqueId(row.resourceRequirementId, RESOURCE_ID,
        "RESOURCE_REQUIREMENT_ID"),
      resourceClassCode: publicCode(row.resourceClassCode, "RESOURCE_CLASS_CODE"),
      capabilityRefHash: hash(row.capabilityRefHash, "RESOURCE_CAPABILITY_REF_HASH"),
      quantity: safeInteger(row.quantity, 1, 1_000_000, "RESOURCE_QUANTITY"),
      unitCode: publicCode(row.unitCode, "RESOURCE_UNIT_CODE"),
      regionRefHash: hash(row.regionRefHash, "RESOURCE_REGION_REF_HASH"),
      requiredBy,
      mandatory: true,
    });
  }
  sortedUniqueRows(items, "resourceRequirementId", "RESOURCE_REQUIREMENT_ID");
  const body = {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.resourceRequirements,
    items,
    allRequirementsMandatory: true,
    providerIdentitiesIncluded: false,
    providerContactTargetsIncluded: false,
  };
  return {
    ...body,
    requirementSetHash: digest(
      OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.resourceRequirements, body),
  };
}

function normalizeEvidenceRequirements(value, formationDeadlineMs, outcomeDeadlineMs) {
  denseArray(value, "EVIDENCE_REQUIREMENTS", 1,
    OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumEvidenceRequirements);
  const items = [];
  let mandatoryIndependentCount = 0;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["evidenceRequirementId", "evidenceClassCode",
      "evidenceRequirementRefHash", "sourceControl", "observationMode", "dueBy",
      "mandatory"], "EVIDENCE_REQUIREMENT");
    const sourceControl = oneOf(row.sourceControl, EVIDENCE_SOURCE_CONTROLS,
      "EVIDENCE_SOURCE_CONTROL");
    if (typeof row.mandatory !== "boolean") fail("EVIDENCE_MANDATORY_INVALID");
    if (sourceControl === "VENDOR_NATIVE_AUXILIARY_ONLY" && row.mandatory !== false) {
      fail("VENDOR_NATIVE_EVIDENCE_CANNOT_BE_MANDATORY_OUTCOME_TRUTH");
    }
    if (sourceControl === "INDEPENDENT_OF_PROVIDER" && row.mandatory === true) {
      mandatoryIndependentCount += 1;
    }
    const dueBy = timestamp(row.dueBy, "EVIDENCE_DUE_BY");
    const dueByMs = DateParse(dueBy);
    if (dueByMs < formationDeadlineMs || dueByMs > outcomeDeadlineMs) {
      fail("EVIDENCE_DUE_BY_OUTSIDE_FORMATION_OUTCOME_WINDOW");
    }
    append(items, {
      evidenceRequirementId: opaqueId(row.evidenceRequirementId, EVIDENCE_ID,
        "EVIDENCE_REQUIREMENT_ID"),
      evidenceClassCode: publicCode(row.evidenceClassCode, "EVIDENCE_CLASS_CODE"),
      evidenceRequirementRefHash: hash(row.evidenceRequirementRefHash,
        "EVIDENCE_REQUIREMENT_REF_HASH"),
      sourceControl,
      observationMode: oneOf(row.observationMode, OBSERVATION_MODES,
        "EVIDENCE_OBSERVATION_MODE"),
      dueBy,
      mandatory: row.mandatory,
      requiredAsIndependentOutcomeEvidence:
        sourceControl === "INDEPENDENT_OF_PROVIDER" && row.mandatory === true,
      evidenceObserved: false,
      acceptedAsAuthority: false,
      acceptedAsIndependentOutcomeTruth: false,
    });
  }
  if (mandatoryIndependentCount < 1) {
    fail("MANDATORY_INDEPENDENT_OUTCOME_EVIDENCE_REQUIRED");
  }
  sortedUniqueRows(items, "evidenceRequirementId", "EVIDENCE_REQUIREMENT_ID");
  const body = {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.evidenceRequirements,
    items,
    mandatoryIndependentRequirementCount: mandatoryIndependentCount,
    providerDoneAcceptedAsOutcomeTruth: false,
    vendorNativeEvidenceAcceptedAsIndependentOutcomeTruth: false,
  };
  return {
    ...body,
    requirementSetHash: digest(
      OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.evidenceRequirements, body),
  };
}

function normalizeRecoveryRequirements(value, evidence, formationDeadlineMs,
  outcomeDeadlineMs) {
  denseArray(value, "RECOVERY_REQUIREMENTS", 1,
    OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumRecoveryRequirements);
  const independentEvidenceIds = new SetConstructor();
  for (let index = 0; index < evidence.items.length; index += 1) {
    if (evidence.items[index].requiredAsIndependentOutcomeEvidence === true) {
      SetAdd(independentEvidenceIds, evidence.items[index].evidenceRequirementId);
    }
  }
  const items = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["recoveryRequirementId", "triggerRefHash",
      "recoveryOutcomeRefHash", "resourceClassCode", "maximumAttempts",
      "completionDeadline", "recoveryEvidenceRequirementId", "routePolicy",
      "mandatory"], "RECOVERY_REQUIREMENT");
    if (row.mandatory !== true) fail("RECOVERY_REQUIREMENT_MUST_BE_MANDATORY");
    const completionDeadline = timestamp(row.completionDeadline,
      "RECOVERY_COMPLETION_DEADLINE");
    const completionDeadlineMs = DateParse(completionDeadline);
    if (completionDeadlineMs < formationDeadlineMs
      || completionDeadlineMs > outcomeDeadlineMs) {
      fail("RECOVERY_DEADLINE_OUTSIDE_FORMATION_OUTCOME_WINDOW");
    }
    const recoveryEvidenceRequirementId = opaqueId(row.recoveryEvidenceRequirementId,
      EVIDENCE_ID, "RECOVERY_EVIDENCE_REQUIREMENT_ID");
    if (!SetHas(independentEvidenceIds, recoveryEvidenceRequirementId)) {
      fail("RECOVERY_REQUIRES_MANDATORY_INDEPENDENT_EVIDENCE");
    }
    append(items, {
      recoveryRequirementId: opaqueId(row.recoveryRequirementId, RECOVERY_ID,
        "RECOVERY_REQUIREMENT_ID"),
      triggerRefHash: hash(row.triggerRefHash, "RECOVERY_TRIGGER_REF_HASH"),
      recoveryOutcomeRefHash: hash(row.recoveryOutcomeRefHash,
        "RECOVERY_OUTCOME_REF_HASH"),
      resourceClassCode: publicCode(row.resourceClassCode,
        "RECOVERY_RESOURCE_CLASS_CODE"),
      maximumAttempts: safeInteger(row.maximumAttempts, 1,
        OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumRecoveryAttemptsPerRequirement,
        "RECOVERY_MAXIMUM_ATTEMPTS"),
      completionDeadline,
      recoveryEvidenceRequirementId,
      routePolicy: oneOf(row.routePolicy, RECOVERY_ROUTE_POLICIES,
        "RECOVERY_ROUTE_POLICY"),
      mandatory: true,
      internalManualRecoveryAllowed: false,
    });
  }
  sortedUniqueRows(items, "recoveryRequirementId", "RECOVERY_REQUIREMENT_ID");
  const body = {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.recoveryRequirements,
    items,
    allRequirementsMandatory: true,
    internalManualRecoveryAllowed: false,
    exhaustedDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  };
  return {
    ...body,
    requirementSetHash: digest(
      OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.recoveryRequirements, body),
  };
}

function normalizeHashSet(value, code, maximum) {
  denseArray(value, code, 1, maximum);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], `${code}_HASH`));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function normalizeMaximumConsequence(value) {
  exactObject(value, ["consequenceEnvelopeRefHash", "consequenceClassCode",
    "measureCode", "maximumValue", "unitCode", "affectedChannelRefHashes",
    "irreversibleHarmAllowed", "unboundedConsequenceAllowed"],
  "MAXIMUM_CONSEQUENCE");
  if (value.irreversibleHarmAllowed !== false
    || value.unboundedConsequenceAllowed !== false) {
    fail("MAXIMUM_CONSEQUENCE_MUST_BE_BOUNDED_AND_REVERSIBLE");
  }
  return {
    consequenceEnvelopeRefHash: hash(value.consequenceEnvelopeRefHash,
      "CONSEQUENCE_ENVELOPE_REF_HASH"),
    consequenceClassCode: publicCode(value.consequenceClassCode,
      "CONSEQUENCE_CLASS_CODE"),
    measureCode: publicCode(value.measureCode, "CONSEQUENCE_MEASURE_CODE"),
    maximumValue: safeInteger(value.maximumValue, 0, Number.MAX_SAFE_INTEGER,
      "CONSEQUENCE_MAXIMUM_VALUE"),
    unitCode: publicCode(value.unitCode, "CONSEQUENCE_UNIT_CODE"),
    affectedChannelRefHashes: normalizeHashSet(value.affectedChannelRefHashes,
      "AFFECTED_CHANNELS", OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumAffectedChannels),
    irreversibleHarmAllowed: false,
    unboundedConsequenceAllowed: false,
    ceilingIsMaximumConsequenceNotPrice: true,
  };
}

function normalizeZeroInternalOps(value) {
  exactObject(value, ["outsiderStaffInterventionsAllowed",
    "internalManualSourcingAllowed", "internalManualCoordinationAllowed",
    "internalManualVerificationAllowed", "internalManualRecoveryAllowed",
    "humanQueueFallbackAllowed", "failureDisposition"], "ZERO_INTERNAL_OPS");
  if (value.outsiderStaffInterventionsAllowed !== 0
    || value.internalManualSourcingAllowed !== false
    || value.internalManualCoordinationAllowed !== false
    || value.internalManualVerificationAllowed !== false
    || value.internalManualRecoveryAllowed !== false
    || value.humanQueueFallbackAllowed !== false
    || value.failureDisposition !== "DECLINE_NOT_HUMAN_QUEUE") {
    fail("ZERO_INTERNAL_OPS_INVARIANT_REQUIRED");
  }
  return {
    outsiderStaffInterventionsAllowed: 0,
    internalManualSourcingAllowed: false,
    internalManualCoordinationAllowed: false,
    internalManualVerificationAllowed: false,
    internalManualRecoveryAllowed: false,
    humanQueueFallbackAllowed: false,
    failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    invariantSatisfied: true,
  };
}

function tenderBody(input) {
  exactObject(input, ["tenderId", "compiledAt", "lineage", "workOrderHash",
    "typedGraph", "authorizationBinding", "exactOutcome", "formationDeadline",
    "resourceRequirements", "evidenceRequirements", "recoveryRequirements",
    "maximumConsequence", "zeroInternalOps"], "COMPILE_INPUT");
  const compiledAt = timestamp(input.compiledAt, "COMPILED_AT");
  const compiledAtMs = DateParse(compiledAt);
  const formationDeadline = timestamp(input.formationDeadline, "FORMATION_DEADLINE");
  const formationDeadlineMs = DateParse(formationDeadline);
  if (formationDeadlineMs <= compiledAtMs
    || formationDeadlineMs - compiledAtMs
      > OUTSIDER_OUTCOME_TENDER_V1_LIMITS.maximumFormationWindowMs) {
    fail("FORMATION_DEADLINE_WINDOW_INVALID");
  }
  const typedGraph = normalizeTypedGraph(input.typedGraph);
  const exactOutcome = normalizeExactOutcome(input.exactOutcome, compiledAtMs);
  const outcomeDeadlineMs = DateParse(exactOutcome.deadline);
  if (formationDeadlineMs >= outcomeDeadlineMs) {
    fail("FORMATION_DEADLINE_MUST_PRECEDE_OUTCOME_DEADLINE");
  }
  const evidenceRequirements = normalizeEvidenceRequirements(
    input.evidenceRequirements, formationDeadlineMs, outcomeDeadlineMs);
  return {
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.tender,
    schemaVersion: "1.0.0",
    tenderClass: "PUBLIC_AUTHORIZATION_SCOPED_OUTCOME_TENDER_HOLD_ONLY",
    tenderId: opaqueId(input.tenderId, TENDER_ID, "TENDER_ID"),
    compiledAt,
    lineage: normalizeLineage(input.lineage),
    workOrderHash: hash(input.workOrderHash, "WORK_ORDER_HASH"),
    typedGraph,
    authorizationBinding: normalizeAuthorization(input.authorizationBinding,
      typedGraph),
    exactOutcome,
    formationDeadline,
    formationWindowMs: formationDeadlineMs - compiledAtMs,
    resourceRequirements: normalizeResourceRequirements(input.resourceRequirements,
      formationDeadlineMs, outcomeDeadlineMs),
    evidenceRequirements,
    recoveryRequirements: normalizeRecoveryRequirements(input.recoveryRequirements,
      evidenceRequirements, formationDeadlineMs, outcomeDeadlineMs),
    maximumConsequence: normalizeMaximumConsequence(input.maximumConsequence),
    zeroInternalOps: normalizeZeroInternalOps(input.zeroInternalOps),
    publicProjection: {
      closedShapeVerified: true,
      controlledCodesOnly: true,
      opaqueHashReferencesOnly: true,
      freeFormTextIncluded: false,
      rawPrivateSourceIncluded: false,
      piiIncluded: false,
      secretsIncluded: false,
      credentialsIncluded: false,
      contactTargetsIncluded: false,
      localPathsIncluded: false,
      urlsIncluded: false,
      paymentInstructionsIncluded: false,
    },
    formationState: {
      state: "STRUCTURAL_TENDER_COMPILED_HOLD",
      discoveryStarted: false,
      contactPerformed: false,
      capacityReserved: false,
      quoteCreated: false,
      sendableTenderEstablished: false,
      unformedDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
    economicBoundary: {
      pricePresent: false,
      pricingPermitted: false,
      guaranteeCreated: false,
      custodyEstablished: false,
      moneyMovementEnabled: false,
      settlementPermitted: false,
      maximumConsequenceIsNotPrice: true,
    },
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    result: "PUBLIC_AUTHORIZATION_SCOPED_TENDER_COMPILED_HOLD",
    boundary: OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY,
  };
}

/**
 * Compile a deterministic public-safe tender from normalized data.
 *
 * Success is structural only.  The returned tender remains HOLD, carries no
 * outbound capability, and does not establish the referenced authorization.
 */
export function compileOutsiderOutcomeTenderV1(input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = tenderBody(input);
  return deepFreeze({
    ...body,
    tenderHash: digest(OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.tender, body),
  });
}

function graphInput(graph) {
  return {
    principalEpoch: graph.principalEpoch,
    accountableDeployment: graph.accountableDeployment,
    runtime: graph.runtime,
    embodiment: graph.embodiment,
    delegation: graph.delegation,
    episode: graph.episode,
    attempt: graph.attempt,
  };
}

function rowsInput(rows, fields) {
  const result = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = {};
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      row[fields[fieldIndex]] = rows[index][fields[fieldIndex]];
    }
    append(result, row);
  }
  return result;
}

function recordInput(record) {
  return {
    tenderId: record.tenderId,
    compiledAt: record.compiledAt,
    lineage: {
      revision: record.lineage.revision,
      predecessorTenderHash: record.lineage.predecessorTenderHash,
      supersedesTenderHash: record.lineage.supersedesTenderHash,
    },
    workOrderHash: record.workOrderHash,
    typedGraph: graphInput(record.typedGraph),
    authorizationBinding: {
      actorIdentityEnvelopeHash: record.authorizationBinding.actorIdentityEnvelopeHash,
      delegationEvidenceRefHash:
        record.authorizationBinding.delegationEvidenceRefHash,
      delegationEdgeHash: record.authorizationBinding.delegationEdgeHash,
      authorityScopeRefHash: record.authorizationBinding.authorityScopeRefHash,
      resourceOwnerAuthorizationRefHash:
        record.authorizationBinding.resourceOwnerAuthorizationRefHash,
      rightsPrivacyPolicyRefHash:
        record.authorizationBinding.rightsPrivacyPolicyRefHash,
    },
    exactOutcome: {
      outcomeKindCode: record.exactOutcome.outcomeKindCode,
      outcomeSpecRefHash: record.exactOutcome.outcomeSpecRefHash,
      subjectRefHash: record.exactOutcome.subjectRefHash,
      acceptanceCriteriaRefHash: record.exactOutcome.acceptanceCriteriaRefHash,
      conditions: rowsInput(record.exactOutcome.conditions, ["conditionId",
        "metricCode", "comparator", "target", "observationWindowMs",
        "conditionRefHash", "mandatory"]),
      deadline: record.exactOutcome.deadline,
    },
    formationDeadline: record.formationDeadline,
    resourceRequirements: rowsInput(record.resourceRequirements.items,
      ["resourceRequirementId", "resourceClassCode", "capabilityRefHash",
        "quantity", "unitCode", "regionRefHash", "requiredBy", "mandatory"]),
    evidenceRequirements: rowsInput(record.evidenceRequirements.items,
      ["evidenceRequirementId", "evidenceClassCode",
        "evidenceRequirementRefHash", "sourceControl", "observationMode", "dueBy",
        "mandatory"]),
    recoveryRequirements: rowsInput(record.recoveryRequirements.items,
      ["recoveryRequirementId", "triggerRefHash", "recoveryOutcomeRefHash",
        "resourceClassCode", "maximumAttempts", "completionDeadline",
        "recoveryEvidenceRequirementId", "routePolicy", "mandatory"]),
    maximumConsequence: {
      consequenceEnvelopeRefHash:
        record.maximumConsequence.consequenceEnvelopeRefHash,
      consequenceClassCode: record.maximumConsequence.consequenceClassCode,
      measureCode: record.maximumConsequence.measureCode,
      maximumValue: record.maximumConsequence.maximumValue,
      unitCode: record.maximumConsequence.unitCode,
      affectedChannelRefHashes:
        record.maximumConsequence.affectedChannelRefHashes,
      irreversibleHarmAllowed: record.maximumConsequence.irreversibleHarmAllowed,
      unboundedConsequenceAllowed:
        record.maximumConsequence.unboundedConsequenceAllowed,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed:
        record.zeroInternalOps.outsiderStaffInterventionsAllowed,
      internalManualSourcingAllowed:
        record.zeroInternalOps.internalManualSourcingAllowed,
      internalManualCoordinationAllowed:
        record.zeroInternalOps.internalManualCoordinationAllowed,
      internalManualVerificationAllowed:
        record.zeroInternalOps.internalManualVerificationAllowed,
      internalManualRecoveryAllowed:
        record.zeroInternalOps.internalManualRecoveryAllowed,
      humanQueueFallbackAllowed: record.zeroInternalOps.humanQueueFallbackAllowed,
      failureDisposition: record.zeroInternalOps.failureDisposition,
    },
  };
}

function verificationFailure(error) {
  let message = "OUTSIDER_OUTCOME_TENDER_V1_UNTRUSTED_FAILURE";
  try {
    if (error instanceof ErrorConstructor
      && typeof error.message === "string"
      && RegExpTest(/^OUTSIDER_OUTCOME_TENDER_V1_[A-Z0-9_]+$/u, error.message)) {
      message = error.message;
    }
  } catch {
    message = "OUTSIDER_OUTCOME_TENDER_V1_UNTRUSTED_FAILURE";
  }
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.verification,
    ok: false,
    structuralTenderVerified: false,
    exactSchemaVerified: false,
    derivationVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    publicProjectionSafeByClosedShape: false,
    typedGraphReferencesPreserved: false,
    zeroInternalOpsVerified: false,
    authorizationReferencesVerified: false,
    authorizationEstablished: false,
    sendableTenderEstablished: false,
    providerDiscoveryPerformed: false,
    providerContactPerformed: false,
    pricePresent: false,
    pricingPermitted: false,
    executionPermitted: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    error: message,
    boundary: OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY,
  });
}

/** Verify exact schema, deterministic derivation, self-hash, and caller pin. */
export function verifyOutsiderOutcomeTenderV1(record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["expectedTenderHash"], "VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "tenderClass", "tenderId",
      "compiledAt", "lineage", "workOrderHash", "typedGraph",
      "authorizationBinding", "exactOutcome", "formationDeadline",
      "formationWindowMs", "resourceRequirements", "evidenceRequirements",
      "recoveryRequirements", "maximumConsequence", "zeroInternalOps",
      "publicProjection", "formationState", "economicBoundary", "decisionState",
      "authority", "actionReady", "executable", "enabledCapabilityCount",
      "provenAuthorityCount", "enabledCapabilitiesSubsetOfProvenAuthority",
      "consequenceReach", "result", "boundary", "tenderHash"], "TENDER");
    if (record.schema !== OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.tender
      || record.schemaVersion !== "1.0.0"
      || record.tenderClass
        !== "PUBLIC_AUTHORIZATION_SCOPED_OUTCOME_TENDER_HOLD_ONLY"
      || record.decisionState !== "HOLD" || record.authority !== "NONE"
      || record.actionReady !== false || record.executable !== false
      || record.enabledCapabilityCount !== 0 || record.provenAuthorityCount !== 0
      || record.enabledCapabilitiesSubsetOfProvenAuthority !== true
      || record.consequenceReach !== "NONE"
      || record.result
        !== "PUBLIC_AUTHORIZATION_SCOPED_TENDER_COMPILED_HOLD"
      || !same(record.boundary, OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY)) {
      fail("TENDER_FIXED_STATE_INVALID");
    }
    const rebuilt = compileOutsiderOutcomeTenderV1(recordInput(record));
    if (!same(record, rebuilt)) fail("TENDER_DERIVATION_OR_SELF_HASH_INVALID");
    const expectedTenderHash = hash(options.expectedTenderHash,
      "EXPECTED_TENDER_HASH");
    if (record.tenderHash !== expectedTenderHash) {
      fail("EXPECTED_TENDER_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_OUTCOME_TENDER_V1_SCHEMAS.verification,
      ok: true,
      structuralTenderVerified: true,
      exactSchemaVerified: true,
      derivationVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      tenderHash: record.tenderHash,
      exactOutcomeHash: record.exactOutcome.exactOutcomeHash,
      typedGraphHash: record.typedGraph.typedGraphHash,
      resourceRequirementSetHash:
        record.resourceRequirements.requirementSetHash,
      evidenceRequirementSetHash:
        record.evidenceRequirements.requirementSetHash,
      recoveryRequirementSetHash:
        record.recoveryRequirements.requirementSetHash,
      publicProjectionSafeByClosedShape: true,
      typedGraphReferencesPreserved: true,
      zeroInternalOpsVerified: true,
      authorizationReferencesVerified: true,
      authorizationEstablished: false,
      sendableTenderEstablished: false,
      providerDiscoveryPerformed: false,
      providerContactPerformed: false,
      pricePresent: false,
      pricingPermitted: false,
      executionPermitted: false,
      settlementPermitted: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      error: null,
      boundary: OUTSIDER_OUTCOME_TENDER_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}

// Short aliases for formation-engine callers; both retain the Outsider-prefixed
// names above as the explicit public API.
export const compileOutcomeTenderV1 = compileOutsiderOutcomeTenderV1;
export const verifyOutcomeTenderV1 = verifyOutsiderOutcomeTenderV1;
