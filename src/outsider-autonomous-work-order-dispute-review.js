/*
 * Stage 1 direct-participant dispute-review candidate ledger.
 *
 * This is product-discovery evidence, not a fourth identity/event ontology and
 * not proof of identity, standing, fault, duty, outcome, recovery, authority,
 * adoption, or a network order.  It stores only caller-declared case-scoped
 * aliases and private-bundle commitments; their salting and unlinkability are
 * not established here.  Raw records, replies, account identifiers, paths,
 * URLs, contact data, keys, and secrets remain outside this projection.
 *
 * A successful structural verification remains HOLD.  The trusted entrypoint
 * is deliberately NOT_INTEGRATED until a later source-replayed private bundle
 * can prove an actual historical case, a fresh response from the same external
 * account/channel, direct participation linkage, current rights/privacy
 * permission, and an externally sourced full-ancestry lifecycle head.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DatePrototypeToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashPrototypeUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashPrototypeDigest = Function.prototype.call.bind(HashPrototype.digest);
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

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS = ObjectFreeze({
  ledger: "outsider/autonomous-work-order-dispute-review-ledger/v1",
  verification: "outsider/autonomous-work-order-dispute-review-verification/v1",
  trustedVerification:
    "outsider/autonomous-work-order-dispute-review-trusted-verification/v1",
});

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_OCCURRENCE_KINDS = ObjectFreeze([
  "INVITATION",
  "RESPONSE",
  "RETRACTION",
  "TIMEOUT",
  "WITHDRAWAL",
]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_VERDICTS = ObjectFreeze([
  "DECLINE",
  "MATERIAL_CORRECTIONS_REQUIRED",
  "NO_WOULD_NOT_HAVE_CHANGED",
  "UNSURE",
  "YES_WOULD_HAVE_CHANGED",
]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_COMPONENTS = ObjectFreeze([
  "ATTEMPT",
  "OBSERVATION",
  "PROMISE",
  "UNRESOLVED",
]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_CHANGE_KINDS = ObjectFreeze([
  "DISPUTE_DISPOSITION",
  "EVIDENCE_REQUEST",
]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_REVISION_BASIS_KINDS =
  ObjectFreeze([
    "GENESIS",
    "OCCURRENCE_APPEND_ONLY",
    "PARTICIPANT_CORRECTION",
    "SOURCE_DISCOVERED_CORRECTION",
  ]);

export const AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY = deepFreeze({
  position:
    "STAGE1_DIRECT_PARTICIPANT_DISPUTE_REVIEW_CANDIDATE_NOT_NETWORK_ORDER_OR_AUTHORITY",
  productDiscoveryEvidenceOnly: true,
  episodeAndAttemptSetReferencesAreCallerSuppliedOnly: true,
  episodeAndAttemptSetReferenceSourceReplayVerified: false,
  createsIdentity: false,
  createsEpisodeOrAttempt: false,
  createsAuthority: false,
  structuralVerificationOnly: true,
  privateSourceBundleReplayIntegrated: false,
  actualPastCaseSourceReplayVerified: false,
  reviewPacketSourceReplayVerified: false,
  freshChallengeResponseReplayVerified: false,
  externalAccountOrChannelContinuityVerified: false,
  directHistoricalParticipationVerified: false,
  participantLegalIdentityVerified: false,
  participantStandingVerified: false,
  responseTruthVerified: false,
  independentOutcomeEstablished: false,
  faultEstablished: false,
  dutyEstablished: false,
  providerCommitmentEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  recoveryEstablished: false,
  remedyEstablished: false,
  adjudicationEstablished: false,
  currentRightsPrivacyPermissionVerified: false,
  sourceDiscoveredCorrectionTruthVerified: false,
  externalLifecycleHeadVerified: false,
  fullAncestryReplayVerified: false,
  durableAppendOnlyHistoryEstablished: false,
  sameRevisionSelfResealExclusionEstablished: false,
  parallelGenesisExclusionEstablished: false,
  forkExclusionEstablished: false,
  publicSourceOrFixtureCanSatisfyGate: false,
  localSignatureOrServerAcknowledgementCanSatisfyGate: false,
  genericPraiseOrFutureWillingnessCanSatisfyGate: false,
  rawSourceIncluded: false,
  rawResponseIncluded: false,
  directPiiFieldsIncluded: false,
  directStableAccountOrPublicKeyIdentifierFieldsIncluded: false,
  caseScopedAliasDerivationAndUnlinkabilityVerified: false,
  commitmentPreimagePrivacyVerified: false,
  lowEntropyIdentifierHashExclusionVerified: false,
  localPathsOrUrlsIncluded: false,
  recordedAtExternalTimeEstablished: false,
  networkProjectionEnabled: false,
  stage1ExternalFactGateSatisfied: false,
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
  permitsInsurance: false,
  permitsSettlement: false,
  custodyEstablished: false,
  capitalEstablished: false,
  moneyMovementEnabled: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CASE_ALIAS = /^case_[a-f0-9]{32}$/u;
const PARTICIPANT_ALIAS = /^participant_[a-f0-9]{32}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_OCCURRENCES = 4_096;
const MAX_TRIGGER_COMPONENTS = 4;
const MAX_TREE_NODES = 100_000;
const MAX_TREE_KEYS = 250_000;

function fail(code) {
  throw new TypeErrorConstructor(`AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_${code}`);
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
  const state = createHash("sha256");
  HashPrototypeUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashPrototypeDigest(state, "hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function alias(value, expression, code) {
  if (typeof value !== "string" || !RegExpTest(expression, value)) fail(`${code}_INVALID`);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const milliseconds = DateParse(value);
  if (!NumberIsSafeInteger(milliseconds)) fail(`${code}_INVALID`);
  let roundTrip;
  try {
    roundTrip = DatePrototypeToISOString(new DateConstructor(milliseconds));
  } catch {
    fail(`${code}_INVALID`);
  }
  if (roundTrip !== value) fail(`${code}_INVALID`);
  return value;
}

function oneOf(value, choices, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  for (let index = 0; index < choices.length; index += 1) {
    if (choices[index] === value) return value;
  }
  fail(`${code}_INVALID`);
}

function contains(rows, value) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index] === value) return true;
  }
  return false;
}

function namedOccurrence(rows, identityHash) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].occurrenceIdentityHash === identityHash) return rows[index];
  }
  return null;
}

function normalizeCaseBinding(value) {
  exactObject(value, ["caseScopedAlias", "privateBundleRootCommitment",
    "workOrderHash", "episodeHash", "attemptSetCompositionHash",
    "reconstructionHash", "reviewPacketHash", "purposeHash", "audienceHash",
    "rightsReviewRootCommitment", "privacyReviewRootCommitment"], "CASE_BINDING");
  return {
    caseScopedAlias: alias(value.caseScopedAlias, CASE_ALIAS, "CASE_SCOPED_ALIAS"),
    privateBundleRootCommitment: hash(value.privateBundleRootCommitment,
      "PRIVATE_BUNDLE_ROOT_COMMITMENT"),
    workOrderHash: hash(value.workOrderHash, "WORK_ORDER_HASH"),
    episodeHash: hash(value.episodeHash, "EPISODE_HASH"),
    attemptSetCompositionHash: hash(value.attemptSetCompositionHash,
      "ATTEMPT_SET_COMPOSITION_HASH"),
    reconstructionHash: hash(value.reconstructionHash, "RECONSTRUCTION_HASH"),
    reviewPacketHash: hash(value.reviewPacketHash, "REVIEW_PACKET_HASH"),
    purposeHash: hash(value.purposeHash, "PURPOSE_HASH"),
    audienceHash: hash(value.audienceHash, "AUDIENCE_HASH"),
    rightsReviewRootCommitment: hash(value.rightsReviewRootCommitment,
      "RIGHTS_REVIEW_ROOT_COMMITMENT"),
    privacyReviewRootCommitment: hash(value.privacyReviewRootCommitment,
      "PRIVACY_REVIEW_ROOT_COMMITMENT"),
    caseScopedAliasDeclaredNotActorEpisodeOrLegalIdentity: true,
    caseScopedAliasDerivationAndUnlinkabilityVerified: false,
    commitmentsDeclaredAsSaltedPrivateBundleReferencesOnly: true,
    commitmentSaltingSourceReplayVerified: false,
    sourceReplayVerified: false,
  };
}

function caseBindingInput(value) {
  return {
    caseScopedAlias: value.caseScopedAlias,
    privateBundleRootCommitment: value.privateBundleRootCommitment,
    workOrderHash: value.workOrderHash,
    episodeHash: value.episodeHash,
    attemptSetCompositionHash: value.attemptSetCompositionHash,
    reconstructionHash: value.reconstructionHash,
    reviewPacketHash: value.reviewPacketHash,
    purposeHash: value.purposeHash,
    audienceHash: value.audienceHash,
    rightsReviewRootCommitment: value.rightsReviewRootCommitment,
    privacyReviewRootCommitment: value.privacyReviewRootCommitment,
  };
}

function immutableCaseSeriesBindingInput(value) {
  return {
    caseScopedAlias: value.caseScopedAlias,
    workOrderHash: value.workOrderHash,
    episodeHash: value.episodeHash,
    attemptSetCompositionHash: value.attemptSetCompositionHash,
    purposeHash: value.purposeHash,
    audienceHash: value.audienceHash,
  };
}

function normalizeReconstruction(value) {
  exactObject(value, ["promiseRefCommitment", "attemptRefCommitment",
    "observationRefCommitment", "unresolvedRefCommitment"], "RECONSTRUCTION");
  return {
    promiseRefCommitment: hash(value.promiseRefCommitment, "PROMISE_REF_COMMITMENT"),
    attemptRefCommitment: hash(value.attemptRefCommitment, "ATTEMPT_REF_COMMITMENT"),
    observationRefCommitment: hash(value.observationRefCommitment,
      "OBSERVATION_REF_COMMITMENT"),
    unresolvedRefCommitment: hash(value.unresolvedRefCommitment,
      "UNRESOLVED_REF_COMMITMENT"),
    callerSuppliedFourPartReconstructionCommitmentShapePresent: true,
    sourceReplayVerified: false,
  };
}

function reconstructionInput(value) {
  return {
    promiseRefCommitment: value.promiseRefCommitment,
    attemptRefCommitment: value.attemptRefCommitment,
    observationRefCommitment: value.observationRefCommitment,
    unresolvedRefCommitment: value.unresolvedRefCommitment,
  };
}

function normalizeLineage(value, predecessor, enforcePrefix) {
  exactObject(value, ["revision", "predecessorLedgerHash", "supersedesLedgerHash",
    "revisionBasisKind", "revisionBasisCommitmentHash"], "APPEND_ONLY_LINEAGE");
  if (!NumberIsSafeInteger(value.revision) || value.revision < 0) {
    fail("LINEAGE_REVISION_INVALID");
  }
  const predecessorLedgerHash = nullableHash(value.predecessorLedgerHash,
    "PREDECESSOR_LEDGER_HASH");
  const supersedesLedgerHash = nullableHash(value.supersedesLedgerHash,
    "SUPERSEDES_LEDGER_HASH");
  const revisionBasisKind = oneOf(value.revisionBasisKind,
    AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_REVISION_BASIS_KINDS,
    "REVISION_BASIS_KIND");
  const revisionBasisCommitmentHash = nullableHash(value.revisionBasisCommitmentHash,
    "REVISION_BASIS_COMMITMENT_HASH");
  if (value.revision === 0) {
    if (predecessor !== null || predecessorLedgerHash !== null
      || supersedesLedgerHash !== null || revisionBasisKind !== "GENESIS"
      || revisionBasisCommitmentHash !== null) fail("GENESIS_LINEAGE_INVALID");
  } else {
    if (predecessorLedgerHash === null || supersedesLedgerHash === null
      || predecessorLedgerHash !== supersedesLedgerHash) {
      fail("DESCENDANT_REQUIRES_EXACT_PREDECESSOR_LINK");
    }
    if (revisionBasisKind === "GENESIS"
      || (revisionBasisKind === "OCCURRENCE_APPEND_ONLY"
        && revisionBasisCommitmentHash !== null)
      || (revisionBasisKind !== "OCCURRENCE_APPEND_ONLY"
        && revisionBasisCommitmentHash === null)) {
      fail("DESCENDANT_REVISION_BASIS_INVALID");
    }
    if (enforcePrefix && predecessor === null) fail("PREDECESSOR_REQUIRED");
  }
  return {
    revision: value.revision,
    predecessorLedgerHash,
    supersedesLedgerHash,
    revisionBasisKind,
    revisionBasisCommitmentHash,
    revisionBasisSourceReplayVerified: false,
    revisionBasisEstablishesCorrectionTruthOrAuthority: false,
    callerSuppliedImmediatePredecessorLinkPresent: value.revision > 0,
    predecessorSourceReplayVerified: false,
    fullAncestryReplayVerified: false,
    externalHeadVerified: false,
    durableAppendOnlyHistoryEstablished: false,
    sameRevisionSelfResealExclusionEstablished: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    returnedRecordInPlaceMutationAllowed: false,
  };
}

function lineageInput(value) {
  return {
    revision: value.revision,
    predecessorLedgerHash: value.predecessorLedgerHash,
    supersedesLedgerHash: value.supersedesLedgerHash,
    revisionBasisKind: value.revisionBasisKind,
    revisionBasisCommitmentHash: value.revisionBasisCommitmentHash,
  };
}

function normalizeTriggeringComponents(value) {
  denseArray(value, "TRIGGERING_COMPONENTS", 1, MAX_TRIGGER_COMPONENTS);
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const component = oneOf(value[index], AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_COMPONENTS,
      "TRIGGERING_COMPONENT");
    if (contains(result, component)) fail("TRIGGERING_COMPONENT_DUPLICATE");
    append(result, component);
  }
  ArraySort(result);
  return result;
}

function normalizeMaterialDelta(value) {
  if (value === null) return null;
  exactObject(value, ["changeKind", "decisionPointRefCommitment",
    "beforeRefCommitment", "changedRefCommitment", "triggeringComponents"],
  "MATERIAL_DELTA");
  const beforeRefCommitment = hash(value.beforeRefCommitment,
    "BEFORE_REF_COMMITMENT");
  const changedRefCommitment = hash(value.changedRefCommitment,
    "CHANGED_REF_COMMITMENT");
  if (beforeRefCommitment === changedRefCommitment) {
    fail("MATERIAL_DELTA_BEFORE_AND_CHANGED_MUST_DIFFER");
  }
  return {
    changeKind: oneOf(value.changeKind,
      AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_CHANGE_KINDS, "CHANGE_KIND"),
    decisionPointRefCommitment: hash(value.decisionPointRefCommitment,
      "DECISION_POINT_REF_COMMITMENT"),
    beforeRefCommitment,
    changedRefCommitment,
    triggeringComponents: normalizeTriggeringComponents(value.triggeringComponents),
    callerSuppliedSpecificPastCaseDeltaCommitmentShapePresent: true,
    deltaTruthOrCausalityVerified: false,
  };
}

function materialDeltaInput(value) {
  if (value === null) return null;
  return {
    changeKind: value.changeKind,
    decisionPointRefCommitment: value.decisionPointRefCommitment,
    beforeRefCommitment: value.beforeRefCommitment,
    changedRefCommitment: value.changedRefCommitment,
    triggeringComponents: value.triggeringComponents,
  };
}

function normalizeOccurrences(value, caseBinding) {
  denseArray(value, "REVIEW_OCCURRENCES", 1, MAX_OCCURRENCES);
  const rows = [];
  const identities = [];
  const invitationChallengeNonceCommitments = [];
  const respondedInvitationIdentities = [];
  const timedOutInvitationIdentities = [];
  const invalidatedResponseIdentities = [];
  let priorTime = null;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["occurrenceOrdinal", "occurredAt", "occurrenceIdentityHash",
      "suppliedPrivateObjectCommitmentHash", "caseScopedParticipantAlias",
      "reviewPacketHash", "reconstructionHash", "kind",
      "respondsToOccurrenceIdentityHash", "challengeNonceCommitmentHash", "responseVerdict",
      "sourceChannelContinuityCommitmentHash", "directParticipationLinkCommitmentHash",
      "materialDelta", "materialCorrectionCommitmentHash"], "REVIEW_OCCURRENCE");
    if (!NumberIsSafeInteger(row.occurrenceOrdinal)
      || row.occurrenceOrdinal !== index + 1) fail("OCCURRENCE_ORDINAL_INVALID");
    const occurredAt = timestamp(row.occurredAt, "OCCURRED_AT");
    if (priorTime !== null && occurredAt < priorTime) fail("OCCURRENCE_TIME_ORDER_INVALID");
    priorTime = occurredAt;
    const occurrenceIdentityHash = hash(row.occurrenceIdentityHash,
      "OCCURRENCE_IDENTITY_HASH");
    if (contains(identities, occurrenceIdentityHash)) fail("OCCURRENCE_IDENTITY_DUPLICATE");
    const kind = oneOf(row.kind, AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_OCCURRENCE_KINDS,
      "OCCURRENCE_KIND");
    const respondsToOccurrenceIdentityHash = nullableHash(
      row.respondsToOccurrenceIdentityHash, "RESPONDS_TO_OCCURRENCE_IDENTITY_HASH");
    const challengeNonceCommitmentHash = hash(row.challengeNonceCommitmentHash,
      "CHALLENGE_NONCE_COMMITMENT_HASH");
    const responseVerdict = row.responseVerdict === null ? null
      : oneOf(row.responseVerdict, AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_VERDICTS,
        "RESPONSE_VERDICT");
    const materialDelta = normalizeMaterialDelta(row.materialDelta);
    const sourceChannelContinuityCommitmentHash = nullableHash(
      row.sourceChannelContinuityCommitmentHash,
      "SOURCE_CHANNEL_CONTINUITY_COMMITMENT_HASH");
    const directParticipationLinkCommitmentHash = nullableHash(
      row.directParticipationLinkCommitmentHash,
      "DIRECT_PARTICIPATION_LINK_COMMITMENT_HASH");
    const materialCorrectionCommitmentHash = nullableHash(
      row.materialCorrectionCommitmentHash, "MATERIAL_CORRECTION_COMMITMENT_HASH");
    const participantAlias = alias(row.caseScopedParticipantAlias, PARTICIPANT_ALIAS,
      "CASE_SCOPED_PARTICIPANT_ALIAS");
    const occurrenceReviewPacketHash = hash(row.reviewPacketHash,
      "OCCURRENCE_REVIEW_PACKET_HASH");
    const occurrenceReconstructionHash = hash(row.reconstructionHash,
      "OCCURRENCE_RECONSTRUCTION_HASH");
    const challengeContextCommitmentHash = digest(
      "outsider.autonomous-work-order.dispute-review-challenge-context.v1", {
        ...immutableCaseSeriesBindingInput(caseBinding),
        reviewPacketHash: occurrenceReviewPacketHash,
        reconstructionHash: occurrenceReconstructionHash,
        caseScopedParticipantAlias: participantAlias,
        challengeNonceCommitmentHash,
      });
    const target = respondsToOccurrenceIdentityHash === null ? null
      : namedOccurrence(rows, respondsToOccurrenceIdentityHash);
    let responseArrivedAfterTimeout = false;

    if (kind === "INVITATION") {
      if (respondsToOccurrenceIdentityHash !== null || responseVerdict !== null
        || sourceChannelContinuityCommitmentHash !== null
        || directParticipationLinkCommitmentHash !== null || materialDelta !== null
        || materialCorrectionCommitmentHash !== null) fail("INVITATION_FIELDS_INVALID");
      if (contains(invitationChallengeNonceCommitments, challengeNonceCommitmentHash)) {
        fail("INVITATION_CHALLENGE_COMMITMENT_REUSED");
      }
      append(invitationChallengeNonceCommitments, challengeNonceCommitmentHash);
    } else {
      if (target === null) fail("OCCURRENCE_TARGET_UNKNOWN_OR_NOT_PRIOR");
      if (target.caseScopedParticipantAlias !== participantAlias
        || target.reviewPacketHash !== occurrenceReviewPacketHash
        || target.reconstructionHash !== occurrenceReconstructionHash
        || target.challengeNonceCommitmentHash !== challengeNonceCommitmentHash
        || target.challengeContextCommitmentHash !== challengeContextCommitmentHash) {
        fail("OCCURRENCE_TARGET_PARTICIPANT_OR_CHALLENGE_MISMATCH");
      }
      if (kind === "RESPONSE") {
        if (target.kind !== "INVITATION" || responseVerdict === null
          || sourceChannelContinuityCommitmentHash === null
          || directParticipationLinkCommitmentHash === null) {
          fail("RESPONSE_FIELDS_INVALID");
        }
        if (contains(respondedInvitationIdentities, target.occurrenceIdentityHash)) {
          fail("INVITATION_RESPONSE_ALREADY_RECORDED");
        }
        responseArrivedAfterTimeout = contains(timedOutInvitationIdentities,
          target.occurrenceIdentityHash);
        append(respondedInvitationIdentities, target.occurrenceIdentityHash);
        if (responseVerdict === "YES_WOULD_HAVE_CHANGED") {
          if (materialDelta === null || materialCorrectionCommitmentHash !== null) {
            fail("POSITIVE_RESPONSE_REQUIRES_EXACT_MATERIAL_DELTA");
          }
        } else if (responseVerdict === "MATERIAL_CORRECTIONS_REQUIRED") {
          if (materialDelta !== null || materialCorrectionCommitmentHash === null) {
            fail("CORRECTION_RESPONSE_FIELDS_INVALID");
          }
        } else if (materialDelta !== null || materialCorrectionCommitmentHash !== null) {
          fail("NONPOSITIVE_RESPONSE_MUST_NOT_CARRY_MATERIAL_DELTA");
        }
      } else if (kind === "TIMEOUT") {
        if (target.kind !== "INVITATION" || responseVerdict !== null
          || sourceChannelContinuityCommitmentHash !== null
          || directParticipationLinkCommitmentHash !== null || materialDelta !== null
          || materialCorrectionCommitmentHash !== null) fail("TIMEOUT_FIELDS_INVALID");
        if (contains(timedOutInvitationIdentities, target.occurrenceIdentityHash)) {
          fail("INVITATION_TIMEOUT_ALREADY_RECORDED");
        }
        if (contains(respondedInvitationIdentities, target.occurrenceIdentityHash)) {
          fail("INVITATION_TIMEOUT_AFTER_RESPONSE_INVALID");
        }
        append(timedOutInvitationIdentities, target.occurrenceIdentityHash);
      } else {
        if (target.kind !== "RESPONSE" || responseVerdict !== null
          || sourceChannelContinuityCommitmentHash === null
          || directParticipationLinkCommitmentHash === null || materialDelta !== null
          || materialCorrectionCommitmentHash !== null) {
          fail("WITHDRAWAL_OR_RETRACTION_FIELDS_INVALID");
        }
        if (contains(invalidatedResponseIdentities, target.occurrenceIdentityHash)) {
          fail("RESPONSE_ALREADY_WITHDRAWN_OR_RETRACTED");
        }
        append(invalidatedResponseIdentities, target.occurrenceIdentityHash);
      }
    }

    append(rows, {
      occurrenceOrdinal: row.occurrenceOrdinal,
      occurredAt,
      occurrenceIdentityHash,
      suppliedPrivateObjectCommitmentHash: hash(row.suppliedPrivateObjectCommitmentHash,
        "SUPPLIED_PRIVATE_OBJECT_COMMITMENT_HASH"),
      caseScopedParticipantAlias: participantAlias,
      reviewPacketHash: occurrenceReviewPacketHash,
      reconstructionHash: occurrenceReconstructionHash,
      kind,
      respondsToOccurrenceIdentityHash,
      challengeNonceCommitmentHash,
      challengeContextCommitmentHash,
      responseVerdict,
      sourceChannelContinuityCommitmentHash,
      directParticipationLinkCommitmentHash,
      materialDelta,
      materialCorrectionCommitmentHash,
      responseArrivedAfterTimeout,
      responseAfterTimeoutEligibleForFreshChallengeGate: false,
      countsInReviewOccurrenceDenominator: true,
      externalSourceReplayVerified: false,
      channelContinuityVerified: false,
      directParticipationVerified: false,
      responseTruthVerified: false,
      responseVerdictCallerSuppliedOnly: responseVerdict !== null,
      materialDeltaCallerSuppliedOnly: materialDelta !== null,
      challengeFreshnessVerified: false,
      audienceAndPurposeBindingSourceReplayVerified: false,
      participantAliasCallerDeclaredCaseScopedOnly: true,
      participantAliasDerivationAndUnlinkabilityVerified: false,
    });
    append(identities, occurrenceIdentityHash);
  }
  return rows;
}

function occurrenceInput(row) {
  return {
    occurrenceOrdinal: row.occurrenceOrdinal,
    occurredAt: row.occurredAt,
    occurrenceIdentityHash: row.occurrenceIdentityHash,
    suppliedPrivateObjectCommitmentHash: row.suppliedPrivateObjectCommitmentHash,
    caseScopedParticipantAlias: row.caseScopedParticipantAlias,
    reviewPacketHash: row.reviewPacketHash,
    reconstructionHash: row.reconstructionHash,
    kind: row.kind,
    respondsToOccurrenceIdentityHash: row.respondsToOccurrenceIdentityHash,
    challengeNonceCommitmentHash: row.challengeNonceCommitmentHash,
    responseVerdict: row.responseVerdict,
    sourceChannelContinuityCommitmentHash: row.sourceChannelContinuityCommitmentHash,
    directParticipationLinkCommitmentHash: row.directParticipationLinkCommitmentHash,
    materialDelta: materialDeltaInput(row.materialDelta),
    materialCorrectionCommitmentHash: row.materialCorrectionCommitmentHash,
  };
}

function occurrenceInputs(rows) {
  const result = [];
  for (let index = 0; index < rows.length; index += 1) {
    append(result, occurrenceInput(rows[index]));
  }
  return result;
}

function prefixMatches(prefix, rows) {
  if (rows.length <= prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (!same(occurrenceInput(prefix[index]), occurrenceInput(rows[index]))) return false;
  }
  return true;
}

function census(rows) {
  const countsByKind = {
    INVITATION: 0, RESPONSE: 0, RETRACTION: 0, TIMEOUT: 0, WITHDRAWAL: 0,
  };
  const countsByVerdict = {
    DECLINE: 0,
    MATERIAL_CORRECTIONS_REQUIRED: 0,
    NO_WOULD_NOT_HAVE_CHANGED: 0,
    UNSURE: 0,
    YES_WOULD_HAVE_CHANGED: 0,
  };
  let responseAfterTimeoutOccurrenceCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    countsByKind[rows[index].kind] += 1;
    if (rows[index].responseVerdict !== null) countsByVerdict[rows[index].responseVerdict] += 1;
    if (rows[index].responseArrivedAfterTimeout) responseAfterTimeoutOccurrenceCount += 1;
  }
  return {
    ledgerKind: "DISPUTE_REVIEW_OCCURRENCE_CENSUS",
    reviewOccurrenceCount: rows.length,
    countsByKind,
    countsByVerdict,
    responseAfterTimeoutOccurrenceCount,
    everyCallerSuppliedOccurrenceRetained: true,
    withinSuppliedRecordLaterPositiveResponseCanErasePriorNegativeDeclineTimeoutOrWithdrawal:
      false,
    globalInvitationOrResponseCompletenessEstablished: false,
  };
}

function objectEqualityView(rows) {
  const hashes = [];
  let duplicateOccurrenceCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const candidate = rows[index].suppliedPrivateObjectCommitmentHash;
    if (contains(hashes, candidate)) duplicateOccurrenceCount += 1;
    else append(hashes, candidate);
  }
  ArraySort(hashes);
  return {
    ledgerKind: "SUPPLIED_PRIVATE_OBJECT_COMMITMENT_HASH_EQUALITY_VIEW",
    distinctSuppliedPrivateObjectCommitmentHashCount: hashes.length,
    suppliedPrivateObjectCommitmentHashes: hashes,
    duplicateHashReviewOccurrenceCount: duplicateOccurrenceCount,
    privateObjectBytesSourceReplayVerified: false,
    contentAddressedObjectIdentityEstablished: false,
    objectHashEqualityCanReduceOccurrenceDenominator: false,
  };
}

function targetInvalidated(rows, identityHash) {
  for (let index = 0; index < rows.length; index += 1) {
    if ((rows[index].kind === "WITHDRAWAL" || rows[index].kind === "RETRACTION")
      && rows[index].respondsToOccurrenceIdentityHash === identityHash) return true;
  }
  return false;
}

function candidateState(rows, caseBinding) {
  let positiveMaterialResponseOccurrenceCount = 0;
  let activePositiveMaterialResponseOccurrenceCount = 0;
  let materialCorrectionsRequiredOccurrenceCount = 0;
  let activeMaterialCorrectionsRequiredOccurrenceCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].kind === "RESPONSE"
      && rows[index].responseVerdict === "YES_WOULD_HAVE_CHANGED") {
      positiveMaterialResponseOccurrenceCount += 1;
      if (rows[index].reviewPacketHash === caseBinding.reviewPacketHash
        && rows[index].reconstructionHash === caseBinding.reconstructionHash
        && !rows[index].responseArrivedAfterTimeout
        && !targetInvalidated(rows, rows[index].occurrenceIdentityHash)) {
        activePositiveMaterialResponseOccurrenceCount += 1;
      }
    }
    if (rows[index].kind === "RESPONSE"
      && rows[index].responseVerdict === "MATERIAL_CORRECTIONS_REQUIRED") {
      materialCorrectionsRequiredOccurrenceCount += 1;
      if (rows[index].reviewPacketHash === caseBinding.reviewPacketHash
        && rows[index].reconstructionHash === caseBinding.reconstructionHash
        && !rows[index].responseArrivedAfterTimeout
        && !targetInvalidated(rows, rows[index].occurrenceIdentityHash)) {
        activeMaterialCorrectionsRequiredOccurrenceCount += 1;
      }
    }
  }
  return {
    candidateClass: "STRUCTURAL_DISPUTE_REVIEW_CANDIDATE_NOT_INTEGRATED",
    positiveMaterialResponseOccurrenceCount,
    activePositiveMaterialResponseOccurrenceCount,
    activePositiveMaterialResponseStructurallyPresent:
      activePositiveMaterialResponseOccurrenceCount > 0,
    materialCorrectionsRequiredOccurrenceCount,
    activeMaterialCorrectionsRequiredOccurrenceCount,
    materialCorrectionsRequireReconstructionDescendantAndRenewedReview:
      activeMaterialCorrectionsRequiredOccurrenceCount > 0,
    actualHumanResponseEstablished: false,
    externalAccountOrChannelContinuityVerified: false,
    directHistoricalParticipationVerified: false,
    currentRightsPrivacyPermissionVerified: false,
    currentExternalLifecycleHeadVerified: false,
    stage1ExternalFactGateSatisfied: false,
    result: "NOT_INTEGRATED",
  };
}

function activeParticipantCorrectionBasisRoot(predecessor) {
  const activeCorrections = [];
  for (let index = 0; index < predecessor.reviewOccurrences.length; index += 1) {
    const row = predecessor.reviewOccurrences[index];
    if (row.kind === "RESPONSE"
      && row.responseVerdict === "MATERIAL_CORRECTIONS_REQUIRED"
      && row.reviewPacketHash === predecessor.caseBinding.reviewPacketHash
      && row.reconstructionHash === predecessor.caseBinding.reconstructionHash
      && !row.responseArrivedAfterTimeout
      && !targetInvalidated(predecessor.reviewOccurrences, row.occurrenceIdentityHash)) {
      append(activeCorrections, {
        occurrenceIdentityHash: row.occurrenceIdentityHash,
        materialCorrectionCommitmentHash: row.materialCorrectionCommitmentHash,
      });
    }
  }
  if (activeCorrections.length === 0) return null;
  return digest(
    "outsider.autonomous-work-order.dispute-review-active-correction-set.v1",
    { activeCorrections });
}

function ledgerInput(record) {
  return {
    recordedAt: record.recordedAt,
    caseBinding: caseBindingInput(record.caseBinding),
    reconstruction: reconstructionInput(record.reconstruction),
    appendOnlyLineage: lineageInput(record.appendOnlyLineage),
    reviewOccurrences: occurrenceInputs(record.reviewOccurrences),
  };
}

function rebuild(input, { predecessor = null, enforcePrefix = true } = {}) {
  exactObject(input, ["recordedAt", "caseBinding", "reconstruction",
    "appendOnlyLineage", "reviewOccurrences"], "LEDGER_INPUT");
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  const caseBinding = normalizeCaseBinding(input.caseBinding);
  const reconstruction = normalizeReconstruction(input.reconstruction);
  const expectedReconstructionHash = digest(
    "outsider.autonomous-work-order.dispute-review-reconstruction.v1",
    reconstructionInput(reconstruction));
  if (caseBinding.reconstructionHash !== expectedReconstructionHash) {
    fail("RECONSTRUCTION_HASH_CROSSWALK_MISMATCH");
  }
  const lineage = normalizeLineage(input.appendOnlyLineage, predecessor, enforcePrefix);
  const reviewOccurrences = normalizeOccurrences(input.reviewOccurrences, caseBinding);
  if (recordedAt < reviewOccurrences[reviewOccurrences.length - 1].occurredAt) {
    fail("RECORDED_AT_PRECEDES_LATEST_OCCURRENCE");
  }

  if (lineage.revision === 0) {
    for (let index = 0; index < reviewOccurrences.length; index += 1) {
      if (reviewOccurrences[index].reviewPacketHash !== caseBinding.reviewPacketHash
        || reviewOccurrences[index].reconstructionHash !== caseBinding.reconstructionHash) {
        fail("GENESIS_OCCURRENCE_PACKET_RECONSTRUCTION_CROSSWALK_MISMATCH");
      }
    }
  }

  if (enforcePrefix && lineage.revision > 0) {
    const checked = verifyAutonomousWorkOrderDisputeReviewLedger(predecessor, {
      predecessor: null,
      expectedLedgerHash: predecessor.ledgerHash,
      expectedPredecessorLedgerHash: null,
      allowUnreplayedDescendantAsSuppliedPredecessor: true,
    });
    if (!checked.ok) fail("PREDECESSOR_STRUCTURAL_REPLAY_INVALID");
    if (lineage.revision !== predecessor.appendOnlyLineage.revision + 1
      || lineage.predecessorLedgerHash !== predecessor.ledgerHash
      || !same(immutableCaseSeriesBindingInput(caseBinding),
        immutableCaseSeriesBindingInput(predecessor.caseBinding))
      || !prefixMatches(predecessor.reviewOccurrences, reviewOccurrences)) {
      fail("DESCENDANT_PREFIX_OR_CASE_BINDING_INVALID");
    }
    if (recordedAt < predecessor.recordedAt) fail("DESCENDANT_RECORDED_AT_REGRESSION");
    if (caseBinding.privateBundleRootCommitment
      === predecessor.caseBinding.privateBundleRootCommitment) {
      fail("DESCENDANT_PRIVATE_BUNDLE_ROOT_MUST_ADVANCE");
    }
    const reconstructionChanged = !same(reconstructionInput(reconstruction),
      reconstructionInput(predecessor.reconstruction));
    const reconstructionHashChanged = caseBinding.reconstructionHash
      !== predecessor.caseBinding.reconstructionHash;
    const reviewPacketChanged = caseBinding.reviewPacketHash
      !== predecessor.caseBinding.reviewPacketHash;
    if (reconstructionChanged || reconstructionHashChanged || reviewPacketChanged) {
      if (!reconstructionChanged || !reconstructionHashChanged || !reviewPacketChanged) {
        fail("RECONSTRUCTION_SUCCESSOR_REQUIRES_ACTIVE_CORRECTION_AND_NEW_PACKET");
      }
      if (lineage.revisionBasisKind === "PARTICIPANT_CORRECTION") {
        const activeCorrectionSetRoot = activeParticipantCorrectionBasisRoot(predecessor);
        if (activeCorrectionSetRoot === null
          || lineage.revisionBasisCommitmentHash !== activeCorrectionSetRoot) {
          fail("PARTICIPANT_CORRECTION_BASIS_SET_NOT_ACTIVE_COMPLETE_OR_EXACT");
        }
      } else if (lineage.revisionBasisKind === "SOURCE_DISCOVERED_CORRECTION") {
        if (activeParticipantCorrectionBasisRoot(predecessor) !== null) {
          fail("SOURCE_DISCOVERY_CANNOT_BYPASS_ACTIVE_PARTICIPANT_CORRECTIONS");
        }
      } else {
        fail("RECONSTRUCTION_SUCCESSOR_REVISION_BASIS_INVALID");
      }
    } else if (lineage.revisionBasisKind !== "OCCURRENCE_APPEND_ONLY") {
      fail("UNCHANGED_RECONSTRUCTION_REQUIRES_OCCURRENCE_APPEND_ONLY_BASIS");
    }
    const activeCorrectionBlocksCurrentPacket = predecessor.currentCandidateState
      .activeMaterialCorrectionsRequiredOccurrenceCount > 0
      && !reconstructionChanged && !reconstructionHashChanged && !reviewPacketChanged;
    for (let index = predecessor.reviewOccurrences.length;
      index < reviewOccurrences.length; index += 1) {
      const row = reviewOccurrences[index];
      if (activeCorrectionBlocksCurrentPacket && row.kind === "INVITATION") {
        fail("ACTIVE_CORRECTION_BLOCKS_UNCHANGED_REVIEW_PACKET");
      }
      if (row.kind === "INVITATION"
        && (row.reviewPacketHash !== caseBinding.reviewPacketHash
          || row.reconstructionHash !== caseBinding.reconstructionHash)) {
        fail("APPENDED_INVITATION_MUST_BIND_CURRENT_PACKET");
      }
    }
  }

  const body = {
    schema: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS.ledger,
    schemaVersion: "1.0.0",
    ledgerClass:
      "CALLER_SUPPLIED_IMMEDIATE_PREFIX_DISPUTE_REVIEW_CANDIDATE_LEDGER_HOLD_ONLY",
    recordedAt,
    caseBinding,
    reconstruction,
    appendOnlyLineage: lineage,
    reviewOccurrences,
    reviewOccurrenceCensus: census(reviewOccurrences),
    suppliedPrivateObjectCommitmentEqualityView: objectEqualityView(reviewOccurrences),
    currentCandidateState: candidateState(reviewOccurrences, caseBinding),
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    result: "STRUCTURAL_CANDIDATE_RECORDED_EXTERNAL_FACT_GATE_NOT_INTEGRATED",
    boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    ledgerHash: digest("outsider.autonomous-work-order.dispute-review-ledger.v1", body),
  });
}

function normalizeCreateOptions(options) {
  if (options === undefined) return { predecessor: null };
  rejectTree(options);
  exactObject(options, ["predecessor"], "CREATE_OPTIONS");
  return { predecessor: options.predecessor };
}

function normalizeVerifyOptions(options) {
  if (options === undefined) {
    return {
      predecessor: null,
      expectedLedgerHash: null,
      expectedPredecessorLedgerHash: null,
      allowUnreplayedDescendantAsSuppliedPredecessor: false,
    };
  }
  rejectTree(options);
  exactObject(options, ["predecessor", "expectedLedgerHash",
    "expectedPredecessorLedgerHash", "allowUnreplayedDescendantAsSuppliedPredecessor"],
  "VERIFY_OPTIONS");
  if (typeof options.allowUnreplayedDescendantAsSuppliedPredecessor !== "boolean") {
    fail("VERIFY_ALLOW_UNREPLAYED_DESCENDANT_INVALID");
  }
  return options;
}

export function createAutonomousWorkOrderDisputeReviewLedger(input, options) {
  rejectTree(input);
  canonicalizeStrict(input);
  const { predecessor } = normalizeCreateOptions(options);
  if (predecessor !== null) {
    rejectTree(predecessor);
    canonicalizeStrict(predecessor);
  }
  return rebuild(clone(input), { predecessor, enforcePrefix: true });
}

export function verifyAutonomousWorkOrderDisputeReviewLedger(record, options) {
  try {
    rejectTree(record);
    canonicalizeStrict(record);
    const normalizedOptions = normalizeVerifyOptions(options);
    exactObject(record, ["schema", "schemaVersion", "ledgerClass", "recordedAt",
      "caseBinding", "reconstruction", "appendOnlyLineage", "reviewOccurrences",
      "reviewOccurrenceCensus", "suppliedPrivateObjectCommitmentEqualityView",
      "currentCandidateState", "disposition", "decisionState", "authority",
      "actionReady", "executable", "result", "boundary", "ledgerHash"], "LEDGER");
    const expectedLedgerHash = normalizedOptions.expectedLedgerHash === null ? null
      : hash(normalizedOptions.expectedLedgerHash, "EXPECTED_LEDGER_HASH");
    const expectedPredecessorLedgerHash
      = normalizedOptions.expectedPredecessorLedgerHash === null ? null
        : hash(normalizedOptions.expectedPredecessorLedgerHash,
          "EXPECTED_PREDECESSOR_LEDGER_HASH");
    const enforcePrefix = !(normalizedOptions.allowUnreplayedDescendantAsSuppliedPredecessor
      && record.appendOnlyLineage.revision > 0 && normalizedOptions.predecessor === null);
    const rebuilt = rebuild(ledgerInput(record), {
      predecessor: normalizedOptions.predecessor,
      enforcePrefix,
    });
    if (!same(record, rebuilt)) fail("LEDGER_REPLAY_MISMATCH");
    if (expectedLedgerHash !== null && rebuilt.ledgerHash !== expectedLedgerHash) {
      fail("CALLER_SUPPLIED_EXPECTED_LEDGER_HASH_MISMATCH");
    }
    if (expectedPredecessorLedgerHash !== null
      && rebuilt.appendOnlyLineage.predecessorLedgerHash !== expectedPredecessorLedgerHash) {
      fail("CALLER_SUPPLIED_EXPECTED_PREDECESSOR_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS.verification,
      ok: true,
      structuralLedgerVerified: true,
      callerSuppliedExpectedHashMatched: expectedLedgerHash !== null,
      suppliedImmediatePrefixVerified: enforcePrefix && rebuilt.appendOnlyLineage.revision > 0,
      fullAncestryReplayVerified: false,
      externalHeadVerified: false,
      actualPastCaseSourceReplayVerified: false,
      actualHumanResponseEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      ledgerHash: rebuilt.ledgerHash,
      error: null,
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
    });
  } catch (error) {
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS.verification,
      ok: false,
      structuralLedgerVerified: false,
      callerSuppliedExpectedHashMatched: false,
      suppliedImmediatePrefixVerified: false,
      fullAncestryReplayVerified: false,
      externalHeadVerified: false,
      actualPastCaseSourceReplayVerified: false,
      actualHumanResponseEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      ledgerHash: null,
      error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_ERROR",
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
    });
  }
}

export function verifyAutonomousWorkOrderDisputeReviewAgainstTrustedSources(input) {
  let structuralLedgerVerified = false;
  try {
    rejectTree(input);
    exactObject(input, ["ledger", "predecessor", "expectedLedgerHash",
      "expectedPrivateBundleRootCommitment"], "TRUSTED_INPUT");
    const { ledger, predecessor, expectedLedgerHash,
      expectedPrivateBundleRootCommitment } = input;
    hash(expectedLedgerHash, "EXPECTED_LEDGER_HASH");
    if (predecessor !== null) {
      rejectTree(predecessor);
      canonicalizeStrict(predecessor);
    }
    const expectedPredecessorLedgerHash = predecessor === null
      ? null : predecessor.ledgerHash;
    const checked = verifyAutonomousWorkOrderDisputeReviewLedger(ledger, {
      predecessor,
      expectedLedgerHash,
      expectedPredecessorLedgerHash,
      allowUnreplayedDescendantAsSuppliedPredecessor: false,
    });
    if (!checked.ok) fail("STRUCTURAL_LEDGER_OR_CALLER_PIN_INVALID");
    structuralLedgerVerified = true;
    hash(expectedPrivateBundleRootCommitment,
      "EXPECTED_PRIVATE_BUNDLE_ROOT_COMMITMENT");
    if (ledger.caseBinding.privateBundleRootCommitment
      !== expectedPrivateBundleRootCommitment) fail("CALLER_SUPPLIED_PRIVATE_ROOT_MISMATCH");
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS.trustedVerification,
      ok: false,
      structuralLedgerVerified: true,
      callerSuppliedPinsMatched: true,
      callerSuppliedLedgerPinMatched: true,
      callerSuppliedPrivateRootPinMatched: true,
      privateSourceBundleReplayIntegrated: false,
      externalAccountOrChannelContinuityVerified: false,
      directHistoricalParticipationVerified: false,
      actualHumanResponseEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      result: "TRUSTED_SOURCE_REPLAY_NOT_INTEGRATED",
      error: "AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_TRUSTED_SOURCE_REPLAY_NOT_INTEGRATED",
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
    });
  } catch (error) {
    return deepFreeze({
      schema: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_SCHEMAS.trustedVerification,
      ok: false,
      structuralLedgerVerified,
      callerSuppliedPinsMatched: false,
      callerSuppliedLedgerPinMatched: false,
      callerSuppliedPrivateRootPinMatched: false,
      privateSourceBundleReplayIntegrated: false,
      externalAccountOrChannelContinuityVerified: false,
      directHistoricalParticipationVerified: false,
      actualHumanResponseEstablished: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      result: "NOT_INTEGRATED",
      error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_ERROR",
      boundary: AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
    });
  }
}
