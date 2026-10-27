/*
 * Stage 1 engineering integration receipt.
 *
 * This HOLD-only descendant freshly composes the source-reference closure,
 * one observed local Attempt-set ancestry, and the role-aware lifecycle/
 * outcome replay. It proves only exact structural membership for the supplied
 * slices. Local ancestry, caller pins, and object-hash equality do not become
 * external provenance, a globally complete denominator, an order, authority,
 * outcome truth, recovery, closure, guarantee, settlement, custody, or capital.
 * Filesystem paths are verification context only and child errors are redacted.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3,
} from "./outsider-autonomous-work-order-lifecycle-outcome-replay-v3.js";
import {
  verifyAutonomousWorkOrderSourceReplayClosureReceipt,
} from "./outsider-autonomous-work-order-source-replay-closure.js";
import {
  verifyEpisodeAttemptSetComposition,
} from "./outsider-episode-attempt-set-composition.js";
import {
  verifyEpisodeAttemptSetLocalHeadV2,
} from "./outsider-episode-attempt-set-local-head-v2.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferIsBuffer = Buffer.isBuffer;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);
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

export const AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS
  = ObjectFreeze({
    receipt:
      "outsider/autonomous-work-order-stage1-engineering-integration-receipt/v1",
    verification:
      "outsider/autonomous-work-order-stage1-engineering-integration-verification/v1",
  });

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const TYPED_ERROR
  = /^AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_[A-Z0-9_:]+$/u;
const MAX_TREE_NODES = 300_000;
const MAX_TREE_KEYS = 750_000;

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_${code}`);
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

export const AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY
  = deepFreeze({
    position:
      "APPEND_ONLY_STAGE1_ENGINEERING_INTEGRATION_DESCENDANT_NOT_VENDOR_SAFETY_CONTROL",
    frozenParentProtocolsMutated: false,
    createsNewActorDelegationEpisodeAttemptOutcomeOrObligationOntology: false,
    orderIdentityAliasesExistingEpisode: true,
    sourceReferenceClosureFreshReplayRequired: true,
    oneObservedLocalAttemptSetAncestryFreshReplayRequired: true,
    roleAwareLifecycleOutcomeV3FreshReplayRequired: true,
    requiredBaseNetworkOccurrenceCount: 3,
    requiredDelayedActionOutcomeOccurrenceCount: 2,
    requiredReportOccurrenceCount: 5,
    requiredDistinctObjectIdentityCount: 4,
    occurrenceDenominatorDerivedFromObjectDedup: false,
    globalAttemptCensusCompletenessEstablished: false,
    globalReportOccurrenceCompletenessEstablished: false,
    localAttemptSetHeadIsDurableExternalHead: false,
    localAttemptSetHeadIsIndependentProvenance: false,
    externalHeadAnchorEstablished: false,
    independentPinProvenanceEstablished: false,
    directParticipantConfirmationEstablished: false,
    rightsPrivacyAdjudicationEstablished: false,
    sourceReviewNetworkReceiptProvenanceEstablished: false,
    originalInstrumentBytesReplayed: false,
    originalRightsReviewBytesReplayed: false,
    originalPrivacyReviewBytesReplayed: false,
    declarationExternalSourceBytesReplayed: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
    organizationalIndependenceEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    directoryPathsProjected: false,
    rawSourceOrReviewBytesProjected: false,
    sourceReplayVerified: false,
    networkOrderEstablished: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    recoveryExternallyVerified: false,
    obligationClosureEstablished: false,
    externalContractAcceptanceEstablished: false,
    externalAdoptionEstablished: false,
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
    platformAdvanceEnabled: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
  });

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

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function timestamp(value, code) {
  const parsed = typeof value === "string" ? DateParse(value) : NaN;
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || !NumberIsSafeInteger(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
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

function callChild(operation, code) {
  try {
    return operation();
  } catch {
    fail(code);
  }
}

function laneNamed(laneBundles, lane) {
  if (!ArrayIsArray(laneBundles)
    || ObjectGetPrototypeOf(laneBundles) !== ArrayPrototype) {
    fail("BASE_LANE_BUNDLES_INVALID");
  }
  let found = null;
  let count = 0;
  for (let index = 0; index < laneBundles.length; index += 1) {
    const candidate = laneBundles[index];
    if (candidate?.preview?.manifest?.lane === lane) {
      found = candidate;
      count += 1;
    }
  }
  if (count !== 1) fail(`BASE_${lane}_LANE_NOT_EXACTLY_ONCE`);
  return found;
}

function verifySourceClosureSlice(input, context) {
  exactObject(input.sourceClosure, ["receipt", "input", "context"],
    "SOURCE_CLOSURE");
  const expected = hash(context.expectedSourceClosureReceiptHash,
    "EXPECTED_SOURCE_CLOSURE_RECEIPT_HASH");
  const checked = callChild(
    () => verifyAutonomousWorkOrderSourceReplayClosureReceipt(
      input.sourceClosure.receipt, {
        input: input.sourceClosure.input,
        context: input.sourceClosure.context,
        expectedClosureReceiptHash: expected,
      }),
    "SOURCE_CLOSURE_CHILD_FAILURE");
  if (!checked || checked.ok !== true
    || checked.receiptDerivationVerified !== true
    || checked.referenceCrosswalksVerified !== true
    || checked.closureReceiptHash !== expected
    || checked.actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified
      !== true
    || checked.enumeratedProductTermReferenceCrosswalkVerified !== true
    || checked.independentPinProvenanceEstablished !== false
    || checked.productTermSourceCoverageComplete !== false
    || checked.networkDelegationCrosswalkComplete !== false
    || checked.sourceReplayVerified !== false
    || checked.networkOrderEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || checked.automaticTraining !== false || checked.trainingRows !== 0) {
    fail("SOURCE_CLOSURE_REPLAY_INVALID");
  }
  return { checked, receipt: input.sourceClosure.receipt, expected };
}

function verifyLifecycleSlice(input, context) {
  exactObject(input.lifecycleOutcome, ["receipt", "input", "context"],
    "LIFECYCLE_OUTCOME");
  const expected = hash(context.expectedLifecycleOutcomeReceiptHash,
    "EXPECTED_LIFECYCLE_OUTCOME_RECEIPT_HASH");
  const checked = callChild(
    () => verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(
      input.lifecycleOutcome.receipt, {
        input: input.lifecycleOutcome.input,
        context: input.lifecycleOutcome.context,
        expectedReceiptHash: expected,
      }),
    "LIFECYCLE_OUTCOME_CHILD_FAILURE");
  if (!checked || checked.ok !== true
    || checked.receiptDerivationVerified !== true
    || checked.receiptHash !== expected
    || checked.roleAwareCertificateV2Verified !== true
    || checked.dualDirectoryRevisionZeroHashCrosswalkVerified !== true
    || checked.delayedWitnessSourceByteReplayIntegrated !== true
    || checked.lifecycleExactExportByteReplayIntegrated !== true
    || checked.lifecycleSourceReviewReferenceBindingByteReplayIntegrated
      !== true
    || checked.sourceReplayVerified !== false
    || checked.externalHeadAnchorVerified !== false
    || checked.sameAffectedPartySetEstablished !== false
    || checked.affectedPartyContinuityEstablished !== false
    || checked.outcomeRegisterSupersetOfPreActionDeclarationEstablished !== false
    || checked.independentOutcomeTruthEstablished !== false
    || checked.organizationalIndependenceEstablished !== false
    || checked.obligationClosureEstablished !== false
    || checked.fullAttemptAncestryReplayVerified !== false
    || checked.episodeAttemptDenominatorComplete !== false
    || checked.witnessOccurrenceLifecycleMembershipVerified !== false
    || checked.crossRegistryOccurrenceContinuityEstablished !== false
    || checked.networkOrderEstablished !== false
    || checked.declarationExternalSourceBytesReplayed !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || checked.automaticTraining !== false || checked.trainingRows !== 0
    || checked.causalExperienceUnits !== 0) {
    fail("LIFECYCLE_OUTCOME_REPLAY_INVALID");
  }
  return { checked, receipt: input.lifecycleOutcome.receipt, expected };
}

function verifyAttemptSetSlice(input, context) {
  exactObject(input.attemptSet, ["headComposition",
    "immediatePredecessorComposition"], "ATTEMPT_SET");
  exactObject(context.localAttemptSet, ["directory", "registryId",
    "expectedLocalHeadHash"], "LOCAL_ATTEMPT_SET_CONTEXT");
  if (typeof context.localAttemptSet.directory !== "string"
    || context.localAttemptSet.directory.length < 1
    || typeof context.localAttemptSet.registryId !== "string"
    || context.localAttemptSet.registryId.length < 1) {
    fail("LOCAL_ATTEMPT_SET_CONTEXT_VALUE_INVALID");
  }
  const expectedHead = hash(context.localAttemptSet.expectedLocalHeadHash,
    "EXPECTED_LOCAL_ATTEMPT_SET_HEAD_HASH");
  const local = callChild(() => verifyEpisodeAttemptSetLocalHeadV2({
    directory: context.localAttemptSet.directory,
    registryId: context.localAttemptSet.registryId,
    expectedLocalHeadHash: expectedHead,
  }), "LOCAL_ATTEMPT_SET_CHILD_FAILURE");
  if (!local || local.ok !== true
    || local.expectedLocalHeadHashProvided !== true
    || local.expectedLocalHeadHashMatched !== true
    || local.head?.headHash !== expectedHead
    || local.fullAncestryReplayVerified !== true
    || local.twoPassEntrySnapshotStabilityVerified !== true
    || local.everyStoredV1CompositionDerivationVerified !== true
    || local.everyStoredV1ImmediatePrefixVerified !== true
    || local.localUniqueHeadStructuralHistoryEstablished !== true
    || local.externalHeadPinVerified !== false
    || local.independentExternalProvenanceEstablished !== false
    || local.parallelGenesisExclusionEstablished !== false
    || local.forkExclusionEstablished !== false
    || local.ownerRollbackOrDirectoryReplacementExcluded !== false
    || local.durableAppendOnlyHistoryEstablished !== false
    || local.decisionState !== "HOLD" || local.authority !== "NONE") {
    fail("LOCAL_ATTEMPT_SET_REPLAY_INVALID");
  }
  const predecessor = input.attemptSet.immediatePredecessorComposition;
  const head = input.attemptSet.headComposition;
  const predecessorChecked = callChild(
    () => verifyEpisodeAttemptSetComposition(predecessor, {
      predecessor: null,
      expectedCompositionHash: predecessor?.compositionHash,
      expectedPredecessorCompositionHash: null,
    }), "PREDECESSOR_COMPOSITION_CHILD_FAILURE");
  const headChecked = callChild(
    () => verifyEpisodeAttemptSetComposition(head, {
      predecessor,
      expectedCompositionHash: head?.compositionHash,
      expectedPredecessorCompositionHash: predecessor?.compositionHash,
    }), "HEAD_COMPOSITION_CHILD_FAILURE");
  if (!predecessorChecked || predecessorChecked.ok !== true
    || !headChecked || headChecked.ok !== true
    || predecessor.appendOnlyLineage.revision !== 0
    || head.appendOnlyLineage.revision !== 1
    || local.entryFileCount !== 2 || local.head.entryCount !== 2
    || local.head.headCompositionRevision !== 1
    || local.head.headCompositionHash !== head.compositionHash
    || local.head.episodeHash !== head.episodeBinding.episodeHash
    || local.head.attemptCount !== head.attemptCensus.attemptCount
    || local.head.reportOccurrenceCount
      !== head.reportOccurrenceCensus.reportOccurrenceCount
    || predecessorChecked.durableAppendOnlyHistoryEstablished !== false
    || headChecked.durableAppendOnlyHistoryEstablished !== false
    || headChecked.globalAttemptCensusCompletenessEstablished !== false
    || headChecked.globalReportOccurrenceCompletenessEstablished !== false) {
    fail("ATTEMPT_SET_COMPOSITION_REPLAY_INVALID");
  }
  return { local, predecessor, head, predecessorChecked, headChecked };
}

function exactInputShape(input, context) {
  exactObject(input, ["recordedAt", "sourceClosure", "attemptSet",
    "lifecycleOutcome", "absentExternalFacts"], "INPUT");
  exactObject(input.absentExternalFacts, ["independentPinProvenance",
    "durableExternalHead", "directParticipantConfirmation",
    "rightsPrivacyAdjudication"], "ABSENT_EXTERNAL_FACTS");
  if (input.absentExternalFacts.independentPinProvenance !== null
    || input.absentExternalFacts.durableExternalHead !== null
    || input.absentExternalFacts.directParticipantConfirmation !== null
    || input.absentExternalFacts.rightsPrivacyAdjudication !== null) {
    fail("EXTERNAL_FACT_INPUT_MUST_REMAIN_NULL");
  }
  exactObject(context, ["expectedSourceClosureReceiptHash", "localAttemptSet",
    "expectedLifecycleOutcomeReceiptHash"], "CONTEXT");
}

function requireSharedPredecessor(input, source, lifecycle) {
  const sourcePredecessor = input.sourceClosure.input.predecessor;
  const lifecyclePredecessor = input.lifecycleOutcome.input.predecessor;
  if (!same(sourcePredecessor, lifecyclePredecessor)
    || source.receipt.supersession.predecessorReceiptHash
      !== lifecycle.receipt.protocolLineage.predecessorReceiptHash
    || source.receipt.supersession.predecessorReceiptHash
      !== sourcePredecessor.receipt.sourceReplayReceiptHash
    || lifecycle.receipt.protocolLineage.predecessorReceiptHash
      !== lifecyclePredecessor.receipt.sourceReplayReceiptHash) {
    fail("PARENT_PREDECESSOR_SPLICE_OR_MISMATCH");
  }
  return sourcePredecessor;
}

function requireEpisodeBinding(predecessor, sourceReceipt, lifecycleReceipt,
  attemptSet) {
  const graph = predecessor.input.workOrder.typedGraph;
  const binding = attemptSet.head.episodeBinding;
  const expected = {
    principalEpochProjectionHash:
      graph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      graph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: graph.runtime.runtimeInstanceHash,
    embodimentRevisionHash: graph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: graph.delegation.delegationEdgeHash,
    episodeHash: graph.episode.episodeHash,
    workOrderProjectionHash: predecessor.input.workOrder.workOrderHash,
    networkCompleteEpisodeJoinHash:
      graph.episode.networkCompleteEpisodeJoinHash,
    prospectiveCensusProjectionHash:
      predecessor.receipt.sourcePins.prospectiveCensusProjectionHash,
    realityObligationGenesisHash:
      predecessor.receipt.sourcePins.obligationGenesisHash,
    realityObligationStateHash:
      predecessor.receipt.sourcePins.obligationStateHash,
    callerSuppliedGenesisObligationAttemptHash: graph.attempt.attemptHash,
  };
  const fields = ReflectOwnKeys(expected);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (binding[field] !== expected[field]) {
      fail("ATTEMPT_SET_EPISODE_BINDING_SPLICE");
    }
  }
  if (!same(attemptSet.predecessor.episodeBinding, binding)
    || sourceReceipt.orderIdentity.workOrderHash !== expected.workOrderProjectionHash
    || sourceReceipt.orderIdentity.orderIdentityHash !== expected.episodeHash
    || sourceReceipt.orderIdentity.episodeHash !== expected.episodeHash
    || lifecycleReceipt.orderIdentity.workOrderHash !== expected.workOrderProjectionHash
    || lifecycleReceipt.orderIdentity.orderIdentityHash !== expected.episodeHash
    || lifecycleReceipt.orderIdentity.episodeHash !== expected.episodeHash
    || lifecycleReceipt.orderIdentity.orderId
      !== predecessor.receipt.orderIdentity.orderId
    || lifecycleReceipt.orderIdentity.attemptHash
      !== expected.callerSuppliedGenesisObligationAttemptHash
    || lifecycleReceipt.delayedOutcomeSuccessor.baseCompleteEpisodeJoinHash
      !== expected.networkCompleteEpisodeJoinHash
    || lifecycleReceipt.obligationCrosswalk.obligationGenesisHash
      !== expected.realityObligationGenesisHash
    || lifecycleReceipt.obligationCrosswalk.baseObligationStateHash
      !== expected.realityObligationStateHash) {
    fail("CROSS_SLICE_IDENTITY_OR_OBLIGATION_SPLICE");
  }
  let representedAttemptCount = 0;
  for (let index = 0; index < attemptSet.head.attempts.length; index += 1) {
    const attempt = attemptSet.head.attempts[index];
    if (attempt.attemptHash === expected.callerSuppliedGenesisObligationAttemptHash) {
      representedAttemptCount += 1;
      if (attempt.attemptOrdinal !== 1 || attempt.episodeHash !== expected.episodeHash
        || attempt.attemptActorSubjectHash
          !== graph.attempt.attemptActorSubjectHash
        || attempt.kind !== "PRIMARY" || attempt.retryOfAttemptHash !== null
        || attempt.recoveryOfAttemptHash !== null) {
        fail("REPRESENTED_ATTEMPT_ROW_CROSSWALK_INVALID");
      }
    }
  }
  if (representedAttemptCount !== 1) {
    fail("REPRESENTED_ATTEMPT_NOT_EXACTLY_ONCE");
  }
  return { graph, binding, expected, representedAttemptCount };
}

function rowMatches(row, expected, networkReceiptRequired = true) {
  if (row.occurrenceIdentityHash !== expected.occurrenceIdentityHash
    || row.networkObjectIdentityHash !== expected.networkObjectIdentityHash
    || row.episodeHash !== expected.episodeHash
    || row.attemptHash !== expected.attemptHash
    || row.reportedAt !== expected.reportedAt
    || row.executionDisposition !== expected.executionDisposition
    || row.outcomeObservationStatus !== expected.outcomeObservationStatus
    || row.reportedOutcomeEvidenceHash !== expected.reportedOutcomeEvidenceHash
    || !same(row.consequenceEvidenceHashes, expected.consequenceEvidenceHashes)) {
    return false;
  }
  return !networkReceiptRequired
    || row.networkReceiptHash === expected.networkReceiptHash;
}

function occurrenceRequirement({ lane, kind, bundle, episodeHash, attemptHash,
  consequenceEvidenceHashes = [], outcomeObservationStatus = "UNKNOWN",
  reportedOutcomeEvidenceHash = null, reportedAt = bundle.receipt.receivedAt,
  networkReceiptRequired = true }) {
  return {
    lane,
    kind,
    expected: {
      occurrenceIdentityHash: bundle.preview.manifest.occurrenceIdentityHash,
      networkObjectIdentityHash: bundle.receipt.objectIdentityHash,
      networkReceiptHash: bundle.receipt.receiptHash,
      episodeHash,
      attemptHash,
      reportedAt,
      executionDisposition: "UNKNOWN",
      outcomeObservationStatus,
      reportedOutcomeEvidenceHash,
      consequenceEvidenceHashes,
    },
    networkReceiptRequired,
  };
}

function requireOccurrenceMembership(predecessor, lifecycleInput,
  lifecycleReceipt, attemptSet, identity) {
  const laneBundles = predecessor.input.completeEpisode.input.laneBundles;
  const census = laneNamed(laneBundles, "PROSPECTIVE_CENSUS");
  const delegation = laneNamed(laneBundles, "DELEGATION_RESPONSIBILITY");
  const actionV1 = laneNamed(laneBundles, "ACTION_OUTCOME");
  if (laneBundles.length !== 3) fail("BASE_LANE_COUNT_NOT_THREE");
  const delayedBundle = lifecycleInput.delayedWitness.input.outcomeWitness
    .nodeSubmissionBundle;
  const delayedPayload = delayedBundle.preview.payload;
  const reviewEvent = lifecycleInput.sourceReview.export.networkSnapshot.event;
  const episodeHash = identity.expected.episodeHash;
  const attemptHash = identity.expected.callerSuppliedGenesisObligationAttemptHash;
  const requirements = [
    occurrenceRequirement({ lane: "PROSPECTIVE_CENSUS", kind: "BASE_V1",
      bundle: census, episodeHash, attemptHash }),
    occurrenceRequirement({ lane: "DELEGATION_RESPONSIBILITY", kind: "BASE_V1",
      bundle: delegation, episodeHash, attemptHash }),
    occurrenceRequirement({ lane: "ACTION_OUTCOME", kind: "BASE_V1",
      bundle: actionV1, episodeHash, attemptHash,
      consequenceEvidenceHashes: [actionV1.preview.payload.outcomeEvidenceHash] }),
    occurrenceRequirement({ lane: "ACTION_OUTCOME", kind: "DELAYED_WITNESS_V2",
      bundle: delayedBundle, episodeHash, attemptHash,
      outcomeObservationStatus: delayedPayload.observationStatus,
      reportedOutcomeEvidenceHash: delayedPayload.consequenceReportHash,
      consequenceEvidenceHashes: [delayedPayload.consequenceReportHash] }),
    {
      lane: "ACTION_OUTCOME",
      kind: "SOURCE_REVIEW_REPORTING_OCCURRENCE_V2",
      networkReceiptRequired: false,
      expected: {
        occurrenceIdentityHash: reviewEvent.occurrenceIdentityHash,
        networkObjectIdentityHash: reviewEvent.objectIdentityHash,
        networkReceiptHash: null,
        episodeHash,
        attemptHash,
        reportedAt: reviewEvent.occurredAt,
        executionDisposition: "UNKNOWN",
        outcomeObservationStatus: delayedPayload.observationStatus,
        reportedOutcomeEvidenceHash: delayedPayload.consequenceReportHash,
        consequenceEvidenceHashes: [delayedPayload.consequenceReportHash],
      },
    },
  ];
  const headRows = attemptSet.head.reportOccurrences;
  const predecessorRows = attemptSet.predecessor.reportOccurrences;
  const requiredOccurrences = [];
  const requiredObjects = [];
  for (let requirementIndex = 0;
    requirementIndex < requirements.length; requirementIndex += 1) {
    const requirement = requirements[requirementIndex];
    let count = 0;
    let predecessorCount = 0;
    for (let index = 0; index < headRows.length; index += 1) {
      if (rowMatches(headRows[index], requirement.expected,
        requirement.networkReceiptRequired)) count += 1;
    }
    for (let index = 0; index < predecessorRows.length; index += 1) {
      if (rowMatches(predecessorRows[index], requirement.expected,
        requirement.networkReceiptRequired)) predecessorCount += 1;
    }
    if (count !== 1) fail("REQUIRED_REPORT_OCCURRENCE_NOT_EXACTLY_ONCE");
    const mustBeInPredecessor = requirementIndex < 3;
    if (mustBeInPredecessor && predecessorCount !== 1
      || !mustBeInPredecessor && predecessorCount !== 0) {
      fail("REQUIRED_REPORT_OCCURRENCE_REVISION_MEMBERSHIP_INVALID");
    }
    append(requiredOccurrences, requirement.expected.occurrenceIdentityHash);
    let objectSeen = false;
    for (let index = 0; index < requiredObjects.length; index += 1) {
      if (requiredObjects[index] === requirement.expected.networkObjectIdentityHash) {
        objectSeen = true;
      }
    }
    if (!objectSeen) {
      append(requiredObjects, requirement.expected.networkObjectIdentityHash);
    }
  }
  if (requirements[3].expected.occurrenceIdentityHash
      === requirements[4].expected.occurrenceIdentityHash
    || requirements[3].expected.networkObjectIdentityHash
      !== requirements[4].expected.networkObjectIdentityHash
    || lifecycleReceipt.lifecycleReplay
      .crosswalkedActionOutcomeV2ReportOccurrenceCount !== 2
    || lifecycleReceipt.lifecycleReplay.crosswalkedDistinctObjectIdentityCount !== 1
    || lifecycleReceipt.sourceReviewReplay
      .sourceReviewOccurrenceIsDistinctFromWitnessOccurrence !== true
    || lifecycleReceipt.sourceReviewReplay
      .sourceReviewOccurrenceCarriesSameContentAddressedPayload !== true
    || requiredOccurrences.length !== 5 || requiredObjects.length !== 4) {
    fail("REQUIRED_REPORT_OCCURRENCE_OBJECT_CROSSWALK_INVALID");
  }
  return { requirements, requiredOccurrences, requiredObjects };
}

function receiptBody(input, context) {
  exactInputShape(input, context);
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  const source = verifySourceClosureSlice(input, context);
  const attemptSet = verifyAttemptSetSlice(input, context);
  const lifecycle = verifyLifecycleSlice(input, context);
  const predecessor = requireSharedPredecessor(input, source, lifecycle);
  const identity = requireEpisodeBinding(predecessor, source.receipt,
    lifecycle.receipt, attemptSet);
  const occurrences = requireOccurrenceMembership(predecessor,
    input.lifecycleOutcome.input, lifecycle.receipt, attemptSet, identity);
  if (recordedAt < attemptSet.head.recordedAt
    || recordedAt < lifecycle.receipt.recordedAt) {
    fail("RECORDED_AT_PRECEDES_PARENT_STATE");
  }
  const blockers = [
    "DIRECT_PARTICIPANT_CONFIRMATION_NOT_ESTABLISHED",
    "DURABLE_EXTERNAL_ATTEMPT_HEAD_NOT_ESTABLISHED",
    "EXTERNAL_HEAD_ANCHOR_NOT_ESTABLISHED",
    "GLOBAL_ATTEMPT_AND_REPORT_DENOMINATOR_NOT_ESTABLISHED",
    "INDEPENDENT_PIN_PROVENANCE_NOT_ESTABLISHED",
    "ORIGINAL_RIGHTS_PRIVACY_SOURCE_BYTES_NOT_ADJUDICATED",
  ];
  return {
    schema: AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    receiptClass:
      "APPEND_ONLY_STAGE1_ENGINEERING_INTEGRATION_HOLD_INCOMPLETE",
    recordedAt,
    protocolLineage: {
      sourceReplayPredecessorReceiptHash:
        source.receipt.supersession.predecessorReceiptHash,
      sourceClosureReceiptHash: source.expected,
      localAttemptSetHeadHash: attemptSet.local.head.headHash,
      localAttemptSetHeadCompositionHash: attemptSet.head.compositionHash,
      localAttemptSetImmediatePredecessorCompositionHash:
        attemptSet.predecessor.compositionHash,
      lifecycleOutcomeReceiptHash: lifecycle.expected,
      roleAwareCertificateHash:
        lifecycle.receipt.delayedOutcomeSuccessor.certificateHash,
      parentsFreshlyRederived: true,
      parentsGloballySuperseded: false,
      frozenParentArtifactsMutated: false,
    },
    orderIdentity: {
      workOrderHash: identity.expected.workOrderProjectionHash,
      orderIdentityHash: identity.expected.episodeHash,
      episodeHash: identity.expected.episodeHash,
      attemptHash: identity.expected.callerSuppliedGenesisObligationAttemptHash,
      orderIdentityAliasesExistingEpisode: true,
      newIdentityCreated: false,
    },
    referenceCrosswalkReplay: {
      closureReceiptHash: source.expected,
      closureReceiptRederived: true,
      actorDelegationEdgeToLanePayloadExactReferenceCrosswalkVerified: true,
      enumeratedProductTermReferenceCrosswalkVerified: true,
      independentPinProvenanceEstablished: false,
      delegationEnvelopeExternalSourceBytesReplayed: false,
      productTermExternalSourceBytesReplayed: false,
      sourceReplayVerified: false,
    },
    localAttemptSetReplay: {
      localHeadHash: attemptSet.local.head.headHash,
      headCompositionHash: attemptSet.head.compositionHash,
      immediatePredecessorCompositionHash: attemptSet.predecessor.compositionHash,
      entryCount: attemptSet.local.entryFileCount,
      attemptCount: attemptSet.head.attemptCensus.attemptCount,
      reportOccurrenceCount:
        attemptSet.head.reportOccurrenceCensus.reportOccurrenceCount,
      distinctSuppliedObjectIdentityHashCount:
        attemptSet.head.objectDedupView
          .distinctSuppliedNetworkObjectIdentityHashCount,
      oneObservedLocalRegistryFullAncestryReplayVerified: true,
      twoPassEntrySnapshotStabilityVerified: true,
      localUniqueHeadStructuralHistoryEstablished: true,
      expectedLocalHeadCallerPinMatched: true,
      callerPinAcceptedAsExternalProvenance: false,
      durableExternalHeadEstablished: false,
      parallelGenesisExclusionEstablished: false,
      forkExclusionEstablished: false,
      ownerRollbackOrDirectoryReplacementExcluded: false,
      globalAttemptCensusCompletenessEstablished: false,
      globalReportOccurrenceCompletenessEstablished: false,
      directoryPathProjected: false,
    },
    lifecycleOutcomeReplay: {
      receiptHash: lifecycle.expected,
      certificateHash: lifecycle.receipt.delayedOutcomeSuccessor.certificateHash,
      lifecycleCheckpointHash: lifecycle.receipt.lifecycleReplay.checkpointHash,
      sourceReviewExportHash: lifecycle.receipt.sourceReviewReplay.exportHash,
      roleAwareCertificateV2Verified: true,
      dualDirectoryRevisionZeroHashCrosswalkVerified: true,
      delayedWitnessSourceByteReplayIntegrated: true,
      lifecycleExactExportByteReplayIntegrated: true,
      lifecycleSourceReviewReferenceBindingByteReplayIntegrated: true,
      witnessOccurrenceLifecycleMembershipVerified: false,
      crossRegistryOccurrenceContinuityEstablished: false,
      originalInstrumentBytesReplayed: false,
      originalRightsReviewBytesReplayed: false,
      originalPrivacyReviewBytesReplayed: false,
      externalHeadAnchorEstablished: false,
      independentOutcomeTruthEstablished: false,
      obligationClosureEstablished: false,
      sourceReplayVerified: false,
    },
    crossSliceBindings: {
      sameSourceReplayV1PredecessorVerified: true,
      sameWorkOrderHashVerified: true,
      sameOrderIdentityAndEpisodeHashVerified: true,
      sameRepresentedAttemptHashVerified: true,
      sameCompleteEpisodeJoinHashVerified: true,
      sameProspectiveCensusProjectionHashVerified: true,
      sameObligationGenesisAndRevisionZeroStateVerified: true,
      representedAttemptMembershipCount: identity.representedAttemptCount,
      roleAwareAffectedPartyRootsRemainDistinct: true,
      sameAffectedPartySetEstablished: false,
      affectedPartyContinuityEstablished: false,
      outcomeRegisterSupersetEstablished: false,
    },
    requiredReportOccurrenceCrosswalk: {
      requiredReportOccurrenceCount: occurrences.requiredOccurrences.length,
      requiredOccurrenceIdentityHashes: occurrences.requiredOccurrences,
      requiredDistinctObjectIdentityCount: occurrences.requiredObjects.length,
      requiredObjectIdentityHashes: occurrences.requiredObjects,
      baseNetworkCoreOccurrenceCount: 3,
      baseNetworkCoreDistinctObjectIdentityCount: 3,
      lifecycleActionOutcomeV2OccurrenceCount: 2,
      lifecycleActionOutcomeV2DistinctObjectIdentityCount: 1,
      sourceReviewNetworkReceiptCrosswalkVerified: false,
      occurrenceCountDerivedFromObjectCount: false,
      objectDedupReducedReportOccurrenceDenominator: false,
      allRequiredOccurrencesPresentExactlyOnce: true,
      requiredOccurrenceListIsCrosswalkOrderNotGlobalOccurrenceOrder: true,
      requiredMembershipDoesNotExcludeAdditionalSuppliedOccurrences: true,
      globalReportOccurrenceCompletenessEstablished: false,
    },
    replayCoverage: {
      sourceClosureReceiptFreshlyRederived: true,
      localAttemptSetFullAncestryFreshlyReplayedInOneObservedDirectory: true,
      currentAndImmediatePredecessorCompositionsFreshlyRederived: true,
      lifecycleOutcomeV3ReceiptFreshlyRederived: true,
      requiredOccurrenceMembershipCrosswalkVerified: true,
      externalPinProvenanceEstablished: false,
      durableExternalHeadEstablished: false,
      fullGlobalAttemptAncestryEstablished: false,
      globalAttemptAndReportDenominatorComplete: false,
      directParticipantConfirmationEstablished: false,
      rightsPrivacyAdjudicationEstablished: false,
      sourceReplayVerified: false,
    },
    stage1Blockers: blockers,
    deferredTruth: {
      externalAdoptionEstablished: false,
      externalContractAcceptanceEstablished: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      recoveryExternallyVerified: false,
      obligationClosureEstablished: false,
      authorityEstablished: false,
      guaranteeEstablished: false,
      insuranceEstablished: false,
      settlementEstablished: false,
      custodyEstablished: false,
      capitalAvailabilityEstablished: false,
    },
    result: "STAGE1_ENGINEERING_SLICES_STRUCTURALLY_INTEGRATED_HOLD_INCOMPLETE",
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
    platformAdvanceEnabled: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
    externalAdoptionEstablished: false,
    externalContractAcceptanceEstablished: false,
    declarationExternalSourceBytesReplayed: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
    organizationalIndependenceEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    networkOrderEstablished: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    boundary: AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY,
  };
}

export function createAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
  input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  const body = receiptBody(input, context);
  return deepFreeze({ ...body, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.receipt,
    body) });
}

function sanitizedFailureMessage(error) {
  if (!(error instanceof ErrorConstructor)) {
    return "AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_UNTRUSTED_FAILURE";
  }
  const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
  const message = descriptor && ObjectHasOwn(descriptor, "value")
    && typeof descriptor.value === "string" ? descriptor.value : null;
  return message !== null && RegExpTest(TYPED_ERROR, message)
    ? message
    : "AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_UNTRUSTED_FAILURE";
}

function verificationFailure(error) {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.verification,
    ok: false,
    receiptDerivationVerified: false,
    sourceClosureReceiptVerified: false,
    localAttemptSetAncestryVerified: false,
    lifecycleOutcomeReceiptVerified: false,
    requiredOccurrenceMembershipVerified: false,
    independentPinProvenanceEstablished: false,
    durableExternalHeadEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
    directParticipantConfirmationEstablished: false,
    rightsPrivacyAdjudicationEstablished: false,
    sourceReplayVerified: false,
    directoryPathsProjected: false,
    rawSourceOrReviewBytesProjected: false,
    networkOrderEstablished: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
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
    platformAdvanceEnabled: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementEnabled: false,
    permitsSettlement: false,
    externalContractAcceptanceEstablished: false,
    externalAdoptionEstablished: false,
    declarationExternalSourceBytesReplayed: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    storageDirectoryContinuityEstablished: false,
    storageDurabilityEstablished: false,
    obligationContinuationUniquenessEstablished: false,
    dualDirectoryNonEquivocationEstablished: false,
    singleCanonicalObligationLedgerEstablished: false,
    organizationalIndependenceEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    error: sanitizedFailureMessage(error),
    boundary: AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY,
  });
}

const RECEIPT_FIELDS = ["schema", "schemaVersion", "receiptClass",
  "recordedAt", "protocolLineage", "orderIdentity", "referenceCrosswalkReplay",
  "localAttemptSetReplay", "lifecycleOutcomeReplay", "crossSliceBindings",
  "requiredReportOccurrenceCrosswalk", "replayCoverage", "stage1Blockers",
  "deferredTruth", "result", "disposition", "decisionState", "authority",
  "enabledCapabilityCount", "provenAuthorityCount",
  "enabledCapabilitiesSubsetOfProvenAuthority", "consequenceReach",
  "actionReady", "executable", "automaticTraining", "trainingRows",
  "causalExperienceUnits", "actorCredit", "moneyMovementEnabled",
  "custodyEstablished", "fundsVerified", "platformAdvanceEnabled",
  "permitsPricing", "guaranteeEstablished", "permitsGuarantee",
  "insuranceEstablished", "permitsInsurance", "settlementEnabled",
  "permitsSettlement", "externalAdoptionEstablished",
  "externalContractAcceptanceEstablished",
  "declarationExternalSourceBytesReplayed",
  "nativeSafetyUnconditionalVetoPreserved",
  "outsiderCanOverrideNativeSafetyVeto",
  "storageDirectoryContinuityEstablished", "storageDurabilityEstablished",
  "obligationContinuationUniquenessEstablished",
  "dualDirectoryNonEquivocationEstablished",
  "singleCanonicalObligationLedgerEstablished",
  "organizationalIndependenceEstablished", "rightsClearanceEstablished",
  "privacyClearanceEstablished", "networkOrderEstablished",
  "stage1EngineeringGatePassed", "stage1ExternalFactGatePassed",
  "stage1Complete", "stage2Eligible", "stage2Permitted", "boundary",
  "receiptHash"];

function requireFixedReceiptBoundary(record) {
  if (record.schema
      !== AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.receipt
    || record.schemaVersion !== "1.0.0"
    || record.receiptClass
      !== "APPEND_ONLY_STAGE1_ENGINEERING_INTEGRATION_HOLD_INCOMPLETE"
    || record.result
      !== "STAGE1_ENGINEERING_SLICES_STRUCTURALLY_INTEGRATED_HOLD_INCOMPLETE"
    || record.disposition !== "QUARANTINED"
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.enabledCapabilityCount !== 0
    || record.provenAuthorityCount !== 0
    || record.enabledCapabilitiesSubsetOfProvenAuthority !== true
    || record.consequenceReach !== "NONE"
    || record.actionReady !== false || record.executable !== false
    || record.automaticTraining !== false || record.trainingRows !== 0
    || record.causalExperienceUnits !== 0 || record.actorCredit !== false
    || record.moneyMovementEnabled !== false
    || record.custodyEstablished !== false || record.fundsVerified !== false
    || record.platformAdvanceEnabled !== false
    || record.permitsPricing !== false || record.guaranteeEstablished !== false
    || record.permitsGuarantee !== false || record.insuranceEstablished !== false
    || record.permitsInsurance !== false || record.settlementEnabled !== false
    || record.permitsSettlement !== false
    || record.externalAdoptionEstablished !== false
    || record.externalContractAcceptanceEstablished !== false
    || record.declarationExternalSourceBytesReplayed !== false
    || record.nativeSafetyUnconditionalVetoPreserved !== true
    || record.outsiderCanOverrideNativeSafetyVeto !== false
    || record.storageDirectoryContinuityEstablished !== false
    || record.storageDurabilityEstablished !== false
    || record.obligationContinuationUniquenessEstablished !== false
    || record.dualDirectoryNonEquivocationEstablished !== false
    || record.singleCanonicalObligationLedgerEstablished !== false
    || record.organizationalIndependenceEstablished !== false
    || record.rightsClearanceEstablished !== false
    || record.privacyClearanceEstablished !== false
    || record.networkOrderEstablished !== false
    || record.stage1EngineeringGatePassed !== false
    || record.stage1ExternalFactGatePassed !== false
    || record.stage1Complete !== false || record.stage2Eligible !== false
    || record.stage2Permitted !== false
    || record.replayCoverage.sourceReplayVerified !== false
    || record.replayCoverage.externalPinProvenanceEstablished !== false
    || record.replayCoverage.durableExternalHeadEstablished !== false
    || record.requiredReportOccurrenceCrosswalk
      .allRequiredOccurrencesPresentExactlyOnce !== true
    || record.requiredReportOccurrenceCrosswalk.requiredReportOccurrenceCount !== 5
    || record.requiredReportOccurrenceCrosswalk.requiredDistinctObjectIdentityCount
      !== 4
    || record.requiredReportOccurrenceCrosswalk
      .sourceReviewNetworkReceiptCrosswalkVerified !== false
    || !same(record.boundary,
      AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY)) {
    fail("RECEIPT_FIXED_BOUNDARY_INVALID");
  }
}

export function verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
  record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["input", "context", "expectedReceiptHash"],
      "VERIFY_OPTIONS");
    exactObject(record, RECEIPT_FIELDS, "RECEIPT");
    hash(record.receiptHash, "RECEIPT_HASH");
    requireFixedReceiptBoundary(record);
    const rebuilt = createAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
      options.input, options.context);
    if (!same(record, rebuilt)) fail("RECEIPT_DERIVATION_OR_SELF_HASH_INVALID");
    const expected = hash(options.expectedReceiptHash, "EXPECTED_RECEIPT_HASH");
    if (rebuilt.receiptHash !== expected) fail("EXPECTED_RECEIPT_HASH_MISMATCH");
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.verification,
      ok: true,
      receiptDerivationVerified: true,
      receiptHash: rebuilt.receiptHash,
      workOrderHash: rebuilt.orderIdentity.workOrderHash,
      orderIdentityHash: rebuilt.orderIdentity.orderIdentityHash,
      episodeHash: rebuilt.orderIdentity.episodeHash,
      attemptHash: rebuilt.orderIdentity.attemptHash,
      sourceClosureReceiptVerified: true,
      localAttemptSetAncestryVerified: true,
      lifecycleOutcomeReceiptVerified: true,
      requiredOccurrenceMembershipVerified: true,
      requiredReportOccurrenceCount: 5,
      requiredDistinctObjectIdentityCount: 4,
      independentPinProvenanceEstablished: false,
      durableExternalHeadEstablished: false,
      globalAttemptAndReportDenominatorComplete: false,
      directParticipantConfirmationEstablished: false,
      rightsPrivacyAdjudicationEstablished: false,
      sourceReplayVerified: false,
      directoryPathsProjected: false,
      rawSourceOrReviewBytesProjected: false,
      networkOrderEstablished: false,
      stage1EngineeringGatePassed: false,
      stage1ExternalFactGatePassed: false,
      stage1Complete: false,
      stage2Eligible: false,
      stage2Permitted: false,
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
      platformAdvanceEnabled: false,
      permitsPricing: false,
      guaranteeEstablished: false,
      permitsGuarantee: false,
      insuranceEstablished: false,
      permitsInsurance: false,
      settlementEnabled: false,
      permitsSettlement: false,
      externalContractAcceptanceEstablished: false,
      externalAdoptionEstablished: false,
      declarationExternalSourceBytesReplayed: false,
      nativeSafetyUnconditionalVetoPreserved: true,
      outsiderCanOverrideNativeSafetyVeto: false,
      storageDirectoryContinuityEstablished: false,
      storageDurabilityEstablished: false,
      obligationContinuationUniquenessEstablished: false,
      dualDirectoryNonEquivocationEstablished: false,
      singleCanonicalObligationLedgerEstablished: false,
      organizationalIndependenceEstablished: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      boundary: AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
