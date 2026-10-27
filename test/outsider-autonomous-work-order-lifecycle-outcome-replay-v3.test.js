import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS,
  createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3,
  verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3,
} from "../src/outsider-autonomous-work-order-lifecycle-outcome-replay-v3.js";
import {
  createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture,
} from "./helpers/outsider-autonomous-work-order-lifecycle-outcome-replay-v3-fixture.js";
import { stage5Hash as h } from "./helpers/outsider-network-stage5-fixture.js";

function createReceipt(fixture, input = fixture.input, context = fixture.context) {
  return createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(input, context);
}

function verifyReceipt(receipt, fixture, input = fixture.input,
  context = fixture.context) {
  return verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(receipt, {
    input, context, expectedReceiptHash: receipt.receiptHash,
  });
}

test("v3 boundary preserves every no-authority and role-separation limit", () => {
  const boundary = AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_BOUNDARY;
  assert.equal(boundary.roleAwareGovernedCertificateV2Required, true);
  assert.equal(boundary.callerExpectedCertificateHashRequired, true);
  assert.equal(boundary.callerExpectedCertificateHashIsIndependentProvenance,
    false);
  assert.equal(boundary.dualDirectoryRevisionZeroHashCrosswalkRequired, true);
  assert.equal(boundary.snapshotAndLiveDirectoryRolesMustBeDistinct, true);
  assert.equal(boundary.directoryPathsProjected, false);
  assert.equal(boundary.storageDirectoryContinuityEstablished, false);
  assert.equal(boundary.storageDurabilityEstablished, false);
  assert.equal(boundary.obligationContinuationUniquenessEstablished, false);
  assert.equal(boundary.dualDirectoryNonEquivocationEstablished, false);
  assert.equal(boundary.singleCanonicalObligationLedgerEstablished, false);
  assert.equal(boundary.affectedPartyCensusRolesCollapsed, false);
  assert.equal(boundary.preActionRootBindsObligationGenesis, true);
  assert.equal(boundary.outcomeRootRewritesObligationGenesis, false);
  assert.equal(boundary.sameAffectedPartySetEstablished, false);
  assert.equal(boundary.affectedPartyContinuityEstablished, false);
  assert.equal(boundary.outcomeRegisterSupersetEstablished, false);
  assert.equal(boundary.originalInstrumentBytesReplayed, false);
  assert.equal(boundary.originalRightsReviewBytesReplayed, false);
  assert.equal(boundary.originalPrivacyReviewBytesReplayed, false);
  assert.equal(boundary.witnessOccurrenceLifecycleMembershipVerified, false);
  assert.equal(boundary.crossRegistryOccurrenceContinuityEstablished, false);
  assert.equal(boundary.externalHeadAnchorEstablished, false);
  assert.equal(boundary.independentOutcomeTruthEstablished, false);
  assert.equal(boundary.causalAttributionEstablished, false);
  assert.equal(boundary.recoveryExternallyVerified, false);
  assert.equal(boundary.obligationClosureEstablished, false);
  assert.equal(boundary.declarationExternalSourceBytesReplayed, false);
  assert.equal(boundary.networkOrderEstablished, false);
  assert.equal(boundary.guaranteeEstablished, false);
  assert.equal(boundary.insuranceEstablished, false);
  assert.equal(boundary.settlementEnabled, false);
  assert.equal(boundary.externalContractAcceptanceEstablished, false);
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.enabledCapabilityCount, 0);
  assert.equal(boundary.provenAuthorityCount, 0);
});

