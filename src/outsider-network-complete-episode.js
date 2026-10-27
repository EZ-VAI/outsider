/*
 * Source-replayed, HOLD-only join for one network complete-episode structure.
 *
 * This module does not define a second actor, delegation, episode, census, or
 * outcome ontology.  It joins only fields already carried by the prospective
 * census, ActorIdentityEnvelope, Node SDK conformance, three Network Intake
 * lanes, and a caller-pinned immutable RealityObligation prefix.  The current
 * ACTION_OUTCOME projection has no outcome-observer identity or independence
 * field, so even a structurally complete join remains HOLD.
 */

import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_LANES,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  networkIntakeDigest,
} from "./outsider-network-intake.js";
import {
  verifyActorIdentityEnvelope,
} from "./outsider-actor-identity-envelope.js";
import {
  verifyOutsiderNetworkNodeSubmissionBundle,
} from "./outsider-network-node-client.js";
import {
  verifyProspectiveEpisodeCensusProjection,
} from "./outsider-prospective-episode-census.js";
import {
  verifyRealityObligationStatePrefix,
} from "./outsider-reality-obligation-store.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
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

export const OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS = ObjectFreeze({
  join: "outsider/network-complete-episode-join/v1",
  verification: "outsider/network-complete-episode-verification/v1",
});

export const OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY = deepFreeze({
  position: "CROSS_VENDOR_EVIDENCE_RESPONSIBILITY_NETWORK_NOT_VENDOR_SAFETY_CONTROLLER",
  joinScope: "STRUCTURAL_SOURCE_REPLAY_ONLY",
  networkSubmissionReplayScope:
    "EXTERNALLY_PINNED_NODE_SUBMISSION_BUNDLES_ONLY",
  externalPerLaneBundleHashRequired: true,
  externalPerLaneAudienceRegistryRetentionPinsRequired: true,
  externalPerLaneServerKeyEpochPinsRequired: true,
  laneInternalPublicKeysAcceptedAsTrustRoots: false,
  realityObligationReplayScope: "PINNED_IMMUTABLE_PREFIX_ONLY",
  fullRealityObligationLedgerReplayed: false,
  completeEpisodeTruthEstablished: false,
  outcomeObserverIdentityExpressibleInActionOutcomeV1: false,
  independentOutcomeEstablished: false,
  sameSubjectSelfReportAcceptedAsIndependentOutcome: false,
  vendorSuccessAcceptedAsOutcomeTruth: false,
  missingIndependentOutcomeAcceptedAsComplete: false,
  disposition: "QUARANTINED",
  status: "HOLD",
  automaticTraining: false,
  trainingRows: 0,
  permitsCuratePromotion: false,
  authority: "NONE",
  actionReady: false,
  executable: false,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_NETWORK_COMPLETE_EPISODE_${code}`);
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
  if (depth > 128) fail("VALUE_TOO_DEEP");
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

function exactNoAuthority(value, code) {
  if (value === null || typeof value !== "object") fail(`${code}_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail(`${code}_INVALID`);
    if (typeof descriptor.value === "boolean" && descriptor.value !== false) {
      fail(`${code}_ESCALATION`);
    }
  }
}

function replayCensus(value) {
  exactObject(value, ["source", "projection"], "PROSPECTIVE_CENSUS_INPUT");
  const checked = verifyProspectiveEpisodeCensusProjection(value.projection, {
    source: value.source,
    expectedSourceHash: value.source.sourceHash,
    expectedProjectionHash: value.projection.projectionHash,
  });
  if (!checked.ok) fail(`PROSPECTIVE_CENSUS_REPLAY_FAILED:${checked.error}`);
  return value;
}

function replayActor(value) {
  exactObject(value, ["source", "envelope"], "ACTOR_IDENTITY_INPUT");
  const checked = verifyActorIdentityEnvelope(value.envelope, {
    source: value.source,
    expectedSourceHash: value.source.sourceHash,
    expectedEnvelopeHash: value.envelope.actorIdentityEnvelopeHash,
  });
  if (!checked.ok) fail(`ACTOR_IDENTITY_REPLAY_FAILED:${checked.error}`);
  return value;
}

