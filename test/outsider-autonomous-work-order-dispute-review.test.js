import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY,
  createAutonomousWorkOrderDisputeReviewLedger,
  verifyAutonomousWorkOrderDisputeReviewAgainstTrustedSources,
  verifyAutonomousWorkOrderDisputeReviewLedger,
} from "../src/outsider-autonomous-work-order-dispute-review.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function reconstruction(label = "base") {
  return {
    promiseRefCommitment: h(`${label}:promise`),
    attemptRefCommitment: h(`${label}:attempt`),
    observationRefCommitment: h(`${label}:observation`),
    unresolvedRefCommitment: h(`${label}:unresolved`),
  };
}

function reconstructionHash(value) {
  return domainHash("outsider.autonomous-work-order.dispute-review-reconstruction.v1",
    value);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function delta(label = "evidence") {
  return {
    changeKind: "EVIDENCE_REQUEST",
    decisionPointRefCommitment: h(`${label}:decision-point`),
    beforeRefCommitment: h(`${label}:before`),
    changedRefCommitment: h(`${label}:changed`),
    triggeringComponents: ["ATTEMPT", "OBSERVATION"],
  };
}

function row({ ordinal, kind, participant = "a", target = null, challenge = "a",
  verdict = null, materialDelta = null, correction = null, object = null,
  reviewPacketHash = h("review-packet"),
  reconstructionHashValue = reconstructionHash(reconstruction()) }) {
  const sourced = kind === "RESPONSE" || kind === "WITHDRAWAL" || kind === "RETRACTION";
  return {
    occurrenceOrdinal: ordinal,
    occurredAt: `2026-08-31T00:00:0${ordinal}.000Z`,
    occurrenceIdentityHash: h(`occurrence:${ordinal}:${kind}:${participant}`),
    suppliedPrivateObjectCommitmentHash: object ?? h(`private-object:${ordinal}`),
    caseScopedParticipantAlias:
      `participant_${h(`case-salt:participant:${participant}`).slice(7, 39)}`,
    reviewPacketHash,
    reconstructionHash: reconstructionHashValue,
    kind,
    respondsToOccurrenceIdentityHash: target,
    challengeNonceCommitmentHash: h(`challenge:${challenge}`),
    responseVerdict: verdict,
    sourceChannelContinuityCommitmentHash: sourced ? h(`channel:${participant}:${ordinal}`) : null,
    directParticipationLinkCommitmentHash: sourced
      ? h(`participation:${participant}:${ordinal}`) : null,
    materialDelta,
    materialCorrectionCommitmentHash: correction,
  };
}

function input(reviewOccurrences, revision = 0, predecessor = null, overrides = {}) {
  const reconstructionRecord = overrides.reconstruction ?? reconstruction();
  const reviewPacketHash = overrides.reviewPacketHash ?? h("review-packet");
  return {
    recordedAt: `2026-08-31T00:01:0${revision}.000Z`,
    caseBinding: {
      caseScopedAlias: `case_${h("case").slice(7, 39)}`,
      privateBundleRootCommitment: h(`salted-private-bundle-root:${revision}`),
      workOrderHash: h("work-order"),
      episodeHash: h("episode"),
      attemptSetCompositionHash: h("attempt-set"),
      reconstructionHash: reconstructionHash(reconstructionRecord),
      reviewPacketHash,
      purposeHash: h("purpose"),
      audienceHash: h("audience"),
      rightsReviewRootCommitment: h("rights-root"),
      privacyReviewRootCommitment: h("privacy-root"),
    },
    reconstruction: reconstructionRecord,
    appendOnlyLineage: {
      revision,
      predecessorLedgerHash: predecessor?.ledgerHash ?? null,
      supersedesLedgerHash: predecessor?.ledgerHash ?? null,
      revisionBasisKind: overrides.revisionBasisKind
        ?? (revision === 0 ? "GENESIS" : "OCCURRENCE_APPEND_ONLY"),
      revisionBasisCommitmentHash: overrides.revisionBasisCommitmentHash ?? null,
    },
    reviewOccurrences,
  };
}

function positiveGenesis() {
  const invitation = row({ ordinal: 1, kind: "INVITATION" });
  const response = row({
    ordinal: 2,
    kind: "RESPONSE",
    target: invitation.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED",
    materialDelta: delta(),
  });
  return createAutonomousWorkOrderDisputeReviewLedger(input([invitation, response]));
}

function occurrenceInputsFromLedger(ledger) {
  return ledger.reviewOccurrences.map((entry) => ({
    occurrenceOrdinal: entry.occurrenceOrdinal,
    occurredAt: entry.occurredAt,
    occurrenceIdentityHash: entry.occurrenceIdentityHash,
    suppliedPrivateObjectCommitmentHash: entry.suppliedPrivateObjectCommitmentHash,
    caseScopedParticipantAlias: entry.caseScopedParticipantAlias,
    reviewPacketHash: entry.reviewPacketHash,
    reconstructionHash: entry.reconstructionHash,
    kind: entry.kind,
    respondsToOccurrenceIdentityHash: entry.respondsToOccurrenceIdentityHash,
    challengeNonceCommitmentHash: entry.challengeNonceCommitmentHash,
    responseVerdict: entry.responseVerdict,
    sourceChannelContinuityCommitmentHash: entry.sourceChannelContinuityCommitmentHash,
    directParticipationLinkCommitmentHash: entry.directParticipationLinkCommitmentHash,
    materialDelta: entry.materialDelta === null ? null : {
      changeKind: entry.materialDelta.changeKind,
      decisionPointRefCommitment: entry.materialDelta.decisionPointRefCommitment,
      beforeRefCommitment: entry.materialDelta.beforeRefCommitment,
      changedRefCommitment: entry.materialDelta.changedRefCommitment,
      triggeringComponents: [...entry.materialDelta.triggeringComponents],
    },
    materialCorrectionCommitmentHash: entry.materialCorrectionCommitmentHash,
  }));
}

function activeCorrectionBasisRoot(ledger) {
  const invalidated = new Set(ledger.reviewOccurrences
    .filter((entry) => entry.kind === "WITHDRAWAL" || entry.kind === "RETRACTION")
    .map((entry) => entry.respondsToOccurrenceIdentityHash));
  const activeCorrections = ledger.reviewOccurrences
    .filter((entry) => entry.kind === "RESPONSE"
      && entry.responseVerdict === "MATERIAL_CORRECTIONS_REQUIRED"
      && entry.reviewPacketHash === ledger.caseBinding.reviewPacketHash
      && entry.reconstructionHash === ledger.caseBinding.reconstructionHash
      && !entry.responseArrivedAfterTimeout
      && !invalidated.has(entry.occurrenceIdentityHash))
    .map((entry) => ({
      occurrenceIdentityHash: entry.occurrenceIdentityHash,
      materialCorrectionCommitmentHash: entry.materialCorrectionCommitmentHash,
    }));
  return activeCorrections.length === 0 ? null : domainHash(
    "outsider.autonomous-work-order.dispute-review-active-correction-set.v1",
    { activeCorrections });
}

test("records a specific material response but keeps the external fact gate NOT_INTEGRATED", () => {
  const ledger = positiveGenesis();
  const checked = verifyAutonomousWorkOrderDisputeReviewLedger(ledger, {
    predecessor: null,
    expectedLedgerHash: ledger.ledgerHash,
    expectedPredecessorLedgerHash: null,
    allowUnreplayedDescendantAsSuppliedPredecessor: false,
  });
  assert.equal(checked.ok, true);
  assert.equal(ledger.reviewOccurrenceCensus.reviewOccurrenceCount, 2);
  assert.equal(ledger.reviewOccurrenceCensus.countsByVerdict.YES_WOULD_HAVE_CHANGED, 1);
  assert.equal(ledger.currentCandidateState.activePositiveMaterialResponseStructurallyPresent,
    true);
  assert.equal(ledger.currentCandidateState.actualHumanResponseEstablished, false);
  assert.equal(checked.stage1ExternalFactGateSatisfied, false);
  assert.equal(ledger.authority, "NONE");
  assert.equal(ledger.actionReady, false);
  assert.deepEqual(ledger.boundary, AUTONOMOUS_WORK_ORDER_DISPUTE_REVIEW_BOUNDARY);
});

test("keeps invitations, YES, NO, timeout and withdrawal occurrences separate from object equality", () => {
  const repeatedObject = h("same-private-object-commitment");
  const inviteA = row({ ordinal: 1, kind: "INVITATION", object: repeatedObject });
  const yesA = row({
    ordinal: 2, kind: "RESPONSE", target: inviteA.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED", materialDelta: delta("yes"), object: repeatedObject,
  });
  const inviteB = row({ ordinal: 3, kind: "INVITATION", participant: "b", challenge: "b" });
  const noB = row({
    ordinal: 4, kind: "RESPONSE", participant: "b", challenge: "b",
    target: inviteB.occurrenceIdentityHash, verdict: "NO_WOULD_NOT_HAVE_CHANGED",
  });
  const inviteC = row({ ordinal: 5, kind: "INVITATION", participant: "c", challenge: "c" });
  const timeoutC = row({
    ordinal: 6, kind: "TIMEOUT", participant: "c", challenge: "c",
    target: inviteC.occurrenceIdentityHash,
  });
  const withdrawalA = row({
    ordinal: 7, kind: "WITHDRAWAL", target: yesA.occurrenceIdentityHash,
  });
  const ledger = createAutonomousWorkOrderDisputeReviewLedger(input([
    inviteA, yesA, inviteB, noB, inviteC, timeoutC, withdrawalA,
  ]));
  assert.equal(ledger.reviewOccurrenceCensus.reviewOccurrenceCount, 7);
  assert.equal(ledger.reviewOccurrenceCensus.countsByKind.INVITATION, 3);
  assert.equal(ledger.reviewOccurrenceCensus.countsByKind.RESPONSE, 2);
  assert.equal(ledger.reviewOccurrenceCensus.countsByKind.TIMEOUT, 1);
  assert.equal(ledger.reviewOccurrenceCensus.countsByKind.WITHDRAWAL, 1);
  assert.equal(ledger.reviewOccurrenceCensus.countsByVerdict.YES_WOULD_HAVE_CHANGED, 1);
  assert.equal(ledger.reviewOccurrenceCensus.countsByVerdict.NO_WOULD_NOT_HAVE_CHANGED, 1);
  assert.equal(ledger.currentCandidateState.activePositiveMaterialResponseOccurrenceCount, 0);
  assert.equal(ledger.suppliedPrivateObjectCommitmentEqualityView
    .duplicateHashReviewOccurrenceCount, 1);
  assert.equal(ledger.suppliedPrivateObjectCommitmentEqualityView
    .objectHashEqualityCanReduceOccurrenceDenominator, false);
});

test("positive materiality requires one concrete changed evidence request or disposition", () => {
  const invite = row({ ordinal: 1, kind: "INVITATION" });
  const praise = row({
    ordinal: 2, kind: "RESPONSE", target: invite.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED", materialDelta: null,
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(input([invite, praise])),
    /POSITIVE_RESPONSE_REQUIRES_EXACT_MATERIAL_DELTA/u);

  const sameRefs = delta();
  sameRefs.changedRefCommitment = sameRefs.beforeRefCommitment;
  const circular = row({
    ordinal: 2, kind: "RESPONSE", target: invite.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED", materialDelta: sameRefs,
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(input([invite, circular])),
    /BEFORE_AND_CHANGED_MUST_DIFFER/u);

  const generic = row({
    ordinal: 2, kind: "RESPONSE", target: invite.occurrenceIdentityHash,
    verdict: "UNSURE", materialDelta: delta("not-allowed"),
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(input([invite, generic])),
    /NONPOSITIVE_RESPONSE_MUST_NOT_CARRY_MATERIAL_DELTA/u);
});

test("each invitation challenge is unique and single-use", () => {
  const invite = row({ ordinal: 1, kind: "INVITATION" });
  const first = row({
    ordinal: 2, kind: "RESPONSE", target: invite.occurrenceIdentityHash,
    verdict: "UNSURE",
  });
  const second = row({
    ordinal: 3, kind: "RESPONSE", target: invite.occurrenceIdentityHash,
    verdict: "NO_WOULD_NOT_HAVE_CHANGED",
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(
    input([invite, first, second])), /RESPONSE_ALREADY_RECORDED/u);

  const reused = row({
    ordinal: 2, kind: "INVITATION", participant: "b", challenge: "a",
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(input([invite, reused])),
    /CHALLENGE_COMMITMENT_REUSED/u);
});

test("append-only descendants retain the supplied prefix while forks and full ancestry stay unproven", () => {
  const predecessor = positiveGenesis();
  const occurrences = occurrenceInputsFromLedger(predecessor);
  occurrences.push(row({
    ordinal: 3, kind: "RETRACTION",
    target: predecessor.reviewOccurrences[1].occurrenceIdentityHash,
  }));
  const descendant = createAutonomousWorkOrderDisputeReviewLedger(
    input(occurrences, 1, predecessor), { predecessor });
  const checked = verifyAutonomousWorkOrderDisputeReviewLedger(descendant, {
    predecessor,
    expectedLedgerHash: descendant.ledgerHash,
    expectedPredecessorLedgerHash: predecessor.ledgerHash,
    allowUnreplayedDescendantAsSuppliedPredecessor: false,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.suppliedImmediatePrefixVerified, true);
  assert.equal(checked.fullAncestryReplayVerified, false);
  assert.equal(descendant.currentCandidateState.activePositiveMaterialResponseOccurrenceCount, 0);
  assert.equal(descendant.boundary.parallelGenesisExclusionEstablished, false);
  assert.equal(descendant.boundary.forkExclusionEstablished, false);

  const omitted = copy(input(occurrences.slice(1), 1, predecessor));
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(omitted, { predecessor }),
    /ORDINAL|PREFIX/u);

  const reusedPrivateRoot = input(occurrences, 1, predecessor);
  reusedPrivateRoot.caseBinding.privateBundleRootCommitment
    = predecessor.caseBinding.privateBundleRootCommitment;
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(
    reusedPrivateRoot, { predecessor }), /PRIVATE_BUNDLE_ROOT_MUST_ADVANCE/u);

  const regressedTime = input(occurrences, 1, predecessor);
  regressedTime.recordedAt = "2026-08-31T00:00:59.000Z";
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(
    regressedTime, { predecessor }), /DESCENDANT_RECORDED_AT_REGRESSION/u);

  const reconstructionSplice = input([row({ ordinal: 1, kind: "INVITATION" })]);
  reconstructionSplice.caseBinding.reconstructionHash = h("foreign-reconstruction");
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(reconstructionSplice),
    /RECONSTRUCTION_HASH_CROSSWALK_MISMATCH/u);
});

test("material corrections require a linked reconstruction and packet descendant", () => {
  const invitation = row({ ordinal: 1, kind: "INVITATION" });
  const correction = row({
    ordinal: 2, kind: "RESPONSE", target: invitation.occurrenceIdentityHash,
    verdict: "MATERIAL_CORRECTIONS_REQUIRED", correction: h("correction-details"),
  });
  const predecessor = createAutonomousWorkOrderDisputeReviewLedger(
    input([invitation, correction]));
  assert.equal(predecessor.currentCandidateState
    .activeMaterialCorrectionsRequiredOccurrenceCount, 1);

  const correctedReconstruction = reconstruction("corrected");
  const correctedReconstructionHash = reconstructionHash(correctedReconstruction);
  const correctedPacketHash = h("review-packet:corrected");
  const occurrences = occurrenceInputsFromLedger(predecessor);
  occurrences.push(row({
    ordinal: 3,
    kind: "INVITATION",
    challenge: "corrected",
    reviewPacketHash: correctedPacketHash,
    reconstructionHashValue: correctedReconstructionHash,
  }));
  const descendant = createAutonomousWorkOrderDisputeReviewLedger(
    input(occurrences, 1, predecessor, {
      reconstruction: correctedReconstruction,
      reviewPacketHash: correctedPacketHash,
      revisionBasisKind: "PARTICIPANT_CORRECTION",
      revisionBasisCommitmentHash: activeCorrectionBasisRoot(predecessor),
    }), { predecessor });
  assert.equal(descendant.appendOnlyLineage.predecessorLedgerHash,
    predecessor.ledgerHash);
  assert.equal(descendant.currentCandidateState
    .activeMaterialCorrectionsRequiredOccurrenceCount, 0);
  assert.equal(descendant.currentCandidateState.activePositiveMaterialResponseOccurrenceCount,
    0);

  const unchanged = occurrenceInputsFromLedger(predecessor);
  unchanged.push(row({ ordinal: 3, kind: "INVITATION", challenge: "unchanged" }));
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(
    input(unchanged, 1, predecessor), { predecessor }),
  /RECONSTRUCTION_SUCCESSOR_REQUIRES|APPENDED_REVIEW|ACTIVE_CORRECTION_BLOCKS/u);

  const discoveredPredecessor = positiveGenesis();
  const discoveredReconstruction = reconstruction("source-discovered");
  const discoveredReconstructionHash = reconstructionHash(discoveredReconstruction);
  const discoveredPacketHash = h("review-packet:source-discovered");
  const discoveredOccurrences = occurrenceInputsFromLedger(discoveredPredecessor);
  discoveredOccurrences.push(row({
    ordinal: 3,
    kind: "INVITATION",
    participant: "d",
    challenge: "source-discovered",
    reviewPacketHash: discoveredPacketHash,
    reconstructionHashValue: discoveredReconstructionHash,
  }));
  const discovered = createAutonomousWorkOrderDisputeReviewLedger(
    input(discoveredOccurrences, 1, discoveredPredecessor, {
      reconstruction: discoveredReconstruction,
      reviewPacketHash: discoveredPacketHash,
      revisionBasisKind: "SOURCE_DISCOVERED_CORRECTION",
      revisionBasisCommitmentHash: h("source-discovery-basis"),
    }), { predecessor: discoveredPredecessor });
  assert.equal(discovered.appendOnlyLineage.revisionBasisKind,
    "SOURCE_DISCOVERED_CORRECTION");
  assert.equal(discovered.appendOnlyLineage.revisionBasisSourceReplayVerified, false);
  assert.equal(discovered.currentCandidateState.activePositiveMaterialResponseOccurrenceCount,
    0);

  const wrongBasis = input(occurrences, 1, predecessor, {
    reconstruction: correctedReconstruction,
    reviewPacketHash: correctedPacketHash,
    revisionBasisKind: "PARTICIPANT_CORRECTION",
    revisionBasisCommitmentHash: h("wrong-correction-basis"),
  });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(
    wrongBasis, { predecessor }), /PARTICIPANT_CORRECTION_BASIS_SET/u);

  const inviteOne = row({ ordinal: 1, kind: "INVITATION", challenge: "one" });
  const correctionOne = row({
    ordinal: 2,
    kind: "RESPONSE",
    challenge: "one",
    target: inviteOne.occurrenceIdentityHash,
    verdict: "MATERIAL_CORRECTIONS_REQUIRED",
    correction: h("shared-correction-content"),
  });
  const inviteTwo = row({
    ordinal: 3, kind: "INVITATION", participant: "b", challenge: "two",
  });
  const correctionTwo = row({
    ordinal: 4,
    kind: "RESPONSE",
    participant: "b",
    challenge: "two",
    target: inviteTwo.occurrenceIdentityHash,
    verdict: "MATERIAL_CORRECTIONS_REQUIRED",
    correction: h("shared-correction-content"),
  });
  const twoCorrectionPredecessor = createAutonomousWorkOrderDisputeReviewLedger(
    input([inviteOne, correctionOne, inviteTwo, correctionTwo]));
  const twoCorrectedReconstruction = reconstruction("two-corrections");
  const twoCorrectedReconstructionHash = reconstructionHash(twoCorrectedReconstruction);
  const twoCorrectedPacketHash = h("review-packet:two-corrections");
  const twoCorrectionOccurrences = occurrenceInputsFromLedger(twoCorrectionPredecessor);
  twoCorrectionOccurrences.push(row({
    ordinal: 5,
    kind: "INVITATION",
    participant: "c",
    challenge: "two-corrections-renewed",
    reviewPacketHash: twoCorrectedPacketHash,
    reconstructionHashValue: twoCorrectedReconstructionHash,
  }));
  const oneOccurrenceOnlyBasis = domainHash(
    "outsider.autonomous-work-order.dispute-review-active-correction-set.v1", {
      activeCorrections: [{
        occurrenceIdentityHash: twoCorrectionPredecessor.reviewOccurrences[1]
          .occurrenceIdentityHash,
        materialCorrectionCommitmentHash: h("shared-correction-content"),
      }],
    });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(input(
    twoCorrectionOccurrences, 1, twoCorrectionPredecessor, {
      reconstruction: twoCorrectedReconstruction,
      reviewPacketHash: twoCorrectedPacketHash,
      revisionBasisKind: "PARTICIPANT_CORRECTION",
      revisionBasisCommitmentHash: oneOccurrenceOnlyBasis,
    }), { predecessor: twoCorrectionPredecessor }),
  /PARTICIPANT_CORRECTION_BASIS_SET/u);
  const allCorrections = createAutonomousWorkOrderDisputeReviewLedger(input(
    twoCorrectionOccurrences, 1, twoCorrectionPredecessor, {
      reconstruction: twoCorrectedReconstruction,
      reviewPacketHash: twoCorrectedPacketHash,
      revisionBasisKind: "PARTICIPANT_CORRECTION",
      revisionBasisCommitmentHash: activeCorrectionBasisRoot(twoCorrectionPredecessor),
    }), { predecessor: twoCorrectionPredecessor });
  assert.equal(allCorrections.currentCandidateState
    .activeMaterialCorrectionsRequiredOccurrenceCount, 0);
  assert.equal(allCorrections.reviewOccurrenceCensus
    .countsByVerdict.MATERIAL_CORRECTIONS_REQUIRED, 2);
});

