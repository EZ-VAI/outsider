/*
 * Append-only Stage 1 source-replay closure descendant.
 *
 * This module does not modify or reinterpret the frozen v1 work-order or v1
 * source-replay receipt.  It re-verifies that receipt, reuses the complete-
 * episode and Network Node contract conformance APIs, and adds two narrowly
 * scoped canonical crosswalk sources:
 *
 *   1. the exact actor delegation edge <-> DELEGATION_RESPONSIBILITY lane
 *      reference relationship; and
 *   2. an exhaustive reference-level crosswalk for the product terms already
 *      present in the frozen work-order projection.
 *
 * Both new sources remain caller-supplied canonical objects.  They do not
 * replay the referenced external bytes and cannot establish the origin of the
 * expected hashes used by their verifiers.  This v2 descendant therefore has
 * no positive independent-pin path: independentPinProvenance must be null and
 * every aggregate source-replay, authority, action, and economic gate remains
 * false/HOLD.  A later version must consume independently obtained pin
 * evidence rather than letting a caller assert that property.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderSourceReplayReceipt,
} from "./outsider-autonomous-work-order-source-replay.js";
import {
  verifyOutsiderNetworkNodeContractConformance,
} from "./outsider-network-node-contract-conformance.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(ArrayPrototype.sort);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashPrototypeUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashPrototypeDigest = Function.prototype.call.bind(HashPrototype.digest);
const JSONParse = JSON.parse;
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

export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS = ObjectFreeze({
  delegationCrosswalkSource:
    "outsider/autonomous-work-order-delegation-lane-crosswalk-source/v2",
  delegationCrosswalkVerification:
    "outsider/autonomous-work-order-delegation-lane-crosswalk-source-verification/v2",
  productTermReferenceSource:
    "outsider/autonomous-work-order-product-term-reference-source/v2",
  productTermReferenceVerification:
    "outsider/autonomous-work-order-product-term-reference-source-verification/v2",
  receipt:
    "outsider/autonomous-work-order-source-replay-closure-receipt/v2",
  verification:
    "outsider/autonomous-work-order-source-replay-closure-verification/v2",
});

export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY = deepFreeze({
  position:
    "APPEND_ONLY_STAGE1_SOURCE_REPLAY_CLOSURE_DESCENDANT_NOT_VENDOR_SAFETY_CONTROL",
  predecessorSchema: "outsider/autonomous-work-order-source-replay-receipt/v1",
  predecessorMutated: false,
  frozenWorkOrderProjectionMutated: false,
  appendOnlyVersionedDescendantOnly: true,
  networkIndividualEventModel:
    "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
  createsSecondIdentityDelegationEpisodeAttemptOrObligationOntology: false,
  actorDelegationLaneReferenceCrosswalkExpressible: true,
  delegationEnvelopeExternalSourceBytesReplayed: false,
  productTermReferenceCrosswalkExpressible: true,
  productTermExternalSourceBytesReplayed: false,
  independentPinEvidenceAcceptedFromCaller: false,
  independentPinProvenanceEstablished: false,
  callerExpectedHashesAcceptedAsIndependentProvenance: false,
  externalHeadAnchorVerified: false,
  lifecycleSourceReviewReplayVerified: false,
  durableAttemptSetHeadVerified: false,
  fullAttemptAncestryReplayed: false,
  outcomeWitnessSourceReplayVerified: false,
  independentOutcomeEstablished: false,
  fullSourceReplayVerified: false,
  networkOrderEstablished: false,
  nativeSafetyUnconditionalVetoPreserved: true,
  outsiderCanOverrideNativeSafetyVeto: false,
  enabledCapabilities: 0,
  provenAuthorityCapabilities: 0,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReachEnabled: 0,
  consequenceReachCommittedEvidenceEstablished: false,
  consequenceReachInvariantSatisfiedVacuouslyAtZero: true,
  rawSourceIncluded: false,
  localSourcePathsProjected: false,
  secretsIncluded: false,
  piiIncluded: false,
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
  actorCredit: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Z0-9_]{2,80}$/u;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;
const MAX_OBLIGORS = 64;
const MAX_REMEDIES = 64;
const MAX_HASH_SET = 256;

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_${code}`,
  );
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
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
  if (depth > 160) fail("VALUE_TOO_DEEP");
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
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
      fail("ACCESSOR_FORBIDDEN");
    }
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
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

function denseArray(value, code, minimum, maximum) {
  if (!ArrayIsArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${code}_ARRAY_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_ARRAY_SPARSE_OR_DECORATED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_ARRAY_INVALID`);
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

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
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

function digest(domain, value) {
  const state = createHash("sha256");
  HashPrototypeUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashPrototypeDigest(state, "hex")}`;
}

function sortedHashes(value, code) {
  denseArray(value, code, 1, MAX_HASH_SET);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], code));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function exactFalse(value, code) {
  if (value !== false) fail(`${code}_MUST_REMAIN_FALSE`);
  return false;
}

function normalizeActorEdge(value) {
  exactObject(value, ["parent", "child", "delegationEvidenceRefHash",
    "delegationEdgeHash"], "ACTOR_EDGE");
  exactObject(value.parent, ["kind", "refHash"], "ACTOR_EDGE_PARENT");
  exactObject(value.child, ["kind", "refHash"], "ACTOR_EDGE_CHILD");
  if (typeof value.parent.kind !== "string" || value.parent.kind.length < 2
    || typeof value.child.kind !== "string" || value.child.kind.length < 2) {
    fail("ACTOR_EDGE_NODE_KIND_INVALID");
  }
  return {
    parent: {
      kind: value.parent.kind,
      refHash: hash(value.parent.refHash, "ACTOR_EDGE_PARENT_REF_HASH"),
    },
    child: {
      kind: value.child.kind,
      refHash: hash(value.child.refHash, "ACTOR_EDGE_CHILD_REF_HASH"),
    },
    delegationEvidenceRefHash: hash(value.delegationEvidenceRefHash,
      "ACTOR_EDGE_EVIDENCE_REF_HASH"),
    delegationEdgeHash: hash(value.delegationEdgeHash,
      "ACTOR_EDGE_HASH"),
  };
}

function normalizeDelegationLaneProjection(value) {
  exactObject(value, ["schema", "accountableDeploymentSubjectHash",
    "delegationEnvelopeHash", "capabilityRadiusHash", "authorityRadiusHash",
    "evidenceRadiusHash", "responsibilityRadiusHash",
    "responsibilityCommitmentHash", "ownerWriteGateConformanceHash",
    "authorityEstablished", "responsibilityCoverageEstablished"],
  "DELEGATION_LANE_PROJECTION");
  if (value.schema
      !== "outsider/network-delegation-responsibility-projection/v1") {
    fail("DELEGATION_LANE_SCHEMA_INVALID");
  }
  return {
    schema: value.schema,
    accountableDeploymentSubjectHash: hash(
      value.accountableDeploymentSubjectHash,
      "DELEGATION_LANE_ACCOUNTABLE_DEPLOYMENT_HASH"),
    delegationEnvelopeHash: hash(value.delegationEnvelopeHash,
      "DELEGATION_LANE_ENVELOPE_HASH"),
    capabilityRadiusHash: hash(value.capabilityRadiusHash,
      "DELEGATION_LANE_CAPABILITY_RADIUS_HASH"),
    authorityRadiusHash: hash(value.authorityRadiusHash,
      "DELEGATION_LANE_AUTHORITY_RADIUS_HASH"),
    evidenceRadiusHash: hash(value.evidenceRadiusHash,
      "DELEGATION_LANE_EVIDENCE_RADIUS_HASH"),
    responsibilityRadiusHash: hash(value.responsibilityRadiusHash,
      "DELEGATION_LANE_RESPONSIBILITY_RADIUS_HASH"),
    responsibilityCommitmentHash: hash(value.responsibilityCommitmentHash,
      "DELEGATION_LANE_RESPONSIBILITY_COMMITMENT_HASH"),
    ownerWriteGateConformanceHash: nullableHash(
      value.ownerWriteGateConformanceHash,
      "DELEGATION_LANE_OWNER_WRITE_GATE_HASH"),
    authorityEstablished: exactFalse(value.authorityEstablished,
      "DELEGATION_LANE_AUTHORITY"),
    responsibilityCoverageEstablished: exactFalse(
      value.responsibilityCoverageEstablished,
      "DELEGATION_LANE_RESPONSIBILITY_COVERAGE"),
  };
}

function delegationSourceBody(input) {
  exactObject(input, ["actorIdentityEnvelopeHash",
    "accountableDeploymentSubjectHash", "actorDelegationEdge",
    "laneProjection"], "DELEGATION_SOURCE_INPUT");
  const actorDelegationEdge = normalizeActorEdge(input.actorDelegationEdge);
  const laneProjection = normalizeDelegationLaneProjection(input.laneProjection);
  const actorIdentityEnvelopeHash = hash(input.actorIdentityEnvelopeHash,
    "DELEGATION_SOURCE_ACTOR_ENVELOPE_HASH");
  const accountableDeploymentSubjectHash = hash(
    input.accountableDeploymentSubjectHash,
    "DELEGATION_SOURCE_ACCOUNTABLE_DEPLOYMENT_HASH");
  if (accountableDeploymentSubjectHash
      !== laneProjection.accountableDeploymentSubjectHash) {
    fail("DELEGATION_SOURCE_ACCOUNTABLE_DEPLOYMENT_CROSSWALK_INVALID");
  }
  const relationship = {
    actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash,
    actorDelegationEdge,
    laneProjection,
  };
  return {
    schema:
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.delegationCrosswalkSource,
    schemaVersion: "2.0.0",
    sourceClass:
      "CALLER_SUPPLIED_CANONICAL_ACTOR_EDGE_TO_NETWORK_DELEGATION_REFERENCE_CROSSWALK",
    actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash,
    actorDelegationEdge,
    laneProjection,
    relationshipCommitmentHash: digest(
      "outsider/autonomous-work-order-delegation-lane-relationship/v2",
      relationship),
    exactSourceBytesReplayed: false,
    independentSourceOriginEstablished: false,
    authorityEstablished: false,
    responsibilityCoverageEstablished: false,
    decisionState: "HOLD",
  };
}

export function createAutonomousWorkOrderDelegationLaneCrosswalkSource(
  input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = delegationSourceBody(input);
  return deepFreeze({ ...body, sourceHash: digest(
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
      .delegationCrosswalkSource, body) });
}

function delegationSourceInput(record) {
  return {
    actorIdentityEnvelopeHash: record.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash:
      record.accountableDeploymentSubjectHash,
    actorDelegationEdge: record.actorDelegationEdge,
    laneProjection: record.laneProjection,
  };
}

function exactDelegationSource(record) {
  exactObject(record, ["schema", "schemaVersion", "sourceClass",
    "actorIdentityEnvelopeHash", "accountableDeploymentSubjectHash",
    "actorDelegationEdge", "laneProjection", "relationshipCommitmentHash",
    "exactSourceBytesReplayed", "independentSourceOriginEstablished",
    "authorityEstablished", "responsibilityCoverageEstablished",
    "decisionState", "sourceHash"], "DELEGATION_SOURCE");
  if (record.schema
      !== AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .delegationCrosswalkSource
    || record.schemaVersion !== "2.0.0"
    || record.sourceClass
      !== "CALLER_SUPPLIED_CANONICAL_ACTOR_EDGE_TO_NETWORK_DELEGATION_REFERENCE_CROSSWALK"
    || record.exactSourceBytesReplayed !== false
    || record.independentSourceOriginEstablished !== false
    || record.authorityEstablished !== false
    || record.responsibilityCoverageEstablished !== false
    || record.decisionState !== "HOLD") {
    fail("DELEGATION_SOURCE_STATE_INVALID");
  }
  hash(record.relationshipCommitmentHash,
    "DELEGATION_RELATIONSHIP_COMMITMENT_HASH");
  hash(record.sourceHash, "DELEGATION_SOURCE_HASH");
  return record;
}

function sourceVerificationFailure(schema, error) {
  return deepFreeze({
    schema,
    ok: false,
    canonicalSourceVerified: false,
    callerCanonicalSourceDerivationVerified: false,
    exactReferenceCrosswalkSourceVerified: false,
    exactSourceBytesReplayed: false,
    independentSourceOriginEstablished: false,
    independentPinProvenanceEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: error instanceof ErrorConstructor ? error.message
      : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderDelegationLaneCrosswalkSource(
  record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactObject(options, ["expectedSourceHash"],
      "DELEGATION_SOURCE_VERIFY_OPTIONS");
    exactDelegationSource(record);
    const rebuilt = createAutonomousWorkOrderDelegationLaneCrosswalkSource(
      delegationSourceInput(record));
    if (!same(record, rebuilt)) fail("DELEGATION_SOURCE_DERIVATION_INVALID");
    if (rebuilt.sourceHash !== hash(options.expectedSourceHash,
      "EXPECTED_DELEGATION_SOURCE_HASH")) {
      fail("EXPECTED_DELEGATION_SOURCE_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .delegationCrosswalkVerification,
      ok: true,
      canonicalSourceVerified: true,
      callerCanonicalSourceDerivationVerified: true,
      exactReferenceCrosswalkSourceVerified: false,
      sourceHash: rebuilt.sourceHash,
      relationshipCommitmentHash: rebuilt.relationshipCommitmentHash,
      exactSourceBytesReplayed: false,
      independentSourceOriginEstablished: false,
      independentPinProvenanceEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
    });
  } catch (error) {
    return sourceVerificationFailure(
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .delegationCrosswalkVerification,
      error);
  }
}

function normalizeResourceOwner(value) {
  exactObject(value, ["resourceOwnerRefHash", "ownerAdoptionEvidenceRefHash",
    "externalAdoptionEstablished"], "TERM_RESOURCE_OWNER");
  if (value.ownerAdoptionEvidenceRefHash !== null
    || value.externalAdoptionEstablished !== false) {
    fail("TERM_RESOURCE_OWNER_ADOPTION_MUST_REMAIN_UNESTABLISHED");
  }
  return {
    resourceOwnerRefHash: hash(value.resourceOwnerRefHash,
      "TERM_RESOURCE_OWNER_REF_HASH"),
    ownerAdoptionEvidenceRefHash: null,
    externalAdoptionEstablished: false,
  };
}

function normalizePromisedOutcome(value) {
  exactObject(value, ["promisedOutcomeRefHash", "acceptanceCriteriaHash",
    "outcomeWitnessRequirementHash", "consequenceChannelHashes"],
  "TERM_PROMISED_OUTCOME");
  return {
    promisedOutcomeRefHash: hash(value.promisedOutcomeRefHash,
      "TERM_PROMISED_OUTCOME_REF_HASH"),
    acceptanceCriteriaHash: hash(value.acceptanceCriteriaHash,
      "TERM_ACCEPTANCE_CRITERIA_HASH"),
    outcomeWitnessRequirementHash: hash(
      value.outcomeWitnessRequirementHash,
      "TERM_OUTCOME_WITNESS_REQUIREMENT_HASH"),
    consequenceChannelHashes: sortedHashes(value.consequenceChannelHashes,
      "TERM_CONSEQUENCE_CHANNEL_HASH"),
  };
}

function normalizeObligors(value) {
  denseArray(value, "TERM_OBLIGORS", 1, MAX_OBLIGORS);
  const rows = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["obligorRefHash", "role", "obligationRefHash"],
      "TERM_OBLIGOR");
    append(rows, {
      obligorRefHash: hash(row.obligorRefHash, "TERM_OBLIGOR_REF_HASH"),
      role: identifier(row.role, "TERM_OBLIGOR_ROLE"),
      obligationRefHash: hash(row.obligationRefHash,
        "TERM_OBLIGATION_REF_HASH"),
    });
  }
  ArraySort(rows, (left, right) => {
    const leftKey = `${left.role}:${left.obligorRefHash}:${left.obligationRefHash}`;
    const rightKey = `${right.role}:${right.obligorRefHash}:${right.obligationRefHash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (let index = 1; index < rows.length; index += 1) {
    if (same(rows[index], rows[index - 1])) fail("TERM_OBLIGOR_DUPLICATE");
  }
  return rows;
}

function normalizeRemedies(value) {
  denseArray(value, "TERM_REMEDIES", 1, MAX_REMEDIES);
  const rows = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["remedyId", "kind", "remedyTermsHash",
      "obligorRefHashes"], "TERM_REMEDY");
    if (typeof row.remedyId !== "string" || row.remedyId.length < 1
      || row.remedyId.length > 80) fail("TERM_REMEDY_ID_INVALID");
    append(rows, {
      remedyId: row.remedyId,
      kind: identifier(row.kind, "TERM_REMEDY_KIND"),
      remedyTermsHash: hash(row.remedyTermsHash,
        "TERM_REMEDY_TERMS_HASH"),
      obligorRefHashes: sortedHashes(row.obligorRefHashes,
        "TERM_REMEDY_OBLIGOR_REF_HASH"),
    });
  }
  ArraySort(rows, (left, right) => left.remedyId < right.remedyId ? -1
    : left.remedyId > right.remedyId ? 1 : 0);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].remedyId === rows[index - 1].remedyId) {
      fail("TERM_REMEDY_ID_DUPLICATE");
    }
  }
  return rows;
}

function normalizeProofAccessPolicy(value) {
  exactObject(value, ["roleScopedProofPolicyHash", "redactionPolicyHash"],
    "TERM_PROOF_ACCESS_POLICY");
  return {
    roleScopedProofPolicyHash: hash(value.roleScopedProofPolicyHash,
      "TERM_ROLE_SCOPED_PROOF_POLICY_HASH"),
    redactionPolicyHash: hash(value.redactionPolicyHash,
      "TERM_REDACTION_POLICY_HASH"),
  };
}

function productTermSourceBody(input) {
  exactObject(input, ["orderIdentityHash", "resourceOwner", "promisedOutcome",
    "obligors", "remedies", "proofAccessPolicy"],
  "PRODUCT_TERM_SOURCE_INPUT");
  const resourceOwner = normalizeResourceOwner(input.resourceOwner);
  const promisedOutcome = normalizePromisedOutcome(input.promisedOutcome);
  const obligors = normalizeObligors(input.obligors);
  const remedies = normalizeRemedies(input.remedies);
  const proofAccessPolicy = normalizeProofAccessPolicy(input.proofAccessPolicy);
  const referenceSet = {
    orderIdentityHash: hash(input.orderIdentityHash,
      "PRODUCT_TERM_ORDER_IDENTITY_HASH"),
    resourceOwner,
    promisedOutcome,
    obligors,
    remedies,
    proofAccessPolicy,
  };
  let referenceCount = 1 + 1 + 3
    + promisedOutcome.consequenceChannelHashes.length
    + 2;
  referenceCount += obligors.length * 2;
  for (let index = 0; index < remedies.length; index += 1) {
    referenceCount += 1 + remedies[index].obligorRefHashes.length;
  }
  return {
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
      .productTermReferenceSource,
    schemaVersion: "2.0.0",
    sourceClass:
      "CALLER_SUPPLIED_CANONICAL_PRODUCT_TERM_REFERENCE_SET_NOT_EXTERNAL_TERM_BYTES",
    ...referenceSet,
    referenceSetHash: digest(
      "outsider/autonomous-work-order-product-term-reference-set/v2",
      referenceSet),
    exactReferenceClasses: [
      "OBLIGOR_DUTY",
      "PROMISED_OUTCOME",
      "PROOF_ACCESS_POLICY",
      "REMEDY_TERMS",
      "RESOURCE_OWNER",
    ],
    referencedHashCount: referenceCount,
    exactSourceBytesReplayed: false,
    independentSourceOriginEstablished: false,
    obligorDutyAcceptanceEstablished: false,
    promisedOutcomeAcceptanceEstablished: false,
    proofAccessEnforcementEstablished: false,
    remedyPerformanceEstablished: false,
    resourceOwnerAdoptionEstablished: false,
    decisionState: "HOLD",
  };
}

export function createAutonomousWorkOrderProductTermReferenceSource(
  input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = productTermSourceBody(input);
  return deepFreeze({ ...body, sourceHash: digest(
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
      .productTermReferenceSource, body) });
}

function productTermSourceInput(record) {
  return {
    orderIdentityHash: record.orderIdentityHash,
    resourceOwner: record.resourceOwner,
    promisedOutcome: record.promisedOutcome,
    obligors: record.obligors,
    remedies: record.remedies,
    proofAccessPolicy: record.proofAccessPolicy,
  };
}

function exactProductTermSource(record) {
  exactObject(record, ["schema", "schemaVersion", "sourceClass",
    "orderIdentityHash", "resourceOwner", "promisedOutcome", "obligors",
    "remedies", "proofAccessPolicy", "referenceSetHash",
    "exactReferenceClasses", "referencedHashCount", "exactSourceBytesReplayed",
    "independentSourceOriginEstablished", "obligorDutyAcceptanceEstablished",
    "promisedOutcomeAcceptanceEstablished", "proofAccessEnforcementEstablished",
    "remedyPerformanceEstablished", "resourceOwnerAdoptionEstablished",
    "decisionState", "sourceHash"], "PRODUCT_TERM_SOURCE");
  const expectedClasses = [
    "OBLIGOR_DUTY",
    "PROMISED_OUTCOME",
    "PROOF_ACCESS_POLICY",
    "REMEDY_TERMS",
    "RESOURCE_OWNER",
  ];
  if (record.schema
      !== AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .productTermReferenceSource
    || record.schemaVersion !== "2.0.0"
    || record.sourceClass
      !== "CALLER_SUPPLIED_CANONICAL_PRODUCT_TERM_REFERENCE_SET_NOT_EXTERNAL_TERM_BYTES"
    || !same(record.exactReferenceClasses, expectedClasses)
    || record.exactSourceBytesReplayed !== false
    || record.independentSourceOriginEstablished !== false
    || record.obligorDutyAcceptanceEstablished !== false
    || record.promisedOutcomeAcceptanceEstablished !== false
    || record.proofAccessEnforcementEstablished !== false
    || record.remedyPerformanceEstablished !== false
    || record.resourceOwnerAdoptionEstablished !== false
    || record.decisionState !== "HOLD") {
    fail("PRODUCT_TERM_SOURCE_STATE_INVALID");
  }
  if (!Number.isSafeInteger(record.referencedHashCount)
    || record.referencedHashCount < 1) fail("PRODUCT_TERM_REFERENCE_COUNT_INVALID");
  hash(record.referenceSetHash, "PRODUCT_TERM_REFERENCE_SET_HASH");
  hash(record.sourceHash, "PRODUCT_TERM_SOURCE_HASH");
  return record;
}

export function verifyAutonomousWorkOrderProductTermReferenceSource(
  record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactObject(options, ["expectedSourceHash"],
      "PRODUCT_TERM_SOURCE_VERIFY_OPTIONS");
    exactProductTermSource(record);
    const rebuilt = createAutonomousWorkOrderProductTermReferenceSource(
      productTermSourceInput(record));
    if (!same(record, rebuilt)) fail("PRODUCT_TERM_SOURCE_DERIVATION_INVALID");
    if (rebuilt.sourceHash !== hash(options.expectedSourceHash,
      "EXPECTED_PRODUCT_TERM_SOURCE_HASH")) {
      fail("EXPECTED_PRODUCT_TERM_SOURCE_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .productTermReferenceVerification,
      ok: true,
      canonicalSourceVerified: true,
      callerCanonicalSourceDerivationVerified: true,
      exactReferenceCrosswalkSourceVerified: false,
      exactReferenceClasses: rebuilt.exactReferenceClasses,
      referencedHashCount: rebuilt.referencedHashCount,
      sourceHash: rebuilt.sourceHash,
      referenceSetHash: rebuilt.referenceSetHash,
      exactSourceBytesReplayed: false,
      independentSourceOriginEstablished: false,
      independentPinProvenanceEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
    });
  } catch (error) {
    return sourceVerificationFailure(
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS
        .productTermReferenceVerification,
      error);
  }
}

function laneBundle(completeEpisodeInput, lane) {
  const bundles = completeEpisodeInput.laneBundles;
  let selected = null;
  let matches = 0;
  for (let index = 0; index < bundles.length; index += 1) {
    if (bundles[index]?.preview?.manifest?.lane === lane) {
      selected = bundles[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`${lane}_LANE_NOT_UNIQUE`);
  return selected;
}

function matchingActorDelegationEdge(envelope, graph) {
  let selected = null;
  let matches = 0;
  for (let index = 0; index < envelope.delegationEdges.length; index += 1) {
    const edge = envelope.delegationEdges[index];
    if (edge.delegationEdgeHash === graph.delegation.delegationEdgeHash
      && edge.delegationEvidenceRefHash
        === graph.delegation.delegationEvidenceRefHash) {
      selected = edge;
      matches += 1;
    }
  }
  if (matches !== 1) fail("ACTOR_DELEGATION_EDGE_NOT_UNIQUE");
  return selected;
}

function sourceActorEdge(edge) {
  return {
    parent: {
      kind: edge.parent.kind,
      refHash: edge.parent.refHash,
    },
    child: {
      kind: edge.child.kind,
      refHash: edge.child.refHash,
    },
    delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
    delegationEdgeHash: edge.delegationEdgeHash,
  };
}

function nodeDelegationBinding(conformance) {
  let selected = null;
  let matches = 0;
  for (let index = 0; index < conformance.adapterContractBindings.length;
    index += 1) {
    const row = conformance.adapterContractBindings[index];
    if (row.kind === "DELEGATION_RESPONSIBILITY") {
      selected = row;
      matches += 1;
    }
  }
  if (matches !== 1) fail("NODE_DELEGATION_BINDING_NOT_UNIQUE");
  return selected;
}

function requireDelegationCrosswalk(predecessor, nodeConformance, source) {
  const order = predecessor.input.workOrder;
  const completeInput = predecessor.input.completeEpisode.input;
  const actor = completeInput.actorIdentity.envelope;
  const edge = matchingActorDelegationEdge(actor, order.typedGraph);
  const bundle = laneBundle(completeInput, "DELEGATION_RESPONSIBILITY");
  const lane = bundle.preview.payload;
  const nodeBinding = nodeDelegationBinding(nodeConformance);
  let edgeOccurrences = 0;
  for (let index = 0;
    index < nodeConformance.typedGraph.actorDelegationEdgeHashes.length;
    index += 1) {
    if (nodeConformance.typedGraph.actorDelegationEdgeHashes[index]
        === edge.delegationEdgeHash) edgeOccurrences += 1;
  }
  if (source.actorIdentityEnvelopeHash !== actor.actorIdentityEnvelopeHash
    || source.accountableDeploymentSubjectHash !== actor.actorSubjectHash
    || !same(source.actorDelegationEdge, sourceActorEdge(edge))
    || !same(source.laneProjection, lane)
    || lane.accountableDeploymentSubjectHash !== actor.actorSubjectHash
    || nodeConformance.typedGraph.delegationEnvelopeHash
      !== lane.delegationEnvelopeHash
    || nodeBinding.derivedTargetHash !== lane.delegationEnvelopeHash
    || nodeBinding.declaredConformanceEvidenceRefHash
      !== lane.delegationEnvelopeHash
    || edgeOccurrences !== 1) {
    fail("ACTOR_EDGE_DELEGATION_LANE_EXACT_CROSSWALK_INVALID");
  }
  return {
    actorIdentityEnvelopeHash: actor.actorIdentityEnvelopeHash,
    actorDelegationEdgeHash: edge.delegationEdgeHash,
    delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
    delegationEnvelopeHash: lane.delegationEnvelopeHash,
    relationshipCommitmentHash: source.relationshipCommitmentHash,
    nodeContractConformanceHash: nodeConformance.conformanceHash,
    exactActorEdgeOccurrenceCount: 1,
  };
}

function conciseObligors(workOrder) {
  const rows = [];
  for (let index = 0; index < workOrder.obligorSet.items.length; index += 1) {
    const row = workOrder.obligorSet.items[index];
    append(rows, {
      obligorRefHash: row.obligorRefHash,
      role: row.role,
      obligationRefHash: row.obligationRefHash,
    });
  }
  return rows;
}

function conciseRemedies(workOrder) {
  const rows = [];
  for (let index = 0; index < workOrder.remedyMenu.items.length; index += 1) {
    const row = workOrder.remedyMenu.items[index];
    append(rows, {
      remedyId: row.remedyId,
      kind: row.kind,
      remedyTermsHash: row.remedyTermsHash,
      obligorRefHashes: row.obligorRefHashes,
    });
  }
  return rows;
}

function workOrderProductTerms(workOrder) {
  return {
    orderIdentityHash: workOrder.episodeAlias.orderIdentityHash,
    resourceOwner: workOrder.resourceOwner,
    promisedOutcome: workOrder.promisedOutcome,
    obligors: conciseObligors(workOrder),
    remedies: conciseRemedies(workOrder),
    proofAccessPolicy: {
      roleScopedProofPolicyHash:
        workOrder.proofAccessPolicy.roleScopedProofPolicyHash,
      redactionPolicyHash: workOrder.proofAccessPolicy.redactionPolicyHash,
    },
  };
}

function requireProductTermCrosswalk(predecessor, source) {
  const expected = createAutonomousWorkOrderProductTermReferenceSource(
    workOrderProductTerms(predecessor.input.workOrder));
  if (!same(source, expected)) fail("PRODUCT_TERM_REFERENCE_CROSSWALK_INVALID");
  return {
    orderIdentityHash: source.orderIdentityHash,
    productTermSourceHash: source.sourceHash,
    productTermReferenceSetHash: source.referenceSetHash,
    exactReferenceClasses: source.exactReferenceClasses,
    exactReferenceClassCount: source.exactReferenceClasses.length,
    referencedHashCount: source.referencedHashCount,
  };
}

function receiptBody(input, context) {
  exactObject(input, ["predecessor", "networkNodeContract",
    "delegationCrosswalkSource", "productTermReferenceSource",
    "independentPinProvenance"], "RECEIPT_INPUT");
  exactObject(input.predecessor, ["receipt", "input", "context"],
    "PREDECESSOR_INPUT");
  exactObject(input.networkNodeContract, ["conformance", "pins"],
    "NETWORK_NODE_CONTRACT_INPUT");
  exactObject(context, ["expectedPredecessorReceiptHash",
    "expectedNetworkNodeContractConformanceHash",
    "expectedDelegationCrosswalkSourceHash",
    "expectedProductTermReferenceSourceHash"], "RECEIPT_CONTEXT");
  if (input.independentPinProvenance !== null) {
    fail("CALLER_INDEPENDENT_PIN_PROVENANCE_FORBIDDEN");
  }

  const predecessorHash = hash(context.expectedPredecessorReceiptHash,
    "EXPECTED_PREDECESSOR_RECEIPT_HASH");
  const predecessorCheck = verifyAutonomousWorkOrderSourceReplayReceipt(
    input.predecessor.receipt, {
      input: input.predecessor.input,
      context: input.predecessor.context,
      expectedReceiptHash: predecessorHash,
    });
  if (!predecessorCheck.ok
    || predecessorCheck.receiptDerivationVerified !== true
    || predecessorCheck.sourceReplayVerified !== false
    || predecessorCheck.networkOrderEstablished !== false) {
    fail(`PREDECESSOR_REPLAY_FAILED:${predecessorCheck.error ?? "INVALID"}`);
  }

  if (input.predecessor.context.expectedCompleteEpisodeJoinHash
      !== input.networkNodeContract.pins.expectedJoinHash
    || !same(input.predecessor.context.laneTrust,
      input.networkNodeContract.pins.laneTrust)) {
    fail("PREDECESSOR_NODE_CONTRACT_PIN_CONTEXT_MISMATCH");
  }
  const expectedConformanceHash = hash(
    context.expectedNetworkNodeContractConformanceHash,
    "EXPECTED_NETWORK_NODE_CONFORMANCE_HASH");
  const nodeCheck = verifyOutsiderNetworkNodeContractConformance(
    input.networkNodeContract.conformance, {
      completeEpisode: input.predecessor.input.completeEpisode,
      pins: input.networkNodeContract.pins,
      expectedConformanceHash,
    });
  if (!nodeCheck.ok || nodeCheck.sourceReplayComplete !== true
    || nodeCheck.exactAdapterContractBindingsVerified !== true
    || nodeCheck.status !== "HOLD") {
    fail(`NETWORK_NODE_CONTRACT_REPLAY_FAILED:${nodeCheck.error ?? "INVALID"}`);
  }

  const delegationCheck =
    verifyAutonomousWorkOrderDelegationLaneCrosswalkSource(
      input.delegationCrosswalkSource, {
        expectedSourceHash: hash(context.expectedDelegationCrosswalkSourceHash,
          "EXPECTED_DELEGATION_CROSSWALK_SOURCE_HASH"),
      });
  if (!delegationCheck.ok) {
    fail(`DELEGATION_CROSSWALK_SOURCE_REPLAY_FAILED:${delegationCheck.error
      ?? "INVALID"}`);
  }
  const productCheck = verifyAutonomousWorkOrderProductTermReferenceSource(
    input.productTermReferenceSource, {
      expectedSourceHash: hash(
        context.expectedProductTermReferenceSourceHash,
        "EXPECTED_PRODUCT_TERM_REFERENCE_SOURCE_HASH"),
    });
  if (!productCheck.ok) {
    fail(`PRODUCT_TERM_REFERENCE_SOURCE_REPLAY_FAILED:${productCheck.error
      ?? "INVALID"}`);
  }

  const delegation = requireDelegationCrosswalk(input.predecessor,
    input.networkNodeContract.conformance,
    input.delegationCrosswalkSource);
  const terms = requireProductTermCrosswalk(input.predecessor,
    input.productTermReferenceSource);

  const missingSourceClasses = [
    "APPEND_ONLY_PREDECESSOR_SOURCE_REPLAY_NOT_VERIFIED_BEYOND_V1_GENESIS",
    "DELEGATION_ENVELOPE_EXTERNAL_SOURCE_BYTES_NOT_REPLAYED",
    "DURABLE_ATTEMPT_SET_HEAD_AND_FULL_ANCESTRY_NOT_REPLAYED",
    "EXTERNAL_HEAD_ANCHOR_NOT_VERIFIED",
    "INDEPENDENTLY_SOURCED_PIN_PROVENANCE_NOT_ESTABLISHED",
    "LIFECYCLE_SOURCE_REVIEW_NOT_REPLAYED",
    "OBLIGOR_DUTY_ACCEPTANCE_NOT_ESTABLISHED",
    "OUTCOME_WITNESS_NOT_MATERIALIZED",
    "PRODUCT_TERM_EXTERNAL_SOURCE_BYTES_NOT_REPLAYED",
    "PROMISED_OUTCOME_ACCEPTANCE_NOT_ESTABLISHED",
    "PROOF_ACCESS_ENFORCEMENT_NOT_ESTABLISHED",
    "REMEDY_PERFORMANCE_NOT_ESTABLISHED",
    "RESOURCE_OWNER_ADOPTION_NOT_ESTABLISHED",
  ];
  ArraySort(missingSourceClasses);

  return {
    schema:
      AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.receipt,
    schemaVersion: "2.0.0",
    receiptClass:
      "APPEND_ONLY_STAGE1_REFERENCE_CROSSWALK_CLOSURE_DESCENDANT_HOLD_INCOMPLETE",
    supersession: {
      relationship: "APPEND_ONLY_VERSIONED_DESCENDANT",
      predecessorSchema:
        "outsider/autonomous-work-order-source-replay-receipt/v1",
      predecessorReceiptHash: predecessorHash,
      successorSchema:
        AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.receipt,
      supersedesScope:
        "ACTOR_DELEGATION_LANE_AND_PRODUCT_TERM_REFERENCE_CROSSWALK_ONLY",
      predecessorGloballyReplaced: false,
      predecessorAndFrozenArtifactsRemainUnmodified: true,
    },
    orderIdentity: {
      orderIdentityHash: input.predecessor.input.workOrder.episodeAlias
        .orderIdentityHash,
      episodeHash: input.predecessor.input.workOrder.typedGraph.episode
        .episodeHash,
      workOrderHash: input.predecessor.input.workOrder.workOrderHash,
      orderIdentityAliasesExistingEpisode: true,
      newIdentityCreated: false,
    },
    sourcePins: {
      pinContextClass:
        "CALLER_EXPECTED_HASH_CONTEXT_REVERIFIED_NOT_INDEPENDENT_PROVENANCE",
      predecessorReceiptHash: predecessorHash,
      networkNodeContractConformanceHash: expectedConformanceHash,
      delegationCrosswalkSourceHash:
        input.delegationCrosswalkSource.sourceHash,
      productTermReferenceSourceHash:
        input.productTermReferenceSource.sourceHash,
      independentPinProvenanceEvidence: null,
      callerExpectedHashesAcceptedAsIndependentProvenance: false,
      independentPinProvenanceEstablished: false,
    },
    delegationCrosswalk: {
      ...delegation,
      completeEpisodeVerifiedBeforeCrosswalkDerivation: true,
      networkNodeContractConformanceReplayed: true,
      actorDelegationEdgeExactAndUnique: true,
      laneProjectionExact: true,
      nodeContractDelegationTargetExact: true,
      actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified: true,
      delegationEnvelopeExternalSourceBytesReplayed: false,
      independentDelegationSourceOriginEstablished: false,
      delegationAuthorityEstablished: false,
      responsibilityCoverageEstablished: false,
      networkDelegationSourceReplayComplete: false,
    },
    productTermCrosswalk: {
      ...terms,
      declarationToProjectionToReferenceSetExact: true,
      resourceOwnerReferenceExact: true,
      promisedOutcomeReferencesExact: true,
      obligorDutyReferencesExact: true,
      remedyTermReferencesExact: true,
      proofAccessPolicyReferencesExact: true,
      enumeratedProductTermReferenceCrosswalkVerified: true,
      productTermExternalSourceBytesReplayed: false,
      independentProductTermSourceOriginEstablished: false,
      productTermSourceCoverageComplete: false,
      obligorDutyAcceptanceEstablished: false,
      promisedOutcomeAcceptanceEstablished: false,
      proofAccessEnforcementEstablished: false,
      remedyPerformanceEstablished: false,
      resourceOwnerAdoptionEstablished: false,
    },
    replayCoverage: {
      predecessorV1ReceiptReverified: true,
      completeEpisodeAndNodeContractReverified: true,
      canonicalDelegationCrosswalkSourceReplayed: true,
      canonicalProductTermReferenceSourceReplayed: true,
      actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified: true,
      enumeratedProductTermReferenceCrosswalkVerified: true,
      trustPolicyExternalPinProvenanceEstablished: false,
      delegationEnvelopeExternalSourceBytesReplayed: false,
      productTermExternalSourceBytesReplayed: false,
      networkDelegationCrosswalkComplete: false,
      productTermSourceCoverageComplete: false,
      lifecycleSourceReviewReplayVerified: false,
      externalHeadAnchorVerified: false,
      durableAttemptSetHeadVerified: false,
      fullAttemptAncestryReplayed: false,
      outcomeWitnessSourceReplayVerified: false,
      appendOnlyPredecessorSourceReplayVerified: false,
      sourceReplayVerified: false,
    },
    missingSourceClasses,
    result:
      "AUTONOMOUS_WORK_ORDER_REFERENCE_CROSSWALKS_REPLAYED_STAGE1_CLOSURE_HOLD",
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    enabledCapabilities: 0,
    provenAuthorityCapabilities: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReachEnabled: 0,
    moneyMovementEnabled: false,
    platformAdvanceEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
    networkOrderEstablished: false,
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
  };
}

export function createAutonomousWorkOrderSourceReplayClosureReceipt(
  input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  canonicalizeStrict(input);
  canonicalizeStrict(context);
  const body = receiptBody(input, context);
  return deepFreeze({ ...body, closureReceiptHash: digest(
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.receipt, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.verification,
    ok: false,
    receiptDerivationVerified: false,
    referenceCrosswalksVerified: false,
    independentPinProvenanceEstablished: false,
    sourceReplayVerified: false,
    networkOrderEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    enabledCapabilities: 0,
    provenAuthorityCapabilities: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReachEnabled: 0,
    moneyMovementEnabled: false,
    platformAdvanceEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
    error: error instanceof ErrorConstructor ? error.message
      : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderSourceReplayClosureReceipt(
  record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactObject(options, ["input", "context", "expectedClosureReceiptHash"],
      "CLOSURE_VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "receiptClass",
      "supersession", "orderIdentity", "sourcePins", "delegationCrosswalk",
      "productTermCrosswalk", "replayCoverage", "missingSourceClasses",
      "result", "disposition", "decisionState", "authority", "actionReady",
      "executable", "automaticTraining", "trainingRows",
      "causalExperienceUnits", "actorCredit", "enabledCapabilities",
      "provenAuthorityCapabilities", "enabledCapabilitiesSubsetOfProvenAuthority",
      "consequenceReachEnabled", "moneyMovementEnabled",
      "platformAdvanceEnabled", "guaranteeEstablished", "insuranceEstablished",
      "settlementEnabled", "networkOrderEstablished", "boundary",
      "closureReceiptHash"], "CLOSURE_RECEIPT");
    if (record.schema
        !== AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.receipt
      || record.schemaVersion !== "2.0.0"
      || record.receiptClass
        !== "APPEND_ONLY_STAGE1_REFERENCE_CROSSWALK_CLOSURE_DESCENDANT_HOLD_INCOMPLETE"
      || record.result
        !== "AUTONOMOUS_WORK_ORDER_REFERENCE_CROSSWALKS_REPLAYED_STAGE1_CLOSURE_HOLD"
      || record.disposition !== "QUARANTINED"
      || record.decisionState !== "HOLD" || record.authority !== "NONE"
      || record.actionReady !== false || record.executable !== false
      || record.automaticTraining !== false || record.trainingRows !== 0
      || record.causalExperienceUnits !== 0 || record.actorCredit !== false
      || record.enabledCapabilities !== 0
      || record.provenAuthorityCapabilities !== 0
      || record.enabledCapabilitiesSubsetOfProvenAuthority !== true
      || record.consequenceReachEnabled !== 0
      || record.moneyMovementEnabled !== false
      || record.platformAdvanceEnabled !== false
      || record.guaranteeEstablished !== false
      || record.insuranceEstablished !== false
      || record.settlementEnabled !== false
      || record.networkOrderEstablished !== false
      || record.sourcePins.independentPinProvenanceEstablished !== false
      || record.replayCoverage.sourceReplayVerified !== false
      || record.replayCoverage
        .actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified !== true
      || record.replayCoverage
        .enumeratedProductTermReferenceCrosswalkVerified !== true
      || record.replayCoverage.productTermSourceCoverageComplete !== false
      || record.replayCoverage.networkDelegationCrosswalkComplete !== false
      || !same(record.boundary,
        AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY)) {
      fail("CLOSURE_RECEIPT_STATE_INVALID");
    }
    const rebuilt = createAutonomousWorkOrderSourceReplayClosureReceipt(
      options.input, options.context);
    if (!same(record, rebuilt)) fail("CLOSURE_RECEIPT_DERIVATION_INVALID");
    if (rebuilt.closureReceiptHash !== hash(options.expectedClosureReceiptHash,
      "EXPECTED_CLOSURE_RECEIPT_HASH")) {
      fail("EXPECTED_CLOSURE_RECEIPT_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_SCHEMAS.verification,
      ok: true,
      receiptDerivationVerified: true,
      referenceCrosswalksVerified: true,
      closureReceiptHash: rebuilt.closureReceiptHash,
      predecessorReceiptHash: rebuilt.supersession.predecessorReceiptHash,
      workOrderHash: rebuilt.orderIdentity.workOrderHash,
      orderIdentityHash: rebuilt.orderIdentity.orderIdentityHash,
      delegationCrosswalkSourceHash:
        rebuilt.sourcePins.delegationCrosswalkSourceHash,
      productTermReferenceSourceHash:
        rebuilt.sourcePins.productTermReferenceSourceHash,
      actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified: true,
      enumeratedProductTermReferenceCrosswalkVerified: true,
      delegationEnvelopeExternalSourceBytesReplayed: false,
      productTermExternalSourceBytesReplayed: false,
      independentPinProvenanceEstablished: false,
      productTermSourceCoverageComplete: false,
      networkDelegationCrosswalkComplete: false,
      sourceReplayVerified: false,
      networkOrderEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      actorCredit: false,
      enabledCapabilities: 0,
      provenAuthorityCapabilities: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReachEnabled: 0,
      moneyMovementEnabled: false,
      platformAdvanceEnabled: false,
      guaranteeEstablished: false,
      insuranceEstablished: false,
      settlementEnabled: false,
      boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_CLOSURE_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
