/*
 * Source-replayed Node adapter contract bindings for a complete-episode join.
 *
 * This v2 descendant upgrades the Node SDK's six declaration references into
 * exact hash bindings.  It does not replay the opaque delegation, execution,
 * or outcome evidence objects behind those hashes, and it does not turn
 * structural conformance into authority, outcome truth, or action readiness.
 */

import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { networkIntakeDigest } from "./outsider-network-intake.js";
import {
  verifyOutsiderNetworkCompleteEpisodeJoin,
} from "./outsider-network-complete-episode.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
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

export const OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS = ObjectFreeze({
  conformance: "outsider/network-node-contract-conformance/v2",
  verification: "outsider/network-node-contract-conformance-verification/v2",
});

export const OUTSIDER_NETWORK_NODE_CONTRACT_BINDING_KINDS = ObjectFreeze([
  "ACTOR_IDENTITY",
  "COMMAND_EFFECT",
  "DELEGATION_RESPONSIBILITY",
  "OBLIGATION_LIFECYCLE",
  "OUTCOME_RECOVERY",
  "PROSPECTIVE_CENSUS",
]);

export const OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY = deepFreeze({
  position:
    "CROSS_PROVIDER_REPORTING_EVIDENCE_NETWORK_NOT_VENDOR_NATIVE_SAFETY_CONTROL",
  conformanceScope: "SOURCE_REPLAYED_EXACT_HASH_CONTRACT_BINDING_ONLY",
  completeEpisodeJoinReplayRequiredFirst: true,
  completeEpisodeJoinStatusRequired: "HOLD",
  externalBundleAudienceRegistryRetentionAndKeyEpochPinsRequired: true,
  externalOriginOfCallerPinsEstablished: false,
  structuralConformanceMintsAuthority: false,
  opaqueDelegationEvidenceSourceReplayed: false,
  opaqueCommandEffectEvidenceSourceReplayed: false,
  opaqueOutcomeEvidenceSourceReplayed: false,
  vendorClaimsAcceptedAsAuthority: false,
  serverAcknowledgmentsAcceptedAsIndependentOutcome: false,
  pseudoLabelsAcceptedAsAuthorityOrOutcomeTruth: false,
  individualEventModel:
    "PrincipalEpoch→AccountableDeployment→Runtime/Embodiment→Delegation→Episode→Attempt",
  ipIdentityUsed: false,
  deviceIdentityUsed: false,
  baseModelIdentityUsed: false,
  globalScoreIdentityUsed: false,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  enabledCapabilities: 0,
  consequenceReachEnabled: 0,
  durableResponsibilitySourceReplayed: false,
  consequenceReachCommittedEvidenceEstablished: false,
  consequenceReachInvariantSatisfiedVacuouslyAtZero: true,
  disposition: "QUARANTINED",
  status: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  permitsCuratePromotion: false,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const EXACT_LANES = ObjectFreeze([
  "ACTION_OUTCOME",
  "DELEGATION_RESPONSIBILITY",
  "PROSPECTIVE_CENSUS",
]);

const CONTRACT_SPECS = deepFreeze([
  {
    kind: "ACTOR_IDENTITY",
    sourceLane: "DELEGATION_RESPONSIBILITY",
    target: "ACTOR_IDENTITY_ENVELOPE_HASH",
    replayStatus: "SUPPLIED_OBJECT_SOURCE_REPLAYED_HASH_BOUND",
  },
  {
    kind: "COMMAND_EFFECT",
    sourceLane: "ACTION_OUTCOME",
    target: "EXECUTION_EVIDENCE_HASH",
    replayStatus: "REFERENCE_BOUND_SOURCE_NOT_REPLAYED",
  },
  {
    kind: "DELEGATION_RESPONSIBILITY",
    sourceLane: "DELEGATION_RESPONSIBILITY",
    target: "DELEGATION_ENVELOPE_HASH",
    replayStatus: "REFERENCE_BOUND_SOURCE_NOT_REPLAYED",
  },
  {
    kind: "OBLIGATION_LIFECYCLE",
    sourceLane: "ACTION_OUTCOME",
    target: "PINNED_OBLIGATION_STATE_HASH",
    replayStatus: "PINNED_IMMUTABLE_PREFIX_REPLAYED",
  },
  {
    kind: "OUTCOME_RECOVERY",
    sourceLane: "ACTION_OUTCOME",
    target: "OUTCOME_EVIDENCE_HASH",
    replayStatus: "REFERENCE_BOUND_SOURCE_NOT_REPLAYED",
  },
  {
    kind: "PROSPECTIVE_CENSUS",
    sourceLane: "PROSPECTIVE_CENSUS",
    target: "PROSPECTIVE_CENSUS_PROJECTION_HASH",
    replayStatus: "SUPPLIED_OBJECT_SOURCE_REPLAYED_HASH_BOUND",
  },
]);

function fail(code) {
  throw new TypeErrorConstructor(
    `OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_${code}`);
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

function rejectTree(value, seen = new SetConstructor(), depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 160) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1);
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

function denseArray(value, code, exactLength) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length !== exactLength) fail(`${code}_DENSE_ARRAY_REQUIRED`);
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

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function laneBundle(input, lane) {
  denseArray(input.laneBundles, "LANE_BUNDLES", EXACT_LANES.length);
  let selected = null;
  let matches = 0;
  for (let index = 0; index < input.laneBundles.length; index += 1) {
    const bundle = input.laneBundles[index];
    if (bundle.preview.manifest.lane === lane) {
      selected = bundle;
      matches += 1;
    }
  }
  if (matches !== 1) fail(`EXACT_${lane}_BUNDLE_REQUIRED`);
  return selected;
}

function laneTrust(pins, lane) {
  denseArray(pins.laneTrust, "LANE_TRUST", EXACT_LANES.length);
  let selected = null;
  let matches = 0;
  for (let index = 0; index < pins.laneTrust.length; index += 1) {
    if (pins.laneTrust[index].lane === lane) {
      selected = pins.laneTrust[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`EXACT_${lane}_TRUST_PIN_REQUIRED`);
  return selected;
}

function adapterDeclaration(bundle, kind) {
  const declarations = bundle.preview.nodeConformance.adapterDeclarations;
  denseArray(declarations, "ADAPTER_DECLARATIONS", 6);
  let selected = null;
  let matches = 0;
  for (let index = 0; index < declarations.length; index += 1) {
    if (declarations[index].kind === kind) {
      selected = declarations[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`EXACT_${kind}_SDK_DECLARATION_REQUIRED`);
  return selected;
}

function targetHash(kind, completeEpisode, bundles) {
  if (kind === "ACTOR_IDENTITY") {
    return hash(completeEpisode.input.actorIdentity.envelope.actorIdentityEnvelopeHash,
      "ACTOR_IDENTITY_ENVELOPE_HASH");
  }
  if (kind === "PROSPECTIVE_CENSUS") {
    return hash(completeEpisode.input.prospectiveCensus.projection.projectionHash,
      "PROSPECTIVE_CENSUS_PROJECTION_HASH");
  }
  if (kind === "DELEGATION_RESPONSIBILITY") {
    return hash(bundles.DELEGATION_RESPONSIBILITY.preview.payload.delegationEnvelopeHash,
      "DELEGATION_ENVELOPE_HASH");
  }
  if (kind === "COMMAND_EFFECT") {
    return hash(bundles.ACTION_OUTCOME.preview.payload.executionEvidenceHash,
      "EXECUTION_EVIDENCE_HASH");
  }
  if (kind === "OUTCOME_RECOVERY") {
    return hash(bundles.ACTION_OUTCOME.preview.payload.outcomeEvidenceHash,
      "OUTCOME_EVIDENCE_HASH");
  }
  if (kind === "OBLIGATION_LIFECYCLE") {
    return hash(completeEpisode.join.sourceReplay.obligationStateHash,
      "PINNED_OBLIGATION_STATE_HASH");
  }
  fail("ADAPTER_KIND_INVALID");
}

function contractBindings(completeEpisode, bundles) {
  const rows = new ArrayConstructor();
  for (let index = 0; index < CONTRACT_SPECS.length; index += 1) {
    const spec = CONTRACT_SPECS[index];
    const bundle = bundles[spec.sourceLane];
    const declaration = adapterDeclaration(bundle, spec.kind);
    const target = targetHash(spec.kind, completeEpisode, bundles);
    if (declaration.status !== "DECLARED_UNVERIFIED"
      || declaration.conformanceEvidenceRefHash !== target) {
      fail(`${spec.kind}_CONFORMANCE_EVIDENCE_TARGET_MISMATCH_HOLD`);
    }
    append(rows, {
      kind: spec.kind,
      sourceLane: spec.sourceLane,
      targetClass: spec.target,
      derivedTargetHash: target,
      sdkNodeSourceHash: bundle.preview.nodeSource.sourceHash,
      sdkNodeConformanceHash: bundle.preview.nodeConformance.conformanceHash,
      adapterArtifactSchema: declaration.artifactSchema,
      adapterImplementationHash: declaration.adapterImplementationHash,
      declaredConformanceEvidenceRefHash: declaration.conformanceEvidenceRefHash,
      exactTargetMatch: true,
      targetReplayStatus: spec.replayStatus,
      declarationCoverage:
        "DECLARED_REFERENCE_EQUALS_REPLAYED_FIELD_AND_EXTERNALLY_PINNED_LOCAL_BUNDLE",
      declaredArtifactSchemaStatus: "DECLARED_UNVERIFIED",
      adapterArtifactSchemaVerified: false,
      adapterImplementationSourceReplayed: false,
      adapterFunctionalityVerified: false,
      authorityEstablished: false,
      independentOutcomeEstablished: false,
    });
  }
  ArraySort(rows, (left, right) => left.kind < right.kind ? -1
    : left.kind > right.kind ? 1 : 0);
  for (let index = 0; index < OUTSIDER_NETWORK_NODE_CONTRACT_BINDING_KINDS.length;
    index += 1) {
    if (rows[index].kind !== OUTSIDER_NETWORK_NODE_CONTRACT_BINDING_KINDS[index]) {
      fail("EXACT_SIX_CONTRACT_BINDINGS_REQUIRED");
    }
  }
  for (let index = 0; index < rows.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (rows[index].derivedTargetHash === rows[prior].derivedTargetHash) {
        fail("ALL_SIX_DERIVED_TARGET_HASHES_MUST_BE_PAIRWISE_DISTINCT");
      }
    }
  }
  return rows;
}

function networkReplayRoots(bundles, pins) {
  const rows = new ArrayConstructor();
  for (let index = 0; index < EXACT_LANES.length; index += 1) {
    const lane = EXACT_LANES[index];
    const bundle = bundles[lane];
    const trust = laneTrust(pins, lane);
    if (trust.expectedBundleHash !== bundle.bundleHash) {
      fail(`${lane}_EXTERNAL_BUNDLE_HASH_PIN_MISMATCH`);
    }
    if (bundle.challenge.signature.keyId !== bundle.networkTrust.challengeServerKeyId
      || bundle.receipt.signature.keyId !== bundle.networkTrust.receiptServerKeyId) {
      fail(`${lane}_SERVER_KEY_ROLE_BINDING_MISMATCH`);
    }
    if (bundle.receipt.transportSignerKeyId === bundle.networkTrust.challengeServerKeyId
      || bundle.receipt.transportSignerKeyId === bundle.networkTrust.receiptServerKeyId) {
      fail(`${lane}_TRANSPORT_SERVER_KEY_ROLE_COLLISION`);
    }
    if (bundle.preview.manifest.payload.objectIdentityHash
      === bundle.preview.manifest.occurrenceIdentityHash) {
      fail(`${lane}_OBJECT_OCCURRENCE_IDENTITY_COLLISION`);
    }
    append(rows, {
      lane,
      bundleHash: hash(bundle.bundleHash, "BUNDLE_HASH"),
      externallyPinnedBundleHash: hash(trust.expectedBundleHash,
        "EXTERNALLY_PINNED_BUNDLE_HASH"),
      laneTrustPolicyContextHash: networkIntakeDigest(
        "outsider/network-node-contract-lane-trust-policy-context/v2",
        trust.trustPolicy),
      laneTrustPolicyContextCommitment:
        "CALLER_SUPPLIED_VERIFICATION_CONTEXT_EXTERNAL_ORIGIN_NOT_ESTABLISHED",
      challengeHash: hash(bundle.challenge.challengeHash, "CHALLENGE_HASH"),
      manifestHash: hash(bundle.preview.manifest.manifestHash, "MANIFEST_HASH"),
      receiptHash: hash(bundle.receipt.receiptHash, "RECEIPT_HASH"),
      receiptEventHash: hash(bundle.receipt.eventHash, "RECEIPT_EVENT_HASH"),
      receiptEventOrdinal: bundle.receipt.eventOrdinal,
      objectIdentityHash: hash(bundle.preview.manifest.payload.objectIdentityHash,
        "OBJECT_IDENTITY_HASH"),
      occurrenceIdentityHash: hash(bundle.preview.manifest.occurrenceIdentityHash,
        "OCCURRENCE_IDENTITY_HASH"),
      objectAlreadyPresent: bundle.receipt.objectAlreadyPresent,
      occurrenceRecorded: true,
      networkDenominatorIncremented: true,
      challengeServerKeyId: hash(bundle.networkTrust.challengeServerKeyId,
        "CHALLENGE_SERVER_KEY_ID"),
      receiptServerKeyId: hash(bundle.networkTrust.receiptServerKeyId,
        "RECEIPT_SERVER_KEY_ID"),
      nodeSoftwareRevisionHash: hash(
        bundle.preview.nodeSource.nodeSoftwareRevisionHash,
        "NODE_SOFTWARE_REVISION_HASH"),
      transportSignerKeyId: hash(bundle.receipt.transportSignerKeyId,
        "TRANSPORT_SIGNER_KEY_ID"),
      transportSignerRole: "CLIENT_TRANSPORT_POSSESSION_ONLY",
      transportSignerIsServerActorWitnessOrAuthority: false,
      externalBundleAndKeyEpochPinsApplied: true,
      challengeManifestReceiptRootsBound: true,
      nodeAdapterRowsReceiptAttested: false,
      adapterDeclarationCoverage:
        "PREVIEW_TO_LOCAL_BUNDLE_HASH_PLUS_CALLER_EXTERNAL_BUNDLE_HASH_PIN_ONLY",
      externalHeadAnchored: false,
      disposition: "QUARANTINED",
    });
  }
  return rows;
}

function typedGraph(completeEpisode, bundles) {
  const envelope = completeEpisode.input.actorIdentity.envelope;
  const delegationHash
    = bundles.DELEGATION_RESPONSIBILITY.preview.payload.delegationEnvelopeHash;
  const delegationEdgeHashes = new ArrayConstructor();
  for (let index = 0; index < envelope.delegationEdges.length; index += 1) {
    append(delegationEdgeHashes, hash(envelope.delegationEdges[index].delegationEdgeHash,
      "ACTOR_DELEGATION_EDGE_HASH"));
  }
  ArraySort(delegationEdgeHashes);
  return {
    order:
      "PrincipalEpoch→AccountableDeployment→Runtime/Embodiment→Delegation→Episode→Attempt",
    principalEpochHash: hash(envelope.principalEpochProjectionHash,
      "PRINCIPAL_EPOCH_HASH"),
    accountableDeploymentHash: hash(envelope.actorSubjectHash,
      "ACCOUNTABLE_DEPLOYMENT_HASH"),
    runtimeInstanceHash: hash(envelope.runtimeInstance.runtimeInstanceHash,
      "RUNTIME_INSTANCE_HASH"),
    embodimentRevisionHash: envelope.embodimentRevision === null ? null
      : hash(envelope.embodimentRevision.embodimentRevisionHash,
        "EMBODIMENT_REVISION_HASH"),
    delegationEnvelopeHash: hash(delegationHash, "TYPED_GRAPH_DELEGATION_HASH"),
    actorDelegationEdgeHashes: delegationEdgeHashes,
    delegationEnvelopeIsActorDelegationEdge: false,
    delegationEnvelopeSourceReplayed: false,
    runtimeToDelegationEdgeEstablished: false,
    episodeHash: hash(completeEpisode.join.subject.episodeHash, "EPISODE_HASH"),
    attemptHash: hash(completeEpisode.join.subject.attemptHash, "ATTEMPT_HASH"),
    actorIdentityEnvelopeHash: hash(
      completeEpisode.join.subject.actorIdentityEnvelopeHash,
      "TYPED_GRAPH_ACTOR_IDENTITY_ENVELOPE_HASH"),
    accountableDeploymentSubjectHash: hash(
      completeEpisode.join.subject.accountableDeploymentSubjectHash,
      "TYPED_GRAPH_ACCOUNTABLE_DEPLOYMENT_SUBJECT_HASH"),
    attemptActorSubjectHash: hash(
      completeEpisode.join.subject.attemptActorSubjectHash,
      "TYPED_GRAPH_ATTEMPT_ACTOR_SUBJECT_HASH"),
    structuralReferencesOnly: true,
    endToEndGraphContinuityEstablished: false,
    identityContinuityEstablished: false,
    delegationAuthorityEstablished: false,
    ipIdentityUsed: false,
    deviceIdentityUsed: false,
    baseModelIdentityUsed: false,
    globalScoreIdentityUsed: false,
  };
}

function conformanceBody(completeEpisode, pins) {
  exactObject(completeEpisode, ["input", "join"], "COMPLETE_EPISODE");
  exactObject(pins, ["expectedJoinHash", "laneTrust"], "EXTERNAL_PINS");

  // This is deliberately the first semantic operation.  No contract target is
  // derived until the existing complete-episode join and every external lane,
  // bundle, audience/registry/retention, and server-key epoch pin replay.
  const completeCheck = verifyOutsiderNetworkCompleteEpisodeJoin(
    completeEpisode.join, {
      input: completeEpisode.input,
      expectedJoinHash: pins.expectedJoinHash,
      laneTrust: pins.laneTrust,
    });
  if (!completeCheck.ok || completeCheck.sourceReplayComplete !== true
    || completeCheck.networkSourceReplayTrusted !== true
    || completeCheck.structuralJoinVerified !== true
    || completeCheck.status !== "HOLD") {
    fail(`COMPLETE_EPISODE_REPLAY_REQUIRED_FIRST:${completeCheck.error ?? "UNTRUSTED"}`);
  }

  const bundles = {
    ACTION_OUTCOME: laneBundle(completeEpisode.input, "ACTION_OUTCOME"),
    DELEGATION_RESPONSIBILITY:
      laneBundle(completeEpisode.input, "DELEGATION_RESPONSIBILITY"),
    PROSPECTIVE_CENSUS: laneBundle(completeEpisode.input, "PROSPECTIVE_CENSUS"),
  };
  const adapterContractBindings = contractBindings(completeEpisode, bundles);
  const replayRoots = networkReplayRoots(bundles, pins);
  const preservedV1NodeConformanceLinks = new ArrayConstructor();
  for (let index = 0; index < EXACT_LANES.length; index += 1) {
    const lane = EXACT_LANES[index];
    append(preservedV1NodeConformanceLinks, {
      lane,
      nodeConformanceHash: bundles[lane].preview.nodeConformance.conformanceHash,
    });
  }
  return {
    schema: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.conformance,
    schemaVersion: "2.0.0",
    conformanceClass:
      "SOURCE_REPLAYED_COMPLETE_EPISODE_EXACT_ADAPTER_CONTRACT_BINDING_HOLD_ONLY",
    supersession: {
      relationship: "APPEND_ONLY_VERSIONED_DESCENDANT",
      descendsFromSchema: "outsider/network-node-sdk-conformance/v1",
      supersedesScope: "ADAPTER_DECLARATION_REFERENCE_BINDING_ONLY",
      v1GloballyReplaced: false,
      ancestorSchemaAndFrozenArtifactsRemainUnmodified: true,
      preservedV1NodeConformanceLinks,
    },
    completeEpisode: {
      joinHash: completeCheck.joinHash,
      actorIdentitySourceHash:
        completeEpisode.input.actorIdentity.source.sourceHash,
      actorIdentityEnvelopeHash:
        completeEpisode.input.actorIdentity.envelope.actorIdentityEnvelopeHash,
      prospectiveCensusSourceHash:
        completeEpisode.input.prospectiveCensus.source.sourceHash,
      prospectiveCensusProjectionHash:
        completeEpisode.input.prospectiveCensus.projection.projectionHash,
      obligationGenesisHash: completeEpisode.join.sourceReplay.obligationGenesisHash,
      obligationStateHash: completeEpisode.join.sourceReplay.obligationStateHash,
      obligationRevision: completeEpisode.join.sourceReplay.obligationRevision,
      fullObligationLedgerSourceReplayComplete: false,
      rightsReviewSourceReplayed: false,
      privacyReviewSourceReplayed: false,
      sourceReplayComplete: true,
      sourceReplayScope:
        "SUPPLIED_COMPLETE_EPISODE_SOURCES_AND_PINNED_OBLIGATION_PREFIX_ONLY_OPAQUE_ADAPTER_TARGET_SOURCES_EXCLUDED",
      networkSourceReplayTrusted: true,
      structuralJoinVerified: true,
      independentOutcomeEstablished: false,
      status: "HOLD",
    },
    typedGraph: typedGraph(completeEpisode, bundles),
    adapterContractBindings,
    networkReplayRoots: replayRoots,
    conformanceChecks: {
      completeEpisodeVerifierCalledBeforeTargetDerivation: true,
      exactlySixAdapterContractBindings: true,
      everySdkConformanceEvidenceRefEqualsDerivedTarget: true,
      allSixDerivedTargetHashesPairwiseDistinct: true,
      exactlyThreeChallengeManifestReceiptRootBindings: true,
      opaqueDelegationEffectOutcomeSourcesReplayed: false,
      adapterArtifactSchemaVerified: false,
      adapterImplementationSourceReplayed: false,
      adapterFunctionalityVerified: false,
      singleNodeContinuityEstablished: false,
      crossLaneDeclarationConsistencyEstablished: false,
      crossLaneNodeSoftwareRevisionContinuityEstablished: false,
      structuralConformanceMintsAuthority: false,
      independentOutcomeEstablished: false,
      enabledCapabilities: 0,
      provenAuthorityCapabilities: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReachEnabled: 0,
      durableResponsibilitySourceReplayed: false,
      consequenceReachCommittedEvidenceEstablished: false,
      consequenceReachInvariantSatisfiedVacuouslyAtZero: true,
    },
    result: "NODE_CONTRACT_HASH_BINDINGS_VERIFIED_HOLD",
    status: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY,
  };
}

export function buildOutsiderNetworkNodeContractConformance(
  completeEpisode = {}, pins = {}) {
  rejectTree(completeEpisode);
  rejectTree(pins);
  canonicalizeStrict(completeEpisode);
  canonicalizeStrict(pins);
  const body = conformanceBody(completeEpisode, pins);
  return deepFreeze({ ...body, conformanceHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.conformance, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.verification,
    ok: false,
    sourceReplayComplete: false,
    sourceReplayScope: "NONE",
    networkSourceReplayTrusted: false,
    structuralJoinVerified: false,
    exactAdapterContractBindingsVerified: false,
    independentOutcomeEstablished: false,
    result: "HOLD",
    status: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY,
  });
}

export function verifyOutsiderNetworkNodeContractConformance(record, context = {}) {
  try {
    rejectTree(record);
    rejectTree(context);
    canonicalizeStrict(record);
    canonicalizeStrict(context);
    exactObject(context, ["completeEpisode", "pins", "expectedConformanceHash"],
      "VERIFY_CONTEXT");

    // Rebuilding performs the complete-episode verification first again.
    const expected = buildOutsiderNetworkNodeContractConformance(
      context.completeEpisode, context.pins);
    exactObject(record, ["schema", "schemaVersion", "conformanceClass",
      "supersession", "completeEpisode", "typedGraph", "adapterContractBindings",
      "networkReplayRoots", "conformanceChecks", "result", "status", "boundary",
      "conformanceHash"], "CONFORMANCE");
    if (!same(record, expected)) fail("CONFORMANCE_SOURCE_REPLAY_INVALID");
    if (expected.conformanceHash !== hash(context.expectedConformanceHash,
      "EXPECTED_CONFORMANCE_HASH")) fail("EXPECTED_CONFORMANCE_HASH_MISMATCH");
    return deepFreeze({
      schema: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_SCHEMAS.verification,
      ok: true,
      sourceReplayComplete: true,
      sourceReplayScope:
        "SUPPLIED_COMPLETE_EPISODE_SOURCES_AND_PINNED_OBLIGATION_PREFIX_ONLY_OPAQUE_ADAPTER_TARGET_SOURCES_EXCLUDED",
      networkSourceReplayTrusted: true,
      structuralJoinVerified: true,
      exactAdapterContractBindingsVerified: true,
      adapterContractBindingRows: 6,
      networkReplayRootRows: 3,
      independentOutcomeEstablished: false,
      conformanceHash: expected.conformanceHash,
      result: "NODE_CONTRACT_HASH_BINDINGS_VERIFIED_HOLD",
      status: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_NODE_CONTRACT_CONFORMANCE_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