function exactLaneTrustRows(value) {
  denseArray(value, "LANE_TRUST", NETWORK_INTAKE_LANES.length);
  const rows = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["lane", "expectedBundleHash", "trustPolicy"], "LANE_TRUST_ROW");
    if (typeof row.lane !== "string") fail("LANE_TRUST_LANE_INVALID");
    hash(row.expectedBundleHash, "LANE_EXPECTED_BUNDLE_HASH");
    append(rows, row);
  }
  ArraySort(rows, (left, right) => left.lane < right.lane ? -1
    : left.lane > right.lane ? 1 : 0);
  const expected = [...NETWORK_INTAKE_LANES];
  ArraySort(expected, (left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (let index = 0; index < expected.length; index += 1) {
    if (rows[index].lane !== expected[index]) fail("EXACT_THREE_LANE_TRUST_ROWS_REQUIRED");
    for (let prior = 0; prior < index; prior += 1) {
      if (rows[index].expectedBundleHash === rows[prior].expectedBundleHash) {
        fail("LANE_EXPECTED_BUNDLE_HASH_MUST_BE_UNIQUE");
      }
    }
  }
  return rows;
}

function trustForBundle(rows, value) {
  let selected = null;
  let matches = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (value !== null && typeof value === "object"
      && value.bundleHash === rows[index].expectedBundleHash) {
      selected = rows[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail("LANE_BUNDLE_EXTERNAL_HASH_PIN_MISSING");
  return selected;
}

function replayLaneBundle(value, trust) {
  const checked = verifyOutsiderNetworkNodeSubmissionBundle(value, {
    expectedBundleHash: trust.expectedBundleHash,
    trustPolicy: trust.trustPolicy,
  });
  if (!checked.ok || checked.sourceReplayComplete !== true
    || checked.networkSourceReplayTrusted !== true) {
    fail(`LANE_NODE_SUBMISSION_BUNDLE_REPLAY_FAILED:${checked.error ?? "UNTRUSTED"}`);
  }
  const manifest = value.preview.manifest;
  const payload = value.preview.payload;
  const nodeSource = value.preview.nodeSource;
  const nodeConformance = value.preview.nodeConformance;
  if (manifest.lane !== trust.lane) fail("LANE_BUNDLE_EXTERNAL_LANE_PIN_MISMATCH");
  if (value.receipt.lane !== manifest.lane
    || value.receipt.disposition !== "QUARANTINED"
    || value.receipt.occurrenceRecorded !== true
    || value.receipt.networkDenominatorIncremented !== true
    || value.receipt.scientificCensusCompletenessEstablished !== false
    || !same(value.receipt.useBoundary, NETWORK_INTAKE_BOUNDARY)) {
    fail("LANE_RECEIPT_BOUNDARY_INVALID");
  }
  return {
    bundle: value,
    manifest,
    payload,
    nodeSource,
    nodeConformance,
    receipt: value.receipt,
  };
}

function replayAllLanes(value, laneTrust) {
  denseArray(value, "LANE_BUNDLES", NETWORK_INTAKE_LANES.length);
  const trustRows = exactLaneTrustRows(laneTrust);
  const rows = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const trust = trustForBundle(trustRows, value[index]);
    append(rows, replayLaneBundle(value[index], trust));
  }
  ArraySort(rows, (left, right) => left.manifest.lane < right.manifest.lane ? -1
    : left.manifest.lane > right.manifest.lane ? 1 : 0);
  const expected = [...NETWORK_INTAKE_LANES];
  ArraySort(expected, (left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (let index = 0; index < expected.length; index += 1) {
    if (rows[index].manifest.lane !== expected[index]) fail("EXACT_THREE_LANES_REQUIRED");
  }
  return rows;
}

function replayObligation(value) {
  exactObject(value, ["directory", "expectedRevision", "expectedStateHash",
    "expectedGenesisHash"], "OBLIGATION_PREFIX_INPUT");
  if (typeof value.directory !== "string" || value.directory.length < 1) {
    fail("OBLIGATION_DIRECTORY_REQUIRED");
  }
  const snapshot = verifyRealityObligationStatePrefix(value.directory, {
    expectedRevision: value.expectedRevision,
    expectedStateHash: hash(value.expectedStateHash, "EXPECTED_OBLIGATION_STATE_HASH"),
    expectedGenesisHash: hash(value.expectedGenesisHash, "EXPECTED_OBLIGATION_GENESIS_HASH"),
  });
  if (snapshot.verification.immutablePrefixReplayComplete !== true
    || snapshot.verification.sourceReplayScope !== "PINNED_IMMUTABLE_PREFIX_ONLY"
    || snapshot.verification.fullLedgerSourceReplayComplete !== false
    || snapshot.verification.mutableHeadRead !== false
    || snapshot.verification.writesPerformed !== false
    || snapshot.verification.testFixtureLedger !== false
    || snapshot.verification.externalClosureVerified !== false
    || snapshot.verification.productionClosureEstablished !== false
    || snapshot.verification.liveActionConnected !== false
    || snapshot.verification.actionReady !== false
    || snapshot.state.productionClosureEstablished !== false
    || snapshot.state.liveActionConnected !== false
    || snapshot.state.causalExperienceUnits !== 0
    || snapshot.state.obligationOutstanding !== true) {
    fail("OBLIGATION_PREFIX_NO_AUTHORITY_STATE_REQUIRED");
  }
  exactNoAuthority(snapshot.genesis.authority, "OBLIGATION_GENESIS_AUTHORITY");
  exactNoAuthority(snapshot.state.authority, "OBLIGATION_STATE_AUTHORITY");
  exactNoAuthority(snapshot.verification.authority, "OBLIGATION_VERIFICATION_AUTHORITY");
  return snapshot;
}

function claimWayWorld(subject) {
  return {
    claimHash: subject.claimHash,
    wayHash: subject.wayHash,
    worldHash: subject.worldHash,
  };
}

function actorClaimWayWorld(envelope) {
  return envelope.bindings.claimWayWorld;
}

function materializedSubject(subject) {
  return {
    episodeHash: subject.episodeHash,
    attemptHash: subject.attemptHash,
    actorIdentityEnvelopeHash: subject.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash: subject.accountableDeploymentSubjectHash,
    attemptActorSubjectHash: subject.attemptActorSubjectHash,
  };
}

function laneNamed(rows, lane) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].manifest.lane === lane) return rows[index];
  }
  fail("LANE_MISSING");
}