test("a correction never drops late responses or timeouts for already-open invitations", () => {
  const inviteA = row({ ordinal: 1, kind: "INVITATION" });
  const inviteB = row({
    ordinal: 2, kind: "INVITATION", participant: "b", challenge: "b",
  });
  const correctionA = row({
    ordinal: 3,
    kind: "RESPONSE",
    target: inviteA.occurrenceIdentityHash,
    verdict: "MATERIAL_CORRECTIONS_REQUIRED",
    correction: h("correction-a"),
  });
  const predecessor = createAutonomousWorkOrderDisputeReviewLedger(
    input([inviteA, inviteB, correctionA]));

  const unchangedOccurrences = occurrenceInputsFromLedger(predecessor);
  unchangedOccurrences.push(row({
    ordinal: 4,
    kind: "TIMEOUT",
    participant: "b",
    challenge: "b",
    target: inviteB.occurrenceIdentityHash,
  }));
  const lateTimeout = createAutonomousWorkOrderDisputeReviewLedger(
    input(unchangedOccurrences, 1, predecessor), { predecessor });
  assert.equal(lateTimeout.reviewOccurrenceCensus.countsByKind.TIMEOUT, 1);
  assert.equal(lateTimeout.currentCandidateState
    .activeMaterialCorrectionsRequiredOccurrenceCount, 1);

  const lateResponseOccurrences = occurrenceInputsFromLedger(lateTimeout);
  lateResponseOccurrences.push(row({
    ordinal: 5,
    kind: "RESPONSE",
    participant: "b",
    challenge: "b",
    target: inviteB.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED",
    materialDelta: delta("late-response"),
  }));
  const lateResponse = createAutonomousWorkOrderDisputeReviewLedger(
    input(lateResponseOccurrences, 2, lateTimeout), { predecessor: lateTimeout });
  assert.equal(lateResponse.reviewOccurrenceCensus.responseAfterTimeoutOccurrenceCount, 1);
  assert.equal(lateResponse.reviewOccurrences[4].responseArrivedAfterTimeout, true);
  assert.equal(lateResponse.currentCandidateState
    .activePositiveMaterialResponseOccurrenceCount, 0);

  const correctedReconstruction = reconstruction("late-response-corrected");
  const correctedReconstructionHash = reconstructionHash(correctedReconstruction);
  const correctedPacketHash = h("review-packet:late-response-corrected");
  const correctedOccurrences = occurrenceInputsFromLedger(predecessor);
  correctedOccurrences.push(row({
    ordinal: 4,
    kind: "RESPONSE",
    participant: "b",
    challenge: "b",
    target: inviteB.occurrenceIdentityHash,
    verdict: "NO_WOULD_NOT_HAVE_CHANGED",
  }));
  correctedOccurrences.push(row({
    ordinal: 5,
    kind: "INVITATION",
    participant: "c",
    challenge: "c",
    reviewPacketHash: correctedPacketHash,
    reconstructionHashValue: correctedReconstructionHash,
  }));
  const corrected = createAutonomousWorkOrderDisputeReviewLedger(
    input(correctedOccurrences, 1, predecessor, {
      reconstruction: correctedReconstruction,
      reviewPacketHash: correctedPacketHash,
      revisionBasisKind: "PARTICIPANT_CORRECTION",
      revisionBasisCommitmentHash: activeCorrectionBasisRoot(predecessor),
    }), { predecessor });
  assert.equal(corrected.reviewOccurrenceCensus.reviewOccurrenceCount, 5);
  assert.equal(corrected.reviewOccurrenceCensus.countsByKind.RESPONSE, 2);
  assert.equal(corrected.reviewOccurrenceCensus
    .countsByVerdict.NO_WOULD_NOT_HAVE_CHANGED, 1);
  assert.equal(corrected.reviewOccurrenceCensus.countsByKind.INVITATION, 3);
  assert.equal(corrected.currentCandidateState
    .activeMaterialCorrectionsRequiredOccurrenceCount, 0);
});