test("v3 creates and verifies one role-aware lifecycle replay while remaining HOLD",
  (t) => {
    const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
    const receipt = createReceipt(fixture);
    const checked = verifyReceipt(receipt, fixture);
    assert.equal(receipt.schema,
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_SCHEMAS.receipt);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.roleAwareCertificateV2Verified, true);
    assert.equal(checked.roleAwareCertificateCallerHashPinMatched, true);
    assert.equal(checked.roleAwareCertificateCallerHashPinHasIndependentProvenance,
      false);
    assert.equal(checked.dualDirectoryRevisionZeroHashCrosswalkVerified, true);
    assert.equal(checked.storageDirectoryContinuityEstablished, false);
    assert.equal(checked.storageDurabilityEstablished, false);
    assert.equal(checked.obligationContinuationUniquenessEstablished, false);
    assert.equal(checked.dualDirectoryNonEquivocationEstablished, false);
    assert.equal(checked.singleCanonicalObligationLedgerEstablished, false);
    assert.notEqual(fixture.predecessor.semantic.directory,
      fixture.liveDirectory);
    assert.equal(fixture.predecessor.semantic.snapshot.revision, 0);
    assert.equal(fixture.liveBaseSnapshot.revision, 0);
    const obligation = receipt.obligationCrosswalk;
    assert.equal(obligation.dualDirectoryRevisionZeroHashCrosswalkVerified, true);
    assert.equal(obligation.snapshotAndLiveDirectoryRolesDistinct, true);
    assert.equal(obligation.snapshotRevisionZeroGenesisHash,
      obligation.liveBasePrefixGenesisHash);
    assert.equal(obligation.snapshotRevisionZeroStateHash,
      obligation.liveBasePrefixStateHash);
    assert.equal(obligation.directoryPathsProjected, false);
    assert.equal(obligation.storageDirectoryContinuityEstablished, false);
    assert.equal(obligation.storageDurabilityEstablished, false);
    assert.equal(obligation.obligationContinuationUniquenessEstablished, false);
    assert.equal(obligation.dualDirectoryNonEquivocationEstablished, false);
    assert.equal(obligation.singleCanonicalObligationLedgerEstablished, false);
    const roles = receipt.affectedPartyRoleCrosswalk;
    assert.notEqual(roles.preActionAffectedPartyDeclarationRootHash,
      roles.outcomeAffectedPartyRegisterRootHash);
    assert.equal(roles.preActionAffectedPartyDeclarationRootHash,
      fixture.preActionRegister.affectedPartyRootHash);
    assert.equal(roles.preActionAffectedPartyDeclarationRootHash,
      fixture.later.genesis.bindings.affectedPartyRootHash);
    assert.equal(roles.outcomeAffectedPartyRegisterRootHash,
      fixture.outcomeRegister.affectedPartyRootHash);
    assert.equal(roles.sameAffectedPartySetEstablished, false);
    assert.equal(roles.affectedPartyContinuityEstablished, false);
    assert.equal(roles.outcomeRegisterSupersetOfPreActionDeclarationEstablished,
      false);
    assert.equal(receipt.lifecycleReplay.eventCount, 2);
    assert.equal(receipt.lifecycleReplay
      .crosswalkedActionOutcomeV2ReportOccurrenceCount, 2);
    assert.equal(receipt.lifecycleReplay.crosswalkedDistinctObjectIdentityCount, 1);
    assert.equal(receipt.lifecycleReplay
      .witnessOccurrenceLifecycleMembershipVerified, false);
    assert.equal(receipt.lifecycleReplay
      .crossRegistryOccurrenceContinuityEstablished, false);
    assert.equal(receipt.sourceReviewReplay
      .sourceReviewOccurrenceIsDistinctFromWitnessOccurrence, true);
    assert.equal(receipt.sourceReviewReplay
      .sourceReviewOccurrenceCarriesSameContentAddressedPayload, true);
    assert.equal(receipt.sourceReviewReplay.originalInstrumentBytesReplayed, false);
    assert.equal(receipt.sourceReviewReplay.originalRightsReviewBytesReplayed, false);
    assert.equal(receipt.sourceReviewReplay.originalPrivacyReviewBytesReplayed, false);
    assert.equal(receipt.replayCoverage.sourceReplayVerified, false);
    assert.equal(receipt.truthAndAuthorityBoundary.independentOutcomeTruthEstablished,
      false);
    assert.equal(receipt.truthAndAuthorityBoundary.obligationClosureEstablished,
      false);
    assert.equal(receipt.decisionState, "HOLD");
    assert.equal(receipt.authority, "NONE");
    assert.equal(receipt.trainingRows, 0);
    assert.equal(receipt.causalExperienceUnits, 0);
    assert.equal(receipt.networkOrderEstablished, false);
    assert.equal(receipt.guaranteeEstablished, false);
    assert.equal(receipt.insuranceEstablished, false);
    assert.equal(receipt.settlementEnabled, false);
  });