function enforceSubjectJoin(census, actor, lanes, obligation) {
  const censusLane = laneNamed(lanes, "PROSPECTIVE_CENSUS");
  const delegationLane = laneNamed(lanes, "DELEGATION_RESPONSIBILITY");
  const actionLane = laneNamed(lanes, "ACTION_OUTCOME");
  if (actionLane.manifest.payloadSchema
      !== NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME
    || actionLane.payload.schema !== NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME) {
    fail("ACTION_OUTCOME_V1_REQUIRED_FOR_V1_JOIN");
  }
  const censusProjection = census.projection;
  if (!same(censusLane.manifest.subject,
    censusProjection.networkProjection.subject)
    || !same(censusLane.payload, censusProjection.networkProjection.payload)) {
    fail("CENSUS_NETWORK_PROJECTION_BINDING_MISMATCH");
  }
  const expectedCww = {
    claimHash: census.source.bindings.claimHash,
    wayHash: census.source.bindings.wayHash,
    worldHash: census.source.bindings.worldHash,
  };
  for (let index = 0; index < lanes.length; index += 1) {
    const subject = lanes[index].manifest.subject;
    if (!same(claimWayWorld(subject), expectedCww)
      || subject.cohortHash !== census.source.bindings.cohortHash
      || subject.censusSlotHash !== census.source.bindings.censusSlotHash) {
      fail("LANE_CLAIM_WAY_WORLD_COHORT_SLOT_MISMATCH");
    }
  }
  if (!same(actorClaimWayWorld(actor.envelope), expectedCww)) {
    fail("ACTOR_CLAIM_WAY_WORLD_MISMATCH");
  }
  const materialized = materializedSubject(delegationLane.manifest.subject);
  if (!same(materialized, materializedSubject(actionLane.manifest.subject))) {
    fail("DELEGATION_ACTION_MATERIALIZED_SUBJECT_MISMATCH");
  }
  if (materialized.episodeHash !== actor.envelope.bindings.run.episodeHash
    || materialized.attemptHash !== actor.envelope.bindings.run.attemptHash
    || materialized.actorIdentityEnvelopeHash !== actor.envelope.actorIdentityEnvelopeHash
    || materialized.accountableDeploymentSubjectHash !== actor.envelope.actorSubjectHash
    || materialized.attemptActorSubjectHash !== actor.envelope.attemptActorSubjectHash) {
    fail("NETWORK_ACTOR_IDENTITY_BINDING_MISMATCH");
  }
  const obligationBindings = obligation.genesis.bindings;
  if (!same({
    claimHash: obligationBindings.claimHash,
    wayHash: obligationBindings.wayHash,
    worldHash: obligationBindings.worldHash,
  }, expectedCww)
    || obligationBindings.episodeHash !== materialized.episodeHash
    || obligationBindings.attemptHash !== materialized.attemptHash) {
    fail("OBLIGATION_SUBJECT_BINDING_MISMATCH");
  }
  const registrationHash
    = census.source.registration.preActionRegistrationReferenceHash;
  const slotHash = census.source.bindings.censusSlotHash;
  const censusLedgerHash = censusProjection.projectionHash;
  if (censusLane.payload.preActionRegistrationReferenceHash !== registrationHash
    || actor.envelope.bindings.run.censusHash !== censusLedgerHash
    || obligationBindings.censusRegistrationHash !== registrationHash) {
    fail("REGISTRATION_ACTOR_OBLIGATION_CROSSWALK_MISMATCH");
  }
  if (slotHash === registrationHash || slotHash === censusLedgerHash
    || registrationHash === censusLedgerHash) {
    fail("SLOT_REGISTRATION_LEDGER_HASHES_MUST_REMAIN_DISTINCT");
  }
  if (actionLane.payload.obligationStateHash !== obligation.stateHash) {
    fail("ACTION_OUTCOME_OBLIGATION_PREFIX_STATE_MISMATCH");
  }
  return {
    expectedCww,
    materialized,
    registrationHash,
    slotHash,
    censusLedgerHash,
    cohortHash: census.source.bindings.cohortHash,
    censusLane,
    delegationLane,
    actionLane,
  };
}