test("trusted verifier can match caller pins but is structurally incapable of PASS", () => {
  const ledger = positiveGenesis();
  const checked = verifyAutonomousWorkOrderDisputeReviewAgainstTrustedSources({
    ledger,
    predecessor: null,
    expectedLedgerHash: ledger.ledgerHash,
    expectedPrivateBundleRootCommitment: ledger.caseBinding.privateBundleRootCommitment,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.structuralLedgerVerified, true);
  assert.equal(checked.callerSuppliedPinsMatched, true);
  assert.equal(checked.privateSourceBundleReplayIntegrated, false);
  assert.equal(checked.externalAccountOrChannelContinuityVerified, false);
  assert.equal(checked.directHistoricalParticipationVerified, false);
  assert.equal(checked.stage1ExternalFactGateSatisfied, false);
  assert.equal(checked.result, "TRUSTED_SOURCE_REPLAY_NOT_INTEGRATED");

  const wrong = verifyAutonomousWorkOrderDisputeReviewAgainstTrustedSources({
    ledger,
    predecessor: null,
    expectedLedgerHash: h("wrong-ledger"),
    expectedPrivateBundleRootCommitment: ledger.caseBinding.privateBundleRootCommitment,
  });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.callerSuppliedPinsMatched, false);

  const unpinned = verifyAutonomousWorkOrderDisputeReviewAgainstTrustedSources({
    ledger,
    predecessor: null,
    expectedLedgerHash: null,
    expectedPrivateBundleRootCommitment: ledger.caseBinding.privateBundleRootCommitment,
  });
  assert.equal(unpinned.ok, false);
  assert.equal(unpinned.structuralLedgerVerified, false);
  assert.equal(unpinned.callerSuppliedPinsMatched, false);
});

