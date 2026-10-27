/*
 * Append-only, HOLD-only product projection for one autonomous work order.
 *
 * This is the user-facing order shape over existing Outsider contracts.  It
 * does not create another identity, delegation, episode, obligation, outcome,
 * challenge, closure, authority, or execution lifecycle.  Every external
 * object is carried only by a caller-pinned content-addressed reference.  The
 * verifier in this file verifies canonical structure, derivation, self-hash,
 * and the caller's expected hash; it deliberately does not replay those
 * referenced sources.  Phase 1 has no custody, money movement, guarantee,
 * insurance, settlement, or callback.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashPrototypeUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashPrototypeDigest = Function.prototype.call.bind(HashPrototype.digest);
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DatePrototypeToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;

export const AUTONOMOUS_WORK_ORDER_SCHEMAS = ObjectFreeze({
  projection: "outsider/autonomous-work-order-product-projection/v1",
  typedGraph: "outsider/autonomous-work-order-typed-graph/v1",
  observationPlan: "outsider/autonomous-work-order-observation-plan/v1",
  remedyMenu: "outsider/autonomous-work-order-remedy-menu/v1",
  obligorSet: "outsider/autonomous-work-order-obligor-set/v1",
  verification: "outsider/autonomous-work-order-verification/v1",
});

export const AUTONOMOUS_WORK_ORDER_STATUSES = ObjectFreeze([
  "STRUCTURAL_PRECOMMITMENT_HOLD",
]);

export const AUTONOMOUS_WORK_ORDER_REMEDY_KINDS = ObjectFreeze([
  "HUMAN_HANDOFF",
  "REPAIR",
  "REPERFORM",
  "REPLACE",
  "ROLLBACK",
]);

export const AUTONOMOUS_WORK_ORDER_OBLIGOR_ROLES = ObjectFreeze([
  "PRIMARY_PERFORMANCE",
  "RECOVERY",
  "REMEDY_ADMINISTRATION",
]);

export const AUTONOMOUS_WORK_ORDER_PROTECTION_FUNDING_STATUSES = ObjectFreeze([
  "NONE",
]);

export const AUTONOMOUS_WORK_ORDER_BOUNDARY = deepFreeze({
  position:
    "CROSS_PROVIDER_AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_NOT_VENDOR_SAFETY_CONTROL",
  productObject: "AUTONOMOUS_WORK_ORDER",
  productProjectionOnly: true,
  existingEpisodeAliasOnly: true,
  newOrderOntologyCreated: false,
  verificationScope:
    "CANONICAL_STRUCTURE_DERIVATION_SELF_HASH_AND_CALLER_EXPECTED_HASH_ONLY",
  sourceReplayPerformedByThisProjection: false,
  sourceReplayVerified: false,
  sourceReferencesAreHashOnly: true,
  networkOrderEstablished: false,
  externalContractAcceptanceEstablished: false,
  appendOnlyPredecessorSourceReplayVerified: false,
  rawSourceIncluded: false,
  secretsIncluded: false,
  createsIdentity: false,
  createsDelegation: false,
  createsEpisodeOrAttempt: false,
  createsObligation: false,
  createsChallenge: false,
  createsClosure: false,
  createsAuthority: false,
  managesLifecycle: false,
  externalResourceOwnerAdoptionEstablished: false,
  independentOutcomeEstablished: false,
  vendorSuccessAcceptedAsOutcomeTruth: false,
  serverAcknowledgementAcceptedAsOutcomeTruth: false,
  vendorDoneAcceptedAsOutcomeTruth: false,
  signatureAcceptedAsOutcomeStandingAuthorityOrClosure: false,
  commitmentAcceptedAsOutcomeStandingAuthorityOrClosure: false,
  challengeAcceptedAsStandingOrAuthority: false,
  recoveryClaimAcceptedAsRecoveryTruthOrClosure: false,
  callbackAcceptedAsEvidenceOrAuthority: false,
  roleScopedProofAccessOnly: true,
  redactedAccessRequired: true,
  unrestrictedTraceDisclosureEnabled: false,
  piiIncluded: false,
  nativeSafetyUnconditionalVetoPreserved: true,
  outsiderCanOverrideNativeSafetyVeto: false,
  nativeSafetyIntegrationVerified: false,
  nativeSafetyEffectivenessEstablished: false,
  protectionFundingPhase: "REFERENCE_ONLY_NO_CUSTODY",
  custodyEstablished: false,
  fundsVerified: false,
  moneyMovementEnabled: false,
  platformAdvanceEnabled: false,
  guaranteeEstablished: false,
  insuranceEstablished: false,
  settlementEnabled: false,
  disposition: "QUARANTINED",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PRIVATE_ORDER_ALIAS = /^awo_[a-f0-9]{32}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_HORIZONS = 64;
const MAX_REMEDIES = 32;
const MAX_OBLIGORS = 32;
const MAX_REMEDY_OBLIGORS = 32;
const MAX_CONSEQUENCE_CHANNELS = 256;
const MAX_HORIZON_MS = 100 * 365 * 24 * 60 * 60 * 1_000;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;

function fail(code) {
  throw new TypeErrorConstructor(`AUTONOMOUS_WORK_ORDER_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (value === null || typeof value !== "object") return;
  if (depth > 128) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > MAX_TREE_KEYS) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
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

function clone(value) {
  rejectTree(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  const instance = createHash("sha256");
  HashPrototypeUpdate(instance, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashPrototypeDigest(instance, "hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function identifier(value, code) {
  if (typeof value !== "string" || !RegExpTest(IDENTIFIER, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function timestamp(value, code) {
  const parsed = typeof value === "string" ? DateParse(value) : NaN;
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || !NumberIsFinite(parsed)
    || DatePrototypeToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function privateOrderAlias(value) {
  if (typeof value !== "string" || !RegExpTest(PRIVATE_ORDER_ALIAS, value)) {
    fail("ORDER_ID_PRIVATE_ALIAS_INVALID");
  }
  return value;
}

function contains(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function oneOf(value, allowed, code) {
  if (!contains(allowed, value)) fail(`${code}_INVALID`);
  return value;
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

function normalizeLineage(value) {
  exactObject(value, ["revision", "predecessorProjectionHash",
    "supersedesProjectionHash"], "APPEND_ONLY_LINEAGE");
  if (!NumberIsSafeInteger(value.revision) || value.revision < 0) {
    fail("APPEND_ONLY_REVISION_INVALID");
  }
  const predecessorProjectionHash = nullableHash(value.predecessorProjectionHash,
    "PREDECESSOR_PROJECTION_HASH");
  const supersedesProjectionHash = nullableHash(value.supersedesProjectionHash,
    "SUPERSEDES_PROJECTION_HASH");
  if (value.revision === 0) {
    if (predecessorProjectionHash !== null || supersedesProjectionHash !== null) {
      fail("GENESIS_LINEAGE_MUST_NOT_REFERENCE_PREDECESSOR");
    }
  } else if (predecessorProjectionHash === null || supersedesProjectionHash === null
    || predecessorProjectionHash !== supersedesProjectionHash) {
    fail("DESCENDANT_REQUIRES_EXACT_PREDECESSOR_SUPERSESSION_LINK");
  }
  return {
    revision: value.revision,
    predecessorProjectionHash,
    supersedesProjectionHash,
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
    "embodiment", "delegation", "episode", "attempt"], "TYPED_GRAPH_INPUT");
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.typedGraph,
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
  return { ...body, typedGraphHash: digest(
    AUTONOMOUS_WORK_ORDER_SCHEMAS.typedGraph, body) };
}

function normalizeContractReferences(value, graph) {
  exactObject(value, ["actorIdentityEnvelopeHash", "realitySemanticBundleHash",
    "realityObligationGenesisHash",
    "realityObligationStateHash", "affectedPartyRootHash",
    "outcomeWitnessEnvelopeHash"], "CONTRACT_REFERENCES");
  const result = {
    actorIdentityEnvelopeHash: hash(value.actorIdentityEnvelopeHash,
      "ACTOR_IDENTITY_ENVELOPE_HASH"),
    realitySemanticBundleHash: hash(value.realitySemanticBundleHash,
      "REALITY_SEMANTIC_BUNDLE_HASH"),
    realityObligationGenesisHash: hash(value.realityObligationGenesisHash,
      "REALITY_OBLIGATION_GENESIS_HASH"),
    realityObligationStateHash: hash(value.realityObligationStateHash,
      "REALITY_OBLIGATION_STATE_HASH"),
    affectedPartyRootHash: hash(value.affectedPartyRootHash,
      "AFFECTED_PARTY_ROOT_HASH"),
    outcomeWitnessEnvelopeHash: nullableHash(value.outcomeWitnessEnvelopeHash,
      "OUTCOME_WITNESS_ENVELOPE_HASH"),
  };
  if (result.outcomeWitnessEnvelopeHash !== null) {
    fail("PHASE1_OUTCOME_WITNESS_MUST_REMAIN_UNMATERIALIZED");
  }
  if (result.actorIdentityEnvelopeHash === graph.typedGraphHash) {
    fail("ACTOR_ENVELOPE_AND_TYPED_GRAPH_HASH_MUST_REMAIN_DISTINCT");
  }
  return result;
}

function normalizeProofAccessPolicy(value) {
  exactObject(value, ["roleScopedProofPolicyHash", "redactionPolicyHash"],
    "PROOF_ACCESS_POLICY");
  return {
    roleScopedProofPolicyHash: hash(value.roleScopedProofPolicyHash,
      "ROLE_SCOPED_PROOF_POLICY_HASH"),
    redactionPolicyHash: hash(value.redactionPolicyHash, "REDACTION_POLICY_HASH"),
    roleScopedProofAccessOnly: true,
    redactionRequired: true,
    projectionContainsOnlyPolicyHashes: true,
    externalProofAccessEnforcementEstablished: false,
    rawSourceAccessEnabled: false,
    piiAccessEnabled: false,
    secretsAccessEnabled: false,
    accessPolicyCreatesStandingOrAuthority: false,
  };
}

function normalizeResourceOwner(value) {
  exactObject(value, ["resourceOwnerRefHash", "ownerAdoptionEvidenceRefHash",
    "externalAdoptionEstablished"], "RESOURCE_OWNER");
  if (value.ownerAdoptionEvidenceRefHash !== null
    || value.externalAdoptionEstablished !== false) {
    fail("PHASE1_RESOURCE_OWNER_EXTERNAL_ADOPTION_MUST_REMAIN_FALSE");
  }
  return {
    resourceOwnerRefHash: hash(value.resourceOwnerRefHash, "RESOURCE_OWNER_REF_HASH"),
    ownerAdoptionEvidenceRefHash: null,
    externalAdoptionEstablished: false,
  };
}

function normalizePromisedOutcome(value) {
  exactObject(value, ["promisedOutcomeRefHash", "acceptanceCriteriaHash",
    "outcomeWitnessRequirementHash", "consequenceChannelHashes"],
  "PROMISED_OUTCOME");
  return {
    promisedOutcomeRefHash: hash(value.promisedOutcomeRefHash,
      "PROMISED_OUTCOME_REF_HASH"),
    acceptanceCriteriaHash: hash(value.acceptanceCriteriaHash,
      "ACCEPTANCE_CRITERIA_HASH"),
    outcomeWitnessRequirementHash: hash(value.outcomeWitnessRequirementHash,
      "OUTCOME_WITNESS_REQUIREMENT_HASH"),
    consequenceChannelHashes: normalizeHashSet(value.consequenceChannelHashes,
      "CONSEQUENCE_CHANNELS", MAX_CONSEQUENCE_CHANNELS),
  };
}

function normalizeObservationPlan(value) {
  denseArray(value, "OBSERVATION_HORIZONS", 2, MAX_HORIZONS);
  const horizons = [];
  const horizonIds = new SetConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["horizonId", "dueAfterMs", "observationRequirementHash",
      "mandatory"], "OBSERVATION_HORIZON");
    if (!NumberIsSafeInteger(row.dueAfterMs) || row.dueAfterMs < 0
      || row.dueAfterMs > MAX_HORIZON_MS) fail("OBSERVATION_HORIZON_DELAY_INVALID");
    if (row.mandatory !== true) fail("OBSERVATION_HORIZON_MUST_BE_MANDATORY");
    const horizonId = identifier(row.horizonId, "OBSERVATION_HORIZON_ID");
    if (SetHas(horizonIds, horizonId)) fail("OBSERVATION_HORIZON_ID_DUPLICATE");
    SetAdd(horizonIds, horizonId);
    const normalized = {
      horizonId,
      dueAfterMs: row.dueAfterMs,
      observationRequirementHash: hash(row.observationRequirementHash,
        "OBSERVATION_REQUIREMENT_HASH"),
      mandatory: true,
    };
    append(horizons, { ...normalized, horizonCommitmentHash: digest(
      "outsider/autonomous-work-order-observation-horizon/v1", normalized) });
  }
  ArraySort(horizons, (left, right) => left.dueAfterMs - right.dueAfterMs
    || (left.horizonId < right.horizonId ? -1 : left.horizonId > right.horizonId ? 1 : 0));
  let immediate = false;
  let delayed = false;
  for (let index = 0; index < horizons.length; index += 1) {
    if (horizons[index].dueAfterMs === 0) immediate = true;
    if (horizons[index].dueAfterMs > 0) delayed = true;
  }
  if (!immediate || !delayed) fail("IMMEDIATE_AND_DELAYED_HORIZONS_REQUIRED");
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.observationPlan,
    horizons,
    independentOutcomeEstablished: false,
    vendorSuccessAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
  };
  return { ...body, observationPlanHash: digest(
    AUTONOMOUS_WORK_ORDER_SCHEMAS.observationPlan, body) };
}

function normalizeObligorSet(value) {
  denseArray(value, "OBLIGORS", 1, MAX_OBLIGORS);
  const items = [];
  let primary = false;
  let recovery = false;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["obligorRefHash", "role", "obligationRefHash"], "OBLIGOR");
    const normalized = {
      obligorRefHash: hash(row.obligorRefHash, "OBLIGOR_REF_HASH"),
      role: oneOf(row.role, AUTONOMOUS_WORK_ORDER_OBLIGOR_ROLES, "OBLIGOR_ROLE"),
      obligationRefHash: hash(row.obligationRefHash, "OBLIGATION_REF_HASH"),
      externalAcceptanceEstablished: false,
    };
    if (normalized.role === "PRIMARY_PERFORMANCE") primary = true;
    if (normalized.role === "RECOVERY") recovery = true;
    append(items, normalized);
  }
  ArraySort(items, (left, right) => {
    const leftKey = `${left.role}:${left.obligorRefHash}:${left.obligationRefHash}`;
    const rightKey = `${right.role}:${right.obligorRefHash}:${right.obligationRefHash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].role === items[index - 1].role
      && items[index].obligorRefHash === items[index - 1].obligorRefHash
      && items[index].obligationRefHash === items[index - 1].obligationRefHash) {
      fail("OBLIGOR_DUTY_OCCURRENCE_DUPLICATE");
    }
  }
  if (!primary || !recovery) fail("PRIMARY_AND_RECOVERY_OBLIGORS_REQUIRED");
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.obligorSet,
    referenceClass:
      "CALLER_DECLARED_DUTY_REFERENCES_NOT_EXTERNALLY_ACCEPTED",
    items,
    allExternalAcceptancesEstablished: false,
    providerCommitmentEstablished: false,
  };
  return { ...body, obligorSetHash: digest(
    AUTONOMOUS_WORK_ORDER_SCHEMAS.obligorSet, body) };
}

function namedObligor(obligors, candidate) {
  for (let index = 0; index < obligors.items.length; index += 1) {
    if (obligors.items[index].obligorRefHash === candidate) return true;
  }
  return false;
}

function normalizeRemedyMenu(value, obligors) {
  denseArray(value, "REMEDY_MENU", 1, MAX_REMEDIES);
  const items = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["remedyId", "kind", "remedyTermsHash", "obligorRefHashes"],
      "REMEDY");
    const obligorRefHashes = normalizeHashSet(row.obligorRefHashes,
      "REMEDY_OBLIGOR_REFS", MAX_REMEDY_OBLIGORS);
    for (let refIndex = 0; refIndex < obligorRefHashes.length; refIndex += 1) {
      if (!namedObligor(obligors, obligorRefHashes[refIndex])) {
        fail("REMEDY_NAMES_UNKNOWN_OBLIGOR");
      }
    }
    append(items, {
      remedyId: identifier(row.remedyId, "REMEDY_ID"),
      kind: oneOf(row.kind, AUTONOMOUS_WORK_ORDER_REMEDY_KINDS, "REMEDY_KIND"),
      remedyTermsHash: hash(row.remedyTermsHash, "REMEDY_TERMS_HASH"),
      obligorRefHashes,
      automaticExecution: false,
      moneyMovementAllowed: false,
    });
  }
  ArraySort(items, (left, right) => left.remedyId < right.remedyId ? -1
    : left.remedyId > right.remedyId ? 1 : 0);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].remedyId === items[index - 1].remedyId) {
      fail("REMEDY_ID_DUPLICATE");
    }
  }
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.remedyMenu,
    items,
    proposedOnly: true,
    remedyPerformanceEstablished: false,
  };
  return { ...body, remedyMenuHash: digest(
    AUTONOMOUS_WORK_ORDER_SCHEMAS.remedyMenu, body) };
}

function normalizeProtectionFunding(value) {
  exactObject(value, ["status"], "PROTECTION_FUNDING");
  const status = oneOf(value.status,
    AUTONOMOUS_WORK_ORDER_PROTECTION_FUNDING_STATUSES,
    "PROTECTION_FUNDING_STATUS");
  return {
    status,
    providerObligorRefHash: null,
    providerCommitmentRefHash: null,
    commitmentExternallyVerified: false,
    custodyEstablished: false,
    fundsVerified: false,
    moneyMovementEnabled: false,
    platformAdvanceEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
  };
}

function normalizeChallenge(value) {
  exactObject(value, ["opened", "challengeRefHash", "standingExternallyVerified"],
    "CHALLENGE");
  if (value.opened !== false || value.challengeRefHash !== null
    || value.standingExternallyVerified !== false) {
    fail("PHASE1_CHALLENGE_MUST_REMAIN_UNOPENED");
  }
  return { opened: false, challengeRefHash: null, standingExternallyVerified: false };
}

function normalizeClosure(value) {
  exactObject(value, ["closed", "closureRefHash", "externalClosureVerified"],
    "CLOSURE");
  if (value.closed !== false || value.closureRefHash !== null
    || value.externalClosureVerified !== false) {
    fail("PHASE1_CLOSURE_MUST_REMAIN_OPEN");
  }
  return { closed: false, closureRefHash: null, externalClosureVerified: false };
}

function projectionBody(input) {
  exactObject(input, ["orderId", "recordedAt", "appendOnlyLineage", "typedGraph",
    "contractReferences", "resourceOwner", "promisedOutcome", "observationHorizons",
    "obligors", "remedyMenu", "protectionFunding", "orderStatus", "challenge",
    "closure", "proofAccessPolicy"], "CREATE_INPUT");
  const typedGraph = normalizeTypedGraph(input.typedGraph);
  const obligors = normalizeObligorSet(input.obligors);
  return {
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.projection,
    schemaVersion: "1.0.0",
    projectionClass: "APPEND_ONLY_AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_HOLD_ONLY",
    orderId: privateOrderAlias(input.orderId),
    orderAliasBoundary: {
      privateDisplayAliasOnly: true,
      randomnessEstablished: false,
      acceptedAsIdentity: false,
      networkProjectionEligible: false,
    },
    recordedAt: timestamp(input.recordedAt, "RECORDED_AT"),
    appendOnlyLineage: normalizeLineage(input.appendOnlyLineage),
    typedGraph,
    episodeAlias: {
      existingEpisodeHash: typedGraph.episode.episodeHash,
      orderIdentityHash: typedGraph.episode.episodeHash,
      orderIdIsDisplayAliasOnly: true,
      newEpisodeOrOrderOntologyCreated: false,
    },
    contractReferences: normalizeContractReferences(input.contractReferences, typedGraph),
    resourceOwner: normalizeResourceOwner(input.resourceOwner),
    promisedOutcome: normalizePromisedOutcome(input.promisedOutcome),
    observationPlan: normalizeObservationPlan(input.observationHorizons),
    obligorSet: obligors,
    remedyMenu: normalizeRemedyMenu(input.remedyMenu, obligors),
    protectionFunding: normalizeProtectionFunding(input.protectionFunding),
    orderStatus: oneOf(input.orderStatus, AUTONOMOUS_WORK_ORDER_STATUSES,
      "ORDER_STATUS"),
    challenge: normalizeChallenge(input.challenge),
    closure: normalizeClosure(input.closure),
    attemptScope: {
      representedAttemptCount: 1,
      representedAttemptHash: typedGraph.attempt.attemptHash,
      multiAttemptCompositionEstablished: false,
      retryPolicyEnforcedByThisProjection: false,
    },
    proofAccessPolicy: normalizeProofAccessPolicy(input.proofAccessPolicy),
    nativeSafetyBoundary: {
      vendorNativeSafetyRemainsRequired: true,
      nativeSafetyUnconditionalVetoPreserved: true,
      outsiderCanOverrideNativeSafetyVeto: false,
      nativeSafetyIntegrationVerified: false,
      nativeSafetyEffectivenessEstablished: false,
    },
    externalAdoptionEstablished: false,
    independentOutcomeEstablished: false,
    obligationClosureEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    result: "AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_CREATED_HOLD",
    boundary: AUTONOMOUS_WORK_ORDER_BOUNDARY,
  };
}

export function createAutonomousWorkOrderProjection(input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = projectionBody(input);
  return deepFreeze({ ...body, workOrderHash: digest(
    AUTONOMOUS_WORK_ORDER_SCHEMAS.projection, body) });
}

function lineageInput(value) {
  return {
    revision: value.revision,
    predecessorProjectionHash: value.predecessorProjectionHash,
    supersedesProjectionHash: value.supersedesProjectionHash,
  };
}

function typedGraphInput(value) {
  return {
    principalEpoch: value.principalEpoch,
    accountableDeployment: value.accountableDeployment,
    runtime: value.runtime,
    embodiment: value.embodiment,
    delegation: value.delegation,
    episode: value.episode,
    attempt: value.attempt,
  };
}

function observationInput(value) {
  const result = [];
  for (let index = 0; index < value.horizons.length; index += 1) {
    const row = value.horizons[index];
    append(result, {
      horizonId: row.horizonId,
      dueAfterMs: row.dueAfterMs,
      observationRequirementHash: row.observationRequirementHash,
      mandatory: row.mandatory,
    });
  }
  return result;
}

function obligorsInput(value) {
  const result = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const row = value.items[index];
    append(result, {
      obligorRefHash: row.obligorRefHash,
      role: row.role,
      obligationRefHash: row.obligationRefHash,
    });
  }
  return result;
}

function remedyInput(value) {
  const result = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const row = value.items[index];
    append(result, {
      remedyId: row.remedyId,
      kind: row.kind,
      remedyTermsHash: row.remedyTermsHash,
      obligorRefHashes: row.obligorRefHashes,
    });
  }
  return result;
}

function projectionInput(record) {
  return {
    orderId: record.orderId,
    recordedAt: record.recordedAt,
    appendOnlyLineage: lineageInput(record.appendOnlyLineage),
    typedGraph: typedGraphInput(record.typedGraph),
    contractReferences: record.contractReferences,
    resourceOwner: record.resourceOwner,
    promisedOutcome: record.promisedOutcome,
    observationHorizons: observationInput(record.observationPlan),
    obligors: obligorsInput(record.obligorSet),
    remedyMenu: remedyInput(record.remedyMenu),
    protectionFunding: {
      status: record.protectionFunding.status,
    },
    orderStatus: record.orderStatus,
    challenge: record.challenge,
    closure: record.closure,
    proofAccessPolicy: {
      roleScopedProofPolicyHash: record.proofAccessPolicy.roleScopedProofPolicyHash,
      redactionPolicyHash: record.proofAccessPolicy.redactionPolicyHash,
    },
  };
}

function verificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.verification,
    ok: false,
    structuralProjectionVerified: false,
    exactSchemaVerified: false,
    selfHashVerified: false,
    expectedHashMatched: false,
    productProjectionOnly: true,
    sourceReplayVerified: false,
    networkOrderEstablished: false,
    externalAdoptionEstablished: false,
    challengeOpened: false,
    closureEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    moneyMovementEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderProjection(record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactObject(options, ["expectedWorkOrderHash"], "VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "projectionClass", "orderId",
      "orderAliasBoundary", "recordedAt", "appendOnlyLineage", "typedGraph", "contractReferences",
      "episodeAlias", "resourceOwner", "promisedOutcome", "observationPlan", "obligorSet",
      "remedyMenu", "protectionFunding", "orderStatus", "challenge", "closure",
      "attemptScope", "proofAccessPolicy", "nativeSafetyBoundary",
      "externalAdoptionEstablished", "independentOutcomeEstablished",
      "obligationClosureEstablished", "decisionState", "authority", "actionReady",
      "executable", "result", "boundary", "workOrderHash"], "PROJECTION");
    if (record.schema !== AUTONOMOUS_WORK_ORDER_SCHEMAS.projection
      || record.schemaVersion !== "1.0.0"
      || record.projectionClass
        !== "APPEND_ONLY_AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_HOLD_ONLY"
      || record.externalAdoptionEstablished !== false
      || record.independentOutcomeEstablished !== false
      || record.obligationClosureEstablished !== false
      || record.decisionState !== "HOLD" || record.authority !== "NONE"
      || record.actionReady !== false || record.executable !== false
      || record.result !== "AUTONOMOUS_WORK_ORDER_PRODUCT_PROJECTION_CREATED_HOLD"
      || !same(record.boundary, AUTONOMOUS_WORK_ORDER_BOUNDARY)) {
      fail("PROJECTION_STATE_INVALID");
    }
    const rebuilt = createAutonomousWorkOrderProjection(projectionInput(record));
    if (!same(record, rebuilt)) fail("PROJECTION_DERIVATION_OR_SELF_HASH_INVALID");
    const expectedWorkOrderHash = hash(options.expectedWorkOrderHash,
      "EXPECTED_WORK_ORDER_HASH");
    if (record.workOrderHash !== expectedWorkOrderHash) {
      fail("EXPECTED_WORK_ORDER_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SCHEMAS.verification,
      ok: true,
      structuralProjectionVerified: true,
      exactSchemaVerified: true,
      selfHashVerified: true,
      expectedHashMatched: true,
      workOrderHash: rebuilt.workOrderHash,
      typedGraphHash: rebuilt.typedGraph.typedGraphHash,
      observationPlanHash: rebuilt.observationPlan.observationPlanHash,
      obligorSetHash: rebuilt.obligorSet.obligorSetHash,
      remedyMenuHash: rebuilt.remedyMenu.remedyMenuHash,
      productProjectionOnly: true,
      sourceReplayPerformedByThisProjection: false,
      sourceReplayVerified: false,
      networkOrderEstablished: false,
      externalContractAcceptanceEstablished: false,
      appendOnlyPredecessorSourceReplayVerified: false,
      externalAdoptionEstablished: false,
      challengeOpened: false,
      closureEstablished: false,
      independentOutcomeEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      moneyMovementEnabled: false,
      guaranteeEstablished: false,
      insuranceEstablished: false,
      settlementEnabled: false,
      boundary: AUTONOMOUS_WORK_ORDER_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
