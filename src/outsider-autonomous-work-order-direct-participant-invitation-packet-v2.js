/*
 * Stage 1 direct-participant invitation packet, read-only replay crosswalk v2.
 *
 * This module derives a non-sendable binding summary only. It freshly invokes
 * the Stage 1 engineering receipt verifier, whose local attempt-set replay
 * performs read-only filesystem I/O, and the pure GitHub lifecycle
 * prerequisite verifier. It then parses the exact lifecycle receipt bytes and
 * freshly derives the v1 invitation draft in memory. It performs no filesystem
 * write, network, transport, or contact operation. No parent input, raw source
 * bytes, prompt, alias, nonce, key, signature, path, URL, or transport target
 * is returned. Fresh replay is structural evidence only: it does not establish
 * an external fact, participant standing, rights, privacy, delivery, or a
 * Stage 1/Stage 2 gate.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1,
} from "./outsider-autonomous-work-order-direct-participant-invitation-packet-v1.js";
import {
  verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt,
} from "./outsider-autonomous-work-order-stage1-engineering-integration.js";
import {
  parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
  verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
} from "./outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js";

const ArrayIsArray = Array.isArray;
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TYPED_ERROR
  = /^AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_[A-Z0-9_]+$/u;
const ERROR_PREFIX
  = "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_";

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_SCHEMAS
  = ObjectFreeze({
    derivation:
      "outsider/autonomous-work-order-direct-participant-invitation-read-only-parent-replay-crosswalk/v2",
  });

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY
  = deepFreeze({
    position:
      "STAGE1_DIRECT_PARTICIPANT_INVITATION_FRESH_READ_ONLY_PARENT_CROSSWALK_NOT_SENT",
    pureInMemoryDerivationOnly: false,
    freshReadOnlyLocalParentReplayAndInMemoryInvitationDerivation: true,
    parentLocalAttemptSetFilesystemReadRequired: true,
    stage1EngineeringReceiptFreshReplayRequired: true,
    lifecyclePrerequisiteFreshVerificationRequired: true,
    lifecyclePrerequisiteExactBytesParseRequired: true,
    invitationV1FreshDerivationRequired: true,
    exactCrosswalkRequired: true,
    parentInputOrContextReturned: false,
    rawPrivateSourceBytesReturned: false,
    exactQuestionPromptReturned: false,
    aliasesReturned: false,
    nonceReturned: false,
    projectionKeyReturned: false,
    signatureOrSignerReferenceReturned: false,
    pathOrUrlReturned: false,
    transportTargetReturned: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromDerivedObject: false,
    filesystemReadPerformedByFreshStage1ParentReplay: true,
    filesystemWritePerformed: false,
    networkIoPerformed: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    lifecycleIntegrated: false,
    lifecycleCurrentParentFilesRehashedByContract: false,
    lifecycleExactParentByteReferencesVerified: false,
    retentionPermissionCurrent: false,
    automaticPurgeIntegrated: false,
    invitationPrivateContentCurrentnessIsCallerAssertionOnly: true,
    reviewPacketCurrentHeadOrSupersessionEstablished: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGateSatisfied: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

function fail(code) {
  throw new TypeErrorConstructor(`${ERROR_PREFIX}${code}`);
}

function ownDataValue(object, key, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(object, key);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail(code);
  return descriptor.value;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value) || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(code);
  // Do not enumerate caller keys.  Every standard own-key API (including the
  // For-In iterator's internal [[OwnPropertyKeys]] step) may materialize an
  // attacker-wide key census before JavaScript can enforce a budget.  This
  // wrapper consumes only the fixed semantic fields below; all additional
  // enumerable, non-enumerable, symbol, and inherited metadata is inert and
  // is neither read nor forwarded to a parent verifier.
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    ownDataValue(value, field, code);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(code);
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) {
    return value;
  }
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return ObjectFreeze(value);
}

function freshStage1Replay(stage1) {
  exactObject(stage1, ["receipt", "input", "context", "expectedReceiptHash"],
    "STAGE1_BINDING_SHAPE_INVALID");
  const receipt = ownDataValue(stage1, "receipt", "STAGE1_BINDING_SHAPE_INVALID");
  const input = ownDataValue(stage1, "input", "STAGE1_BINDING_SHAPE_INVALID");
  const context = ownDataValue(stage1, "context", "STAGE1_BINDING_SHAPE_INVALID");
  const expectedReceiptHash = hash(ownDataValue(stage1, "expectedReceiptHash",
    "STAGE1_BINDING_SHAPE_INVALID"), "STAGE1_EXPECTED_RECEIPT_HASH_INVALID");
  let checked;
  try {
    checked = verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
      receipt, { input, context, expectedReceiptHash });
  } catch {
    fail("STAGE1_PARENT_VERIFIER_REJECTED");
  }
  if (checked === null || typeof checked !== "object" || checked.ok !== true
    || checked.receiptDerivationVerified !== true
    || checked.sourceClosureReceiptVerified !== true
    || checked.localAttemptSetAncestryVerified !== true
    || checked.lifecycleOutcomeReceiptVerified !== true
    || checked.requiredOccurrenceMembershipVerified !== true
    || checked.receiptHash !== expectedReceiptHash
    || checked.stage1EngineeringGatePassed !== false
    || checked.stage1ExternalFactGatePassed !== false
    || checked.stage1Complete !== false || checked.stage2Eligible !== false
    || checked.stage2Permitted !== false
    || checked.directParticipantConfirmationEstablished !== false
    || checked.rightsPrivacyAdjudicationEstablished !== false
    || checked.sourceReplayVerified !== false
    || checked.networkOrderEstablished !== false
    || checked.directoryPathsProjected !== false
    || checked.rawSourceOrReviewBytesProjected !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE") {
    fail("STAGE1_PARENT_FRESH_REPLAY_REJECTED");
  }
  if (receipt === null || typeof receipt !== "object"
    || receipt.receiptHash !== checked.receiptHash
    || receipt.orderIdentity?.workOrderHash !== checked.workOrderHash
    || receipt.orderIdentity?.orderIdentityHash !== checked.orderIdentityHash
    || receipt.orderIdentity?.episodeHash !== checked.episodeHash
    || receipt.orderIdentity?.attemptHash !== checked.attemptHash
    || receipt.orderIdentity?.orderIdentityHash !== receipt.orderIdentity?.episodeHash
    || receipt.localAttemptSetReplay?.headCompositionHash === undefined
    || receipt.replayCoverage?.directParticipantConfirmationEstablished !== false
    || receipt.replayCoverage?.rightsPrivacyAdjudicationEstablished !== false
    || receipt.replayCoverage?.sourceReplayVerified !== false) {
    fail("STAGE1_PARENT_RECEIPT_CROSSWALK_REJECTED");
  }
  hash(receipt.localAttemptSetReplay.headCompositionHash,
    "STAGE1_ATTEMPT_SET_COMPOSITION_HASH_INVALID");
  return { receipt, checked, expectedReceiptHash };
}

function freshLifecycleReplay(lifecycle) {
  exactObject(lifecycle, ["receiptBytes", "expectedReceiptHash"],
    "LIFECYCLE_BINDING_SHAPE_INVALID");
  const receiptBytes = ownDataValue(lifecycle, "receiptBytes",
    "LIFECYCLE_BINDING_SHAPE_INVALID");
  const expectedReceiptHash = hash(ownDataValue(lifecycle, "expectedReceiptHash",
    "LIFECYCLE_BINDING_SHAPE_INVALID"),
  "LIFECYCLE_EXPECTED_RECEIPT_HASH_INVALID");
  let checked;
  try {
    checked = verifyAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      receiptBytes);
  } catch {
    fail("LIFECYCLE_PARENT_VERIFIER_REJECTED");
  }
  if (checked === null || typeof checked !== "object" || checked.ok !== true
    || checked.structuralProtocolVerified !== true
    || checked.receiptHash !== expectedReceiptHash
    || checked.protocolState !== "AUDITED_DRAFT_NOT_INTEGRATED"
    || checked.exactParentByteReferencesVerified !== false
    || checked.currentParentFilesRehashedByContract !== false
    || checked.lifecycleIntegrated !== false
    || checked.eligibleToLiftExistingKillGate !== false
    || checked.stage1EngineeringGateSatisfied !== false
    || checked.stage1ExternalFactGateSatisfied !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE") {
    fail("LIFECYCLE_PARENT_FRESH_VERIFICATION_REJECTED");
  }
  let receipt;
  try {
    receipt = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      receiptBytes);
  } catch {
    fail("LIFECYCLE_EXACT_BYTES_PARSE_REJECTED");
  }
  const rights = receipt.rightsPrivacyBoundary;
  const gate = receipt.integrationGate;
  if (receipt.receiptHash !== checked.receiptHash
    || receipt.protocolState !== "AUDITED_DRAFT_NOT_INTEGRATED"
    || rights?.lifecycleProtocolIsRightsAdjudication !== false
    || rights?.lifecycleProtocolIsPrivacyAdjudication !== false
    || rights?.sourceSpecificRightsClearanceEstablished !== false
    || rights?.sourceSpecificPrivacyClearanceEstablished !== false
    || rights?.redistributionPermissionEstablished !== false
    || rights?.publicationPermissionEstablished !== false
    || rights?.retentionPermissionEstablished !== false
    || rights?.trainingPermissionEstablished !== false
    || gate?.externalLifecycleRegistrarImplemented !== false
    || gate?.allRawReadersUseExternalLifecycleGuard !== false
    || gate?.crashResumablePurgeWorkerIntegrated !== false
    || gate?.productionRawLoaderEnabled !== false
    || gate?.productionRawPublisherEnabled !== false
    || gate?.productionRawVerifierEnabled !== false
    || gate?.purgeExecutionEnabled !== false
    || gate?.eligibleToLiftExistingKillGate !== false) {
    fail("LIFECYCLE_RIGHTS_PRIVACY_OR_PURGE_BOUNDARY_REJECTED");
  }
  return { receipt, checked, expectedReceiptHash };
}

function freshInvitationDerivation(invitationInput) {
  let invitation;
  try {
    invitation
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        invitationInput);
  } catch {
    fail("INVITATION_V1_FRESH_DERIVATION_REJECTED");
  }
  const packet = invitation?.privatePacket;
  const projection = invitation?.networkSafeProjection;
  if (packet === null || typeof packet !== "object"
    || projection === null || typeof projection !== "object"
    || invitation.stage1EngineeringIntegrationReceiptReplayed !== false
    || invitation.stage1EngineeringGatePassed !== false
    || invitation.stage1Complete !== false || invitation.stage2Permitted !== false
    || invitation.sourceReplayVerified !== false
    || invitation.rightsPrivacyAdjudicationEstablished !== false
    || invitation.directParticipantConfirmationEstablished !== false
    || invitation.networkOrderEstablished !== false
    || invitation.sendableInvitationMaterialAvailable !== false
    || invitation.challengeEchoCanBeRequestedFromThisDerivedObject !== false
    || invitation.contactPerformed !== false
    || invitation.outboundCapability !== false
    || packet.delivery?.state !== "NOT_SENT"
    || packet.delivery?.contactPerformed !== false
    || packet.delivery?.outboundCapability !== false
    || packet.retention?.retentionPermissionCurrent !== false
    || packet.retention?.automaticPurgeIntegrated !== false
    || projection.delivery?.state !== "NOT_SENT"
    || projection.delivery?.contactPerformed !== false
    || projection.delivery?.outboundCapability !== false
    || projection.gate?.eligibleForContact !== false
    || projection.gate?.sendableInvitationMaterialAvailable !== false) {
    fail("INVITATION_V1_FIXED_BOUNDARY_REJECTED");
  }
  return { invitation, packet, projection };
}

function exactCrosswalk(stage1, lifecycle, invitation) {
  const { receipt: stageReceipt, checked: stageChecked } = stage1;
  const { receipt: lifecycleReceipt } = lifecycle;
  const { packet, projection } = invitation;
  const binding = packet.caseBinding;
  const sources = packet.exactPrivateSources;
  if (binding?.workOrderHash !== stageChecked.workOrderHash
    || binding?.episodeHash !== stageChecked.episodeHash
    || binding?.attemptSetCompositionHash
      !== stageReceipt.localAttemptSetReplay.headCompositionHash
    || packet.reconstruction?.attemptRefCommitment !== stageChecked.attemptHash) {
    fail("STAGE1_INVITATION_IDENTITY_CROSSWALK_MISMATCH");
  }
  if (binding.caseRecordHash !== sources?.caseRecord?.sha256
    || binding.reviewPacketHash !== sources?.reviewPacket?.sha256
    || binding.purposeHash !== sources?.purpose?.sha256
    || binding.audienceHash !== sources?.audience?.sha256
    || digest(
      "outsider.autonomous-work-order.dispute-review-reconstruction.v1",
      packet.reconstruction) !== binding.reconstructionHash) {
    fail("INVITATION_CURRENT_PRIVATE_SOURCE_CROSSWALK_MISMATCH");
  }
  if (packet.question?.structurallySpecificQuestionShapePresent !== true
    || packet.question?.responseProtocol !== "YES_NO_UNSURE_DECLINE_V1"
    || !ArrayIsArray(packet.question?.triggeringComponents)
    || packet.question.triggeringComponents.length < 1
    || typeof packet.retention?.retentionSeconds !== "number"
    || packet.retention?.purgeRequired !== true
    || packet.retention?.retentionPermissionCurrent !== false
    || packet.retention?.automaticPurgeIntegrated !== false
    || projection.retention?.retentionSeconds
      !== packet.retention.retentionSeconds
    || projection.retention?.permissionCurrent !== false
    || projection.retention?.automaticPurgeIntegrated !== false
    || lifecycleReceipt.rightsPrivacyBoundary.retentionPermissionEstablished
      !== false
    || lifecycleReceipt.integrationGate.crashResumablePurgeWorkerIntegrated
      !== false) {
    fail("INVITATION_QUESTION_RETENTION_LIFECYCLE_CROSSWALK_MISMATCH");
  }

  const privateContentBindingHash = digest(
    "outsider.autonomous-work-order.direct-participant-invitation.private-content.v2",
    {
      recordedAt: packet.recordedAt,
      caseBinding: packet.caseBinding,
      caseScopedParticipantAlias: packet.caseScopedParticipantAlias,
      reconstruction: packet.reconstruction,
      question: packet.question,
      exactPrivateSources: packet.exactPrivateSources,
      retention: {
        retentionSeconds: packet.retention.retentionSeconds,
        expiresAtLocalDerivationClock:
          packet.retention.expiresAtLocalDerivationClock,
        purgeRequired: packet.retention.purgeRequired,
      },
    },
  );
  const parentAndContentBindingHash = digest(
    "outsider.autonomous-work-order.direct-participant-invitation.parent-crosswalk.v2",
    {
      stage1EngineeringReceiptHash: stageChecked.receiptHash,
      lifecyclePrerequisiteReceiptHash: lifecycleReceipt.receiptHash,
      privateContentBindingHash,
    },
  );
  const freshDerivationBindingHash = digest(
    "outsider.autonomous-work-order.direct-participant-invitation.fresh-derivation.v2",
    {
      parentAndContentBindingHash,
      invitationV1PrivatePacketHash: packet.packetHash,
    },
  );
  return {
    privateContentBindingHash,
    parentAndContentBindingHash,
    freshDerivationBindingHash,
  };
}

function success(stage1, lifecycle, invitation, bindings) {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_SCHEMAS
        .derivation,
    ok: true,
    derivationClass:
      "PRIVATE_IN_MEMORY_EXACT_PARENT_CROSSWALK_DRAFT_NOT_SENT_HOLD",
    parentReplay: {
      stage1EngineeringIntegrationReceiptFreshlyReplayed: true,
      stage1EngineeringReceiptHash: stage1.checked.receiptHash,
      localAttemptSetFilesystemReadPerformed: true,
      filesystemWritePerformed: false,
      lifecyclePrerequisiteFreshlyVerified: true,
      lifecyclePrerequisiteExactBytesParsed: true,
      lifecyclePrerequisiteReceiptHash: lifecycle.checked.receiptHash,
      lifecycleProtocolState: "AUDITED_DRAFT_NOT_INTEGRATED",
      lifecycleExactParentByteReferencesVerified: false,
      lifecycleCurrentParentFilesRehashedByContract: false,
      lifecycleIntegrated: false,
      invitationV1FreshlyDerived: true,
      invitationV1PrivatePacketHash: invitation.packet.packetHash,
    },
    exactCrosswalk: {
      stage1ReceiptHashMatchedExpected: true,
      lifecycleReceiptHashMatchedExpected: true,
      workOrderHashMatched: true,
      orderIdentityAndEpisodeHashMatched: true,
      attemptHashMatchedReconstructionAttemptReference: true,
      attemptSetHeadCompositionHashMatched: true,
      localAttemptSetTwoPassSnapshotStabilityFreshlyReplayed: true,
      currentCaseRecordExactBytesBound: true,
      currentReviewPacketExactBytesBound: true,
      currentReconstructionExactContentBound: true,
      currentPurposeExactBytesBound: true,
      currentAudienceExactBytesBound: true,
      currentRetentionExactValueBound: true,
      exactDecisionBeforeChangedTriggerQuestionBound: true,
      lifecycleRightsPrivacyBoundaryFreshlyParsed: true,
      retentionPermissionRemainsFalseAcrossInvitationAndLifecycle: true,
      purgeIntegrationRemainsFalseAcrossInvitationAndLifecycle: true,
      lifecyclePrerequisiteCarriesCaseIdentity: false,
      caseScopeEstablishedByV2CompositeBindingOnly: true,
    },
    currentnessBoundary: {
      currentMeansExactPrivateBytesSuppliedForThisDerivationCallOnly: true,
      invitationPrivateContentCurrentnessIsCallerAssertionOnly: true,
      independentCurrentnessEstablished: false,
      reviewPacketCurrentHeadOrSupersessionEstablished: false,
      reconstructionCurrentHeadOrSupersessionEstablished: false,
      purposeCurrentHeadOrSupersessionEstablished: false,
      audienceCurrentHeadOrSupersessionEstablished: false,
    },
    binding: {
      privateContentBindingHash: bindings.privateContentBindingHash,
      parentAndContentBindingHash: bindings.parentAndContentBindingHash,
      freshDerivationBindingHash: bindings.freshDerivationBindingHash,
      exactPrivateValuesProjected: false,
      networkSafeProjectionReturned: false,
    },
    redaction: {
      parentInputOrContextReturned: false,
      rawPrivateSourceBytesReturned: false,
      exactQuestionPromptReturned: false,
      aliasesReturned: false,
      nonceReturned: false,
      projectionKeyReturned: false,
      signatureOrSignerReferenceReturned: false,
      pathOrUrlReturned: false,
      transportTargetReturned: false,
    },
    controlBoundary: {
      v1InMemoryControlSignatureVerifiedDuringFreshDerivation: true,
      signatureProvesControlOnly: true,
      challengeGeneratedForThisDerivationCallByLocalCsprng: true,
      challengeGlobalFreshnessEstablished: false,
      signerLegalIdentityVerified: false,
      participantStandingVerified: false,
      narrativeOrOutcomeTruthVerified: false,
    },
    stage1EngineeringIntegrationReceiptReplayed: true,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGateSatisfied: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    lifecycleIntegrated: false,
    lifecycleCurrentParentFilesRehashedByContract: false,
    lifecycleExactParentByteReferencesVerified: false,
    retentionPermissionCurrent: false,
    automaticPurgeIntegrated: false,
    invitationPrivateContentCurrentnessIsCallerAssertionOnly: true,
    reviewPacketCurrentHeadOrSupersessionEstablished: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    filesystemReadPerformed: true,
    filesystemWritePerformed: false,
    networkIoPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    error: null,
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY,
  });
}

function failure(error) {
  let message = `${ERROR_PREFIX}UNTRUSTED_FAILURE`;
  try {
    const descriptor = error !== null && typeof error === "object"
      && error instanceof ErrorConstructor
      ? ObjectGetOwnPropertyDescriptor(error, "message") : undefined;
    if (descriptor && ObjectHasOwn(descriptor, "value")
      && typeof descriptor.value === "string"
      && StringStartsWith(descriptor.value, ERROR_PREFIX)
      && RegExpTest(TYPED_ERROR, descriptor.value)) message = descriptor.value;
  } catch {
    message = `${ERROR_PREFIX}UNTRUSTED_FAILURE`;
  }
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_SCHEMAS
        .derivation,
    ok: false,
    stage1EngineeringIntegrationReceiptReplayed: false,
    lifecyclePrerequisiteFreshlyVerified: false,
    invitationV1FreshlyDerived: false,
    exactCrosswalkEstablished: false,
    lifecycleIntegrated: false,
    retentionPermissionCurrent: false,
    automaticPurgeIntegrated: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGateSatisfied: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    error: message,
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY,
  });
}

export function deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(
  input,
) {
  try {
    exactObject(input, ["invitationInput", "stage1Engineering",
      "lifecyclePrerequisite"], "INPUT_SHAPE_INVALID");
    const stage1 = freshStage1Replay(ownDataValue(input, "stage1Engineering",
      "INPUT_SHAPE_INVALID"));
    const lifecycle = freshLifecycleReplay(ownDataValue(input,
      "lifecyclePrerequisite", "INPUT_SHAPE_INVALID"));
    const invitation = freshInvitationDerivation(ownDataValue(input,
      "invitationInput", "INPUT_SHAPE_INVALID"));
    const bindings = exactCrosswalk(stage1, lifecycle, invitation);
    return success(stage1, lifecycle, invitation, bindings);
  } catch (error) {
    return failure(error);
  }
}
