/*
 * Stage 1b caller-pinned network-core replay receipt for the Stage 1a
 * autonomous-work-order view.
 *
 * This module is intentionally a companion to, not a mutation of,
 * outsider/autonomous-work-order-product-projection/v1.  It replays the
 * caller-declared projection input, the already source-replayed network
 * complete-episode join, and the Reality semantic/obligation bundle, then
 * proves their exact crosswalk.  It does not claim that the declaration bytes
 * came from an external authority, that the represented Attempt is the full
 * Episode denominator, or that an outcome witness exists.  Consequently a
 * successful receipt remains HOLD and keeps sourceReplayVerified false.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_BOUNDARY,
  createAutonomousWorkOrderProjection,
  verifyAutonomousWorkOrderProjection,
} from "./outsider-autonomous-work-order.js";
import {
  verifyActorIdentityEnvelope,
} from "./outsider-actor-identity-envelope.js";
import {
  verifyOutsiderNetworkCompleteEpisodeJoin,
} from "./outsider-network-complete-episode.js";
import {
  verifyProspectiveEpisodeCensusProjection,
} from "./outsider-prospective-episode-census.js";
import {
  REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
  verifyRealitySemanticBundle,
} from "./outsider-reality-semantic-bundle.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
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

export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS = ObjectFreeze({
  declarationSource: "outsider/autonomous-work-order-declaration-source/v1",
  declarationVerification:
    "outsider/autonomous-work-order-declaration-source-verification/v1",
  receipt: "outsider/autonomous-work-order-source-replay-receipt/v1",
  verification: "outsider/autonomous-work-order-source-replay-verification/v1",
});

export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY = deepFreeze({
  position:
    "CALLER_PINNED_AUTONOMOUS_WORK_ORDER_NETWORK_CORE_REPLAY_NOT_VENDOR_SAFETY_CONTROL",
  stage1aProjectionMutated: false,
  appendOnlyCompanionReceiptOnly: true,
  declarationReplayScope:
    "CALLER_DECLARED_CANONICAL_HASH_REFERENCES_NOT_EXTERNAL_SOURCE_BYTES",
  declarationSourceBytesReplayed: false,
  declarationExternalAcceptanceEstablished: false,
  networkCoreReplayScope:
    "ACTOR_CENSUS_THREE_NETWORK_LANES_SEMANTIC_SOURCES_AND_REV0_OBLIGATION",
  networkCoreReplayTrustClass:
    "CALLER_PINNED_CANONICAL_REPLAY_WITHOUT_EXTERNAL_PIN_PROVENANCE",
  trustPolicyExternalPinProvenanceEstablished: false,
  networkCoreSourceReplayVerified: false,
  completeEpisodeV1Only: true,
  representedAttemptCount: 1,
  attemptSetSourceReplayVerified: false,
  episodeAttemptDenominatorComplete: false,
  retryPolicyEnforced: false,
  outcomeWitnessPermittedInThisReceipt: false,
  outcomeWitnessSourceReplayVerified: false,
  independentOutcomeEstablished: false,
  appendOnlyPredecessorSourceReplayVerified: false,
  lifecycleSourceReviewReplayVerified: false,
  externalHeadAnchorVerified: false,
  sourceReplayVerified: false,
  networkOrderEstablished: false,
  externalContractAcceptanceEstablished: false,
  nativeSafetyUnconditionalVetoPreserved: true,
  outsiderCanOverrideNativeSafetyVeto: false,
  rawSourceIncluded: false,
  localSourcePathsProjected: false,
  secretsIncluded: false,
  piiIncluded: false,
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
  actorCredit: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;

function fail(code) {
  throw new TypeErrorConstructor(`AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_${code}`);
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
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashPrototypeUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashPrototypeDigest(state, "hex")}`;
}

function exactNoPositiveAuthority(value, code) {
  if (!same(value, REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY)) {
    fail(`${code}_SHAPE_OR_VALUE_INVALID`);
  }
}

function declarationBody(input) {
  exactObject(input, ["projectionInput", "sourceReferences"], "DECLARATION_INPUT");
  exactObject(input.sourceReferences, ["declarationObjectHash", "rightsReviewHash",
    "privacyReviewHash"], "DECLARATION_SOURCE_REFERENCES");
  const projectionInput = clone(input.projectionInput);
  const workOrder = createAutonomousWorkOrderProjection(projectionInput);
  return {
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationSource,
    schemaVersion: "1.0.0",
    sourceClass:
      "CALLER_DECLARED_CANONICAL_HASH_ONLY_ORDER_INPUT_HOLD_NO_EXTERNAL_ACCEPTANCE",
    projectionInput,
    sourceReferences: {
      declarationObjectHash: hash(input.sourceReferences.declarationObjectHash,
        "DECLARATION_OBJECT_HASH"),
      rightsReviewHash: hash(input.sourceReferences.rightsReviewHash,
        "RIGHTS_REVIEW_HASH"),
      privacyReviewHash: hash(input.sourceReferences.privacyReviewHash,
        "PRIVACY_REVIEW_HASH"),
      exactSourceBytesReplayed: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      externalAcceptanceEstablished: false,
    },
    derivedWorkOrderHash: workOrder.workOrderHash,
    sourceReplayClass:
      "CANONICAL_DECLARATION_DERIVATION_ONLY_NOT_EXTERNAL_SOURCE_BYTE_REPLAY",
    sourceBytesReplayed: false,
    externalContractAcceptanceEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
  };
}

export function createAutonomousWorkOrderDeclarationSource(input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = declarationBody(input);
  return deepFreeze({ ...body, declarationSourceHash: digest(
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationSource, body) });
}

function declarationInput(record) {
  return {
    projectionInput: record.projectionInput,
    sourceReferences: {
      declarationObjectHash: record.sourceReferences.declarationObjectHash,
      rightsReviewHash: record.sourceReferences.rightsReviewHash,
      privacyReviewHash: record.sourceReferences.privacyReviewHash,
    },
  };
}

function exactDeclaration(record) {
  exactObject(record, ["schema", "schemaVersion", "sourceClass", "projectionInput",
    "sourceReferences", "derivedWorkOrderHash", "sourceReplayClass",
    "sourceBytesReplayed", "externalContractAcceptanceEstablished", "decisionState",
    "authority", "actionReady", "executable", "boundary", "declarationSourceHash"],
  "DECLARATION_SOURCE");
  if (record.schema !== AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationSource
    || record.schemaVersion !== "1.0.0"
    || record.sourceClass
      !== "CALLER_DECLARED_CANONICAL_HASH_ONLY_ORDER_INPUT_HOLD_NO_EXTERNAL_ACCEPTANCE"
    || record.sourceReplayClass
      !== "CANONICAL_DECLARATION_DERIVATION_ONLY_NOT_EXTERNAL_SOURCE_BYTE_REPLAY"
    || record.sourceBytesReplayed !== false
    || record.externalContractAcceptanceEstablished !== false
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.actionReady !== false || record.executable !== false
    || !same(record.boundary, AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY)) {
    fail("DECLARATION_SOURCE_STATE_INVALID");
  }
  hash(record.derivedWorkOrderHash, "DECLARATION_DERIVED_WORK_ORDER_HASH");
  hash(record.declarationSourceHash, "DECLARATION_SOURCE_HASH");
  return record;
}

function declarationVerificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationVerification,
    ok: false,
    canonicalDeclarationDerivationVerified: false,
    declarationSourceHash: null,
    derivedWorkOrderHash: null,
    exactSourceBytesReplayed: false,
    externalContractAcceptanceEstablished: false,
    sourceReplayVerified: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderDeclarationSource(record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactObject(options, ["expectedSourceHash", "expectedWorkOrderHash"],
      "DECLARATION_VERIFY_OPTIONS");
    exactDeclaration(record);
    const rebuilt = createAutonomousWorkOrderDeclarationSource(declarationInput(record));
    if (!same(record, rebuilt)) fail("DECLARATION_SOURCE_DERIVATION_INVALID");
    if (rebuilt.declarationSourceHash !== hash(options.expectedSourceHash,
      "EXPECTED_DECLARATION_SOURCE_HASH")) {
      fail("EXPECTED_DECLARATION_SOURCE_HASH_MISMATCH");
    }
    if (rebuilt.derivedWorkOrderHash !== hash(options.expectedWorkOrderHash,
      "EXPECTED_DECLARATION_WORK_ORDER_HASH")) {
      fail("EXPECTED_DECLARATION_WORK_ORDER_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.declarationVerification,
      ok: true,
      canonicalDeclarationDerivationVerified: true,
      declarationSourceHash: rebuilt.declarationSourceHash,
      derivedWorkOrderHash: rebuilt.derivedWorkOrderHash,
      exactSourceBytesReplayed: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      externalContractAcceptanceEstablished: false,
      sourceReplayVerified: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
    });
  } catch (error) {
    return declarationVerificationFailure(error);
  }
}

function laneNamed(bundles, lane) {
  let found = null;
  let matches = 0;
  for (let index = 0; index < bundles.length; index += 1) {
    if (bundles[index]?.preview?.manifest?.lane === lane) {
      found = bundles[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`LANE_${lane}_NOT_UNIQUE`);
  return found;
}

function matchingDelegationEdge(envelope, graph) {
  let found = null;
  let matches = 0;
  for (let index = 0; index < envelope.delegationEdges.length; index += 1) {
    const edge = envelope.delegationEdges[index];
    if (edge.delegationEdgeHash === graph.delegation.delegationEdgeHash
      && edge.delegationEvidenceRefHash
        === graph.delegation.delegationEvidenceRefHash) {
      found = edge;
      matches += 1;
    }
  }
  if (matches !== 1) fail("TYPED_GRAPH_DELEGATION_EDGE_NOT_UNIQUE_IN_ACTOR_SOURCE");
  return found;
}

function channelHashes(bundle) {
  const values = [];
  for (let index = 0; index < bundle.channelCrosswalk.length; index += 1) {
    append(values, bundle.channelCrosswalk[index].obligationConsequenceChannelHash);
  }
  ArraySort(values);
  return values;
}

function horizonTuples(bundle) {
  const values = [];
  for (let index = 0; index < bundle.horizonCrosswalk.length; index += 1) {
    const row = bundle.horizonCrosswalk[index].obligation;
    append(values, {
      horizonId: row.horizonId,
      dueAfterMs: row.dueAfterMs,
      observationRequirementHash: row.observationRequirementHash,
      mandatory: row.mandatory,
    });
  }
  ArraySort(values, (left, right) => left.dueAfterMs - right.dueAfterMs
    || (left.horizonId < right.horizonId ? -1
      : left.horizonId > right.horizonId ? 1 : 0));
  return values;
}

function orderHorizonTuples(order) {
  const values = [];
  for (let index = 0; index < order.observationPlan.horizons.length; index += 1) {
    const row = order.observationPlan.horizons[index];
    append(values, {
      horizonId: row.horizonId,
      dueAfterMs: row.dueAfterMs,
      observationRequirementHash: row.observationRequirementHash,
      mandatory: row.mandatory,
    });
  }
  return values;
}

function requireCoreCrosswalk(input, context, order, join, semantic) {
  const completeInput = input.completeEpisode.input;
  const actor = completeInput.actorIdentity.envelope;
  const census = completeInput.prospectiveCensus;
  const graph = order.typedGraph;
  const prefix = completeInput.obligationPrefix;
  const semanticOptions = context.semantic;
  if (prefix.directory !== semanticOptions.obligationDirectory
    || prefix.expectedRevision !== 0
    || prefix.expectedGenesisHash !== semanticOptions.expectedObligationGenesisHash
    || prefix.expectedStateHash !== semanticOptions.expectedObligationStateHash
    || semantic.obligation.revision !== 0) {
    fail("OBLIGATION_DIRECTORY_OR_REV0_PIN_CROSSWALK_INVALID");
  }
  if (graph.principalEpoch.principalRefHash !== actor.principalEpoch.principalRefHash
    || graph.principalEpoch.epochRefHash !== actor.principalEpoch.epochRefHash
    || graph.principalEpoch.principalEpochProjectionHash
      !== actor.principalEpochProjectionHash) {
    fail("TYPED_GRAPH_PRINCIPAL_EPOCH_CROSSWALK_INVALID");
  }
  if (graph.accountableDeployment.deploymentLineageRefHash
      !== actor.deploymentLineage.deploymentLineageRefHash
    || graph.accountableDeployment.deploymentRevisionHash
      !== actor.deploymentRevision.deploymentRevisionHash
    || graph.accountableDeployment.accountableDeploymentSubjectHash
      !== actor.actorSubjectHash
    || graph.accountableDeployment.accountableDeploymentSubjectHash
      !== join.subject.accountableDeploymentSubjectHash) {
    fail("TYPED_GRAPH_ACCOUNTABLE_DEPLOYMENT_CROSSWALK_INVALID");
  }
  if (graph.runtime.runtimeInstanceRefHash
      !== actor.runtimeInstance.runtimeInstanceRefHash
    || graph.runtime.runtimeInstanceHash !== actor.runtimeInstance.runtimeInstanceHash) {
    fail("TYPED_GRAPH_RUNTIME_CROSSWALK_INVALID");
  }
  const actorEmbodiment = actor.embodimentRevision;
  if ((actorEmbodiment === null) !== (graph.embodiment.present === false)
    || (actorEmbodiment === null
      ? graph.embodiment.deviceLineageRefHash !== null
        || graph.embodiment.embodimentRevisionHash !== null
      : graph.embodiment.deviceLineageRefHash !== actorEmbodiment.deviceLineageRefHash
        || graph.embodiment.embodimentRevisionHash
          !== actorEmbodiment.embodimentRevisionHash)) {
    fail("TYPED_GRAPH_EMBODIMENT_CROSSWALK_INVALID");
  }
  const actorDelegationEdge = matchingDelegationEdge(actor, graph);
  const principalToDeployment = actorDelegationEdge.parent.kind === "PRINCIPAL_EPOCH"
    && actorDelegationEdge.parent.refHash
      === graph.principalEpoch.principalEpochProjectionHash
    && actorDelegationEdge.child.kind === "ACCOUNTABLE_DEPLOYMENT"
    && actorDelegationEdge.child.refHash
      === graph.accountableDeployment.accountableDeploymentSubjectHash;
  const deploymentToRuntime
    = actorDelegationEdge.parent.kind === "ACCOUNTABLE_DEPLOYMENT"
      && actorDelegationEdge.parent.refHash
        === graph.accountableDeployment.accountableDeploymentSubjectHash
      && actorDelegationEdge.child.kind === "RUNTIME_INSTANCE"
      && actorDelegationEdge.child.refHash === graph.runtime.runtimeInstanceHash;
  if (!principalToDeployment && !deploymentToRuntime) {
    fail("TYPED_GRAPH_DELEGATION_EDGE_DOES_NOT_BIND_ADJACENT_GRAPH_NODES");
  }
  if (graph.episode.episodeHash !== join.subject.episodeHash
    || graph.episode.episodeHash !== semantic.subjectBindings.episodeHash
    || graph.episode.networkCompleteEpisodeJoinHash !== join.joinHash
    || order.episodeAlias.orderIdentityHash !== graph.episode.episodeHash) {
    fail("TYPED_GRAPH_EPISODE_CROSSWALK_INVALID");
  }
  if (graph.attempt.attemptHash !== join.subject.attemptHash
    || graph.attempt.attemptHash !== semantic.subjectBindings.attemptHash
    || graph.attempt.attemptActorSubjectHash !== actor.attemptActorSubjectHash
    || graph.attempt.attemptActorSubjectHash !== join.subject.attemptActorSubjectHash) {
    fail("TYPED_GRAPH_ATTEMPT_CROSSWALK_INVALID");
  }
  const references = order.contractReferences;
  if (references.actorIdentityEnvelopeHash !== actor.actorIdentityEnvelopeHash
    || references.actorIdentityEnvelopeHash !== join.subject.actorIdentityEnvelopeHash
    || references.realitySemanticBundleHash !== semantic.bundleHash
    || references.realityObligationGenesisHash !== semantic.obligation.genesisHash
    || references.realityObligationGenesisHash
      !== join.sourceReplay.obligationGenesisHash
    || references.realityObligationStateHash !== semantic.obligation.stateHash
    || references.realityObligationStateHash !== join.sourceReplay.obligationStateHash
    || references.affectedPartyRootHash !== semantic.affectedPartyRootHash
    || references.outcomeWitnessEnvelopeHash !== null) {
    fail("CONTRACT_REFERENCE_CROSSWALK_INVALID");
  }
  if (!same(join.subject.claimWayWorld, {
    claimHash: semantic.subjectBindings.claimHash,
    wayHash: semantic.subjectBindings.wayHash,
    worldHash: semantic.subjectBindings.worldHash,
  }) || !same(actor.bindings.claimWayWorld, join.subject.claimWayWorld)) {
    fail("CLAIM_WAY_WORLD_CROSSWALK_INVALID");
  }
  if (semantic.subjectBindings.censusHash
      !== join.censusCrosswalk.preActionRegistrationReferenceHash
    || actor.bindings.run.censusHash
      !== join.censusCrosswalk.censusLedgerProjectionHash
    || census.source.sourceHash !== context.expectedCensusSourceHash
    || census.projection.projectionHash !== context.expectedCensusProjectionHash) {
    fail("ROLE_AWARE_CENSUS_CROSSWALK_INVALID");
  }
  if (!same(order.promisedOutcome.consequenceChannelHashes,
    channelHashes(semantic))
    || !same(orderHorizonTuples(order), horizonTuples(semantic))) {
    fail("SEMANTIC_CHANNEL_OR_HORIZON_CROSSWALK_INVALID");
  }
  const delegationLane = laneNamed(completeInput.laneBundles,
    "DELEGATION_RESPONSIBILITY");
  const actionLane = laneNamed(completeInput.laneBundles, "ACTION_OUTCOME");
  return {
    actor,
    census,
    delegationLane,
    actionLane,
    actorDelegationEdge,
    actorDelegationEdgeBindsAdjacentTypedGraphNodes: true,
    obligationDirectoryRoleMatched: true,
  };
}

function receiptBody(input, context) {
  exactObject(input, ["declarationSource", "workOrder", "completeEpisode",
    "semantic", "outcomeWitness"], "RECEIPT_INPUT");
  exactObject(input.completeEpisode, ["join", "input"], "COMPLETE_EPISODE_INPUT");
  exactObject(input.semantic, ["bundle", "semanticPlan", "semanticPlanSource"],
    "SEMANTIC_INPUT");
  if (input.outcomeWitness !== null) fail("V1_OUTCOME_WITNESS_MUST_REMAIN_ABSENT");
  exactObject(context, ["expectedDeclarationSourceHash", "expectedWorkOrderHash",
    "expectedActorSourceHash", "expectedActorEnvelopeHash",
    "expectedCensusSourceHash", "expectedCensusProjectionHash",
    "expectedCompleteEpisodeJoinHash", "laneTrust", "semantic"],
  "RECEIPT_CONTEXT");
  exactObject(context.semantic, ["obligationDirectory", "expectedSemanticPlanHash",
    "expectedObligationGenesisHash", "expectedObligationStateHash",
    "expectedBundleHash"], "SEMANTIC_CONTEXT");

  const expectedWorkOrderHash = hash(context.expectedWorkOrderHash,
    "EXPECTED_WORK_ORDER_HASH");
  const declarationChecked = verifyAutonomousWorkOrderDeclarationSource(
    input.declarationSource, {
      expectedSourceHash: hash(context.expectedDeclarationSourceHash,
        "EXPECTED_DECLARATION_SOURCE_HASH"),
      expectedWorkOrderHash,
    });
  if (!declarationChecked.ok) {
    fail(`DECLARATION_REPLAY_FAILED:${declarationChecked.error ?? "INVALID"}`);
  }
  const orderChecked = verifyAutonomousWorkOrderProjection(input.workOrder, {
    expectedWorkOrderHash,
  });
  if (!orderChecked.ok || orderChecked.structuralProjectionVerified !== true
    || orderChecked.sourceReplayVerified !== false
    || orderChecked.networkOrderEstablished !== false) {
    fail(`WORK_ORDER_STRUCTURAL_REPLAY_FAILED:${orderChecked.error ?? "INVALID"}`);
  }
  const declaredOrder = createAutonomousWorkOrderProjection(
    input.declarationSource.projectionInput);
  if (!same(input.workOrder, declaredOrder)) fail("DECLARATION_WORK_ORDER_MISMATCH");
  if (input.workOrder.appendOnlyLineage.revision !== 0
    || input.workOrder.appendOnlyLineage.predecessorProjectionHash !== null
    || input.workOrder.appendOnlyLineage.supersedesProjectionHash !== null) {
    fail("STAGE1B_V1_GENESIS_ONLY");
  }

  const actorInput = input.completeEpisode.input.actorIdentity;
  const actorChecked = verifyActorIdentityEnvelope(actorInput.envelope, {
    source: actorInput.source,
    expectedSourceHash: hash(context.expectedActorSourceHash,
      "EXPECTED_ACTOR_SOURCE_HASH"),
    expectedEnvelopeHash: hash(context.expectedActorEnvelopeHash,
      "EXPECTED_ACTOR_ENVELOPE_HASH"),
  });
  if (!actorChecked.ok || actorChecked.sourceReplayComplete !== true) {
    fail(`ACTOR_SOURCE_REPLAY_FAILED:${actorChecked.error ?? "INVALID"}`);
  }
  const censusInput = input.completeEpisode.input.prospectiveCensus;
  const censusChecked = verifyProspectiveEpisodeCensusProjection(
    censusInput.projection, {
      source: censusInput.source,
      expectedSourceHash: hash(context.expectedCensusSourceHash,
        "EXPECTED_CENSUS_SOURCE_HASH"),
      expectedProjectionHash: hash(context.expectedCensusProjectionHash,
        "EXPECTED_CENSUS_PROJECTION_HASH"),
    });
  if (!censusChecked.ok || censusChecked.sourceReplayComplete !== true) {
    fail(`CENSUS_SOURCE_REPLAY_FAILED:${censusChecked.error ?? "INVALID"}`);
  }
  const expectedJoinHash = hash(context.expectedCompleteEpisodeJoinHash,
    "EXPECTED_COMPLETE_EPISODE_JOIN_HASH");
  const completeChecked = verifyOutsiderNetworkCompleteEpisodeJoin(
    input.completeEpisode.join, {
      input: input.completeEpisode.input,
      expectedJoinHash,
      laneTrust: context.laneTrust,
    });
  if (!completeChecked.ok || completeChecked.sourceReplayComplete !== true
    || completeChecked.networkSourceReplayTrusted !== true
    || completeChecked.structuralJoinVerified !== true
    || completeChecked.independentOutcomeEstablished !== false) {
    fail(`COMPLETE_EPISODE_REPLAY_FAILED:${completeChecked.error ?? "INVALID"}`);
  }
  const semanticChecked = verifyRealitySemanticBundle(input.semantic.bundle, {
    semanticPlan: input.semantic.semanticPlan,
    semanticPlanSource: input.semantic.semanticPlanSource,
    obligationDirectory: context.semantic.obligationDirectory,
    expectedSemanticPlanHash: hash(context.semantic.expectedSemanticPlanHash,
      "EXPECTED_SEMANTIC_PLAN_HASH"),
    expectedObligationGenesisHash: hash(
      context.semantic.expectedObligationGenesisHash,
      "EXPECTED_SEMANTIC_OBLIGATION_GENESIS_HASH"),
    expectedObligationStateHash: hash(context.semantic.expectedObligationStateHash,
      "EXPECTED_SEMANTIC_OBLIGATION_STATE_HASH"),
    expectedBundleHash: hash(context.semantic.expectedBundleHash,
      "EXPECTED_SEMANTIC_BUNDLE_HASH"),
  });
  if (!semanticChecked.ok || semanticChecked.semanticSourceReplayComplete !== true
    || semanticChecked.productionObligationSourceReplayComplete !== true
    || semanticChecked.exactSemanticBindingVerified !== true) {
    fail(`SEMANTIC_BUNDLE_REPLAY_FAILED:${semanticChecked.error ?? "INVALID"}`);
  }
  exactNoPositiveAuthority(semanticChecked.authority, "SEMANTIC_AUTHORITY");
  const crosswalk = requireCoreCrosswalk(input, context, input.workOrder,
    input.completeEpisode.join, input.semantic.bundle);
  const missingSourceClasses = [
    "ACTOR_EDGE_TO_NETWORK_DELEGATION_ENVELOPE_CROSSWALK_NOT_ESTABLISHED",
    "APPEND_ONLY_PREDECESSOR_NOT_APPLICABLE_TO_GENESIS",
    "DECLARATION_EXTERNAL_SOURCE_BYTES_NOT_REPLAYED",
    "EPISODE_ATTEMPT_DENOMINATOR_NOT_ESTABLISHED",
    "EXTERNAL_HEAD_ANCHOR_NOT_VERIFIED",
    "LIFECYCLE_SOURCE_REVIEW_NOT_REPLAYED_BY_THIS_RECEIPT",
    "OBLIGOR_DUTY_ACCEPTANCE_NOT_SOURCE_CROSSWALKED",
    "OUTCOME_WITNESS_NOT_MATERIALIZED",
    "PROMISED_OUTCOME_TERM_REFERENCES_NOT_SOURCE_CROSSWALKED",
    "PROOF_ACCESS_POLICY_NOT_SOURCE_CROSSWALKED",
    "REMEDY_TERMS_NOT_SOURCE_CROSSWALKED",
    "RESOURCE_OWNER_REFERENCE_NOT_SOURCE_CROSSWALKED",
    "TRUST_POLICY_EXTERNAL_PIN_PROVENANCE_NOT_ESTABLISHED",
  ];
  ArraySort(missingSourceClasses);
  const body = {
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    receiptClass:
      "APPEND_ONLY_STAGE1B_CALLER_PINNED_NETWORK_CORE_REPLAY_HOLD_INCOMPLETE",
    orderIdentity: {
      orderId: input.workOrder.orderId,
      orderIdentityHash: input.workOrder.episodeAlias.orderIdentityHash,
      episodeHash: input.workOrder.typedGraph.episode.episodeHash,
      workOrderHash: input.workOrder.workOrderHash,
      orderIdentityAliasesExistingEpisode: true,
      newIdentityCreated: false,
    },
    sourcePins: {
      pinProvenanceClass: "CALLER_SUPPLIED_EXPECTED_HASHES_AND_KEY_EPOCH_POLICIES",
      externalPinProvenanceEstablished: false,
      declarationSourceHash: input.declarationSource.declarationSourceHash,
      actorIdentitySourceHash: actorInput.source.sourceHash,
      actorIdentityEnvelopeHash: actorInput.envelope.actorIdentityEnvelopeHash,
      prospectiveCensusSourceHash: censusInput.source.sourceHash,
      prospectiveCensusProjectionHash: censusInput.projection.projectionHash,
      completeEpisodeJoinHash: input.completeEpisode.join.joinHash,
      prospectiveCensusBundleHash: laneNamed(input.completeEpisode.input.laneBundles,
        "PROSPECTIVE_CENSUS").bundleHash,
      delegationBundleHash: crosswalk.delegationLane.bundleHash,
      actionOutcomeBundleHash: crosswalk.actionLane.bundleHash,
      semanticPlanHash: input.semantic.bundle.semanticPlanHash,
      realitySemanticBundleHash: input.semantic.bundle.bundleHash,
      obligationGenesisHash: input.semantic.bundle.obligation.genesisHash,
      obligationStateHash: input.semantic.bundle.obligation.stateHash,
      affectedPartyRootHash: input.semantic.bundle.affectedPartyRootHash,
      outcomeWitnessEnvelopeHash: null,
    },
    typedGraphCrosswalk: {
      principalEpochExact: true,
      accountableDeploymentExact: true,
      runtimeExact: true,
      embodimentExact: true,
      actorDelegationEdgeExactAndUniqueInActorSource: true,
      actorDelegationEdgeBindsAdjacentTypedGraphNodes:
        crosswalk.actorDelegationEdgeBindsAdjacentTypedGraphNodes,
      networkDelegationPayloadReplayed: true,
      actorEdgeToNetworkDelegationEnvelopeCrosswalkEstablished: false,
      episodeExact: true,
      attemptExact: true,
      claimWayWorldExact: true,
      actorCensusUsesProjectionHash: true,
      semanticObligationCensusUsesRegistrationHash: true,
      censusHashRolesNotCollapsed: true,
      typedGraphIdentityEpisodeAttemptCrosswalkExact: true,
    },
    semanticCrosswalk: {
      semanticBundleExact: true,
      affectedPartyRootExact: true,
      obligationDirectoryRoleMatched:
        crosswalk.obligationDirectoryRoleMatched,
      obligationGenesisAndRevisionZeroStateExact: true,
      consequenceChannelSetExact: true,
      immediateAndDelayedHorizonTuplesExact: true,
      enumeratedNetworkSemanticCrosswalkExact: true,
      productTermSourceCrosswalkComplete: false,
      fullObligationLedgerSourceReplayComplete: false,
      obligationOutstanding: true,
    },
    networkOccurrenceSummary: {
      representedAttemptCount: 1,
      representedAttemptHash: input.workOrder.typedGraph.attempt.attemptHash,
      baseLaneCount: input.completeEpisode.input.laneBundles.length,
      prospectiveCensusOccurrenceIdentityHash:
        laneNamed(input.completeEpisode.input.laneBundles,
          "PROSPECTIVE_CENSUS").preview.manifest.occurrenceIdentityHash,
      delegationOccurrenceIdentityHash:
        crosswalk.delegationLane.preview.manifest.occurrenceIdentityHash,
      actionOutcomeOccurrenceIdentityHash:
        crosswalk.actionLane.preview.manifest.occurrenceIdentityHash,
      occurrenceCensusUsedAsAttemptDenominator: false,
      objectDedupUsedAsAttemptDenominator: false,
      attemptSetSourceReplayVerified: false,
      episodeAttemptDenominatorComplete: false,
    },
    replayCoverage: {
      declarationCanonicalDerivationVerified: true,
      declarationExternalSourceBytesReplayed: false,
      workOrderStructuralProjectionVerified: true,
      actorIdentitySourceObjectsReplayed: true,
      prospectiveCensusSourceObjectsReplayed: true,
      threeNetworkLaneBundlesSourceReplayed: true,
      callerSuppliedLaneBundleAndKeyEpochPinsApplied: true,
      trustPolicyExternalPinProvenanceEstablished: false,
      completeEpisodeNetworkCoreCanonicalReplayComplete: true,
      realitySemanticSourcesReplayed: true,
      productionRevisionZeroObligationReplayed: true,
      exactEnumeratedNetworkSemanticCrosswalkVerified: true,
      networkDelegationCrosswalkComplete: false,
      productTermSourceCrosswalkComplete: false,
      lifecycleSourceReviewReplayVerified: false,
      externalHeadAnchorVerified: false,
      outcomeWitnessSourceReplayVerified: false,
      appendOnlyPredecessorSourceReplayVerified: false,
      networkCoreCanonicalReplayVerified: true,
      networkCoreSourceReplayVerified: false,
      sourceReplayVerified: false,
    },
    missingSourceClasses,
    result: "AUTONOMOUS_WORK_ORDER_NETWORK_CORE_CALLER_PINNED_REPLAYED_HOLD",
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
    networkOrderEstablished: false,
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
  };
  return body;
}

export function createAutonomousWorkOrderSourceReplayReceipt(
  input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  canonicalizeStrict(input);
  canonicalizeStrict(context);
  const body = receiptBody(input, context);
  return deepFreeze({ ...body, sourceReplayReceiptHash: digest(
    AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.receipt, body) });
}

function receiptVerificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.verification,
    ok: false,
    receiptDerivationVerified: false,
    networkCoreSourceReplayVerified: false,
    sourceReplayVerified: false,
    networkOrderEstablished: false,
    independentOutcomeEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    guaranteeEstablished: false,
    insuranceEstablished: false,
    settlementEnabled: false,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderSourceReplayReceipt(record,
  options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    canonicalizeStrict(record);
    exactObject(options, ["input", "context", "expectedReceiptHash"],
      "RECEIPT_VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "receiptClass", "orderIdentity",
      "sourcePins", "typedGraphCrosswalk", "semanticCrosswalk",
      "networkOccurrenceSummary", "replayCoverage", "missingSourceClasses", "result",
      "disposition", "decisionState", "authority", "actionReady", "executable",
      "automaticTraining", "trainingRows", "causalExperienceUnits", "actorCredit",
      "moneyMovementEnabled", "guaranteeEstablished", "insuranceEstablished",
      "settlementEnabled", "networkOrderEstablished", "boundary",
      "sourceReplayReceiptHash"], "SOURCE_REPLAY_RECEIPT");
    if (record.schema !== AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.receipt
      || record.schemaVersion !== "1.0.0"
      || record.receiptClass
        !== "APPEND_ONLY_STAGE1B_CALLER_PINNED_NETWORK_CORE_REPLAY_HOLD_INCOMPLETE"
      || record.result !== "AUTONOMOUS_WORK_ORDER_NETWORK_CORE_CALLER_PINNED_REPLAYED_HOLD"
      || record.disposition !== "QUARANTINED" || record.decisionState !== "HOLD"
      || record.authority !== "NONE" || record.actionReady !== false
      || record.executable !== false || record.automaticTraining !== false
      || record.trainingRows !== 0 || record.causalExperienceUnits !== 0
      || record.actorCredit !== false || record.moneyMovementEnabled !== false
      || record.guaranteeEstablished !== false || record.insuranceEstablished !== false
      || record.settlementEnabled !== false || record.networkOrderEstablished !== false
      || record.replayCoverage.networkCoreCanonicalReplayVerified !== true
      || record.replayCoverage.networkCoreSourceReplayVerified !== false
      || record.replayCoverage.trustPolicyExternalPinProvenanceEstablished !== false
      || record.replayCoverage.sourceReplayVerified !== false
      || record.networkOccurrenceSummary.attemptSetSourceReplayVerified !== false
      || record.networkOccurrenceSummary.episodeAttemptDenominatorComplete !== false
      || !same(record.boundary, AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY)) {
      fail("SOURCE_REPLAY_RECEIPT_STATE_INVALID");
    }
    const rebuilt = createAutonomousWorkOrderSourceReplayReceipt(
      options.input, options.context);
    if (!same(record, rebuilt)) fail("SOURCE_REPLAY_RECEIPT_DERIVATION_INVALID");
    if (record.sourceReplayReceiptHash !== hash(options.expectedReceiptHash,
      "EXPECTED_SOURCE_REPLAY_RECEIPT_HASH")) {
      fail("EXPECTED_SOURCE_REPLAY_RECEIPT_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_SCHEMAS.verification,
      ok: true,
      receiptDerivationVerified: true,
      sourceReplayReceiptHash: rebuilt.sourceReplayReceiptHash,
      declarationSourceHash: rebuilt.sourcePins.declarationSourceHash,
      workOrderHash: rebuilt.orderIdentity.workOrderHash,
      orderIdentityHash: rebuilt.orderIdentity.orderIdentityHash,
      completeEpisodeJoinHash: rebuilt.sourcePins.completeEpisodeJoinHash,
      realitySemanticBundleHash: rebuilt.sourcePins.realitySemanticBundleHash,
      networkCoreCanonicalReplayVerified: true,
      networkCoreSourceReplayVerified: false,
      trustPolicyExternalPinProvenanceEstablished: false,
      sourceReplayVerified: false,
      networkOrderEstablished: false,
      externalContractAcceptanceEstablished: false,
      attemptSetSourceReplayVerified: false,
      outcomeWitnessSourceReplayVerified: false,
      independentOutcomeEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      actorCredit: false,
      moneyMovementEnabled: false,
      guaranteeEstablished: false,
      insuranceEstablished: false,
      settlementEnabled: false,
      boundary: AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_BOUNDARY,
    });
  } catch (error) {
    return receiptVerificationFailure(error);
  }
}

export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_NO_AUTHORITY =
  REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY;
export const AUTONOMOUS_WORK_ORDER_SOURCE_REPLAY_INHERITED_PRODUCT_BOUNDARY =
  AUTONOMOUS_WORK_ORDER_BOUNDARY;
