/*
 * Stage 1c append-only companion for lifecycle and delayed-outcome replay.
 *
 * This module does not mutate the frozen autonomous-work-order projection or
 * its Stage 1b receipt. It rederives that receipt, rederives the existing
 * ACTION_OUTCOME/v2 governed-reality certificate, replays an exact unfiltered
 * quarantine lifecycle export, and replays the canonical witness manifest
 * plus three reference-binding records through a distinct reporting
 * occurrence carrying the same content-addressed v2 payload and subject.
 *
 * This descendant is an audited draft, not an integrated receipt path. The
 * Stage 1b semantic register/obligation binds the pre-action-registration hash,
 * while the existing governed-reality certificate requires its affected-party
 * register to bind the census-ledger projection hash and also requires that
 * register root to equal the immutable obligation-genesis root. Those roles
 * are intentionally not collapsed, so no success receipt is minted until a
 * versioned role-aware certificate/obligation protocol exists. A local
 * checkpoint, its digest-only outbox request, a caller pin,
 * or a provider/Rekor-looking digest is never an external head or independent
 * witness. Different keys are not organizational independence, and a delayed
 * observation is not outcome truth, causality, recovery, or closure.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAutonomousWorkOrderSourceReplayReceipt,
} from "./outsider-autonomous-work-order-source-replay.js";
import {
  verifyOutsiderFirstGovernedRealityEpisodeCertificate,
} from "./outsider-network-first-governed-reality-episode.js";
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

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS
  = ObjectFreeze({
    receipt:
      "outsider/autonomous-work-order-lifecycle-outcome-replay-receipt/v2",
    verification:
      "outsider/autonomous-work-order-lifecycle-outcome-replay-verification/v2",
    pageByteAudit:
      "outsider/autonomous-work-order-lifecycle-page-byte-audit/v1",
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY
  = deepFreeze({
    position:
      "STAGE1_APPEND_ONLY_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAY_NOT_VENDOR_SAFETY_CONTROL",
    integrationStatus: "AUDITED_DRAFT_NOT_INTEGRATED",
    successReceiptMintingEnabled: false,
    censusHashRolesCollapsed: false,
    affectedPartyRootContinuityAcrossCensusRolesEstablished: false,
    sameAffectedPartySetEstablished: false,
    roleAwareAffectedPartyCertificateProtocolEstablished: false,
    roleAwareObligationGenesisProtocolEstablished: false,
    pageByteAuditMaximumPageBytes: 1_048_576,
    pageByteAuditMaximumTotalBytes: 4_194_304,
    frozenStage1aProjectionMutated: false,
    frozenStage1bReceiptMutated: false,
    appendOnlyVersionedCompanionOnly: true,
    exactUnfilteredLifecycleExportBytesRequired: true,
    currentReservationEventMembershipRequired: true,
    occurrenceCensusSeparateFromObjectDedup: true,
    sourceManifestAndReferenceBindingRecordBytesRequired: true,
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
    declarationExternalSourceBytesReplayed: false,
    durableAttemptSetHeadEstablished: false,
    fullAttemptAncestryReplayVerified: false,
    episodeAttemptDenominatorComplete: false,
    directParticipantConfirmationEstablished: false,
    externalAdoptionEstablished: false,
    networkOrderEstablished: false,
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
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
  });

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_PAGES = 100_000;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_TOTAL_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_TREE_NODES = 200_000;
const MAX_TREE_KEYS = 500_000;

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_${code}`);
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
    || value instanceof Uint8Array && ObjectGetPrototypeOf(value) === Uint8ArrayPrototype) {
    return;
  }
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
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
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
    || !Number.isSafeInteger(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function clone(value) {
  rejectTree(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
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
      || byteLength > MAX_PAGE_BYTES) {
      fail("LIFECYCLE_EXPORT_PAGE_BYTE_LIMIT_EXCEEDED");
    }
    if (byteLength > MAX_TOTAL_PAGE_BYTES - totalBytes) {
      fail("LIFECYCLE_EXPORT_TOTAL_BYTE_LIMIT_EXCEEDED");
    }
    totalBytes += byteLength;
    append(result, BufferFrom(page));
  }
  return result;
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
    fail(`PREDECESSOR_REPLAY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  return checked;
}

function verifyDelayedWitness(input, context) {
  const certificateContext = input.delayedWitness.context;
  exactObject(certificateContext, ["baseLaneTrust", "expectedBaseJoinHash",
    "outcomeWitnessNetworkTrust", "outcomeWitnessTrustPolicy",
    "outcomeWitnessAdapterRegistry", "outcomeWitnessAdapterId"],
  "DELAYED_WITNESS_CONTEXT");
  const checked = verifyOutsiderFirstGovernedRealityEpisodeCertificate(
    input.delayedWitness.certificate, {
      input: input.delayedWitness.input,
      expectedCertificateHash: hash(context.expectedCertificateHash,
        "EXPECTED_CERTIFICATE_HASH"),
      baseLaneTrust: certificateContext.baseLaneTrust,
      expectedBaseJoinHash: certificateContext.expectedBaseJoinHash,
      outcomeWitnessNetworkTrust: certificateContext.outcomeWitnessNetworkTrust,
      outcomeWitnessTrustPolicy: certificateContext.outcomeWitnessTrustPolicy,
      outcomeWitnessAdapterRegistry: certificateContext.outcomeWitnessAdapterRegistry,
      outcomeWitnessAdapterId: certificateContext.outcomeWitnessAdapterId,
    });
  if (!checked.ok || checked.sourceReplayComplete !== true
    || checked.observedMatureHorizonPathComplete !== false
    || checked.firstGovernedRealityEpisodeWitnessPathReplayed !== false
    || checked.completeEpisodeTruthEstablished !== false
    || checked.independentOutcomeTruthEstablished !== false
    || checked.causalAttributionEstablished !== false
    || checked.recoveryExternallyVerified !== false
    || checked.obligationClosureEstablished !== false
    || checked.authority !== "NONE" || checked.actionReady !== false
    || checked.trainingRows !== 0 || checked.causalExperienceUnits !== 0) {
    fail(`DELAYED_WITNESS_REPLAY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  const certificate = input.delayedWitness.certificate;
  if (certificate.sourceReplay.exactWitnessSourceBytesReplayed !== true
    || certificate.sourceReplay.witnessAdapterProjectionSpecificationAndSchemaReplayed
      !== true
    || certificate.sourceReplay.witnessAdapterImplementationOrCodeClosureReplayed
      !== false
    || certificate.roleSeparation.differentKeysAcceptedAsOrganizationalIndependence
      !== false
    || certificate.roleSeparation.independencePolicyVerifiedWithinScope !== true
    || certificate.roleSeparation.organizationalIndependenceEstablished !== false
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
  const baseEpisode = input.delayedWitness.input.baseEpisode;
  if (!same(input.predecessor.input.completeEpisode, baseEpisode)
    || predecessor.sourcePins.completeEpisodeJoinHash
      !== certificate.baseEpisode.completeEpisodeJoinHash
    || predecessor.sourcePins.completeEpisodeJoinHash !== baseEpisode.join.joinHash
    || predecessor.orderIdentity.orderIdentityHash !== certificate.subject.episodeHash
    || predecessor.orderIdentity.episodeHash !== certificate.subject.episodeHash
    || predecessor.networkOccurrenceSummary.representedAttemptHash
      !== certificate.subject.attemptHash
    || predecessor.sourcePins.affectedPartyRootHash
      !== certificate.affectedPartyCrosswalk.affectedPartyRegisterRootHash
    || predecessor.sourcePins.obligationGenesisHash
      !== certificate.horizonAndObligationCrosswalk.obligationGenesisHash
    || predecessor.sourcePins.obligationStateHash
      !== certificate.horizonAndObligationCrosswalk.baseObligationStateHash
    || predecessor.sourcePins.outcomeWitnessEnvelopeHash !== null) {
    fail("PREDECESSOR_DELAYED_WITNESS_CROSSWALK_INVALID");
  }
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
    fail(`SOURCE_REVIEW_BOUNDARY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  return rebuilt;
}

function parseLifecyclePages(exportPageBytes) {
  const pages = [];
  for (let index = 0; index < exportPageBytes.length; index += 1) {
    let parsed;
    try {
      parsed = JSONParse(BufferToString(exportPageBytes[index], "utf8"));
    } catch {
      fail("LIFECYCLE_PAGE_JSON_INVALID");
    }
    append(pages, parsed);
  }
  return pages;
}

/* Narrow parser-hardening audit only. It returns byte commitments and never
   projects parsed lifecycle pages or treats JSON parsing as lifecycle replay. */
