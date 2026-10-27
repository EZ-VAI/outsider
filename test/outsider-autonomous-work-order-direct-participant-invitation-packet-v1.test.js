import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS,
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_QUESTION_KINDS,
  AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS,
  deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1,
  publishAutonomousWorkOrderDirectParticipantInvitationPacketV1,
  verifyAutonomousWorkOrderDirectParticipantInvitationPacketV1,
} from "../src/outsider-autonomous-work-order-direct-participant-invitation-packet-v1.js";

function sha(bytesOrString) {
  return `sha256:${createHash("sha256").update(bytesOrString).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function syntheticSources(label = "a") {
  return {
    caseRecord: Buffer.from(
      `SYNTHETIC_ONLY case ${label}; no external candidate or account bytes`, "utf8"),
    reviewPacket: Buffer.from(
      `SYNTHETIC_ONLY exact review packet ${label}; no real incident claim`, "utf8"),
    purpose: Buffer.from(
      `SYNTHETIC_ONLY purpose ${label}: bounded product-discovery question`, "utf8"),
    audience: Buffer.from(
      `SYNTHETIC_ONLY audience ${label}: case-scoped fictional participant`, "utf8"),
  };
}

function reconstruction(label = "a") {
  return {
    promiseRefCommitment: sha(`synthetic:${label}:promise`),
    attemptRefCommitment: sha(`synthetic:${label}:attempt`),
    observationRefCommitment: sha(`synthetic:${label}:observation`),
    unresolvedRefCommitment: sha(`synthetic:${label}:unresolved`),
  };
}

function fixture(label = "a", kind = "EVIDENCE_REQUEST") {
  const sourceBytes = syntheticSources(label);
  const exactReconstruction = reconstruction(label);
  return {
    recordedAt: "2026-09-01T01:00:00.000Z",
    retentionSeconds: 86_400,
    caseBinding: {
      caseScopedAlias: `case_${sha(`synthetic:${label}:case-alias`).slice(7, 39)}`,
      caseRecordHash: sha(sourceBytes.caseRecord),
      workOrderHash: sha(`synthetic:${label}:work-order`),
      episodeHash: sha(`synthetic:${label}:episode`),
      attemptSetCompositionHash: sha(`synthetic:${label}:attempt-set`),
      reconstructionHash: domainHash(
        "outsider.autonomous-work-order.dispute-review-reconstruction.v1",
        exactReconstruction),
      reviewPacketHash: sha(sourceBytes.reviewPacket),
      purposeHash: sha(sourceBytes.purpose),
      audienceHash: sha(sourceBytes.audience),
    },
    caseScopedParticipantAlias:
      `participant_${sha(`synthetic:${label}:participant`).slice(7, 39)}`,
    reconstruction: exactReconstruction,
    sourceBytes,
    question: kind === "EVIDENCE_REQUEST" ? {
      kind,
      prompt:
        "Would the exact requested observation change the committed decision from before to changed?",
      decisionPointRefCommitment: sha(`synthetic:${label}:decision-point`),
      beforeRefCommitment: sha(`synthetic:${label}:before`),
      changedRefCommitment: sha(`synthetic:${label}:changed`),
      triggeringComponents: ["ATTEMPT", "OBSERVATION"],
      requestedEvidenceRefCommitment: sha(`synthetic:${label}:requested-evidence`),
      disputeDispositionRefCommitment: null,
      responseProtocol: "YES_NO_UNSURE_DECLINE_V1",
    } : {
      kind,
      prompt:
        "Would this exact reconstruction change the committed dispute disposition from before to changed?",
      decisionPointRefCommitment: sha(`synthetic:${label}:decision-point`),
      beforeRefCommitment: sha(`synthetic:${label}:before`),
      changedRefCommitment: sha(`synthetic:${label}:changed`),
      triggeringComponents: ["ATTEMPT", "OBSERVATION", "UNRESOLVED"],
      requestedEvidenceRefCommitment: null,
      disputeDispositionRefCommitment: sha(`synthetic:${label}:disposition`),
      responseProtocol: "YES_NO_UNSURE_DECLINE_V1",
    },
  };
}

function privateRoot(t) {
  const created = mkdtempSync(path.join(os.tmpdir(), "outsider-invitation-v1-"));
  const root = realpathSync(created);
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("boundary hard-disables raw persistence until retention and purge lifecycle exist",
  () => {
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_QUESTION_KINDS,
      ["EVIDENCE_REQUEST", "DISPUTE_DISPOSITION"]);
    assert.deepEqual(
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS,
      ["ATTEMPT", "OBSERVATION", "PROMISE", "UNRESOLVED"]);
    const boundary
      = AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY;
    assert.equal(boundary.rawPrivatePublicationIntegrated, false);
    assert.equal(boundary.rawPrivatePublicationHardDisabledBeforeInputOrPathAccess,
      true);
    assert.equal(boundary.rawPrivateVerificationIntegrated, false);
    assert.equal(boundary.rawPrivateVerificationHardDisabledBeforeInputOrPathAccess,
      true);
    assert.equal(
      boundary.retentionAndPurgeLifecycleRequiredBeforeRawPersistenceCanBeEnabled,
      true);
    assert.equal(boundary.pureInMemoryDerivationAvailable, true);
    assert.equal(boundary.processLocalChallengeCollisionRejected, false);
    assert.equal(boundary.processLocalChallengeCollisionTrackingIntegrated, false);
    assert.equal(boundary.inputNormalizedBeforeChallengeOrKeyGeneration, true);
    assert.equal(boundary.createsDisputeReviewInvitationOccurrence, false);
    assert.equal(boundary.stage1EngineeringIntegrationReceiptReplayed, false);
    assert.equal(boundary.stage1EngineeringGatePassed, false);
    assert.equal(boundary.stage1Complete, false);
    assert.equal(boundary.stage2Permitted, false);
    assert.equal(boundary.sourceReplayVerified, false);
    assert.equal(boundary.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(boundary.directParticipantConfirmationEstablished, false);
    assert.equal(boundary.networkOrderEstablished, false);
    assert.equal(boundary.callerBindingsOnly, true);
    assert.equal(boundary.eligibleForContact, false);
    assert.equal(boundary.sendableInvitationMaterialAvailable, false);
    assert.equal(boundary.challengeEchoCanBeRequestedFromThisDerivedObject, false);
    assert.equal(boundary.contactPerformed, false);
    assert.equal(boundary.outboundCapability, false);
    assert.equal(boundary.stage1ExternalFactGateSatisfied, false);
    assert.equal(boundary.authority, "NONE");
  });

test("pure synthetic EVIDENCE_REQUEST derives exact delta and explicit YES/NO protocol in memory",
  () => {
    const result = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
      fixture("evidence-request"));
    assert.equal(result.schema,
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .inMemoryDerivation);
    assert.equal(result.privatePacket.question.kind, "EVIDENCE_REQUEST");
    assert.notEqual(result.privatePacket.question.beforeRefCommitment,
      result.privatePacket.question.changedRefCommitment);
    assert.deepEqual(result.privatePacket.question.triggeringComponents,
      ["ATTEMPT", "OBSERVATION"]);
    assert.equal(result.privatePacket.question.responseProtocol,
      "YES_NO_UNSURE_DECLINE_V1");
    assert.deepEqual(result.privatePacket.question.responseChoices,
      ["YES", "NO", "UNSURE", "DECLINE"]);
    assert.equal(
      result.privatePacket.question
        .yesMeansExactChangedReferenceWouldReplaceBeforeAtDecisionPoint,
      true);
    assert.equal(
      result.privatePacket.question
        .noMeansExactChangedReferenceWouldNotReplaceBeforeAtDecisionPoint,
      true);
    assert.equal(result.privatePacket.question.actualCaseDeltaTruthOrCausalityVerified,
      false);
    assert.equal(result.privatePacket.challenge.processLocalCollisionRejected, false);
    assert.equal(result.challengeControl.inputNormalizedBeforeChallengeOrKeyGeneration,
      true);
    assert.equal(result.inMemoryControlVerification
      .inMemoryDerivationControlSignatureVerified, true);
    assert.equal(result.inMemoryControlVerification.signatureProvesControlOnly, true);
    assert.equal(result.inMemoryControlVerification.signerLegalIdentityVerified, false);
    assert.equal(result.inMemoryControlVerification.participantStandingVerified, false);
    assert.equal(result.persistence.directoryOrFileCreated, false);
    assert.equal(result.persistence.retentionPermissionCurrent, false);
    assert.equal(result.persistence.automaticPurgeIntegrated, false);
    assert.equal(result.stage1EngineeringIntegrationReceiptReplayed, false);
    assert.equal(result.stage1EngineeringGatePassed, false);
    assert.equal(result.stage1Complete, false);
    assert.equal(result.stage2Permitted, false);
    assert.equal(result.sourceReplayVerified, false);
    assert.equal(result.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(result.directParticipantConfirmationEstablished, false);
    assert.equal(result.networkOrderEstablished, false);
    assert.equal(result.callerBindingsOnly, true);
    assert.equal(result.eligibleForContact, false);
    assert.equal(result.sendableInvitationMaterialAvailable, false);
    assert.equal(result.challengeEchoCanBeRequestedFromThisDerivedObject, false);
    assert.equal(result.privatePacket.stage1EngineeringIntegrationReceiptReplayed,
      false);
    assert.equal(result.privatePacket.stage1EngineeringGatePassed, false);
    assert.equal(result.privatePacket.stage1Complete, false);
    assert.equal(result.privatePacket.stage2Permitted, false);
    assert.equal(result.privatePacket.sourceReplayVerified, false);
    assert.equal(result.privatePacket.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(result.privatePacket.directParticipantConfirmationEstablished,
      false);
    assert.equal(result.privatePacket.networkOrderEstablished, false);
    assert.equal(result.privatePacket.callerBindingsOnly, true);
    assert.equal(result.privatePacket.eligibleForContact, false);
    assert.equal(result.privatePacket.sendableInvitationMaterialAvailable, false);
    assert.equal(
      result.privatePacket.challengeEchoCanBeRequestedFromThisDerivedObject,
      false);
    assert.equal(result.contactPerformed, false);
    assert.equal(result.outboundCapability, false);
    assert.equal(result.stage1ExternalFactGateSatisfied, false);
  });

test("network-safe projection leaks no private bytes, provider reference, raw hash, or path",
  () => {
    const projection
      = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        fixture("projection-safety")).networkSafeProjection;
    const serialized = JSON.stringify(projection);
    assert.equal(projection.delivery.state, "NOT_SENT");
    assert.equal(projection.delivery.contactPerformed, false);
    assert.equal(projection.delivery.outboundCapability, false);
    assert.equal(projection.challenge.nonceBits, 256);
    assert.equal(projection.challenge.globalFreshnessEstablished, false);
    assert.equal(projection.challenge.processLocalCollisionRejected, false);
    assert.equal(projection.localControl.provesLegalPerson, false);
    assert.equal(projection.localControl.provesParticipantStanding, false);
    assert.equal(projection.binding.caseScopedAliasesProjected, false);
    assert.equal(projection.binding.aliasSourceDerivationVerified, false);
    assert.equal(projection.binding.aliasUnlinkabilityVerified, false);
    assert.equal(projection.gate.stage1EngineeringIntegrationReceiptReplayed,
      false);
    assert.equal(projection.gate.stage1EngineeringGatePassed, false);
    assert.equal(projection.gate.stage1Complete, false);
    assert.equal(projection.gate.stage2Permitted, false);
    assert.equal(projection.gate.sourceReplayVerified, false);
    assert.equal(projection.gate.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(projection.gate.directParticipantConfirmationEstablished, false);
    assert.equal(projection.gate.networkOrderEstablished, false);
    assert.equal(projection.gate.callerBindingsOnly, true);
    assert.equal(projection.gate.eligibleForContact, false);
    assert.equal(projection.gate.sendableInvitationMaterialAvailable, false);
    assert.equal(
      projection.gate.challengeEchoCanBeRequestedFromThisDerivedObject,
      false);
    assert.doesNotMatch(serialized, /https?:\/\/|www\.|@/iu);
    assert.doesNotMatch(serialized, /(?:^|[^-])sha256:/u);
    assert.doesNotMatch(serialized,
      /"(?:login|id|node_id|url|path|file|filename|pii)"/iu);
    for (const forbidden of ["SYNTHETIC_ONLY", "Would the exact requested",
      "case_", "participant_", ".bytes", ".json", ".spki"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

test("separate in-memory derivations receive distinct 256-bit challenge commitments",
  () => {
    const first = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
      fixture("fresh"));
    const second = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
      fixture("fresh"));
    assert.notEqual(first.networkSafeProjection.challenge.challengeCommitment,
      second.networkSafeProjection.challenge.challengeCommitment);
    assert.equal(first.challengeControl.nonceBits, 256);
    assert.equal(first.challengeControl.nonceReturnedOrPersisted, false);
    assert.equal(first.challengeControl.processLocalCollisionRejected, false);
    assert.equal(first.challengeControl.crossProcessOrGlobalFreshnessEstablished,
      false);
    assert.equal(second.challengeControl.nonceReturnedOrPersisted, false);
  });

test("DISPUTE_DISPOSITION and material-delta fields fail closed on shape ambiguity",
  () => {
    const valid = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
      fixture("disposition", "DISPUTE_DISPOSITION"));
    assert.equal(valid.privatePacket.question.kind, "DISPUTE_DISPOSITION");
    assert.equal(valid.privatePacket.question.responseProtocol,
      "YES_NO_UNSURE_DECLINE_V1");

    const extraEvidence = fixture("extra-evidence", "DISPUTE_DISPOSITION");
    extraEvidence.question.requestedEvidenceRefCommitment = sha("forbidden-extra-ref");
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(extraEvidence),
    /DISPUTE_DISPOSITION_EXACT_REFERENCE_SHAPE_REQUIRED/u);

    const noDelta = fixture("no-delta");
    noDelta.question.changedRefCommitment = noDelta.question.beforeRefCommitment;
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(noDelta),
    /QUESTION_BEFORE_AND_CHANGED_REFERENCES_MUST_DIFFER/u);

    const ambiguousComponents = fixture("ambiguous-components");
    ambiguousComponents.question.triggeringComponents = ["OBSERVATION", "ATTEMPT"];
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        ambiguousComponents),
    /QUESTION_TRIGGERING_COMPONENTS_ORDER_OR_DUPLICATE_INVALID/u);

    const vagueProtocol = fixture("vague-protocol");
    vagueProtocol.question.responseProtocol = "FREE_TEXT";
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(vagueProtocol),
    /QUESTION_RESPONSE_PROTOCOL_INVALID/u);
  });

test("exact source, prompt, and caller-only alias constraints are explicit", () => {
  const wrongPacket = fixture("wrong-review");
  wrongPacket.caseBinding.reviewPacketHash = sha("not-the-review-packet");
  assert.throws(() =>
    deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(wrongPacket),
  /REVIEW_PACKET_EXACT_BYTES_MISMATCH/u);

  const vague = fixture("vague");
  vague.question.prompt = "Please review";
  assert.throws(() =>
    deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(vague),
  /QUESTION_PROMPT_INVALID/u);

  const invalidAlias = fixture("invalid-alias");
  invalidAlias.caseScopedParticipantAlias = "real-account-login";
  assert.throws(() =>
    deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(invalidAlias),
  /CASE_SCOPED_PARTICIPANT_ALIAS_INVALID/u);

  const valid = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
    fixture("alias-boundary"));
  assert.equal(valid.privatePacket.aliasBoundary.aliasesCallerSuppliedRegexOnly,
    true);
  assert.equal(valid.privatePacket.aliasBoundary.aliasSourceDerivationVerified,
    false);
  assert.equal(valid.privatePacket.aliasBoundary.aliasUnlinkabilityVerified, false);
  assert.equal(valid.privatePacket.aliasBoundary
    .aliasEstablishesActorEpisodeOrLegalIdentity, false);
});

test("tree budgets reject oversized strings, arrays, and top-level keys before canonicalization",
  () => {
    const oversizedString = fixture("oversized-string");
    oversizedString.question.prompt = `${"x".repeat(65_536)}?`;
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        oversizedString),
    /VALUE_STRING_BYTES_EXCEEDED/u);

    const oversizedArray = fixture("oversized-array");
    oversizedArray.question.triggeringComponents = new Array(4_097).fill("ATTEMPT");
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        oversizedArray),
    /VALUE_ARRAY_LENGTH_EXCEEDED/u);

    const tooManyTopLevelKeys = {};
    for (let index = 0; index < 65; index += 1) {
      tooManyTopLevelKeys[`field_${index}`] = index;
    }
    let poisonAccessorRead = false;
    Object.defineProperty(tooManyTopLevelKeys, "poison", {
      enumerable: true,
      get() {
        poisonAccessorRead = true;
        throw new Error("DESCRIPTORS_OR_CANONICALIZATION_RAN_BEFORE_KEY_BUDGET");
      },
    });
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        tooManyTopLevelKeys),
    /VALUE_TOP_LEVEL_KEYS_EXCEEDED/u);
    assert.equal(poisonAccessorRead, false);
  });

test("source buffers require exact Buffer prototype, intrinsic size, and only indexed own keys",
  () => {
    const ownLength = fixture("buffer-own-length");
    Object.defineProperty(ownLength.sourceBytes.caseRecord, "length", {
      value: ownLength.sourceBytes.caseRecord.length,
      enumerable: true,
      configurable: true,
    });
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(ownLength),
    /VALUE_BUFFER_EXACT_BUFFER_REQUIRED/u);

    const extraOwnKey = fixture("buffer-extra-key");
    extraOwnKey.sourceBytes.caseRecord.extra = true;
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(extraOwnKey),
    /VALUE_BUFFER_OWN_KEYS_INVALID/u);

    const wrongPrototype = fixture("buffer-prototype");
    Object.setPrototypeOf(wrongPrototype.sourceBytes.caseRecord,
      Uint8Array.prototype);
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(wrongPrototype),
    /SOURCE_CASERECORD_EXACT_BUFFER_REQUIRED/u);

    const oversized = fixture("buffer-oversized");
    oversized.sourceBytes.caseRecord = Buffer.alloc(32 * 1024 + 1, 0x61);
    assert.throws(() =>
      deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(oversized),
    /VALUE_BUFFER_TYPED_ARRAY_SIZE_INVALID/u);
  });

test("captured TypedArray size getters ignore later Buffer prototype length poisoning",
  () => {
    const prior = Object.getOwnPropertyDescriptor(Buffer.prototype, "length");
    Object.defineProperty(Buffer.prototype, "length", {
      configurable: true,
      get() { throw new Error("LIVE_BUFFER_LENGTH_DISPATCH_USED"); },
    });
    try {
      const derived = deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        fixture("captured-buffer-length"));
      assert.equal(derived.persistence.directoryOrFileCreated, false);
      assert.equal(derived.challengeControl.processLocalCollisionRejected, false);
    } finally {
      if (prior === undefined) Reflect.deleteProperty(Buffer.prototype, "length");
      else Object.defineProperty(Buffer.prototype, "length", prior);
    }
  });

test("raw publisher and verifier stop before input or path access and create nothing",
  (t) => {
    const poison = new Proxy({}, {
      get() { throw new Error("POISON_WAS_ACCESSED"); },
      ownKeys() { throw new Error("POISON_WAS_ACCESSED"); },
    });
    assert.throws(() =>
      publishAutonomousWorkOrderDirectParticipantInvitationPacketV1(poison, poison),
    /RAW_PUBLICATION_HARD_DISABLED_PENDING_RETENTION_AND_PURGE_LIFECYCLE/u);
    const hardDisabled =
      verifyAutonomousWorkOrderDirectParticipantInvitationPacketV1(poison, poison);
    assert.equal(hardDisabled.ok, false);
    assert.match(hardDisabled.error,
      /RAW_VERIFICATION_HARD_DISABLED_PENDING_RETENTION_AND_PURGE_LIFECYCLE/u);
    assert.equal(hardDisabled.stage1EngineeringGatePassed, false);
    assert.equal(hardDisabled.stage1Complete, false);
    assert.equal(hardDisabled.stage2Permitted, false);
    assert.equal(hardDisabled.sourceReplayVerified, false);
    assert.equal(hardDisabled.rightsPrivacyAdjudicationEstablished, false);
    assert.equal(hardDisabled.directParticipantConfirmationEstablished, false);
    assert.equal(hardDisabled.networkOrderEstablished, false);

    const root = privateRoot(t);
    const directory = path.join(root,
      `invitation_${sha("must-not-exist").slice(7, 39)}`);
    assert.throws(() =>
      publishAutonomousWorkOrderDirectParticipantInvitationPacketV1(
        fixture("must-not-persist"), {
          trustedRoot: root,
          outputDirectory: directory,
        }), /RAW_PUBLICATION_HARD_DISABLED_PENDING_RETENTION_AND_PURGE_LIFECYCLE/u);
    assert.equal(existsSync(directory), false);
  });