test("v3 rejects a missing or mismatched external certificate hash pin", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  assert.throws(() => createReceipt(fixture, fixture.input, {
    ...fixture.context, expectedCertificateHash: null,
  }), /EXPECTED_CERTIFICATE_HASH_CALLER_PIN_REQUIRED/u);
  assert.throws(() => createReceipt(fixture, fixture.input, {
    ...fixture.context, expectedCertificateHash: h("stage1d:wrong-certificate"),
  }), /DELAYED_WITNESS_REPLAY_INVALID/u);
});

test("v3 rejects role-root laundering inside the certificate", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const tamperedCertificate = structuredClone(fixture.certificate);
  tamperedCertificate.affectedPartyRoleCrosswalk
    .outcomeAffectedPartyRegisterRootHash =
      tamperedCertificate.affectedPartyRoleCrosswalk
        .preActionAffectedPartyDeclarationRootHash;
  const input = { ...fixture.input, delayedWitness: {
    ...fixture.input.delayedWitness, certificate: tamperedCertificate } };
  assert.throws(() => createReceipt(fixture, input),
    /DELAYED_WITNESS_REPLAY_INVALID/u);
});

test("v3 verification does not project a private missing obligation path", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const receipt = createReceipt(fixture);
  const privateMissingDirectory =
    `${fixture.predecessor.semantic.directory}/private-missing-ledger`;
  const predecessorInput = { ...fixture.input.predecessor.input,
    completeEpisode: { ...fixture.input.predecessor.input.completeEpisode,
      input: { ...fixture.input.predecessor.input.completeEpisode.input,
        obligationPrefix: {
          ...fixture.input.predecessor.input.completeEpisode.input.obligationPrefix,
          directory: privateMissingDirectory,
        } } } };
  const predecessorContext = { ...fixture.input.predecessor.context,
    semantic: { ...fixture.input.predecessor.context.semantic,
      obligationDirectory: privateMissingDirectory } };
  const input = { ...fixture.input, predecessor: {
    ...fixture.input.predecessor, input: predecessorInput,
    context: predecessorContext } };
  const checked = verifyReceipt(receipt, fixture, input);
  assert.equal(checked.ok, false);
  assert.equal(checked.error,
    "AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V3_PREDECESSOR_REPLAY_INVALID");
  assert.equal(checked.error.includes(privateMissingDirectory), false);
  assert.equal(checked.directoryPathsProjected, false);
});

test("v3 rejects receipt time before the checkpointed source review", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const input = { ...fixture.input, recordedAt: "2026-08-28T00:12:06.000Z" };
  assert.throws(() => createReceipt(fixture, input), /RECEIPT_TIME_ORDER_INVALID/u);
});

test("v3 refuses occurrence/object crosswalk tampering", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const changedItem = structuredClone(
    fixture.input.sourceReview.input.v1ExportItem);
  changedItem.object = { ...changedItem.object,
    obligationStateHash: h("stage1d:wrong-object-state") };
  const input = { ...fixture.input, sourceReview: {
    ...fixture.input.sourceReview,
    input: { ...fixture.input.sourceReview.input, v1ExportItem: changedItem },
  } };
  assert.throws(() => createReceipt(fixture, input),
    /SOURCE_REVIEW_/u);
});

test("v3 verifier rejects any network-order or economics escalation", (t) => {
  const fixture = createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const receipt = createReceipt(fixture);
  const escalated = structuredClone(receipt);
  escalated.networkOrderEstablished = true;
  escalated.guaranteeEstablished = true;
  const checked = verifyReceipt(escalated, fixture);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /RECEIPT_STATE_INVALID/u);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.independentOutcomeTruthEstablished, false);
});