export function auditAutonomousWorkOrderLifecyclePageBytesV2(
  exportPageBytes = []) {
  rejectTree(exportPageBytes);
  const exact = exactPageBytes(exportPageBytes);
  parseLifecyclePages(exact);
  const pageCommitments = [];
  let exactByteCount = 0;
  for (let index = 0; index < exact.length; index += 1) {
    const state = createHash("sha256");
    HashUpdate(state, exact[index]);
    exactByteCount += exact[index].length;
    append(pageCommitments, {
      page: index + 1,
      byteLength: exact[index].length,
      byteHash: `sha256:${HashDigest(state, "hex")}`,
    });
  }
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.pageByteAudit,
    pageCount: exact.length,
    exactByteCount,
    pageCommitments,
    jsonParsingCompleted: true,
    lifecycleReplayVerified: false,
    rawPagesProjected: false,
    authority: "NONE",
    actionReady: false,
  });
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
  for (let index = 0; index < bindings.length; index += 1) {
    if (bindings[index].kind === kind) return bindings[index];
  }
  fail(`SOURCE_BINDING_${kind}_NOT_UNIQUE`);
}

function verifySourceBindingRecords(witnessInput, sourceReview) {
  const bytes = sourceBindingRecordBytes(witnessInput);
  const expected = [
    ["SOURCE_MANIFEST", "sourceManifest", bytes.sourceManifest],
    ["INSTRUMENT", "instrument", bytes.instrument],
    ["RIGHTS_REVIEW", "rightsReview", bytes.rightsReview],
    ["PRIVACY_REVIEW", "privacyReview", bytes.privacyReview],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const [kind, _role, value] = expected[index];
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
  let exactMatches = 0;
  let latest = null;
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

function verifySuccessorCrosswalk(input, lifecycle, sourceReview) {
  const witnessInput = input.delayedWitness.input.outcomeWitness;
  const successorBundle = witnessInput.nodeSubmissionBundle;
  const manifest = successorBundle.preview.manifest;
  const payload = successorBundle.preview.payload;
  const reviewManifest = input.sourceReview.input.persistedContract.manifest;
  const certificate = input.delayedWitness.certificate;
  const current = currentLifecycleItem(lifecycle.exportPageBytes, sourceReview);
  const bindingBytes = verifySourceBindingRecords(witnessInput, sourceReview);
  if (certificate.outcomeWitnessSuccessor.nodeSubmissionBundleHash
      !== successorBundle.bundleHash
    || certificate.outcomeWitnessSuccessor.manifestHash !== manifest.manifestHash
    || certificate.outcomeWitnessSuccessor.occurrenceIdentityHash
      !== manifest.occurrenceIdentityHash
    || certificate.outcomeWitnessSuccessor.outcomeWitnessEnvelopeHash
      !== witnessInput.envelope.envelopeHash
    || certificate.outcomeWitnessSuccessor.witnessSourceManifestHash
      !== witnessInput.sourceManifest.sourceManifestHash
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
    || DateParse(sourceReview.networkSnapshot.event.occurredAt)
      <= DateParse(successorBundle.receipt.receivedAt)
    || sourceReview.sourceReviewSetPin.checkpointHash
      !== lifecycle.checked.checkpointHash) {
    fail("ACTION_OUTCOME_V2_LIFECYCLE_SOURCE_REVIEW_CROSSWALK_INVALID");
  }
  return { ...current, bindingByteCount:
    bindingBytes.sourceManifest.length + bindingBytes.instrument.length
      + bindingBytes.rightsReview.length + bindingBytes.privacyReview.length };
}

function receiptBody(input, context) {
  exactInputShape(input, context);
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  const predecessorCheck = verifyPredecessor(input, context);
  const witnessCheck = verifyDelayedWitness(input, context);
  verifyBaseCrosswalk(input);
  const lifecycle = verifyLifecycle(input, context);
  const sourceReview = verifySourceReview(input, context);
  const current = verifySuccessorCrosswalk(input, lifecycle, sourceReview);
  if (DateParse(sourceReview.reviewedAt)
      < DateParse(input.lifecycle.checkpoint.createdAt)
    || DateParse(recordedAt) < DateParse(sourceReview.reviewedAt)
    || DateParse(recordedAt) < DateParse(input.lifecycle.checkpoint.createdAt)) {
    fail("RECEIPT_TIME_ORDER_INVALID");
  }
  const predecessor = input.predecessor.receipt;
  const certificate = input.delayedWitness.certificate;
  const missingSourceClasses = [
    "ACTOR_EDGE_TO_NETWORK_DELEGATION_ENVELOPE_CROSSWALK_NOT_ESTABLISHED",
    "DECLARATION_EXTERNAL_SOURCE_BYTES_NOT_REPLAYED",
    "DIRECT_PARTICIPANT_CONFIRMATION_NOT_ESTABLISHED",
    "DURABLE_ATTEMPT_SET_HEAD_NOT_ESTABLISHED",
    "EXTERNAL_HEAD_ANCHOR_NOT_ESTABLISHED",
    "EXTERNAL_PIN_PROVENANCE_NOT_ESTABLISHED",
    "FULL_ATTEMPT_ANCESTRY_NOT_REPLAYED",
    "INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED",
    "ORGANIZATIONAL_INDEPENDENCE_NOT_ESTABLISHED",
    "OUTCOME_WITNESS_ADAPTER_IMPLEMENTATION_CODE_CLOSURE_NOT_REPLAYED",
    "PRIVACY_REVIEW_SEMANTICS_NOT_ADJUDICATED",
    "RIGHTS_REVIEW_SEMANTICS_NOT_ADJUDICATED",
  ];
  return {
    schema: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.receipt,
    schemaVersion: "2.0.0",
    receiptClass:
      "APPEND_ONLY_STAGE1C_LIFECYCLE_ACTION_OUTCOME_V2_SOURCE_REPLAY_HOLD_INCOMPLETE",
    recordedAt,
    supersession: {
      predecessorSchema: predecessor.schema,
      predecessorReceiptHash: predecessor.sourceReplayReceiptHash,
      supersedesReceiptHash: predecessor.sourceReplayReceiptHash,
      predecessorRederived: true,
      predecessorExternalSourceReplayVerified: false,
      predecessorOverwritten: false,
      inPlaceMutationAllowed: false,
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
      sameLaneDelayedSuccessor: true,
      exactWitnessSourceBytesReplayed: true,
      adapterSpecificationAndSchemaReplayed: true,
      adapterImplementationOrCodeClosureReplayed: false,
      delayedHorizonMatured: true,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      obligationClosed: false,
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
      actionOutcomeV2CurrentOccurrenceCount: 1,
      crosswalkedActionOutcomeV2ReportOccurrenceCount: 2,
      crosswalkedDistinctObjectIdentityCount: 1,
      occurrenceCountDerivedFromObjectCount: false,
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
      instrumentBindingRecordIsReferenceOnly: true,
      rightsAndPrivacyBindingRecordsAreReferenceOnly: true,
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
    roleAndTruthBoundary: {
      secondTypedWitnessIdentityReplayed: true,
      differentKeysAcceptedAsOrganizationalIndependence: false,
      relationshipPolicyVerifiedWithinDeclaredScope: true,
      organizationalIndependenceEstablished: false,
      delayedObservationAcceptedAsIndependentOutcomeTruth: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      recoveryExternallyVerified: false,
      obligationOutstanding: true,
      obligationClosureEstablished: false,
    },
    replayCoverage: {
      predecessorReceiptRederived: predecessorCheck.receiptDerivationVerified,
      networkCoreCanonicalReplayVerified: true,
      networkCoreSourceReplayVerified: false,
      delayedWitnessCertificateRederived: witnessCheck.sourceReplayComplete,
      delayedWitnessSourceByteReplayIntegrated: true,
      lifecycleExactExportByteReplayIntegrated: true,
      lifecycleSourceReviewByteReplayIntegrated: true,
      appendOnlyPredecessorExternalSourceReplayVerified: false,
      trustPolicyExternalPinProvenanceEstablished: false,
      externalHeadAnchorVerified: false,
      attemptSetSourceReplayVerified: false,
      fullAttemptAncestryReplayVerified: false,
      episodeAttemptDenominatorComplete: false,
      declarationExternalSourceBytesReplayed: false,
      sourceReplayVerified: false,
    },
    missingSourceClasses,
    result:
      "AUTONOMOUS_WORK_ORDER_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAYED_HOLD_INCOMPLETE",
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
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
    externalAdoptionEstablished: false,
    networkOrderEstablished: false,
    boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY,
  };
}

export function createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2(
  input = {}, context = {}) {
  rejectTree(input);
  rejectTree(context);
  if (AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY
    .successReceiptMintingEnabled !== true) {
    fail("NOT_INTEGRATED_CENSUS_ROLE_AND_OBLIGATION_ROOT_PROTOCOL_REQUIRED");
  }
  const body = receiptBody(input, context);
  return deepFreeze({ ...body, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.receipt, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.verification,
    ok: false,
    integrationStatus: "AUDITED_DRAFT_NOT_INTEGRATED",
    successReceiptMintingEnabled: false,
    receiptDerivationVerified: false,
    lifecycleExactExportByteReplayIntegrated: false,
    lifecycleSourceReviewByteReplayIntegrated: false,
    delayedWitnessSourceByteReplayIntegrated: false,
    sourceReplayVerified: false,
    externalHeadAnchorVerified: false,
    independentOutcomeTruthEstablished: false,
    organizationalIndependenceEstablished: false,
    obligationClosureEstablished: false,
    fullAttemptAncestryReplayVerified: false,
    episodeAttemptDenominatorComplete: false,
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
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2(
  record, options = {}) {
  if (AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY
    .successReceiptMintingEnabled !== true) {
    return verificationFailure(new TypeErrorConstructor(
      "AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_"
      + "NOT_INTEGRATED_CENSUS_ROLE_AND_OBLIGATION_ROOT_PROTOCOL_REQUIRED"));
  }
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["input", "context", "expectedReceiptHash"],
      "VERIFY_OPTIONS");
    exactObject(record, ["schema", "schemaVersion", "receiptClass", "recordedAt",
      "supersession", "orderIdentity", "delayedOutcomeSuccessor",
      "lifecycleReplay", "sourceReviewReplay", "roleAndTruthBoundary",
      "replayCoverage", "missingSourceClasses", "result", "disposition",
      "decisionState", "authority", "enabledCapabilityCount",
      "provenAuthorityCount", "enabledCapabilitiesSubsetOfProvenAuthority",
      "consequenceReach", "actionReady", "executable", "automaticTraining",
      "trainingRows", "causalExperienceUnits", "actorCredit",
      "moneyMovementEnabled", "custodyEstablished", "fundsVerified",
      "permitsPricing", "permitsGuarantee", "permitsInsurance",
      "permitsSettlement", "externalAdoptionEstablished",
      "networkOrderEstablished", "boundary", "receiptHash"], "RECEIPT");
    if (record.schema
        !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.receipt
      || record.schemaVersion !== "2.0.0"
      || record.receiptClass
        !== "APPEND_ONLY_STAGE1C_LIFECYCLE_ACTION_OUTCOME_V2_SOURCE_REPLAY_HOLD_INCOMPLETE"
      || record.result
        !== "AUTONOMOUS_WORK_ORDER_LIFECYCLE_AND_DELAYED_OUTCOME_REPLAYED_HOLD_INCOMPLETE"
      || record.disposition !== "QUARANTINED" || record.decisionState !== "HOLD"
      || record.authority !== "NONE" || record.enabledCapabilityCount !== 0
      || record.provenAuthorityCount !== 0
      || record.enabledCapabilitiesSubsetOfProvenAuthority !== true
      || record.consequenceReach !== "NONE" || record.actionReady !== false
      || record.executable !== false || record.automaticTraining !== false
      || record.trainingRows !== 0 || record.causalExperienceUnits !== 0
      || record.actorCredit !== false || record.moneyMovementEnabled !== false
      || record.custodyEstablished !== false || record.fundsVerified !== false
      || record.permitsPricing !== false || record.permitsGuarantee !== false
      || record.permitsInsurance !== false || record.permitsSettlement !== false
      || record.externalAdoptionEstablished !== false
      || record.networkOrderEstablished !== false
      || record.replayCoverage.sourceReplayVerified !== false
      || record.replayCoverage.externalHeadAnchorVerified !== false
      || record.replayCoverage.fullAttemptAncestryReplayVerified !== false
      || record.replayCoverage.episodeAttemptDenominatorComplete !== false
      || record.roleAndTruthBoundary.independentOutcomeTruthEstablished !== false
      || record.roleAndTruthBoundary.organizationalIndependenceEstablished !== false
      || record.roleAndTruthBoundary.obligationClosureEstablished !== false
      || !same(record.boundary,
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY)) {
      fail("RECEIPT_STATE_INVALID");
    }
    const rebuilt = createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2(
      options.input, options.context);
    if (!same(record, rebuilt)) fail("RECEIPT_SOURCE_REPLAY_INVALID");
    if (record.receiptHash !== hash(options.expectedReceiptHash,
      "EXPECTED_RECEIPT_HASH")) {
      fail("EXPECTED_RECEIPT_HASH_MISMATCH");
    }
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.verification,
      ok: true,
      receiptDerivationVerified: true,
      receiptHash: rebuilt.receiptHash,
      predecessorReceiptHash: rebuilt.supersession.predecessorReceiptHash,
      certificateHash: rebuilt.delayedOutcomeSuccessor.certificateHash,
      lifecycleCheckpointHash: rebuilt.lifecycleReplay.checkpointHash,
      sourceReviewExportHash: rebuilt.sourceReviewReplay.exportHash,
      lifecycleEventCount: rebuilt.lifecycleReplay.eventCount,
      lifecycleExactByteCount: rebuilt.lifecycleReplay.exactByteCount,
      sourceReviewExactByteCount: rebuilt.sourceReviewReplay.exactSourceReviewByteCount,
      delayedWitnessSourceByteReplayIntegrated: true,
      lifecycleExactExportByteReplayIntegrated: true,
      lifecycleSourceReviewByteReplayIntegrated: true,
      sourceReplayVerified: false,
      externalHeadAnchorVerified: false,
      callerPinAcceptedAsExternalEvidence: false,
      rekorOrProviderCallerPinAcceptedAsExternalHead: false,
      independentOutcomeTruthEstablished: false,
      organizationalIndependenceEstablished: false,
      obligationClosureEstablished: false,
      fullAttemptAncestryReplayVerified: false,
      episodeAttemptDenominatorComplete: false,
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
      boundary: AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