test("raw, public-only, identity, callback and authority-shaped extras fail closed", () => {
  const base = input([row({ ordinal: 1, kind: "INVITATION" })]);
  for (const [key, value] of [
    ["rawTranscript", "secret"],
    ["email", "person@example.com"],
    ["sourceUrl", "https://example.com"],
    ["publicKeyId", "stable-key"],
    ["fixtureIsReal", true],
    ["authority", true],
    ["callback", () => true],
  ]) {
    const candidate = { ...base, [key]: value };
    assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(candidate),
      /FIELDS_INVALID|FUNCTION|unsupported canonical value type:function/u);
  }

  const accessor = copy(base);
  Object.defineProperty(accessor, "authority", { enumerable: true, get() {
    throw new Error("getter must not run");
  } });
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(accessor),
    /ACCESSOR_FORBIDDEN/u);

  const proxy = new Proxy(base, {});
  assert.throws(() => createAutonomousWorkOrderDisputeReviewLedger(proxy),
    /PROXY_FORBIDDEN/u);

  const record = positiveGenesis();
  const verifyOptionsProxy = new Proxy({
    predecessor: null,
    expectedLedgerHash: record.ledgerHash,
    expectedPredecessorLedgerHash: null,
    allowUnreplayedDescendantAsSuppliedPredecessor: false,
  }, {});
  const rejectedOptions = verifyAutonomousWorkOrderDisputeReviewLedger(
    record, verifyOptionsProxy);
  assert.equal(rejectedOptions.ok, false);
  assert.match(rejectedOptions.error, /PROXY_FORBIDDEN/u);
});