function joinBody(input, context) {
  exactObject(input, ["prospectiveCensus", "actorIdentity", "laneBundles",
    "obligationPrefix"], "JOIN_INPUT");
  exactObject(context, ["laneTrust"], "JOIN_CONTEXT");
  const census = replayCensus(input.prospectiveCensus);
  const actor = replayActor(input.actorIdentity);
  const lanes = replayAllLanes(input.laneBundles, context.laneTrust);
  const obligation = replayObligation(input.obligationPrefix);
  const joined = enforceSubjectJoin(census, actor, lanes, obligation);
  const laneReferences = new ArrayConstructor();
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    append(laneReferences, {
      lane: lane.manifest.lane,
      nodeSubmissionBundleHash: lane.bundle.bundleHash,
      manifestHash: lane.manifest.manifestHash,
      occurrenceIdentityHash: lane.manifest.occurrenceIdentityHash,
      objectIdentityHash: lane.manifest.payload.objectIdentityHash,
      nodeSourceHash: lane.nodeSource.sourceHash,
      nodeConformanceHash: lane.nodeConformance.conformanceHash,
      receiptHash: lane.receipt.receiptHash,
      transportSignerKeyId: lane.receipt.transportSignerKeyId,
      transportSignerIsActorIdentity: false,
      disposition: "QUARANTINED",
    });
  }
  return {
    schema: OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS.join,
    schemaVersion: "1.0.0",
    joinClass: "SOURCE_REPLAYED_CROSS_LANE_COMPLETE_EPISODE_STRUCTURE_HOLD_ONLY",
    subject: {
      claimWayWorld: joined.expectedCww,
      episodeHash: joined.materialized.episodeHash,
      attemptHash: joined.materialized.attemptHash,
      actorIdentityEnvelopeHash: joined.materialized.actorIdentityEnvelopeHash,
      accountableDeploymentSubjectHash:
        joined.materialized.accountableDeploymentSubjectHash,
      attemptActorSubjectHash: joined.materialized.attemptActorSubjectHash,
      cohortHash: joined.cohortHash,
      censusSlotHash: joined.slotHash,
    },
    censusCrosswalk: {
      censusSlotHash: joined.slotHash,
      preActionRegistrationReferenceHash: joined.registrationHash,
      actorCensusHash: actor.envelope.bindings.run.censusHash,
      obligationCensusRegistrationHash:
        obligation.genesis.bindings.censusRegistrationHash,
      censusLedgerProjectionHash: joined.censusLedgerHash,
      actorCensusHashEqualsCensusLedgerProjectionHash: true,
      obligationCensusRegistrationHashEqualsRegistrationHash: true,
      slotHashIsRegistrationHash: false,
      slotHashIsCensusLedgerHash: false,
      registrationHashIsCensusLedgerHash: false,
    },
    sourceReplay: {
      prospectiveCensusSourceHash: census.source.sourceHash,
      prospectiveCensusProjectionHash: census.projection.projectionHash,
      actorIdentitySourceHash: actor.source.sourceHash,
      actorIdentityEnvelopeHash: actor.envelope.actorIdentityEnvelopeHash,
      laneReferences,
      obligationGenesisHash: obligation.genesis.genesisHash,
      obligationStateHash: obligation.stateHash,
      obligationRevision: obligation.revision,
      networkSourceReplayComplete: true,
      networkSourceReplayTrusted: true,
      obligationImmutablePrefixReplayComplete: true,
      fullObligationLedgerSourceReplayComplete: false,
      mutableObligationHeadRead: false,
      writesPerformed: false,
    },
    structuralChecks: {
      prospectiveCensusSourceReplayed: true,
      actorIdentityEnvelopeSourceReplayed: true,
      allThreeNodeSubmissionBundlesExternallyPinnedAndReplayed: true,
      allThreeLaneManifestsAndReceiptsSourceReplayed: true,
      allThreeNodeConformancesSourceReplayed: true,
      noLaneInternalPublicKeyAcceptedAsTrustRoot: true,
      exactClaimWayWorldAcrossSources: true,
      exactCohortAndSlotAcrossLanes: true,
      exactDelegationActionEpisodeAttemptActorTuple: true,
      exactActorIdentityEnvelopeBinding: true,
      exactRegistrationActorObligationCrosswalk: true,
      slotRegistrationAndLedgerHashesRemainDistinct: true,
      actionOutcomeBoundToPinnedObligationState: true,
      transportSignerSeparatedFromActor: true,
      structuralJoinVerified: true,
    },
    outcomeBoundary: {
      actionOutcomeProjectionPresent: true,
      outcomeEvidenceHash: joined.actionLane.payload.outcomeEvidenceHash,
      actionOutcomeProjectionExternalOutcomeVerified: false,
      outcomeObserverIdentityPresentInExistingSchema: false,
      independentOutcomeEstablished: false,
      sameSubjectSelfReportAcceptedAsIndependentOutcome: false,
      vendorSuccessAcceptedAsOutcomeTruth: false,
      missingIndependentOutcomeDecision: "HOLD",
      reason:
        "ACTION_OUTCOME_V1_HAS_NO_OUTCOME_OBSERVER_IDENTITY_OR_INDEPENDENCE_BINDING",
    },
    result: "COMPLETE_EPISODE_JOIN_STRUCTURE_VERIFIED_HOLD",
    status: "HOLD",
    boundary: OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY,
  };
}

