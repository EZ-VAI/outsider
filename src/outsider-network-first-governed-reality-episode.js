/*
 * Stage 5: one source-replayed governed-reality episode witness path.
 *
 * ACTION_OUTCOME/v2 is a delayed successor in the existing ACTION_OUTCOME
 * lane.  It does not replace the v1 three-lane join and does not add a fourth
 * lane.  This module joins existing records only: the v1 complete-episode
 * structure, a source-byte-replayed second ActorIdentityEnvelope witness, an
 * externally pinned relationship review, the affected-party review register,
 * a structurally rederived consequence report, and a later pinned immutable
 * obligation prefix.  The joined path remains quarantine/HOLD and creates no
 * outcome truth, causality, closure, CEU, training, action, or economics.
 */

import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyAffectedPartyRegister } from "./outsider-affected-party-register.js";
import {
  NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS,
  NETWORK_INTAKE_BOUNDARY,
  networkIntakeDigest,
} from "./outsider-network-intake.js";
import {
  verifyOutsiderNetworkCompleteEpisodeJoin,
} from "./outsider-network-complete-episode.js";
import {
  verifyOutsiderNetworkNodeSubmissionBundle,
} from "./outsider-network-node-client.js";
import {
  OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  OutsiderOutcomeWitnessAdapterRegistry,
  verifyOutsiderOutcomeWitnessEnvelope,
} from "./outsider-network-outcome-witness.js";
import {
  verifyRealityObligationStatePrefix,
} from "./outsider-reality-obligation-store.js";
import {
  verifyConsequenceReport,
  verifyRealityBoundary,
  verifyRealityExecutionReceipt,
  verifyStewardshipClaim,
} from "./outsider-reality-stewardship.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateParse = Date.parse;
const JSONParse = JSON.parse;
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

export const OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS = ObjectFreeze({
  certificate: "outsider/first-governed-reality-episode-certificate/v1",
  verification: "outsider/first-governed-reality-episode-verification/v1",
  affectedPartyReportSet: "outsider/network-affected-party-report-set/v1",
  recoveryEvidenceSet: "outsider/network-recovery-evidence-set/v1",
  normalizedObservation:
    "outsider/network-outcome-witness-normalized-observation/v1",
});

