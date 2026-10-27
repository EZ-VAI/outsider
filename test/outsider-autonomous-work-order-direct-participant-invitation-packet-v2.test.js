import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_SCHEMAS,
  deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2,
} from "../src/outsider-autonomous-work-order-direct-participant-invitation-packet-v2.js";
import {
  createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
  parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2,
} from "../src/outsider-autonomous-work-order-github-discovery-lifecycle-prerequisite-v2.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationReceipt,
} from "../src/outsider-autonomous-work-order-stage1-engineering-integration.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationFixture,
} from "./helpers/outsider-autonomous-work-order-stage1-engineering-integration-fixture.js";

const AUDITED_AT = "2026-09-01T01:00:59.364Z";

function sha(bytesOrText) {
  return `sha256:${createHash("sha256").update(bytesOrText).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function syntheticInvitationInput(stageReceipt, label = "alpha") {
  const sourceBytes = {
    caseRecord: Buffer.from(
      `SYNTHETIC_V2_ONLY case ${label}; no external candidate bytes`, "utf8"),
    reviewPacket: Buffer.from(
      `SYNTHETIC_V2_ONLY review ${label}; no real participant claim`, "utf8"),
    purpose: Buffer.from(
      `SYNTHETIC_V2_ONLY purpose ${label}; bounded evidence question`, "utf8"),
    audience: Buffer.from(
      `SYNTHETIC_V2_ONLY audience ${label}; fictional case participant`, "utf8"),
  };
  const reconstruction = {
    promiseRefCommitment: sha(`synthetic-v2:${label}:promise`),
    attemptRefCommitment: stageReceipt.orderIdentity.attemptHash,
    observationRefCommitment: sha(`synthetic-v2:${label}:observation`),
    unresolvedRefCommitment: sha(`synthetic-v2:${label}:unresolved`),
  };
  return {
    recordedAt: "2026-09-01T01:01:00.000Z",
    retentionSeconds: 86_400,
    caseBinding: {
      caseScopedAlias:
        `case_${sha(`synthetic-v2:${label}:case`).slice(7, 39)}`,
      caseRecordHash: sha(sourceBytes.caseRecord),
      workOrderHash: stageReceipt.orderIdentity.workOrderHash,
      episodeHash: stageReceipt.orderIdentity.episodeHash,
      attemptSetCompositionHash:
        stageReceipt.localAttemptSetReplay.headCompositionHash,
      reconstructionHash: domainHash(
        "outsider.autonomous-work-order.dispute-review-reconstruction.v1",
        reconstruction),
      reviewPacketHash: sha(sourceBytes.reviewPacket),
      purposeHash: sha(sourceBytes.purpose),
      audienceHash: sha(sourceBytes.audience),
    },
    caseScopedParticipantAlias:
      `participant_${sha(`synthetic-v2:${label}:participant`).slice(7, 39)}`,
    reconstruction,
    sourceBytes,
    question: {
      kind: "EVIDENCE_REQUEST",
      prompt:
        "Would this exact synthetic observation change the committed decision from before to changed?",
      decisionPointRefCommitment:
        sha(`synthetic-v2:${label}:decision-point`),
      beforeRefCommitment: sha(`synthetic-v2:${label}:before`),
      changedRefCommitment: sha(`synthetic-v2:${label}:changed`),
      triggeringComponents: ["ATTEMPT", "OBSERVATION"],
      requestedEvidenceRefCommitment:
        sha(`synthetic-v2:${label}:requested-evidence`),
      disputeDispositionRefCommitment: null,
      responseProtocol: "YES_NO_UNSURE_DECLINE_V1",
    },
  };
}

function fixture(t, label = "alpha") {
  const stage = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
  const stageReceipt
    = createAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
      stage.input, stage.context);
  const lifecycleReceiptBytes
    = createAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2({
      auditedAtLocalClock: AUDITED_AT,
    });
  const lifecycleReceipt
    = parseAutonomousWorkOrderGithubDiscoveryLifecyclePrerequisiteV2(
      lifecycleReceiptBytes);
  return {
    stage,
    stageReceipt,
    lifecycleReceiptBytes,
    lifecycleReceipt,
    input: {
      invitationInput: syntheticInvitationInput(stageReceipt, label),
      stage1Engineering: {
        receipt: stageReceipt,
        input: stage.input,
        context: stage.context,
        expectedReceiptHash: stageReceipt.receiptHash,
      },
      lifecyclePrerequisite: {
        receiptBytes: lifecycleReceiptBytes,
        expectedReceiptHash: lifecycleReceipt.receiptHash,
      },
    },
  };
}

function cloneInvitationInput(value) {
  const cloned = structuredClone(value);
  for (const role of ["caseRecord", "reviewPacket", "purpose", "audience"]) {
    cloned.sourceBytes[role] = Buffer.from(value.sourceBytes[role]);
  }
  return cloned;
}

function assertHoldBoundary(value) {
  assert.equal(value.stage1EngineeringGatePassed, false);
  assert.equal(value.stage1ExternalFactGateSatisfied, false);
  assert.equal(value.stage1Complete, false);
  assert.equal(value.stage2Eligible, false);
  assert.equal(value.stage2Permitted, false);
  assert.equal(value.lifecycleIntegrated, false);
  assert.equal(value.retentionPermissionCurrent, false);
  assert.equal(value.automaticPurgeIntegrated, false);
  assert.equal(value.sourceReplayVerified, false);
  assert.equal(value.rightsPrivacyAdjudicationEstablished, false);
  assert.equal(value.directParticipantConfirmationEstablished, false);
  assert.equal(value.networkOrderEstablished, false);
  assert.equal(value.eligibleForContact, false);
  assert.equal(value.sendableInvitationMaterialAvailable, false);
  assert.equal(value.challengeEchoCanBeRequestedFromThisDerivedObject, false);
  assert.equal(value.contactPerformed, false);
  assert.equal(value.outboundCapability, false);
  assert.equal(value.deliveryEstablished, false);
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.enabledCapabilityCount, 0);
  assert.equal(value.provenAuthorityCount, 0);
  assert.equal(value.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(value.consequenceReach, "NONE");
}

function writeStableSentinel(file) {
  const bytes = Buffer.from(
    "SYNTHETIC_V2_READ_ONLY_SIDE_EFFECT_SENTINEL", "utf8");
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  return bytes;
}

function stableStat(file) {
  const value = lstatSync(file, { bigint: true });
  return {
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    nlink: value.nlink,
    size: value.size,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
  };
}

test("v2 performs fresh read-only local parent replay and an in-memory exact invitation crosswalk",
  (t) => {
    const value = fixture(t);
    const sentinel = path.join(value.stage.attemptSet.parent,
      "v2-read-only-side-effect-sentinel.bytes");
    const sentinelBytes = writeStableSentinel(sentinel);
    const sentinelStatBefore = stableStat(sentinel);
    const registryStatBefore = stableStat(value.stage.attemptSet.directory);
    const directoryBefore = readdirSync(value.stage.attemptSet.directory).sort();
    const derived
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(value.input);
    const directoryAfter = readdirSync(value.stage.attemptSet.directory).sort();
    const registryStatAfter = stableStat(value.stage.attemptSet.directory);
    const sentinelStatAfter = stableStat(sentinel);

    assert.equal(derived.ok, true, derived.error);
    assert.equal(derived.schema,
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_SCHEMAS
        .derivation);
    assert.equal(derived.parentReplay
      .stage1EngineeringIntegrationReceiptFreshlyReplayed, true);
    assert.equal(derived.parentReplay.stage1EngineeringReceiptHash,
      value.stageReceipt.receiptHash);
    assert.equal(derived.parentReplay.localAttemptSetFilesystemReadPerformed,
      true);
    assert.equal(derived.parentReplay.filesystemWritePerformed, false);
    assert.equal(derived.parentReplay.lifecyclePrerequisiteFreshlyVerified, true);
    assert.equal(derived.parentReplay.lifecyclePrerequisiteExactBytesParsed, true);
    assert.equal(derived.parentReplay.lifecyclePrerequisiteReceiptHash,
      value.lifecycleReceipt.receiptHash);
    assert.equal(derived.parentReplay.invitationV1FreshlyDerived, true);
    assert.match(derived.parentReplay.invitationV1PrivatePacketHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.deepEqual(directoryAfter, directoryBefore);
    assert.deepEqual(registryStatAfter, registryStatBefore);
    assert.deepEqual(sentinelStatAfter, sentinelStatBefore);
    assert.deepEqual(readFileSync(sentinel), sentinelBytes);

    for (const [key, expected] of Object.entries({
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
    })) assert.equal(derived.exactCrosswalk[key], expected, key);

    assert.match(derived.binding.privateContentBindingHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.match(derived.binding.parentAndContentBindingHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.match(derived.binding.freshDerivationBindingHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(derived.binding.exactPrivateValuesProjected, false);
    assert.equal(derived.binding.networkSafeProjectionReturned, false);
    assert.equal(derived.currentnessBoundary
      .currentMeansExactPrivateBytesSuppliedForThisDerivationCallOnly, true);
    assert.equal(derived.currentnessBoundary
      .invitationPrivateContentCurrentnessIsCallerAssertionOnly, true);
    assert.equal(derived.currentnessBoundary.independentCurrentnessEstablished,
      false);
    assert.equal(derived.currentnessBoundary
      .reviewPacketCurrentHeadOrSupersessionEstablished, false);
    assert.equal(derived.stage1EngineeringIntegrationReceiptReplayed, true);
    assert.equal(derived.lifecycleCurrentParentFilesRehashedByContract, false);
    assert.equal(derived.lifecycleExactParentByteReferencesVerified, false);
    assert.equal(derived.filesystemReadPerformed, true);
    assert.equal(derived.filesystemWritePerformed, false);
    assert.equal(derived.networkIoPerformed, false);
    assertHoldBoundary(derived);
    assert.deepEqual(derived.boundary,
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY);
    assert.equal(Object.isFrozen(derived), true);
    assert.equal(Object.isFrozen(derived.exactCrosswalk), true);
  });

test("output omits raw sources, prompt, aliases, nonce, key, signature, paths, URLs, and targets",
  (t) => {
    const value = fixture(t, "redaction");
    const derived
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(value.input);
    assert.equal(derived.ok, true, derived.error);
    const serialized = canonicalizeStrict(derived);
    for (const bytes of Object.values(value.input.invitationInput.sourceBytes)) {
      assert.equal(serialized.includes(bytes.toString("utf8")), false);
    }
    assert.equal(serialized.includes(value.input.invitationInput.question.prompt),
      false);
    assert.equal(serialized.includes(
      value.input.invitationInput.caseBinding.caseScopedAlias), false);
    assert.equal(serialized.includes(
      value.input.invitationInput.caseScopedParticipantAlias), false);
    assert.equal(serialized.includes(value.stage.context.localAttemptSet.directory),
      false);
    assert.doesNotMatch(serialized, /https?:\/\//iu);
    assert.doesNotMatch(serialized,
      /"(?:nonce|projectionKey|signature|signerReference|path|url|login|id|node_id|transportTarget)":/u);
    assert.equal(derived.redaction.rawPrivateSourceBytesReturned, false);
    assert.equal(derived.redaction.exactQuestionPromptReturned, false);
    assert.equal(derived.redaction.nonceReturned, false);
    assert.equal(derived.redaction.projectionKeyReturned, false);
    assert.equal(derived.redaction.signatureOrSignerReferenceReturned, false);
    assert.equal(derived.redaction.pathOrUrlReturned, false);
    assert.equal(derived.redaction.transportTargetReturned, false);
  });

test("stable private content binding changes with current review bytes but not fresh control randomness",
  (t) => {
    const value = fixture(t, "content-binding");
    const first
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(value.input);
    const second
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(value.input);
    assert.equal(first.ok, true, first.error);
    assert.equal(second.ok, true, second.error);
    assert.equal(first.binding.privateContentBindingHash,
      second.binding.privateContentBindingHash);
    assert.equal(first.binding.parentAndContentBindingHash,
      second.binding.parentAndContentBindingHash);

    const invitationInput = cloneInvitationInput(value.input.invitationInput);
    invitationInput.sourceBytes.reviewPacket = Buffer.from(
      "SYNTHETIC_V2_ONLY changed current review; still no real claim", "utf8");
    invitationInput.caseBinding.reviewPacketHash
      = sha(invitationInput.sourceBytes.reviewPacket);
    const changed = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2({
      ...value.input,
      invitationInput,
    });
    assert.equal(changed.ok, true, changed.error);
    assert.notEqual(changed.binding.privateContentBindingHash,
      first.binding.privateContentBindingHash);
    assert.notEqual(changed.binding.parentAndContentBindingHash,
      first.binding.parentAndContentBindingHash);
  });

test("fresh Stage1 replay rejects a stale parent binding without leaking its directory",
  (t) => {
    const value = fixture(t, "stale-stage1");
    const staleExpected = sha("synthetic stale Stage1 receipt hash");
    const result = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2({
      ...value.input,
      stage1Engineering: {
        ...value.input.stage1Engineering,
        expectedReceiptHash: staleExpected,
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_STAGE1_PARENT_FRESH_REPLAY_REJECTED");
    assert.equal(canonicalizeStrict(result).includes(
      value.stage.context.localAttemptSet.directory), false);
    assertHoldBoundary(result);
  });

test("a missing absolute Stage1 child path is rejected with one fixed pathless error",
  (t) => {
    const value = fixture(t, "missing-child-path");
    const missingAbsoluteDirectory = path.join(value.stage.attemptSet.parent,
      "SENSITIVE_ABSOLUTE_PATH_MUST_NOT_ESCAPE");
    assert.equal(path.isAbsolute(missingAbsoluteDirectory), true);
    assert.equal(existsSync(missingAbsoluteDirectory), false);
    const context = structuredClone(value.input.stage1Engineering.context);
    context.localAttemptSet.directory = missingAbsoluteDirectory;
    const result = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2({
      ...value.input,
      stage1Engineering: {
        ...value.input.stage1Engineering,
        context,
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_STAGE1_PARENT_FRESH_REPLAY_REJECTED");
    const serialized = canonicalizeStrict(result);
    assert.equal(serialized.includes(missingAbsoluteDirectory), false);
    assert.equal(serialized.includes("SENSITIVE_ABSOLUTE_PATH_MUST_NOT_ESCAPE"),
      false);
    assertHoldBoundary(result);
  });

test("fresh lifecycle verification rejects tampered bytes and returns a typed redacted failure",
  (t) => {
    const value = fixture(t, "stale-lifecycle");
    const tampered = Buffer.from(value.lifecycleReceiptBytes);
    tampered[tampered.length - 2] = tampered[tampered.length - 2] === 0x7d
      ? 0x7b : 0x7d;
    const result = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2({
      ...value.input,
      lifecyclePrerequisite: {
        receiptBytes: tampered,
        expectedReceiptHash: value.lifecycleReceipt.receiptHash,
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_LIFECYCLE_PARENT_FRESH_VERIFICATION_REJECTED");
    assert.doesNotMatch(canonicalizeStrict(result), /SYNTHETIC_V2_ONLY/u);
    assertHoldBoundary(result);
  });

test("exact Stage1-to-invitation identity crosswalk rejects a valid but spliced work-order hash",
  (t) => {
    const value = fixture(t, "splice");
    const invitationInput = cloneInvitationInput(value.input.invitationInput);
    invitationInput.caseBinding.workOrderHash
      = sha("synthetic different work order");
    const result = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2({
      ...value.input,
      invitationInput,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_STAGE1_INVITATION_IDENTITY_CROSSWALK_MISMATCH");
    assert.equal(result.stage1EngineeringIntegrationReceiptReplayed, false);
    assert.equal(result.exactCrosswalkEstablished, false);
    assertHoldBoundary(result);
  });

test("boundary truthfully declares read-only parent I/O, no writes/contact/send, rights HOLD, and no Stage 2",
  () => {
    const boundary
      = AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_BOUNDARY;
    assert.equal(boundary.pureInMemoryDerivationOnly, false);
    assert.equal(boundary
      .freshReadOnlyLocalParentReplayAndInMemoryInvitationDerivation, true);
    assert.equal(boundary.parentLocalAttemptSetFilesystemReadRequired, true);
    assert.equal(boundary.stage1EngineeringReceiptFreshReplayRequired, true);
    assert.equal(boundary.lifecyclePrerequisiteFreshVerificationRequired, true);
    assert.equal(boundary.invitationV1FreshDerivationRequired, true);
    assert.equal(boundary.parentInputOrContextReturned, false);
    assert.equal(boundary.rawPrivateSourceBytesReturned, false);
    assert.equal(boundary.nonceReturned, false);
    assert.equal(boundary.projectionKeyReturned, false);
    assert.equal(boundary.signatureOrSignerReferenceReturned, false);
    assert.equal(boundary.filesystemReadPerformedByFreshStage1ParentReplay, true);
    assert.equal(boundary.filesystemWritePerformed, false);
    assert.equal(boundary.networkIoPerformed, false);
    assert.equal(boundary.contactPerformed, false);
    assert.equal(boundary.outboundCapability, false);
    assert.equal(boundary.sendableInvitationMaterialAvailable, false);
    assert.equal(boundary.retentionPermissionCurrent, false);
    assert.equal(boundary.automaticPurgeIntegrated, false);
    assert.equal(boundary
      .invitationPrivateContentCurrentnessIsCallerAssertionOnly, true);
    assert.equal(boundary.reviewPacketCurrentHeadOrSupersessionEstablished,
      false);
    assert.equal(boundary.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(boundary.stage1EngineeringGatePassed, false);
    assert.equal(boundary.stage1Complete, false);
    assert.equal(boundary.stage2Permitted, false);
    assert.equal(boundary.decisionState, "HOLD");
    assert.equal(boundary.authority, "NONE");
    assert.equal(boundary.enabledCapabilitiesSubsetOfProvenAuthority, true);
    assert.equal(boundary.consequenceReach, "NONE");
  });

test("top-level semantic view ignores a wide key census before caller values are read",
  () => {
    let invitationGetterReads = 0;
    const hostile = {};
    Object.defineProperty(hostile, "invitationInput", {
      enumerable: true,
      get() {
        invitationGetterReads += 1;
        throw new Error("HOSTILE_INVITATION_GETTER_MUST_NOT_RUN");
      },
    });
    hostile.stage1Engineering = null;
    hostile.lifecyclePrerequisite = null;
    for (let index = 0; index < 100_000; index += 1) {
      hostile[`extra_${index}`] = null;
    }

    const result
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV2(hostile);
    assert.equal(result.ok, false);
    assert.equal(result.error,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V2_INPUT_SHAPE_INVALID");
    assert.equal(invitationGetterReads, 0);
    assertHoldBoundary(result);
  });