export function createOutsiderNetworkCompleteEpisodeJoin(input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  canonicalizeStrict(input);
  canonicalizeStrict(context);
  const body = joinBody(input, context);
  return deepFreeze({ ...body, joinHash: networkIntakeDigest(
    OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS.join, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS.verification,
    ok: false,
    sourceReplayComplete: false,
    networkSourceReplayComplete: false,
    networkSourceReplayTrusted: false,
    structuralJoinVerified: false,
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
    boundary: OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY,
  });
}

export function verifyOutsiderNetworkCompleteEpisodeJoin(record, context = {}) {
  try {
    rejectTree(record);
    rejectTree(context);
    canonicalizeStrict(record);
    exactObject(context, ["input", "expectedJoinHash", "laneTrust"], "VERIFY_CONTEXT");
    exactObject(record, ["schema", "schemaVersion", "joinClass", "subject",
      "censusCrosswalk", "sourceReplay", "structuralChecks", "outcomeBoundary", "result",
      "status", "boundary", "joinHash"], "JOIN");
    if (record.schema !== OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS.join
      || record.schemaVersion !== "1.0.0"
      || record.joinClass
        !== "SOURCE_REPLAYED_CROSS_LANE_COMPLETE_EPISODE_STRUCTURE_HOLD_ONLY"
      || record.result !== "COMPLETE_EPISODE_JOIN_STRUCTURE_VERIFIED_HOLD"
      || record.status !== "HOLD"
      || !same(record.boundary, OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY)) {
      fail("JOIN_STATE_INVALID");
    }
    const rebuilt = createOutsiderNetworkCompleteEpisodeJoin(context.input, {
      laneTrust: context.laneTrust,
    });
    if (!same(record, rebuilt)) fail("JOIN_SOURCE_REPLAY_INVALID");
    if (record.joinHash !== hash(context.expectedJoinHash, "EXPECTED_JOIN_HASH")) {
      fail("EXPECTED_JOIN_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_NETWORK_COMPLETE_EPISODE_SCHEMAS.verification,
      ok: true,
      sourceReplayComplete: true,
      networkSourceReplayComplete: true,
      networkSourceReplayTrusted: true,
      sourceReplayScope: "ALL_SUPPLIED_SOURCES_AND_PINNED_OBLIGATION_PREFIX",
      fullObligationLedgerSourceReplayComplete: false,
      structuralJoinVerified: true,
      independentOutcomeEstablished: false,
      joinHash: rebuilt.joinHash,
      result: "COMPLETE_EPISODE_JOIN_STRUCTURE_VERIFIED_HOLD",
      status: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_COMPLETE_EPISODE_BOUNDARY,
    });
  } catch (error) { return verificationFailure(error); }
}
