/*
 * Stage 1d append-only role-aware lifecycle/outcome replay.
 *
 * This v3 descendant consumes the role-aware governed-reality certificate v2.
 * The pre-action affected-party declaration remains bound to the obligation
 * genesis and pre-action registration reference.  The outcome register is a
 * distinct later-observation role bound to the census-ledger projection.  No
 * party-set continuity, superset, completeness, standing, outcome truth,
 * causality, recovery, closure, authority, action, training, CEU, or economics
 * is created.  A distinct revision-zero replay directory and live-ledger
 * directory may prove identical genesis/state content only; they do not prove
 * storage continuity, durability, uniqueness, or non-equivocation.  Local
 * checkpoints and caller pins are not external heads.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderSourceReplayReceipt,
} from "./outsider-autonomous-work-order-source-replay.js";
import {
  OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS,
  verifyOutsiderFirstGovernedRealityEpisodeCertificateV2,
} from "./outsider-network-first-governed-reality-episode-v2.js";
import {
  verifyNetworkLifecycleHeadCheckpoint,
} from "./outsider-network-lifecycle-head-checkpoint.js";
import {
  createNetworkQuarantineSourceReviewExport,
  networkQuarantineSourceReviewFileHash,
  verifyNetworkQuarantineSourceReviewExportStructure,
} from "./outsider-network-quarantine-source-review.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const BufferToString = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(BufferPrototype, "toString").value);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);
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
const Uint8ArrayPrototype = Uint8Array.prototype;

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS
  = ObjectFreeze({
    blockedDraftReceipt:
      "outsider/autonomous-work-order-lifecycle-outcome-replay-receipt/v2",
    receipt:
      "outsider/autonomous-work-order-lifecycle-outcome-replay-receipt/v3",
    verification:
      "outsider/autonomous-work-order-lifecycle-outcome-replay-verification/v3",
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY
  = deepFreeze({
    position:
      "STAGE1_ROLE_AWARE_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAY_NOT_VENDOR_SAFETY_CONTROL",
    integrationStatus: "ROLE_AWARE_STRUCTURAL_REPLAY_HOLD_ONLY",
    frozenStage1aProjectionMutated: false,
    frozenStage1bReceiptMutated: false,
    blockedV2DraftMutated: false,
    appendOnlyVersionedDescendantOnly: true,
    dualDirectoryRevisionZeroHashCrosswalkRequired: true,
    snapshotAndLiveDirectoryRolesMustBeDistinct: true,
    directoryPathsProjected: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
    roleAwareGovernedCertificateV2Required: true,
    callerExpectedCertificateHashRequired: true,
    callerExpectedCertificateHashIsIndependentProvenance: false,
    affectedPartyCensusRolesCollapsed: false,
    preActionRootBindsObligationGenesis: true,
    outcomeRootRewritesObligationGenesis: false,
    sameAffectedPartySetEstablished: false,
    affectedPartyContinuityEstablished: false,
    outcomeRegisterSupersetEstablished: false,
    affectedPartyCompletenessEstablished: false,
    affectedPartyStandingEstablished: false,
    exactUnfilteredLifecycleExportBytesRequired: true,
    currentReservationEventMembershipRequired: true,
    occurrenceCensusSeparateFromObjectDedup: true,
    occurrenceCensusUsedAsAttemptDenominator: false,
    objectDedupUsedAsAttemptDenominator: false,
    witnessOccurrenceLifecycleMembershipVerified: false,
    crossRegistryOccurrenceContinuityEstablished: false,
    sourceManifestAndReferenceBindingRecordBytesRequired: true,
    originalInstrumentBytesReplayed: false,
    originalRightsReviewBytesReplayed: false,
    originalPrivacyReviewBytesReplayed: false,
    rawLifecyclePagesProjected: false,
    rawSourceOrReviewBytesProjected: false,
    localPathsProjected: false,
    localCheckpointIsExternalHead: false,
    callerPinnedCheckpointIsExternalHead: false,
    callerPinnedRekorOrProviderDigestIsExternalHead: false,
    digestOutboxRequestIsExternalHead: false,
    externalHeadAnchorEstablished: false,
    independentLifecycleWitnessEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    differentKeysAcceptedAsOrganizationalIndependence: false,
    organizationalIndependenceEstablished: false,
    delayedWitnessAcceptedAsIndependentOutcomeTruth: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    recoveryExternallyVerified: false,
    obligationClosureEstablished: false,
    rightsReviewSemanticsAdjudicated: false,
    privacyReviewSemanticsAdjudicated: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    durableAttemptSetHeadEstablished: false,
    fullAttemptAncestryReplayVerified: false,
    episodeAttemptDenominatorComplete: false,
    directParticipantConfirmationEstablished: false,
    externalAdoptionEstablished: false,
    externalContractAcceptanceEstablished: false,
    networkOrderEstablished: false,
    declarationExternalSourceBytesReplayed: false,
    sourceReplayVerified: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    custodyEstablished: false,
    fundsVerified: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
  });

const HASH = /^sha256:[a-f0-9]{64}$/u;
const V3_TYPED_ERROR
  = /^AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_[A-Z0-9_:]+$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_PAGES = 100_000;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_TOTAL_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_TREE_NODES = 200_000;
const MAX_TREE_KEYS = 500_000;

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_${code}`);
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
  if (depth > 128) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (BufferIsBuffer(value)
    || value instanceof Uint8Array
      && ObjectGetPrototypeOf(value) === Uint8ArrayPrototype) return;
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
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

function denseArray(value, code, maximum = MAX_PAGES) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < 1 || value.length > maximum) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== "length") {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function timestamp(value, code) {
  const parsed = typeof value === "string" ? DateParse(value) : NaN;
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || !NumberIsSafeInteger(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) fail(`${code}_INVALID`);
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function exactPageBytes(value) {
  denseArray(value, "LIFECYCLE_EXPORT_PAGE_BYTES");
  const result = [];
  let totalBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const page = value[index];
    if (isProxy(page)) fail("LIFECYCLE_EXPORT_PAGE_PROXY_FORBIDDEN");
    if (!BufferIsBuffer(page)
      && !(page instanceof Uint8Array
        && ObjectGetPrototypeOf(page) === Uint8ArrayPrototype)) {
      fail("LIFECYCLE_EXPORT_PAGE_BYTES_REQUIRED");
    }
    const byteLength = page.byteLength;
    if (!NumberIsSafeInteger(byteLength) || byteLength < 0
      || byteLength > MAX_PAGE_BYTES) fail("LIFECYCLE_EXPORT_PAGE_BYTE_LIMIT_EXCEEDED");
    if (byteLength > MAX_TOTAL_PAGE_BYTES - totalBytes) {
      fail("LIFECYCLE_EXPORT_TOTAL_BYTE_LIMIT_EXCEEDED");
    }
    totalBytes += byteLength;
    append(result, BufferFrom(page));
  }
  return result;
}

function parseLifecyclePages(exportPageBytes) {
  const pages = [];
  for (let index = 0; index < exportPageBytes.length; index += 1) {
    try {
      append(pages, JSONParse(BufferToString(exportPageBytes[index], "utf8")));
    } catch {
      fail("LIFECYCLE_PAGE_JSON_INVALID");
    }
  }
  return pages;
}

function exactInputShape(input, context) {
  exactObject(input, ["recordedAt", "predecessor", "delayedWitness", "lifecycle",
    "sourceReview"], "INPUT");
  exactObject(input.predecessor, ["receipt", "input", "context"], "PREDECESSOR");
  exactObject(input.delayedWitness, ["certificate", "input", "context"],
    "DELAYED_WITNESS");
  exactObject(input.lifecycle, ["exportPageBytes", "checkpoint", "outboxRequest"],
    "LIFECYCLE");
  exactObject(input.sourceReview, ["export", "input"], "SOURCE_REVIEW");
  exactObject(context, ["expectedPredecessorReceiptHash", "expectedCertificateHash",
    "expectedLifecycleCheckpointHash", "expectedSourceReviewExportHash",
    "expectedSourceReviewSetRoot"], "CONTEXT");
}

function verifyPredecessor(input, context) {
  const checked = verifyAutonomousWorkOrderSourceReplayReceipt(
    input.predecessor.receipt, {
      input: input.predecessor.input,
      context: input.predecessor.context,
      expectedReceiptHash: hash(context.expectedPredecessorReceiptHash,
        "EXPECTED_PREDECESSOR_RECEIPT_HASH"),
    });
  if (!checked.ok || checked.receiptDerivationVerified !== true
    || checked.networkCoreCanonicalReplayVerified !== true
    || checked.networkCoreSourceReplayVerified !== false
    || checked.trustPolicyExternalPinProvenanceEstablished !== false
    || checked.sourceReplayVerified !== false
    || checked.independentOutcomeEstablished !== false
    || checked.authority !== "NONE" || checked.actionReady !== false
    || checked.trainingRows !== 0 || checked.causalExperienceUnits !== 0) {
    fail("PREDECESSOR_REPLAY_INVALID");
  }
  return checked;
}

function verifyDelayedWitness(input, context) {
  const certificateContext = input.delayedWitness.context;
  exactObject(certificateContext, ["baseLaneTrust", "expectedBaseJoinHash",
    "outcomeWitnessNetworkTrust", "outcomeWitnessTrustPolicy",
    "outcomeWitnessAdapterRegistry", "outcomeWitnessAdapterId"],
  "DELAYED_WITNESS_CONTEXT");
  const expectedCertificateHash = hash(context.expectedCertificateHash,
    "EXPECTED_CERTIFICATE_HASH_CALLER_PIN_REQUIRED");
  const checked = verifyOutsiderFirstGovernedRealityEpisodeCertificateV2(
    input.delayedWitness.certificate, {
      input: input.delayedWitness.input,
      expectedCertificateHash,
      baseLaneTrust: certificateContext.baseLaneTrust,
      expectedBaseJoinHash: certificateContext.expectedBaseJoinHash,
      outcomeWitnessNetworkTrust: certificateContext.outcomeWitnessNetworkTrust,
      outcomeWitnessTrustPolicy: certificateContext.outcomeWitnessTrustPolicy,
      outcomeWitnessAdapterRegistry: certificateContext.outcomeWitnessAdapterRegistry,
      outcomeWitnessAdapterId: certificateContext.outcomeWitnessAdapterId,
    });
  if (!checked.ok || checked.certificateHash !== expectedCertificateHash
    || checked.sourceReplayComplete !== true
    || checked.sameAffectedPartySetEstablished !== false
    || checked.affectedPartyContinuityEstablished !== false
    || checked.outcomeRegisterSupersetOfPreActionDeclarationEstablished !== false
    || checked.completeEpisodeTruthEstablished !== false
    || checked.independentOutcomeTruthEstablished !== false
    || checked.causalAttributionEstablished !== false
    || checked.affectedPartyCompletenessEstablished !== false
    || checked.affectedPartyStandingEstablished !== false
    || checked.recoveryExternallyVerified !== false
    || checked.obligationClosureEstablished !== false
    || checked.authority !== "NONE" || checked.actionReady !== false
    || checked.trainingRows !== 0 || checked.causalExperienceUnits !== 0) {
    fail("DELAYED_WITNESS_REPLAY_INVALID");
  }
  const certificate = input.delayedWitness.certificate;
  if (certificate.schema
      !== OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.certificate
    || certificate.sourceReplay.exactWitnessSourceBytesReplayed !== true
    || certificate.sourceReplay
      .witnessAdapterProjectionSpecificationAndSchemaReplayed !== true
    || certificate.sourceReplay
      .witnessAdapterImplementationOrCodeClosureReplayed !== false
    || certificate.roleSeparation
      .differentKeysAcceptedAsOrganizationalIndependence !== false
    || certificate.roleSeparation.organizationalIndependenceEstablished !== false
    || certificate.affectedPartyRoleCrosswalk.sameAffectedPartySetEstablished !== false
    || certificate.affectedPartyRoleCrosswalk.affectedPartyContinuityEstablished
      !== false
    || certificate.affectedPartyRoleCrosswalk
      .outcomeRegisterSupersetOfPreActionDeclarationEstablished !== false
    || certificate.horizonAndObligationCrosswalk.delayedHorizonMatured !== true
    || certificate.horizonAndObligationCrosswalk.obligationOutstanding !== true
    || certificate.horizonAndObligationCrosswalk.obligationClosed !== false) {
    fail("DELAYED_WITNESS_BOUNDARY_INVALID");
  }
  return checked;
}

function verifyBaseCrosswalk(input) {
  const predecessor = input.predecessor.receipt;
  const certificate = input.delayedWitness.certificate;
  const certificateInput = input.delayedWitness.input;
  const baseEpisode = certificateInput.baseEpisode;
  const roles = certificate.affectedPartyRoleCrosswalk;
  const horizon = certificate.horizonAndObligationCrosswalk;
  const preAction = certificateInput.preActionAffectedPartyDeclaration.register;
  const outcome = certificateInput.outcomeAffectedPartyRegister.register;
  const join = baseEpisode.join;
  const snapshotEpisode = input.predecessor.input.completeEpisode;
  exactObject(snapshotEpisode, ["join", "input"], "SNAPSHOT_BASE_EPISODE");
  exactObject(baseEpisode, ["join", "input"], "LIVE_BASE_EPISODE");
  exactObject(snapshotEpisode.input, ["prospectiveCensus", "actorIdentity",
    "laneBundles", "obligationPrefix"], "SNAPSHOT_BASE_EPISODE_INPUT");
  exactObject(baseEpisode.input, ["prospectiveCensus", "actorIdentity",
    "laneBundles", "obligationPrefix"], "LIVE_BASE_EPISODE_INPUT");
  const snapshotPrefix = exactObject(snapshotEpisode.input.obligationPrefix,
    ["directory", "expectedRevision", "expectedStateHash", "expectedGenesisHash"],
    "SNAPSHOT_OBLIGATION_PREFIX");
  const livePrefix = exactObject(baseEpisode.input.obligationPrefix,
    ["directory", "expectedRevision", "expectedStateHash", "expectedGenesisHash"],
    "LIVE_OBLIGATION_PREFIX");
  if (typeof snapshotPrefix.directory !== "string"
    || snapshotPrefix.directory.length < 1
    || typeof livePrefix.directory !== "string" || livePrefix.directory.length < 1
    || snapshotPrefix.directory === livePrefix.directory
    || snapshotPrefix.expectedRevision !== 0 || livePrefix.expectedRevision !== 0
    || snapshotPrefix.expectedGenesisHash !== livePrefix.expectedGenesisHash
    || snapshotPrefix.expectedStateHash !== livePrefix.expectedStateHash
    || snapshotPrefix.expectedGenesisHash
      !== predecessor.sourcePins.obligationGenesisHash
    || snapshotPrefix.expectedStateHash !== predecessor.sourcePins.obligationStateHash
    || !same(snapshotEpisode.join, baseEpisode.join)
    || !same(snapshotEpisode.input.prospectiveCensus,
      baseEpisode.input.prospectiveCensus)
    || !same(snapshotEpisode.input.actorIdentity, baseEpisode.input.actorIdentity)
    || !same(snapshotEpisode.input.laneBundles, baseEpisode.input.laneBundles)) {
    fail("DUAL_DIRECTORY_REVISION_ZERO_CROSSWALK_INVALID");
  }
  if (predecessor.sourcePins.completeEpisodeJoinHash
      !== certificate.baseEpisode.completeEpisodeJoinHash
    || predecessor.sourcePins.completeEpisodeJoinHash !== join.joinHash
    || predecessor.orderIdentity.orderIdentityHash !== certificate.subject.episodeHash
    || predecessor.orderIdentity.episodeHash !== certificate.subject.episodeHash
    || predecessor.networkOccurrenceSummary.representedAttemptHash
      !== certificate.subject.attemptHash
    || predecessor.sourcePins.affectedPartyRootHash
      !== roles.preActionAffectedPartyDeclarationRootHash
    || roles.preActionAffectedPartyDeclarationRootHash
      !== horizon.preActionAffectedPartyDeclarationRootHash
    || roles.preActionAffectedPartyDeclarationRootHash
      !== preAction.affectedPartyRootHash
    || roles.outcomeAffectedPartyRegisterRootHash
      !== horizon.outcomeAffectedPartyRegisterRootHash
    || roles.outcomeAffectedPartyRegisterRootHash !== outcome.affectedPartyRootHash
    || roles.outcomeAffectedPartyRegisterRootHash
      !== certificateInput.outcomeWitness.nodeSubmissionBundle.preview.payload
        .affectedPartyRegisterRootHash
    || roles.preActionAffectedPartyDeclarationRootHash
      === roles.outcomeAffectedPartyRegisterRootHash
    || roles.preActionAffectedPartyCensusRoleHash
      !== join.censusCrosswalk.preActionRegistrationReferenceHash
    || roles.outcomeAffectedPartyCensusRoleHash
      !== join.censusCrosswalk.censusLedgerProjectionHash
    || roles.preActionAffectedPartyCensusRoleHash
      === roles.outcomeAffectedPartyCensusRoleHash
    || predecessor.sourcePins.obligationGenesisHash !== horizon.obligationGenesisHash
    || predecessor.sourcePins.obligationStateHash !== horizon.baseObligationStateHash
    || roles.obligationGenesisContinuesToBindPreActionDeclarationRoot !== true
    || roles.outcomeRegisterUsedAsLaterObservationCrosswalkOnly !== true
    || roles.outcomeRegisterRewroteObligationGenesis !== false
    || roles.sameEpisodeHash !== true || roles.sameAttemptHash !== true
    || roles.sameAffectedPartySetEstablished !== false
    || roles.affectedPartyContinuityEstablished !== false
    || roles.outcomeRegisterSupersetOfPreActionDeclarationEstablished !== false
    || predecessor.sourcePins.outcomeWitnessEnvelopeHash !== null) {
    fail("PREDECESSOR_ROLE_AWARE_DELAYED_WITNESS_CROSSWALK_INVALID");
  }
  return { roles, horizon, dualDirectory: {
    revision: 0,
    genesisHash: snapshotPrefix.expectedGenesisHash,
    stateHash: snapshotPrefix.expectedStateHash,
    snapshotAndLiveDirectoryRolesDistinct: true,
    dualDirectoryRevisionZeroHashCrosswalkVerified: true,
    directoryPathsProjected: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
  } };
}

function verifyLifecycle(input, context) {
  const exportPageBytes = exactPageBytes(input.lifecycle.exportPageBytes);
  const checked = verifyNetworkLifecycleHeadCheckpoint({
    exportPageBytes,
    checkpoint: input.lifecycle.checkpoint,
    outboxRequest: input.lifecycle.outboxRequest,
    expectedCheckpointHash: hash(context.expectedLifecycleCheckpointHash,
      "EXPECTED_LIFECYCLE_CHECKPOINT_HASH"),
  });
  if (checked.source.exactGatewayResponseBytesReplayed !== true
    || checked.source.inMemoryExactFrozenPagesReplayed !== false
    || checked.localChecks.eventOrdinalsAndPreviousHashesReplayed !== true
    || checked.localChecks.eventHashesRecomputed !== true
    || checked.localChecks.lifecycleTransitionsReplayed !== true
    || checked.localChecks.paginationCursorsAndTailReplayed !== true
    || checked.localChecks.checkpointMatchedCallerPinAndSource !== true
    || checked.limitations.localCheckpointOnly !== true
    || checked.limitations.externalAnchorEstablished !== false
    || checked.limitations.independentWitnessEstablished !== false
    || checked.limitations.wormStorageEstablished !== false
    || checked.limitations.nonOmissionProofEstablished !== false
    || checked.limitations.serverNonEquivocationEstablished !== false
    || checked.limitations.serverCompletenessEstablished !== false
    || checked.limitations.providerReceiptPresent !== false
    || checked.limitations.callerPinIsNotExternalEvidence !== true
    || checked.useBoundary.authority !== "NONE"
    || checked.useBoundary.authorityGrants !== 0
    || checked.useBoundary.actionAdmissions !== 0
    || checked.useBoundary.trainingRows !== 0
    || checked.useBoundary.causalExperienceUnits !== 0) {
    fail("LIFECYCLE_CHECKPOINT_BOUNDARY_INVALID");
  }
  return { checked, exportPageBytes };
}

function verifySourceReview(input, context) {
  const rebuilt = createNetworkQuarantineSourceReviewExport(
    input.sourceReview.input);
  if (!same(rebuilt, input.sourceReview.export)) {
    fail("SOURCE_REVIEW_EXACT_SOURCE_REPLAY_INVALID");
  }
  const checked = verifyNetworkQuarantineSourceReviewExportStructure(rebuilt, {
    expectedExportHash: hash(context.expectedSourceReviewExportHash,
      "EXPECTED_SOURCE_REVIEW_EXPORT_HASH"),
    expectedSourceReviewSetRoot: hash(context.expectedSourceReviewSetRoot,
      "EXPECTED_SOURCE_REVIEW_SET_ROOT"),
  });
  const review = rebuilt.sourceReview;
  if (!checked.ok || checked.structuralOnly !== true
    || checked.sourceByteReplayReperformed !== false
    || rebuilt.supersession.sourceKind !== "V1_EXPORT_ITEM"
    || rebuilt.supersession.structuralFixtureOnly !== false
    || rebuilt.supersession.networkPublicationAdmissible !== false
    || rebuilt.persistedContract.kind
      !== "SELF_SIGNED_RESERVATION_TRANSPORT_POSSESSION_ONLY"
    || rebuilt.lifecycle.eventType !== "QUARANTINED"
    || rebuilt.lifecycle.reservationStatus !== "SETTLED"
    || rebuilt.lifecycle.revoked !== false || rebuilt.lifecycle.purged !== false
    || rebuilt.lifecycle.payloadTombstoned !== false
    || rebuilt.lifecycle.payloadAccessibleInDescendant !== false
    || review.fileCount !== 4 || review.lifecycleSuppressed !== false
    || review.sourceManifestByteReplayEstablished !== true
    || review.instrumentByteReplayEstablished !== true
    || review.rightsReviewByteReplayEstablished !== true
    || review.privacyReviewByteReplayEstablished !== true
    || review.reviewSemanticsAdjudicated !== false
    || review.rightsClearanceEstablished !== false
    || review.privacyClearanceEstablished !== false
    || review.networkProjectionAuthorized !== false
    || review.rawBytesProjected !== false || review.localPathsProjected !== false
    || rebuilt.externalHeadAnchor.externalHeadAnchorEstablished !== false
    || rebuilt.externalHeadAnchor.independentWitnessEstablished !== false
    || rebuilt.externalHeadAnchor.nonOmissionProofEstablished !== false
    || rebuilt.externalHeadAnchor.nonEquivocationEstablished !== false) {
    fail("SOURCE_REVIEW_BOUNDARY_INVALID");
  }
  return rebuilt;
}

function sourceBindingRecordBytes(witnessInput) {
  const encoded = (value) => BufferFrom(canonicalizeStrict(value), "utf8");
  return {
    sourceManifest: encoded(witnessInput.sourceManifest),
    instrument: encoded({
      schema:
        "outsider/autonomous-work-order-witness-instrument-reference-binding/v1",
      instrumentHash: witnessInput.envelope.instrumentHash,
      implementationOrCodeClosureReplayed: false,
    }),
    rightsReview: encoded({
      schema:
        "outsider/autonomous-work-order-witness-rights-review-reference-binding/v1",
      rightsReviewHash: witnessInput.sourceManifest.rightsReviewHash,
      reviewSemanticsAdjudicated: false,
      clearanceEstablished: false,
    }),
    privacyReview: encoded({
      schema:
        "outsider/autonomous-work-order-witness-privacy-review-reference-binding/v1",
      privacyReviewHash: witnessInput.sourceManifest.privacyReviewHash,
      reviewSemanticsAdjudicated: false,
      clearanceEstablished: false,
    }),
  };
}

function bindingNamed(bindings, kind) {
  let found = null;
  let matches = 0;
  for (let index = 0; index < bindings.length; index += 1) {
    if (bindings[index].kind === kind) {
      found = bindings[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail(`SOURCE_BINDING_${kind}_NOT_UNIQUE`);
  return found;
}

function verifySourceBindingRecords(witnessInput, sourceReview) {
  const bytes = sourceBindingRecordBytes(witnessInput);
  const expected = [
    ["SOURCE_MANIFEST", bytes.sourceManifest],
    ["INSTRUMENT", bytes.instrument],
    ["RIGHTS_REVIEW", bytes.rightsReview],
    ["PRIVACY_REVIEW", bytes.privacyReview],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const [kind, value] = expected[index];
    const binding = bindingNamed(sourceReview.sourceReview.bindings, kind);
    const expectedHash = networkQuarantineSourceReviewFileHash(kind, value);
    if (binding.bytes !== value.length || binding.replayedHash !== expectedHash
      || binding.expectedHash !== expectedHash || binding.matched !== true) {
      fail(`SOURCE_BINDING_${kind}_BYTE_CROSSWALK_INVALID`);
    }
  }
  return bytes;
}

function currentLifecycleItem(exportPageBytes, sourceReview) {
  const pages = parseLifecyclePages(exportPageBytes);
  const reservationHash = sourceReview.networkBinding.reservationHash;
  const eventHash = sourceReview.networkBinding.eventHash;
  let exact = null;
  let latest = null;
  let exactMatches = 0;
  let reservationEventCount = 0;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!ArrayIsArray(page.items)) fail("LIFECYCLE_PAGE_ITEMS_INVALID");
    for (let itemIndex = 0; itemIndex < page.items.length; itemIndex += 1) {
      const item = page.items[itemIndex];
      if (item?.event?.reservationHash !== reservationHash) continue;
      reservationEventCount += 1;
      if (latest === null || item.event.ordinal > latest.event.ordinal) latest = item;
      if (item.event.eventHash === eventHash) {
        exact = item;
        exactMatches += 1;
      }
    }
  }
  if (exactMatches !== 1 || latest === null || latest.event.eventHash !== eventHash) {
    fail("SOURCE_REVIEW_EVENT_NOT_EXACT_CURRENT_RESERVATION_HEAD");
  }
  if (!same(exact.event, sourceReview.networkSnapshot.event)
    || !same(exact.derivedState, {
      reservationStatus: sourceReview.lifecycle.reservationStatus,
    })
    || !same(exact.retention, {
      retentionUntil: sourceReview.lifecycle.retentionUntil,
      payloadTombstoned: sourceReview.lifecycle.payloadTombstoned,
      tombstonedAt: sourceReview.lifecycle.tombstonedAt,
    })) {
    fail("SOURCE_REVIEW_LIFECYCLE_EXPORT_ITEM_CROSSWALK_INVALID");
  }
  return { item: exact, reservationEventCount };
}

function verifySuccessorCrosswalk(input, lifecycle, sourceReview, roleCrosswalk) {
  const witnessInput = input.delayedWitness.input.outcomeWitness;
  const successorBundle = witnessInput.nodeSubmissionBundle;
  const manifest = successorBundle.preview.manifest;
  const payload = successorBundle.preview.payload;
  const reviewManifest = input.sourceReview.input.persistedContract.manifest;
  const certificate = input.delayedWitness.certificate;
  const current = currentLifecycleItem(lifecycle.exportPageBytes, sourceReview);
  const bindingBytes = verifySourceBindingRecords(witnessInput, sourceReview);
  const reportedAt = certificate.horizonAndObligationCrosswalk.reportedAt;
  if (certificate.outcomeWitnessSuccessor.nodeSubmissionBundleHash
      !== successorBundle.bundleHash
    || certificate.outcomeWitnessSuccessor.manifestHash !== manifest.manifestHash
    || certificate.outcomeWitnessSuccessor.occurrenceIdentityHash
      !== manifest.occurrenceIdentityHash
    || certificate.outcomeWitnessSuccessor.outcomeWitnessEnvelopeHash
      !== witnessInput.envelope.envelopeHash
    || certificate.outcomeWitnessSuccessor.witnessSourceManifestHash
      !== witnessInput.sourceManifest.sourceManifestHash
    || payload.affectedPartyRegisterRootHash
      !== roleCrosswalk.roles.outcomeAffectedPartyRegisterRootHash
    || payload.obligationGenesisHash
      !== roleCrosswalk.horizon.obligationGenesisHash
    || sourceReview.networkBinding.lane !== "ACTION_OUTCOME"
    || sourceReview.networkBinding.manifestHash !== reviewManifest.manifestHash
    || sourceReview.networkBinding.manifestHash === manifest.manifestHash
    || sourceReview.networkBinding.objectIdentityHash
      !== manifest.payload.objectIdentityHash
    || sourceReview.networkBinding.occurrenceIdentityHash
      === manifest.occurrenceIdentityHash
    || !same(reviewManifest.subject, manifest.subject)
    || !same(input.sourceReview.input.v1ExportItem.object, payload)
    || !same(current.item.object, payload)
    || !same(input.sourceReview.input.v1ExportItem, current.item)
    || DateParse(manifest.createdAt) < DateParse(reportedAt)
    || DateParse(successorBundle.receipt.receivedAt) <= DateParse(manifest.createdAt)
    || DateParse(sourceReview.networkSnapshot.event.occurredAt)
      <= DateParse(successorBundle.receipt.receivedAt)
    || sourceReview.sourceReviewSetPin.checkpointHash
      !== lifecycle.checked.checkpointHash) {
    fail("ROLE_AWARE_ACTION_OUTCOME_V2_LIFECYCLE_CROSSWALK_INVALID");
  }
  return {
    ...current,
    bindingByteCount: bindingBytes.sourceManifest.length
      + bindingBytes.instrument.length + bindingBytes.rightsReview.length
      + bindingBytes.privacyReview.length,
  };
}

function receiptBody(input, context) {
  exactInputShape(input, context);
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  const predecessorCheck = verifyPredecessor(input, context);
  const witnessCheck = verifyDelayedWitness(input, context);
  const roleCrosswalk = verifyBaseCrosswalk(input);
  const lifecycle = verifyLifecycle(input, context);
  const sourceReview = verifySourceReview(input, context);
  const current = verifySuccessorCrosswalk(input, lifecycle, sourceReview,
    roleCrosswalk);
  if (DateParse(sourceReview.reviewedAt)
      < DateParse(input.lifecycle.checkpoint.createdAt)
    || DateParse(recordedAt) < DateParse(sourceReview.reviewedAt)
    || DateParse(recordedAt) < DateParse(input.lifecycle.checkpoint.createdAt)) {
    fail("RECEIPT_TIME_ORDER_INVALID");
  }
  const predecessor = input.predecessor.receipt;
  const certificate = input.delayedWitness.certificate;
  const roles = certificate.affectedPartyRoleCrosswalk;
  const horizon = certificate.horizonAndObligationCrosswalk;
  const dualDirectory = roleCrosswalk.dualDirectory;
  const missingSourceClasses = [
    "AFFECTED_PARTY_ROLE_CONTINUITY_NOT_ESTABLISHED",
    "DECLARATION_EXTERNAL_SOURCE_BYTES_NOT_REPLAYED",
    "DIRECT_PARTICIPANT_CONFIRMATION_NOT_ESTABLISHED",
    "DUAL_DIRECTORY_NON_EQUIVOCATION_NOT_ESTABLISHED",
    "DURABLE_ATTEMPT_SET_HEAD_NOT_ESTABLISHED",
    "EXTERNAL_HEAD_ANCHOR_NOT_ESTABLISHED",
    "EXTERNAL_PIN_PROVENANCE_NOT_ESTABLISHED",
    "FULL_ATTEMPT_ANCESTRY_NOT_REPLAYED",
    "INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED",
    "ORGANIZATIONAL_INDEPENDENCE_NOT_ESTABLISHED",
    "ORIGINAL_INSTRUMENT_RIGHTS_PRIVACY_BYTES_NOT_REPLAYED",
    "OBLIGATION_CONTINUATION_UNIQUENESS_NOT_ESTABLISHED",
    "OUTCOME_REGISTER_SUPERSET_NOT_ESTABLISHED",
    "OUTCOME_WITNESS_ADAPTER_IMPLEMENTATION_CODE_CLOSURE_NOT_REPLAYED",
    "PRIVACY_REVIEW_SEMANTICS_NOT_ADJUDICATED",
    "RIGHTS_REVIEW_SEMANTICS_NOT_ADJUDICATED",
    "SINGLE_CANONICAL_OBLIGATION_LEDGER_NOT_ESTABLISHED",
    "STORAGE_DIRECTORY_CONTINUITY_NOT_ESTABLISHED",
    "STORAGE_DURABILITY_NOT_ESTABLISHED",
  ];
  return {
    schema: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.receipt,
    schemaVersion: "3.0.0",
    receiptClass:
      "ROLE_AWARE_LIFECYCLE_ACTION_OUTCOME_V2_SOURCE_REPLAY_HOLD_INCOMPLETE",
    recordedAt,
    protocolLineage: {
      blockedDraftReceiptSchema:
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS
          .blockedDraftReceipt,
      blockedDraftMintedReceiptConsumed: false,
      roleAwareCertificateSchema:
        OUTSIDER_FIRST_GOVERNED_REALITY_EPISODE_V2_SCHEMAS.certificate,
      roleAwareCertificateHash: certificate.certificateHash,
      predecessorReceiptSchema: predecessor.schema,
      predecessorReceiptHash: predecessor.sourceReplayReceiptHash,
      supersedesReceiptHash: predecessor.sourceReplayReceiptHash,
      supersessionScope:
        "ROLE_AWARE_CENSUS_AND_AFFECTED_PARTY_LIFECYCLE_REPLAY_ONLY",
      predecessorRederived: true,
      predecessorOverwritten: false,
      blockedV2DraftMutated: false,
    },
    orderIdentity: {
      orderId: predecessor.orderIdentity.orderId,
      orderIdentityHash: predecessor.orderIdentity.orderIdentityHash,
      episodeHash: predecessor.orderIdentity.episodeHash,
      attemptHash: predecessor.networkOccurrenceSummary.representedAttemptHash,
      workOrderHash: predecessor.orderIdentity.workOrderHash,
      orderIdentityAliasesExistingEpisode: true,
      newIdentityCreated: false,
    },
    delayedOutcomeSuccessor: {
      certificateHash: certificate.certificateHash,
      expectedCertificateHashCallerPinMatched: true,
      expectedCertificateHashCallerPinIsIndependentProvenance: false,
      baseCompleteEpisodeJoinHash: certificate.baseEpisode.completeEpisodeJoinHash,
      lane: "ACTION_OUTCOME",
      payloadSchema: certificate.outcomeWitnessSuccessor.payloadSchema,
      nodeSubmissionBundleHash:
        certificate.outcomeWitnessSuccessor.nodeSubmissionBundleHash,
      manifestHash: certificate.outcomeWitnessSuccessor.manifestHash,
      occurrenceIdentityHash:
        certificate.outcomeWitnessSuccessor.occurrenceIdentityHash,
      outcomeWitnessEnvelopeHash:
        certificate.outcomeWitnessSuccessor.outcomeWitnessEnvelopeHash,
      observationStatus: certificate.outcomeWitnessSuccessor.observationStatus,
      observedAt: certificate.outcomeWitnessSuccessor.observedAt,
      reportedAt: horizon.reportedAt,
      sameLaneDelayedSuccessor: true,
      exactWitnessSourceBytesReplayed: true,
      adapterSpecificationAndSchemaReplayed: true,
      adapterImplementationOrCodeClosureReplayed: false,
      delayedHorizonMatured: true,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      obligationClosed: false,
    },
    affectedPartyRoleCrosswalk: {
      preActionAffectedPartyDeclarationRootHash:
        roles.preActionAffectedPartyDeclarationRootHash,
      preActionAffectedPartyCensusRoleHash:
        roles.preActionAffectedPartyCensusRoleHash,
      outcomeAffectedPartyRegisterRootHash:
        roles.outcomeAffectedPartyRegisterRootHash,
      outcomeAffectedPartyCensusRoleHash:
        roles.outcomeAffectedPartyCensusRoleHash,
      rootsDistinct: true,
      censusRolesDistinct: true,
      sameEpisodeHash: true,
      sameAttemptHash: true,
      obligationGenesisContinuesToBindPreActionDeclarationRoot: true,
      outcomeRegisterUsedAsLaterObservationCrosswalkOnly: true,
      outcomeRegisterRewroteObligationGenesis: false,
      sameAffectedPartySetEstablished: false,
      affectedPartyContinuityEstablished: false,
      outcomeRegisterSupersetOfPreActionDeclarationEstablished: false,
      affectedPartyCompletenessEstablished: false,
      affectedPartyStandingEstablished: false,
    },
    obligationCrosswalk: {
      obligationGenesisHash: horizon.obligationGenesisHash,
      baseObligationStateHash: horizon.baseObligationStateHash,
      laterObligationStateHash: horizon.laterObligationStateHash,
      snapshotRevisionZero: dualDirectory.revision,
      liveBasePrefixRevision: dualDirectory.revision,
      snapshotRevisionZeroGenesisHash: dualDirectory.genesisHash,
      liveBasePrefixGenesisHash: dualDirectory.genesisHash,
      snapshotRevisionZeroStateHash: dualDirectory.stateHash,
      liveBasePrefixStateHash: dualDirectory.stateHash,
      snapshotAndLiveDirectoryRolesDistinct:
        dualDirectory.snapshotAndLiveDirectoryRolesDistinct,
      dualDirectoryRevisionZeroHashCrosswalkVerified:
        dualDirectory.dualDirectoryRevisionZeroHashCrosswalkVerified,
      directoryPathsProjected: false,
      storageDirectoryContinuityEstablished: false,
      storageDurabilityEstablished: false,
      obligationContinuationUniquenessEstablished: false,
      dualDirectoryNonEquivocationEstablished: false,
      singleCanonicalObligationLedgerEstablished: false,
      horizonId: horizon.horizonId,
      dueAt: horizon.dueAt,
      observedAt: horizon.observedAt,
      reportedAt: horizon.reportedAt,
      preActionAffectedPartyDeclarationRootHash:
        horizon.preActionAffectedPartyDeclarationRootHash,
      outcomeAffectedPartyRegisterRootHash:
        horizon.outcomeAffectedPartyRegisterRootHash,
      obligationGenesisRewrittenForOutcomeRegister: false,
      obligationOutstanding: true,
      obligationClosureEstablished: false,
    },
    lifecycleReplay: {
      checkpointHash: lifecycle.checked.checkpointHash,
      outboxRequestHash: lifecycle.checked.outboxRequestHash,
      registryId: lifecycle.checked.registryId,
      eventCount: lifecycle.checked.eventCount,
      tailHash: lifecycle.checked.tailHash,
      exportSetRoot: lifecycle.checked.exportSetRoot,
      pageCount: lifecycle.checked.source.pageCount,
      exactByteCount: lifecycle.checked.source.exactByteCount,
      exactUnfilteredExportBytesReplayed: true,
      eventChainAndTransitionsReplayed: true,
      currentReservationEventMembershipVerified: true,
      reservationLifecycleEventCount: current.reservationEventCount,
      actionOutcomeV2CurrentReviewOccurrenceCount: 1,
      crosswalkedActionOutcomeV2ReportOccurrenceCount: 2,
      crosswalkedDistinctObjectIdentityCount: 1,
      occurrenceCountDerivedFromObjectCount: false,
      witnessOccurrenceLifecycleMembershipVerified: false,
      crossRegistryOccurrenceContinuityEstablished: false,
      localCheckpointOnly: true,
      callerPinMatched: true,
      callerPinAcceptedAsExternalEvidence: false,
      digestOutboxNetworkSubmissionPerformed: false,
      externalHeadAnchorEstablished: false,
      independentWitnessEstablished: false,
      nonOmissionProofEstablished: false,
      nonEquivocationEstablished: false,
      serverCompletenessEstablished: false,
    },
    sourceReviewReplay: {
      exportHash: sourceReview.exportHash,
      sourceReviewSetRoot: sourceReview.sourceReviewSetRoot,
      manifestHash: sourceReview.networkBinding.manifestHash,
      eventHash: sourceReview.networkBinding.eventHash,
      objectIdentityHash: sourceReview.networkBinding.objectIdentityHash,
      occurrenceIdentityHash: sourceReview.networkBinding.occurrenceIdentityHash,
      occurrenceCensusCount: sourceReview.occurrenceCensus.observedEventBindings,
      referencedDistinctObjectIdentityCount:
        sourceReview.objectDedup.referencedDistinctObjectIdentities,
      occurrenceCensusSeparateFromObjectDedup: true,
      sourceReviewFileCount: sourceReview.sourceReview.fileCount,
      exactSourceReviewByteCount: sourceReview.sourceReview.totalBytes,
      expectedSourceBindingRecordByteCount: current.bindingByteCount,
      sourceReviewOccurrenceIsDistinctFromWitnessOccurrence: true,
      sourceReviewOccurrenceCarriesSameContentAddressedPayload: true,
      sourceManifestBindingRecordIsCanonicalWitnessManifest: true,
      instrumentBindingRecordIsSynthesizedReferenceOnly: true,
      rightsAndPrivacyBindingRecordsAreSynthesizedReferenceOnly: true,
      sourceManifestBytesReplayed: true,
      instrumentReferenceBindingRecordBytesReplayed: true,
      rightsReviewReferenceBindingRecordBytesReplayed: true,
      privacyReviewReferenceBindingRecordBytesReplayed: true,
      originalInstrumentBytesReplayed: false,
      originalRightsReviewBytesReplayed: false,
      originalPrivacyReviewBytesReplayed: false,
      reviewSemanticsAdjudicated: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      rawBytesProjected: false,
      localPathsProjected: false,
      callerExternalHeadDigestReferencePresent:
        sourceReview.externalHeadAnchor.pinned,
      callerExternalHeadDigestAcceptedAsExternalHead: false,
      rekorOrProviderCallerPinAcceptedAsExternalHead: false,
      externalHeadAnchorEstablished: false,
      independentWitnessEstablished: false,
    },
    truthAndAuthorityBoundary: {
      differentKeysAcceptedAsOrganizationalIndependence: false,
      organizationalIndependenceEstablished: false,
      delayedObservationAcceptedAsIndependentOutcomeTruth: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      recoveryExternallyVerified: false,
      obligationClosureEstablished: false,
      completeEpisodeTruthEstablished: false,
    },
    replayCoverage: {
      predecessorReceiptRederived: predecessorCheck.receiptDerivationVerified,
      predecessorRevisionZeroSnapshotFreshReplayVerified: true,
      roleAwareCertificateV2Rederived: witnessCheck.sourceReplayComplete,
      certificateLiveLedgerPrefixFreshReplayVerified: true,
      dualDirectoryRevisionZeroHashCrosswalkVerified: true,
      storageDirectoryContinuityEstablished: false,
      storageDurabilityEstablished: false,
      obligationContinuationUniquenessEstablished: false,
      dualDirectoryNonEquivocationEstablished: false,
      singleCanonicalObligationLedgerEstablished: false,
      roleAwareCertificateCallerHashPinMatched: true,
      roleAwareCertificateCallerHashPinHasIndependentProvenance: false,
      delayedWitnessSourceByteReplayIntegrated: true,
      lifecycleExactExportByteReplayIntegrated: true,
      lifecycleSourceReviewReferenceBindingByteReplayIntegrated: true,
      networkCoreSourceReplayVerified: false,
      appendOnlyPredecessorExternalSourceReplayVerified: false,
      externalHeadAnchorVerified: false,
      attemptSetSourceReplayVerified: false,
      fullAttemptAncestryReplayVerified: false,
      episodeAttemptDenominatorComplete: false,
      declarationExternalSourceBytesReplayed: false,
      sourceReplayVerified: false,
    },
    missingSourceClasses,
    result:
      "ROLE_AWARE_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAYED_HOLD_INCOMPLETE",
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    custodyEstablished: false,
    fundsVerified: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
    externalAdoptionEstablished: false,
    externalContractAcceptanceEstablished: false,
    networkOrderEstablished: false,
    declarationExternalSourceBytesReplayed: false,
    boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY,
  };
}

export function createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(
  input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  const body = receiptBody(input, context);
  return deepFreeze({ ...body, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.receipt, body) });
}

function sanitizedFailureMessage(error) {
  if (!(error instanceof ErrorConstructor)) {
    return "AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_UNTRUSTED_FAILURE";
  }
  const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
  const message = descriptor && ObjectHasOwn(descriptor, "value")
    && typeof descriptor.value === "string" ? descriptor.value : null;
  return message !== null && RegExpTest(V3_TYPED_ERROR, message)
    ? message
    : "AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_UNTRUSTED_FAILURE";
}

function verificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.verification,
    ok: false,
    receiptDerivationVerified: false,
    roleAwareCertificateV2Verified: false,
    roleAwareCertificateCallerHashPinMatched: false,
    roleAwareCertificateCallerHashPinHasIndependentProvenance: false,
    dualDirectoryRevisionZeroHashCrosswalkVerified: false,
    directoryPathsProjected: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
    lifecycleExactExportByteReplayIntegrated: false,
    lifecycleSourceReviewReferenceBindingByteReplayIntegrated: false,
    delayedWitnessSourceByteReplayIntegrated: false,
    sourceReplayVerified: false,
    externalHeadAnchorVerified: false,
    sameAffectedPartySetEstablished: false,
    affectedPartyContinuityEstablished: false,
    outcomeRegisterSupersetOfPreActionDeclarationEstablished: false,
    independentOutcomeTruthEstablished: false,
    organizationalIndependenceEstablished: false,
    obligationClosureEstablished: false,
    fullAttemptAncestryReplayVerified: false,
    episodeAttemptDenominatorComplete: false,
    witnessOccurrenceLifecycleMembershipVerified: false,
    crossRegistryOccurrenceContinuityEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
    externalContractAcceptanceEstablished: false,
    networkOrderEstablished: false,
    declarationExternalSourceBytesReplayed: false,
    error: sanitizedFailureMessage(error),
    boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(
  record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["input", "context", "expectedReceiptHash"],
      "VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "receiptClass", "recordedAt",
      "protocolLineage", "orderIdentity", "delayedOutcomeSuccessor",
      "affectedPartyRoleCrosswalk", "obligationCrosswalk", "lifecycleReplay",
      "sourceReviewReplay", "truthAndAuthorityBoundary", "replayCoverage",
      "missingSourceClasses", "result", "disposition", "decisionState",
      "authority", "enabledCapabilityCount", "provenAuthorityCount",
      "enabledCapabilitiesSubsetOfProvenAuthority", "consequenceReach",
      "actionReady", "executable", "automaticTraining", "trainingRows",
      "causalExperienceUnits", "actorCredit", "moneyMovementEnabled",
      "custodyEstablished", "fundsVerified", "permitsPricing",
      "guaranteeEstablished", "permitsGuarantee", "insuranceEstablished",
      "permitsInsurance", "settlementEnabled", "permitsSettlement",
      "externalAdoptionEstablished", "externalContractAcceptanceEstablished",
      "networkOrderEstablished", "declarationExternalSourceBytesReplayed",
      "boundary", "receiptHash"], "RECEIPT");
    if (record.schema
        !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.receipt
      || record.schemaVersion !== "3.0.0"
      || record.receiptClass
        !== "ROLE_AWARE_LIFECYCLE_ACTION_OUTCOME_V2_SOURCE_REPLAY_HOLD_INCOMPLETE"
      || record.result
        !== "ROLE_AWARE_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAYED_HOLD_INCOMPLETE"
      || record.disposition !== "QUARANTINED" || record.decisionState !== "HOLD"
      || record.authority !== "NONE" || record.enabledCapabilityCount !== 0
      || record.provenAuthorityCount !== 0
      || record.enabledCapabilitiesSubsetOfProvenAuthority !== true
      || record.consequenceReach !== "NONE" || record.actionReady !== false
      || record.executable !== false || record.automaticTraining !== false
      || record.trainingRows !== 0 || record.causalExperienceUnits !== 0
      || record.actorCredit !== false || record.moneyMovementEnabled !== false
      || record.custodyEstablished !== false || record.fundsVerified !== false
      || record.permitsPricing !== false || record.guaranteeEstablished !== false
      || record.permitsGuarantee !== false || record.insuranceEstablished !== false
      || record.permitsInsurance !== false || record.settlementEnabled !== false
      || record.permitsSettlement !== false
      || record.externalAdoptionEstablished !== false
      || record.externalContractAcceptanceEstablished !== false
      || record.networkOrderEstablished !== false
      || record.declarationExternalSourceBytesReplayed !== false
      || record.affectedPartyRoleCrosswalk.sameAffectedPartySetEstablished !== false
      || record.affectedPartyRoleCrosswalk.affectedPartyContinuityEstablished !== false
      || record.affectedPartyRoleCrosswalk
        .outcomeRegisterSupersetOfPreActionDeclarationEstablished !== false
      || record.truthAndAuthorityBoundary.independentOutcomeTruthEstablished !== false
      || record.truthAndAuthorityBoundary.organizationalIndependenceEstablished
        !== false
      || record.truthAndAuthorityBoundary.obligationClosureEstablished !== false
      || record.replayCoverage.sourceReplayVerified !== false
      || record.replayCoverage.externalHeadAnchorVerified !== false
      || record.replayCoverage.fullAttemptAncestryReplayVerified !== false
      || record.replayCoverage.episodeAttemptDenominatorComplete !== false
      || record.replayCoverage
        .roleAwareCertificateCallerHashPinHasIndependentProvenance !== false
      || record.obligationCrosswalk
        .dualDirectoryRevisionZeroHashCrosswalkVerified !== true
      || record.obligationCrosswalk.snapshotAndLiveDirectoryRolesDistinct !== true
      || record.obligationCrosswalk.directoryPathsProjected !== false
      || record.obligationCrosswalk.storageDirectoryContinuityEstablished !== false
      || record.obligationCrosswalk.storageDurabilityEstablished !== false
      || record.obligationCrosswalk
        .obligationContinuationUniquenessEstablished !== false
      || record.obligationCrosswalk.dualDirectoryNonEquivocationEstablished
        !== false
      || record.obligationCrosswalk.singleCanonicalObligationLedgerEstablished
        !== false
      || record.replayCoverage
        .predecessorRevisionZeroSnapshotFreshReplayVerified !== true
      || record.replayCoverage.certificateLiveLedgerPrefixFreshReplayVerified
        !== true
      || record.replayCoverage.dualDirectoryRevisionZeroHashCrosswalkVerified
        !== true
      || record.replayCoverage.storageDirectoryContinuityEstablished !== false
      || record.replayCoverage.storageDurabilityEstablished !== false
      || record.replayCoverage.obligationContinuationUniquenessEstablished
        !== false
      || record.replayCoverage.dualDirectoryNonEquivocationEstablished !== false
      || record.replayCoverage.singleCanonicalObligationLedgerEstablished !== false
      || record.lifecycleReplay.witnessOccurrenceLifecycleMembershipVerified
        !== false
      || record.lifecycleReplay.crossRegistryOccurrenceContinuityEstablished
        !== false
      || !same(record.boundary,
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY)) {
      fail("RECEIPT_STATE_INVALID");
    }
    const rebuilt = createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(
      options.input, options.context);
    if (!same(record, rebuilt)) fail("RECEIPT_SOURCE_REPLAY_INVALID");
    if (record.receiptHash !== hash(options.expectedReceiptHash,
      "EXPECTED_RECEIPT_HASH")) fail("EXPECTED_RECEIPT_HASH_MISMATCH");
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.verification,
      ok: true,
      receiptDerivationVerified: true,
      receiptHash: rebuilt.receiptHash,
      predecessorReceiptHash: rebuilt.protocolLineage.predecessorReceiptHash,
      certificateHash: rebuilt.delayedOutcomeSuccessor.certificateHash,
      lifecycleCheckpointHash: rebuilt.lifecycleReplay.checkpointHash,
      sourceReviewExportHash: rebuilt.sourceReviewReplay.exportHash,
      preActionAffectedPartyDeclarationRootHash:
        rebuilt.affectedPartyRoleCrosswalk.preActionAffectedPartyDeclarationRootHash,
      outcomeAffectedPartyRegisterRootHash:
        rebuilt.affectedPartyRoleCrosswalk.outcomeAffectedPartyRegisterRootHash,
      roleAwareCertificateV2Verified: true,
      roleAwareCertificateCallerHashPinMatched: true,
      roleAwareCertificateCallerHashPinHasIndependentProvenance: false,
      dualDirectoryRevisionZeroHashCrosswalkVerified: true,
      directoryPathsProjected: false,
      storageDirectoryContinuityEstablished: false,
      storageDurabilityEstablished: false,
      obligationContinuationUniquenessEstablished: false,
      dualDirectoryNonEquivocationEstablished: false,
      singleCanonicalObligationLedgerEstablished: false,
      delayedWitnessSourceByteReplayIntegrated: true,
      lifecycleExactExportByteReplayIntegrated: true,
      lifecycleSourceReviewReferenceBindingByteReplayIntegrated: true,
      sourceReplayVerified: false,
      externalHeadAnchorVerified: false,
      sameAffectedPartySetEstablished: false,
      affectedPartyContinuityEstablished: false,
      outcomeRegisterSupersetOfPreActionDeclarationEstablished: false,
      independentOutcomeTruthEstablished: false,
      organizationalIndependenceEstablished: false,
      obligationClosureEstablished: false,
      fullAttemptAncestryReplayVerified: false,
      episodeAttemptDenominatorComplete: false,
      witnessOccurrenceLifecycleMembershipVerified: false,
      crossRegistryOccurrenceContinuityEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      actorCredit: false,
      permitsPricing: false,
      guaranteeEstablished: false,
      permitsGuarantee: false,
      insuranceEstablished: false,
      permitsInsurance: false,
      settlementEnabled: false,
      permitsSettlement: false,
      externalContractAcceptanceEstablished: false,
      networkOrderEstablished: false,
      declarationExternalSourceBytesReplayed: false,
      boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