export const OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY = deepFreeze({
  stage: "STAGE_5_FIRST_GOVERNED_REALITY_EPISODE_WITNESS_PATH",
  position: "CROSS_VENDOR_EVIDENCE_NETWORK_NOT_VENDOR_NATIVE_SAFETY_CONTROLLER",
  vendorNativeSafetyControllerReimplemented: false,
  existingNetworkLanes: 3,
  fourthLaneAdded: false,
  actionOutcomeV1JoinPreserved: true,
  actionOutcomeV2SameLaneDelayedSuccessor: true,
  sourceByteReplayRequired: true,
  secondTypedActorIdentityRequired: true,
  externallyPinnedRelationshipReviewRequired: true,
  affectedPartyAndDelayedObligationCrosswalkRequired: true,
  topLevelEffectChannelGapRequired: true,
  pathCompleteRequiresZeroEffectChannelGap: true,
  pathCompleteRequiresExternallyReplayedAdapterCodeClosure: true,
  adapterCodeClosureExternallyReplayed: false,
  rawSourceBytesInCertificate: false,
  relationshipReviewSourceReplayed: false,
  independencePolicyVerifiedWithinScopeIsOutcomeTruth: false,
  organizationalIndependenceEstablished: false,
  independentOutcomeTruthEstablished: false,
  causalAttributionEstablished: false,
  obligationClosureEstablished: false,
  affectedPartyCompletenessEstablished: false,
  affectedPartyStandingEstablished: false,
  disposition: "QUARANTINED",
  status: "HOLD",
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

function fail(code) {
  throw new TypeErrorConstructor(
    `OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)
    || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
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

function denseArray(value, code, { nonempty = false, maximum = 4096 } = {}) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
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

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function includes(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function sortedHashes(values, code, { nonempty = false } = {}) {
  denseArray(values, code, { nonempty, maximum: 4096 });
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    append(result, hash(values[index], `${code}_HASH`));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function sortedStrings(values, code, { nonempty = false } = {}) {
  denseArray(values, code, { nonempty, maximum: 4096 });
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "string" || values[index].length < 1
      || values[index].length > 256) fail(`${code}_VALUE_INVALID`);
    append(result, values[index]);
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function requireNoIntersection(left, right, code) {
  for (let index = 0; index < left.length; index += 1) {
    if (includes(right, left[index])) fail(`${code}_ROLE_ROOT_COLLISION`);
  }
}

function requireSuperset(superset, required, code) {
  for (let index = 0; index < required.length; index += 1) {
    if (!includes(superset, required[index])) fail(`${code}_CORE_ROOT_MISSING`);
  }
}

function identityRoots(envelope) {
  const roots = [
    envelope.actorIdentityEnvelopeHash,
    envelope.actorSubjectHash,
    envelope.attemptActorSubjectHash,
    envelope.principalEpochProjectionHash,
    envelope.deploymentLineageProjectionHash,
    envelope.runtimeInstance.runtimeInstanceHash,
    envelope.principalEpoch.controllerKeyRefHash,
    envelope.deploymentRevision.providerRootHash,
    envelope.principalEpoch.trustDomainRefHash,
  ];
  return sortedHashes(roots, "IDENTITY_CORE_ROOTS", { nonempty: true });
}

function laneBundleNamed(bundles, lane) {
  denseArray(bundles, "BASE_LANE_BUNDLES", { nonempty: true, maximum: 3 });
  let found = null;
  let matches = 0;
  for (let index = 0; index < bundles.length; index += 1) {
    if (bundles[index]?.preview?.manifest?.lane === lane) {
      found = bundles[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail("BASE_ACTION_OUTCOME_LANE_NOT_UNIQUE");
  return found;
}

function horizonNamed(rows, horizonId, code) {
  denseArray(rows, `${code}_ROWS`, { nonempty: true, maximum: 4096 });
  let found = null;
  let matches = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.horizonId === horizonId) {
      found = rows[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`${code}_NOT_UNIQUE`);
  return found;
}

function exactNoAuthority(value, code) {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    fail(`${code}_INVALID`);
  }
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

function verifyBaseEpisode(baseEpisode, context) {
  exactObject(baseEpisode, ["join", "input"], "BASE_EPISODE");
  const expectedBaseJoinHash = hash(context.expectedBaseJoinHash,
    "EXPECTED_BASE_JOIN_HASH");
  if (baseEpisode.join.joinHash !== expectedBaseJoinHash) {
    fail("BASE_JOIN_EXTERNAL_HASH_PIN_MISMATCH");
  }
  const checked = verifyOutsiderNetworkCompleteEpisodeJoin(baseEpisode.join, {
    input: baseEpisode.input,
    expectedJoinHash: expectedBaseJoinHash,
    laneTrust: context.baseLaneTrust,
  });
  if (!checked.ok || checked.sourceReplayComplete !== true
    || checked.networkSourceReplayTrusted !== true
    || checked.structuralJoinVerified !== true
    || checked.independentOutcomeEstablished !== false
    || checked.authority !== "NONE" || checked.trainingRows !== 0
    || checked.causalExperienceUnits !== 0) {
    fail(`BASE_JOIN_REPLAY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  return { checked, actionBundle: laneBundleNamed(
    baseEpisode.input.laneBundles, "ACTION_OUTCOME") };
}

function verifyWitnessSuccessor(input, context, base) {
  exactObject(input, ["nodeSubmissionBundle", "witnessIdentity", "sourceManifest",
    "sourceObjects", "relationshipReview", "envelope"], "OUTCOME_WITNESS_INPUT");
  exactObject(context.outcomeWitnessNetworkTrust,
    ["expectedBundleHash", "trustPolicy"], "OUTCOME_WITNESS_NETWORK_TRUST");
  const expectedBundleHash = hash(
    context.outcomeWitnessNetworkTrust.expectedBundleHash,
    "EXPECTED_OUTCOME_WITNESS_BUNDLE_HASH");
  if (input.nodeSubmissionBundle.bundleHash !== expectedBundleHash) {
    fail("OUTCOME_WITNESS_BUNDLE_EXTERNAL_HASH_PIN_MISMATCH");
  }
  const networkCheck = verifyOutsiderNetworkNodeSubmissionBundle(
    input.nodeSubmissionBundle, { expectedBundleHash,
      trustPolicy: context.outcomeWitnessNetworkTrust.trustPolicy });
  if (!networkCheck.ok || networkCheck.sourceReplayComplete !== true
    || networkCheck.networkSourceReplayTrusted !== true) {
    fail(`OUTCOME_WITNESS_NETWORK_REPLAY_INVALID:${networkCheck.error ?? "UNTRUSTED"}`);
  }
  const bundle = input.nodeSubmissionBundle;
  const manifest = bundle.preview.manifest;
  const payload = bundle.preview.payload;
  const baseBundle = base.actionBundle;
  const baseManifest = baseBundle.preview.manifest;
  const basePayload = baseBundle.preview.payload;
  if (manifest.lane !== "ACTION_OUTCOME"
    || manifest.payloadSchema !== NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2
    || payload.schema !== NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2
    || baseManifest.payloadSchema !== NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V1
    || basePayload.schema !== NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V1
    || bundle.disposition !== "QUARANTINED" || bundle.decision !== "HOLD"
    || !same(bundle.boundary, input.nodeSubmissionBundle.boundary)
    || !same(bundle.receipt.useBoundary, NETWORK_INTAKE_BOUNDARY)) {
    fail("ACTION_OUTCOME_V2_SUCCESSOR_STATE_INVALID");
  }
  if (!same(manifest.subject, baseManifest.subject)
    || payload.baseActionOutcomeManifestHash !== baseManifest.manifestHash
    || payload.baseActionOutcomeBundleHash !== baseBundle.bundleHash
    || payload.baseActionOutcomeOccurrenceIdentityHash
      !== baseManifest.occurrenceIdentityHash
    || manifest.manifestHash === baseManifest.manifestHash
    || bundle.bundleHash === baseBundle.bundleHash
    || manifest.occurrenceIdentityHash === baseManifest.occurrenceIdentityHash) {
    fail("ACTION_OUTCOME_V2_BASE_SUCCESSOR_BINDING_INVALID");
  }
  if (payload.attemptRecordHash !== baseManifest.subject.attemptHash
    || payload.executionEvidenceHash !== basePayload.executionEvidenceHash
    || payload.observationStatus !== "OBSERVED"
    || payload.consequenceReportHash === null
    || payload.affectedPartyReportSetHash === null
    || payload.externalOutcomeVerified !== false
    || payload.causalAttributionEstablished !== false
    || payload.obligationClosed !== false) {
    fail("ACTION_OUTCOME_V2_OBSERVED_HOLD_STATE_REQUIRED");
  }
  if (DateParse(payload.observedAt) <= DateParse(baseBundle.receipt.receivedAt)
    || DateParse(manifest.createdAt) < DateParse(payload.observedAt)) {
    fail("ACTION_OUTCOME_V2_NOT_A_DELAYED_SUCCESSOR");
  }
  const target = {
    claimHash: manifest.subject.claimHash,
    wayHash: manifest.subject.wayHash,
    worldHash: manifest.subject.worldHash,
    episodeHash: manifest.subject.episodeHash,
    attemptHash: manifest.subject.attemptHash,
    executionEvidenceHash: payload.executionEvidenceHash,
  };
  const horizon = {
    horizonId: payload.horizonId,
    obligationHorizonCommitmentHash: payload.obligationHorizonCommitmentHash,
    affectedPartyHorizonBindingHash: payload.affectedPartyHorizonBindingHash,
  };
  if (!(context.outcomeWitnessAdapterRegistry
      instanceof OutsiderOutcomeWitnessAdapterRegistry)) {
    fail("OUTCOME_WITNESS_ADAPTER_REGISTRY_REQUIRED");
  }
  if (typeof context.outcomeWitnessAdapterId !== "string") {
    fail("OUTCOME_WITNESS_ADAPTER_ID_REQUIRED");
  }
  const witnessCheck = verifyOutsiderOutcomeWitnessEnvelope(input.envelope, {
    expectedEnvelopeHash: payload.outcomeWitnessEnvelopeHash,
    witnessIdentity: input.witnessIdentity,
    sourceReplay: {
      registry: context.outcomeWitnessAdapterRegistry,
      adapterId: context.outcomeWitnessAdapterId,
      sourceManifest: input.sourceManifest,
      sourceObjects: input.sourceObjects,
      target,
      horizon,
    },
    relationshipReview: input.relationshipReview,
    trustPolicy: context.outcomeWitnessTrustPolicy,
  });
  if (!witnessCheck.ok || witnessCheck.sourceByteReplayComplete !== true
    || witnessCheck.adapterProjectionSpecificationAndSchemaReplayed !== true
    || witnessCheck.adapterImplementationOrCodeClosureReplayed !== false
    || witnessCheck.secondTypedActorIdentityReplayed !== true
    || witnessCheck.independencePolicyVerifiedWithinScope !== true
    || witnessCheck.organizationalIndependenceEstablished !== false
    || witnessCheck.independentOutcomeTruthEstablished !== false
    || witnessCheck.authority !== "NONE" || witnessCheck.trainingRows !== 0
    || witnessCheck.causalExperienceUnits !== 0) {
    fail(`OUTCOME_WITNESS_REPLAY_INVALID:${witnessCheck.error ?? "UNTRUSTED"}`);
  }
  const observation = input.envelope.observation;
  if (payload.outcomeWitnessEnvelopeHash !== input.envelope.envelopeHash
    || payload.witnessSourceManifestHash !== input.sourceManifest.sourceManifestHash
    || payload.witnessSourceManifestHash !== input.envelope.sourceManifestHash
    || payload.witnessReplayReceiptHash !== input.envelope.replayReceiptHash
    || payload.witnessRelationshipReviewHash !== input.relationshipReview.reviewHash
    || payload.witnessRelationshipReviewHash !== input.envelope.relationshipReviewHash
    || payload.observationStatus !== observation.observationStatus
    || payload.observedAt !== observation.observedAt
    || payload.consequenceReportHash !== observation.consequenceReportHash
    || payload.affectedPartyReportSetHash !== observation.affectedPartyReportSetHash
    || payload.recoveryEvidenceSetHash !== observation.recoveryEvidenceSetHash
    || !same(input.envelope.target, target) || !same(input.envelope.horizon, horizon)
    || manifest.source.sourceManifestHash !== input.sourceManifest.sourceManifestHash
    || manifest.source.instrumentHash !== input.envelope.instrumentHash
    || manifest.source.rightsReviewHash !== input.sourceManifest.rightsReviewHash
    || manifest.source.privacyReviewHash !== input.sourceManifest.privacyReviewHash) {
    fail("OUTCOME_WITNESS_SOURCE_NETWORK_CROSSWALK_INVALID");
  }
  return { bundle, manifest, payload, target, horizon, observation, witnessCheck };
}

function verifyRoleSeparation(baseEpisode, witnessInput, successor) {
  const actorEnvelope = baseEpisode.input.actorIdentity.envelope;
  const witnessEnvelope = witnessInput.witnessIdentity.envelope;
  const actorRoots = identityRoots(actorEnvelope);
  const witnessRoots = identityRoots(witnessEnvelope);
  requireNoIntersection(actorRoots, witnessRoots, "ACTOR_WITNESS");
  const reviewActorRoots = sortedHashes(
    witnessInput.relationshipReview.actor.correlationRootHashes,
    "RELATIONSHIP_REVIEW_ACTOR_ROOTS", { nonempty: true });
  const reviewWitnessRoots = sortedHashes(
    witnessInput.relationshipReview.witness.correlationRootHashes,
    "RELATIONSHIP_REVIEW_WITNESS_ROOTS", { nonempty: true });
  requireSuperset(reviewActorRoots, actorRoots, "RELATIONSHIP_REVIEW_ACTOR");
  requireSuperset(reviewWitnessRoots, witnessRoots, "RELATIONSHIP_REVIEW_WITNESS");
  if (witnessInput.relationshipReview.actor.identityEnvelopeHash
      !== actorEnvelope.actorIdentityEnvelopeHash
    || witnessInput.relationshipReview.actor.subjectHash !== actorEnvelope.actorSubjectHash
    || witnessInput.relationshipReview.witness.identityEnvelopeHash
      !== witnessEnvelope.actorIdentityEnvelopeHash
    || witnessInput.relationshipReview.witness.subjectHash
      !== witnessEnvelope.actorSubjectHash) {
    fail("RELATIONSHIP_REVIEW_IDENTITY_CROSSWALK_INVALID");
  }
  const protectedRoots = [...actorRoots, ...witnessRoots,
    witnessInput.envelope.signingKeyId,
    witnessInput.relationshipReview.issuerOrganizationHash,
    witnessInput.relationshipReview.signature.keyId];
  for (let index = 0; index < protectedRoots.length; index += 1) {
    for (let prior = 0; prior < index; prior += 1) {
      if (protectedRoots[index] === protectedRoots[prior]) {
        fail("IDENTITY_WITNESS_REVIEW_ROLE_ROOT_COLLISION");
      }
    }
  }
  const transportKeys = new ArrayConstructor();
  const baseBundles = baseEpisode.input.laneBundles;
  for (let index = 0; index < baseBundles.length; index += 1) {
    append(transportKeys, baseBundles[index].receipt.transportSignerKeyId);
  }
  append(transportKeys, successor.bundle.receipt.transportSignerKeyId);
  for (let index = 0; index < transportKeys.length; index += 1) {
    if (includes(protectedRoots, transportKeys[index])) {
      fail("TRANSPORT_SIGNER_ACTOR_WITNESS_REVIEW_ROLE_COLLISION");
    }
  }
  return { actorRoots, witnessRoots,
    witnessSigningKeyId: witnessInput.envelope.signingKeyId,
    relationshipReviewIssuerOrganizationHash:
      witnessInput.relationshipReview.issuerOrganizationHash,
    relationshipReviewIssuerKeyId: witnessInput.relationshipReview.signature.keyId,
    transportSignerKeyId: successor.bundle.receipt.transportSignerKeyId };
}

function verifyAffectedParty(input, baseJoin, successor) {
  exactObject(input, ["source", "register"], "AFFECTED_PARTY_INPUT");
  const checked = verifyAffectedPartyRegister(input.register, {
    source: input.source,
    expectedSourceHash: input.source.sourceHash,
    expectedAffectedPartyRootHash: successor.payload.affectedPartyRegisterRootHash,
  });
  if (!checked.ok || checked.sourceReplayComplete !== true
    || checked.effectReviewSourceRebuildComplete !== true
    || checked.affectedPartyCompletenessEstablished !== false
    || checked.standingEstablished !== false || checked.externalAuthorityEstablished !== false
    || checked.closureEstablished !== false || checked.actionReady !== false
    || checked.causalExperienceUnits !== 0) {
    fail(`AFFECTED_PARTY_REGISTER_REPLAY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  const expectedSubject = {
    claimHash: baseJoin.subject.claimWayWorld.claimHash,
    wayHash: baseJoin.subject.claimWayWorld.wayHash,
    worldHash: baseJoin.subject.claimWayWorld.worldHash,
    episodeHash: baseJoin.subject.episodeHash,
    attemptHash: baseJoin.subject.attemptHash,
    censusHash: baseJoin.censusCrosswalk.censusLedgerProjectionHash,
  };
  if (!same(input.register.subjectBindings, expectedSubject)
    || input.register.affectedPartyRootHash
      !== successor.payload.affectedPartyRegisterRootHash) {
    fail("AFFECTED_PARTY_SUBJECT_CROSSWALK_INVALID");
  }
  const horizon = horizonNamed(input.register.mandatoryHorizonRows,
    successor.payload.horizonId, "AFFECTED_PARTY_HORIZON");
  if (horizon.mandatory !== true
    || horizon.horizonHash !== successor.payload.affectedPartyHorizonBindingHash) {
    fail("AFFECTED_PARTY_HORIZON_CROSSWALK_INVALID");
  }
  const coverageRoots = new ArrayConstructor();
  for (let index = 0; index < input.register.coverageSubjects.length; index += 1) {
    append(coverageRoots, input.register.coverageSubjects[index].coverageSubjectRefHash);
  }
  return { checked, horizon, coverageRoots: sortedHashes(coverageRoots,
    "AFFECTED_PARTY_COVERAGE_ROOTS", { nonempty: true }) };
}

function verifyConsequence(input, baseJoin, successor, affected) {
  exactObject(input, ["boundary", "claim", "execution", "report"],
    "CONSEQUENCE_INPUT");
  const boundaryCheck = verifyRealityBoundary(input.boundary);
  const claimCheck = verifyStewardshipClaim(input.claim, { boundary: input.boundary });
  const executionCheck = verifyRealityExecutionReceipt(input.execution,
    { boundary: input.boundary, claim: input.claim });
  const reportCheck = verifyConsequenceReport(input.report,
    { boundary: input.boundary, claim: input.claim, execution: input.execution });
  if (!boundaryCheck.ok || !claimCheck.ok || !executionCheck.ok || !reportCheck.ok
    || reportCheck.protocolInputsReplayed !== true
    || reportCheck.measurementTruthExternallyVerified !== false
    || reportCheck.affectedPartyReportsExternallyVerified !== false
    || reportCheck.recoveryExternallyVerified !== false) {
    fail(`CONSEQUENCE_SOURCE_REPLAY_INVALID:${reportCheck.error
      ?? executionCheck.error ?? claimCheck.error ?? boundaryCheck.error ?? "UNTRUSTED"}`);
  }
  const cww = baseJoin.subject.claimWayWorld;
  if (input.claim.claimHash !== cww.claimHash || input.claim.wayHash !== cww.wayHash
    || input.boundary.worldHash !== cww.worldHash
    || input.execution.executionEvidenceHash !== successor.payload.executionEvidenceHash
    || input.report.consequenceHash !== successor.payload.consequenceReportHash
    || input.report.horizonId !== successor.payload.horizonId
    || input.report.observedAt !== successor.payload.observedAt) {
    fail("CONSEQUENCE_NETWORK_SUBJECT_CROSSWALK_INVALID");
  }
  const boundaryPartyRoots = sortedHashes(input.boundary.affectedPartyRootHashes,
    "BOUNDARY_AFFECTED_PARTY_ROOTS", { nonempty: true });
  if (!same(boundaryPartyRoots, affected.coverageRoots)) {
    fail("AFFECTED_PARTY_REGISTER_BOUNDARY_ROOT_SET_MISMATCH");
  }
  const affectedPartyReportSetHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.affectedPartyReportSet,
    input.report.affectedPartyReports);
  const recoveryEvidenceSetHash = input.report.recoveryEvidenceHashes.length === 0
    ? null : networkIntakeDigest(
      OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.recoveryEvidenceSet,
      input.report.recoveryEvidenceHashes);
  const normalizedObservationHash = networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.normalizedObservation, {
      consequenceReportHash: input.report.consequenceHash,
      affectedPartyReportSetHash,
      recoveryEvidenceSetHash,
      horizonId: input.report.horizonId,
      observedAt: input.report.observedAt,
    });
  if (affectedPartyReportSetHash !== successor.payload.affectedPartyReportSetHash
    || recoveryEvidenceSetHash !== successor.payload.recoveryEvidenceSetHash
    || normalizedObservationHash
      !== successor.observation.normalizedObservationHash) {
    fail("CONSEQUENCE_WITNESS_NORMALIZED_OBSERVATION_CROSSWALK_INVALID");
  }
  const constraintIds = new ArrayConstructor();
  for (let index = 0; index < input.boundary.constraints.length; index += 1) {
    append(constraintIds, input.boundary.constraints[index].channelId);
  }
  return { boundaryCheck, claimCheck, executionCheck, reportCheck,
    affectedPartyReportSetHash, recoveryEvidenceSetHash, normalizedObservationHash,
    constraintIds: sortedStrings(constraintIds, "BOUNDARY_CONSTRAINT_IDS",
      { nonempty: true }) };
}

function verifyEffectChannelCrosswalk(affectedInput, consequence) {
  const effectChannelIds = new ArrayConstructor();
  for (let index = 0; index < affectedInput.register.effectChannelRows.length;
    index += 1) {
    append(effectChannelIds, affectedInput.register.effectChannelRows[index].channelId);
  }
  const normalized = sortedStrings(effectChannelIds, "AFFECTED_EFFECT_CHANNEL_IDS",
    { nonempty: true });
  for (let index = 0; index < consequence.constraintIds.length; index += 1) {
    if (!includes(normalized, consequence.constraintIds[index])) {
      fail("BOUNDARY_CONSTRAINT_OUTSIDE_AFFECTED_EFFECT_REVIEW");
    }
  }
  return { effectChannelIds: normalized,
    boundaryConstraintChannelIds: consequence.constraintIds,
    effectChannelGapCount: normalized.length - consequence.constraintIds.length };
}

function verifyLaterObligation(input, baseEpisode, baseJoin, successor) {
  exactObject(input, ["directory", "expectedRevision", "expectedStateHash",
    "expectedGenesisHash"], "LATER_OBLIGATION_PREFIX");
  if (typeof input.directory !== "string" || input.directory.length < 1) {
    fail("LATER_OBLIGATION_DIRECTORY_REQUIRED");
  }
  const snapshot = verifyRealityObligationStatePrefix(input.directory, {
    expectedRevision: input.expectedRevision,
    expectedStateHash: hash(input.expectedStateHash,
      "EXPECTED_LATER_OBLIGATION_STATE_HASH"),
    expectedGenesisHash: hash(input.expectedGenesisHash,
      "EXPECTED_LATER_OBLIGATION_GENESIS_HASH"),
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
    fail("LATER_OBLIGATION_NO_AUTHORITY_PREFIX_REQUIRED");
  }
  exactNoAuthority(snapshot.genesis.authority, "LATER_OBLIGATION_GENESIS_AUTHORITY");
  exactNoAuthority(snapshot.state.authority, "LATER_OBLIGATION_STATE_AUTHORITY");
  exactNoAuthority(snapshot.verification.authority,
    "LATER_OBLIGATION_VERIFICATION_AUTHORITY");
  const basePrefix = baseEpisode.input.obligationPrefix;
  if (input.directory !== basePrefix.directory
    || snapshot.genesis.genesisHash !== baseJoin.sourceReplay.obligationGenesisHash
    || snapshot.genesis.genesisHash !== successor.payload.obligationGenesisHash
    || snapshot.stateHash !== successor.payload.obligationStateHash
    || snapshot.revision <= baseJoin.sourceReplay.obligationRevision
    || snapshot.stateHash === baseJoin.sourceReplay.obligationStateHash) {
    fail("LATER_OBLIGATION_PREFIX_SUCCESSOR_CROSSWALK_INVALID");
  }
  const bindings = snapshot.genesis.bindings;
  if (bindings.claimHash !== baseJoin.subject.claimWayWorld.claimHash
    || bindings.wayHash !== baseJoin.subject.claimWayWorld.wayHash
    || bindings.worldHash !== baseJoin.subject.claimWayWorld.worldHash
    || bindings.episodeHash !== baseJoin.subject.episodeHash
    || bindings.attemptHash !== baseJoin.subject.attemptHash
    || bindings.affectedPartyRootHash
      !== successor.payload.affectedPartyRegisterRootHash) {
    fail("LATER_OBLIGATION_SUBJECT_CROSSWALK_INVALID");
  }
  const horizon = horizonNamed(snapshot.state.mandatoryHorizons,
    successor.payload.horizonId, "LATER_OBLIGATION_HORIZON");
  return { snapshot, horizon };
}

function completeLaterObligationCrosswalk(later, consequenceInput, successor, affected) {
  const boundaryHorizon = horizonNamed(consequenceInput.boundary.observationHorizons,
    successor.payload.horizonId, "REALITY_BOUNDARY_HORIZON");
  const horizon = later.horizon;
  if (horizon.mandatory !== true || horizon.dueAfterMs <= 0
    || horizon.horizonCommitmentHash
      !== successor.payload.obligationHorizonCommitmentHash
    || horizon.status !== "REPORTED"
    || horizon.consequenceReportHash !== successor.payload.consequenceReportHash
    || horizon.reportedAt === null || horizon.dueAt === null
    || DateParse(successor.payload.observedAt) < DateParse(horizon.dueAt)
    || DateParse(horizon.reportedAt) < DateParse(successor.payload.observedAt)
    || boundaryHorizon.mandatory !== true
    || boundaryHorizon.closesAfterMs !== horizon.dueAfterMs
    || affected.horizon.horizonHash
      !== successor.payload.affectedPartyHorizonBindingHash) {
    fail("MATURE_DELAYED_HORIZON_CROSSWALK_INVALID");
  }
  return { ...later, boundaryHorizon };
}

function certificateBody(input, context) {
  exactObject(input, ["baseEpisode", "outcomeWitness", "affectedParty",
    "consequence", "laterObligationPrefix"], "CERTIFICATE_INPUT");
  exactObject(context, ["baseLaneTrust", "expectedBaseJoinHash",
    "outcomeWitnessNetworkTrust", "outcomeWitnessTrustPolicy",
    "outcomeWitnessAdapterRegistry", "outcomeWitnessAdapterId"],
  "CERTIFICATE_CONTEXT");
  const base = verifyBaseEpisode(input.baseEpisode, context);
  const successor = verifyWitnessSuccessor(input.outcomeWitness, context, base);
  const roleSeparation = verifyRoleSeparation(input.baseEpisode,
    input.outcomeWitness, successor);
  const affected = verifyAffectedParty(input.affectedParty,
    input.baseEpisode.join, successor);
  const consequence = verifyConsequence(input.consequence,
    input.baseEpisode.join, successor, affected);
  const effectChannels = verifyEffectChannelCrosswalk(input.affectedParty,
    consequence);
  const laterInitial = verifyLaterObligation(input.laterObligationPrefix,
    input.baseEpisode, input.baseEpisode.join, successor);
  const later = completeLaterObligationCrosswalk(laterInitial,
    input.consequence, successor, affected);
  const witnessPathComplete = effectChannels.effectChannelGapCount === 0
    && successor.witnessCheck.adapterImplementationOrCodeClosureReplayed === true;
  const result = witnessPathComplete
    ? "FIRST_GOVERNED_REALITY_EPISODE_WITNESS_PATH_REPLAYED_HOLD"
    : "PARTIAL_WITNESS_PATH_REPLAYED_HOLD";
  const body = {
    schema: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.certificate,
    schemaVersion: "1.0.0",
    certificateClass:
      "SOURCE_REPLAYED_ACTION_OUTCOME_V2_WITNESS_PATH_HOLD_ONLY",
    subject: clone(input.baseEpisode.join.subject),
    baseEpisode: {
      completeEpisodeJoinHash: input.baseEpisode.join.joinHash,
      actionOutcomeV1BundleHash: base.actionBundle.bundleHash,
      actionOutcomeV1ManifestHash: base.actionBundle.preview.manifest.manifestHash,
      actionOutcomeV1OccurrenceIdentityHash:
        base.actionBundle.preview.manifest.occurrenceIdentityHash,
      actionOutcomeV1ObligationStateHash:
        base.actionBundle.preview.payload.obligationStateHash,
      actionOutcomeV1JoinPreserved: true,
    },
    outcomeWitnessSuccessor: {
      lane: "ACTION_OUTCOME",
      payloadSchema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
      nodeSubmissionBundleHash: successor.bundle.bundleHash,
      manifestHash: successor.manifest.manifestHash,
      occurrenceIdentityHash: successor.manifest.occurrenceIdentityHash,
      observationStatus: "OBSERVED",
      observedAt: successor.payload.observedAt,
      outcomeWitnessEnvelopeHash: successor.payload.outcomeWitnessEnvelopeHash,
      witnessIdentityEnvelopeHash:
        input.outcomeWitness.witnessIdentity.envelope.actorIdentityEnvelopeHash,
      witnessActorSubjectHash:
        input.outcomeWitness.witnessIdentity.envelope.actorSubjectHash,
      witnessSourceManifestHash: successor.payload.witnessSourceManifestHash,
      witnessReplayReceiptHash: successor.payload.witnessReplayReceiptHash,
      witnessRelationshipReviewHash: successor.payload.witnessRelationshipReviewHash,
      sameLaneDelayedSuccessor: true,
      disposition: "QUARANTINED",
      decision: "HOLD",
    },
    sourceReplay: {
      baseCompleteEpisodeSourceReplayed: true,
      actionOutcomeV2NodeSubmissionSourceReplayed: true,
      actionOutcomeV2NetworkTrustExternallyPinned: true,
      exactWitnessSourceBytesReplayed: true,
      witnessAdapterProjectionSpecificationAndSchemaReplayed: true,
      witnessAdapterImplementationOrCodeClosureReplayed: false,
      secondActorIdentityEnvelopeSourceReplayed: true,
      externalRelationshipReviewSignatureAndKeyEpochVerified: true,
      relationshipReviewSourceReplayed: false,
      affectedPartyRegisterSourceReplayed: true,
      consequenceProtocolInputsRederived: true,
      laterObligationImmutablePrefixReplayed: true,
      fullObligationLedgerSourceReplayed: false,
      mutableObligationHeadRead: false,
      rawSourceBytesInCertificate: false,
      writesPerformed: false,
    },
    roleSeparation: {
      actorCoreRootCount: roleSeparation.actorRoots.length,
      witnessCoreRootCount: roleSeparation.witnessRoots.length,
      actorWitnessCoreRootsDisjoint: true,
      relationshipReviewCoversActorAndWitnessCoreRoots: true,
      witnessSigningKeyId: roleSeparation.witnessSigningKeyId,
      relationshipReviewIssuerOrganizationHash:
        roleSeparation.relationshipReviewIssuerOrganizationHash,
      relationshipReviewIssuerKeyId:
        roleSeparation.relationshipReviewIssuerKeyId,
      actionOutcomeV2TransportSignerKeyId: roleSeparation.transportSignerKeyId,
      transportSignerSeparatedFromActorWitnessAndReview: true,
      differentKeysAcceptedAsOrganizationalIndependence: false,
      independencePolicyVerifiedWithinScope: true,
      organizationalIndependenceEstablished: false,
    },
    affectedPartyCrosswalk: {
      affectedPartyRegisterRootHash:
        successor.payload.affectedPartyRegisterRootHash,
      affectedPartyRegisterSourceHash: input.affectedParty.source.sourceHash,
      affectedPartyCoverageRootCount: affected.coverageRoots.length,
      effectChannelIds: effectChannels.effectChannelIds,
      boundaryConstraintChannelIds: effectChannels.boundaryConstraintChannelIds,
      effectChannelGapCount: effectChannels.effectChannelGapCount,
      boundaryConstraintsSubsetOfEffectReview: true,
      allEffectChannelsWithinConsequenceBoundary:
        effectChannels.effectChannelGapCount === 0,
      affectedPartyReportSetHash: consequence.affectedPartyReportSetHash,
      consequenceReportCoversDeclaredRegisterRoots: true,
      affectedPartyCompletenessEstablished: false,
      affectedPartyStandingEstablished: false,
      externalAuthorityEstablished: false,
    },
    horizonAndObligationCrosswalk: {
      horizonId: successor.payload.horizonId,
      dueAfterMs: later.horizon.dueAfterMs,
      dueAt: later.horizon.dueAt,
      observedAt: successor.payload.observedAt,
      reportedAt: later.horizon.reportedAt,
      consequenceReportHash: successor.payload.consequenceReportHash,
      normalizedObservationHash: consequence.normalizedObservationHash,
      recoveryEvidenceSetHash: consequence.recoveryEvidenceSetHash,
      affectedPartyHorizonBindingHash:
        successor.payload.affectedPartyHorizonBindingHash,
      obligationHorizonCommitmentHash:
        successor.payload.obligationHorizonCommitmentHash,
      obligationGenesisHash: later.snapshot.genesis.genesisHash,
      baseObligationRevision: input.baseEpisode.join.sourceReplay.obligationRevision,
      baseObligationStateHash: input.baseEpisode.join.sourceReplay.obligationStateHash,
      laterObligationRevision: later.snapshot.revision,
      laterObligationStateHash: later.snapshot.stateHash,
      delayedHorizonMatured: true,
      delayedHorizonReportRecordedInLaterImmutablePrefix: true,
      obligationOutstanding: true,
      obligationClosed: false,
    },
    effectChannelGapCount: effectChannels.effectChannelGapCount,
    structuralResult: {
      observedMatureHorizonPathComplete: witnessPathComplete,
      firstGovernedRealityEpisodeWitnessPathReplayed: witnessPathComplete,
      completeEpisodeTruthEstablished: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      affectedPartyCompletenessEstablished: false,
      affectedPartyStandingEstablished: false,
      recoveryExternallyVerified: false,
      obligationClosureEstablished: false,
    },
    result,
    disposition: "QUARANTINED",
    status: "HOLD",
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
    boundary: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY,
  };
  return body;
}

export function createOutsiderFirstGovernedRealityEpisodeCertificate(
  input = {}, context = {}) {
  const body = certificateBody(input, context);
  return deepFreeze({ ...body, certificateHash: networkIntakeDigest(
    OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.certificate, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.verification,
    ok: false,
    sourceReplayComplete: false,
    effectChannelGapCount: null,
    observedMatureHorizonPathComplete: false,
    firstGovernedRealityEpisodeWitnessPathReplayed: false,
    completeEpisodeTruthEstablished: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    affectedPartyCompletenessEstablished: false,
    affectedPartyStandingEstablished: false,
    recoveryExternallyVerified: false,
    obligationClosureEstablished: false,
    result: "HOLD",
    disposition: "QUARANTINED",
    status: "HOLD",
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
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY,
  });
}

export function verifyOutsiderFirstGovernedRealityEpisodeCertificate(
  record, context = {}) {
  try {
    rejectTree(record);
    canonicalizeStrict(record);
    exactObject(context, ["input", "expectedCertificateHash", "baseLaneTrust",
      "expectedBaseJoinHash", "outcomeWitnessNetworkTrust",
      "outcomeWitnessTrustPolicy", "outcomeWitnessAdapterRegistry",
      "outcomeWitnessAdapterId"], "VERIFY_CONTEXT");
    exactObject(record, ["schema", "schemaVersion", "certificateClass", "subject",
      "baseEpisode", "outcomeWitnessSuccessor", "sourceReplay", "roleSeparation",
      "affectedPartyCrosswalk", "horizonAndObligationCrosswalk", "effectChannelGapCount",
      "structuralResult", "result", "disposition", "status", "authority", "actionReady", "executable",
      "automaticTraining", "trainingRows", "causalExperienceUnits", "actorCredit",
      "permitsPricing", "permitsGuarantee", "permitsSettlement", "boundary",
      "certificateHash"], "CERTIFICATE");
    if (record.schema
        !== OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.certificate
      || record.schemaVersion !== "1.0.0"
      || record.certificateClass
        !== "SOURCE_REPLAYED_ACTION_OUTCOME_V2_WITNESS_PATH_HOLD_ONLY"
      || record.disposition !== "QUARANTINED" || record.status !== "HOLD"
      || record.authority !== "NONE" || record.actionReady !== false
      || record.executable !== false || record.automaticTraining !== false
      || record.trainingRows !== 0 || record.causalExperienceUnits !== 0
      || record.actorCredit !== false || record.permitsPricing !== false
      || record.permitsGuarantee !== false || record.permitsSettlement !== false
      || !same(record.boundary, OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY)) {
      fail("CERTIFICATE_STATE_INVALID");
    }
    if (!NumberIsSafeInteger(record.effectChannelGapCount)
      || record.effectChannelGapCount < 0
      || record.effectChannelGapCount
        !== record.affectedPartyCrosswalk.effectChannelGapCount) {
      fail("CERTIFICATE_EFFECT_CHANNEL_GAP_INVALID");
    }
    if (record.sourceReplay.witnessAdapterProjectionSpecificationAndSchemaReplayed
        !== true
      || record.sourceReplay.witnessAdapterImplementationOrCodeClosureReplayed
        !== false) {
      fail("CERTIFICATE_ADAPTER_REPLAY_STATE_INVALID");
    }
    const witnessPathComplete = record.effectChannelGapCount === 0
      && record.sourceReplay.witnessAdapterImplementationOrCodeClosureReplayed === true;
    const expectedResult = witnessPathComplete
      ? "FIRST_GOVERNED_REALITY_EPISODE_WITNESS_PATH_REPLAYED_HOLD"
      : "PARTIAL_WITNESS_PATH_REPLAYED_HOLD";
    if (record.result !== expectedResult
      || record.structuralResult.observedMatureHorizonPathComplete
        !== witnessPathComplete
      || record.structuralResult.firstGovernedRealityEpisodeWitnessPathReplayed
        !== witnessPathComplete) {
      fail("CERTIFICATE_PATH_COMPLETENESS_STATE_INVALID");
    }
    const creationContext = {
      baseLaneTrust: context.baseLaneTrust,
      expectedBaseJoinHash: context.expectedBaseJoinHash,
      outcomeWitnessNetworkTrust: context.outcomeWitnessNetworkTrust,
      outcomeWitnessTrustPolicy: context.outcomeWitnessTrustPolicy,
      outcomeWitnessAdapterRegistry: context.outcomeWitnessAdapterRegistry,
      outcomeWitnessAdapterId: context.outcomeWitnessAdapterId,
    };
    const rebuilt = createOutsiderFirstGovernedRealityEpisodeCertificate(
      context.input, creationContext);
    if (!same(record, rebuilt)) fail("CERTIFICATE_SOURCE_REPLAY_INVALID");
    const expectedCertificateHash = hash(context.expectedCertificateHash,
      "EXPECTED_CERTIFICATE_HASH");
    if (record.certificateHash !== expectedCertificateHash) {
      fail("EXPECTED_CERTIFICATE_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_SCHEMAS.verification,
      ok: true,
      certificateHash: rebuilt.certificateHash,
      sourceReplayComplete: true,
      sourceReplayScope:
        "SUPPLIED_EXACT_SOURCES_AND_EXTERNALLY_PINNED_IMMUTABLE_PREFIXES",
      effectChannelGapCount: rebuilt.effectChannelGapCount,
      observedMatureHorizonPathComplete: witnessPathComplete,
      firstGovernedRealityEpisodeWitnessPathReplayed: witnessPathComplete,
      completeEpisodeTruthEstablished: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      affectedPartyCompletenessEstablished: false,
      affectedPartyStandingEstablished: false,
      recoveryExternallyVerified: false,
      obligationClosureEstablished: false,
      result: expectedResult,
      disposition: "QUARANTINED",
      status: "HOLD",
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
      boundary: OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