test("captured hash intrinsics keep structural hashes stable after prototype poisoning", () => {
  const invitation = row({ ordinal: 1, kind: "INVITATION" });
  const response = row({
    ordinal: 2,
    kind: "RESPONSE",
    target: invitation.occurrenceIdentityHash,
    verdict: "YES_WOULD_HAVE_CHANGED",
    materialDelta: delta(),
  });
  const sourceInput = input([invitation, response]);
  const before = createAutonomousWorkOrderDisputeReviewLedger(sourceInput);
  const prototype = Object.getPrototypeOf(createHash("sha256"));
  const update = prototype.update;
  const digestMethod = prototype.digest;
  try {
    prototype.update = function poisonedUpdate() { return this; };
    prototype.digest = function poisonedDigest() { return "0".repeat(64); };
    const after = createAutonomousWorkOrderDisputeReviewLedger(sourceInput);
    assert.equal(after.ledgerHash, before.ledgerHash);
    assert.equal(verifyAutonomousWorkOrderDisputeReviewLedger(after, {
      predecessor: null,
      expectedLedgerHash: before.ledgerHash,
      expectedPredecessorLedgerHash: null,
      allowUnreplayedDescendantAsSuppliedPredecessor: false,
    }).ok, true);
  } finally {
    prototype.update = update;
    prototype.digest = digestMethod;
  }
});
