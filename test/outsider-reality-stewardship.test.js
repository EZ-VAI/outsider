import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";

import {
  assessRealityStewardship,
  buildConsequenceState,
  createConsequenceReport,
  createRealityBoundary,
  createRealityBudgetCommitment,
  createRealityExecutionReceipt,
  createStewardshipChallenge,
  createStewardshipClaim,
  describeStewardshipGap,
  verifyConsequenceState,
  verifyConsequenceReport,
  verifyRealityBoundary,
  verifyRealityBudgetCommitment,
  verifyRealityExecutionReceipt,
  verifyRealityStewardshipAssessment,
  verifyStewardshipClaim,
} from "../src/outsider-reality-stewardship.js";

const h = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const t = (seconds) => new Date(Date.parse("2026-08-21T00:00:00.000Z")
  + seconds * 1_000).toISOString();

function partyReports(boundary, label, disposition = "OBSERVED") {
  return boundary.affectedPartyRootHashes.map((affectedPartyRootHash, index) => ({
    affectedPartyRootHash,
    reportHash: h(`${label}-${index}`),
    disposition,
  }));
}

function impactRows(boundary, label, amounts = {}) {
  return boundary.constraints.map(({ channelId }) => ({
    channelId,
    amount: amounts[channelId] ?? 0,
    measurementEvidenceHash: h(`${label}-${channelId}`),
  }));
}

function reseal(record, domain, hashField, changes) {
  const body = { ...record, ...changes };
  delete body[hashField];
  return { ...body, [hashField]: `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(body)}`).digest("hex")}` };
}

function fixture() {
  const partyA = h("affected-party-a");
  const partyB = h("affected-party-b");
  const boundary = createRealityBoundary({
    boundaryId: "shared-lab-1",
    worldHash: h("world"),
    policyHash: h("policy"),
    resourceOwnerRootHash: h("owner"),
    affectedPartyRootHashes: [partyB, partyA],
    constraints: [
      { channelId: "human-consent", kind: "HARD_PROHIBITION", unit: "violations",
        cap: 0, aggregation: "CUMULATIVE_MAX", nonCompensable: true,
        affectedPartyRootHashes: [partyA] },
      { channelId: "shared-reality-load", kind: "CUMULATIVE_CAP", unit: "impact-points",
        cap: 10, aggregation: "CUMULATIVE_MAX", nonCompensable: true,
        affectedPartyRootHashes: [partyA, partyB] },
    ],
    observationHorizons: [
      { horizonId: "immediate", closesAfterMs: 0, mandatory: true },
      { horizonId: "delayed", closesAfterMs: 1_000, mandatory: true },
    ],
    challengePolicyHash: h("challenge-policy"),
    recoveryStandardHash: h("recovery-standard"),
    validFrom: t(0),
    validUntil: t(100),
  });
  const makeClaim = ({ load = 4, represented = [partyA, partyB], purpose = "WORK",
    consentViolations = 0, compensation = null, causal = true } = {}) =>
    createStewardshipClaim({
      boundary,
      claimIdHash: h(`claim-${load}-${represented.length}-${purpose}-${consentViolations}`),
      wayHash: h("way"),
      claimantRootHash: h("claimant"),
      standingEvidenceHashes: [h("standing")],
      purpose,
      operationHashes: [h("operation")],
      representedPartyRootHashes: represented,
      requestedExternalities: [
        { channelId: "human-consent", amount: consentViolations },
        { channelId: "shared-reality-load", amount: load },
      ],
      alternativesConsideredHashes: [h("simulation-alternative")],
      whyRealityRequiredHash: purpose === "EXPERIENCE" && causal ? h("why-reality") : null,
      causalDesignHash: purpose === "EXPERIENCE" && causal ? h("causal-design") : null,
      experienceRightsHash: purpose === "EXPERIENCE" && causal ? h("rights") : null,
      optionPreservationEvidenceHashes: [h("option-preservation")],
      recoveryPlanHash: h("recovery"),
      responsibilityRootHashes: [h("principal"), h("provider")],
      compensationProposalHash: compensation,
      requestedAt: t(1),
      expiresAt: t(90),
    });
  return { boundary, partyA, partyB, makeClaim };
}

test("the missing layer is a cross-stage stewardship spine, not another scalar score", () => {
  const gap = describeStewardshipGap();
  assert.equal(gap.conclusion, "REALITY_STEWARDSHIP_IS_A_CROSS_STAGE_KERNEL_NOT_A_FINAL_STAGE");
  assert.deepEqual(Object.keys(gap.stageGaps),
    ["MEASURE", "ATTEST", "CURATE", "PRICE", "GUARANTEE", "SETTLE"]);
  assert.match(gap.missingSpines.join("\n"), /CUMULATIVE_SCARCE_REALITY/);
  assert.match(gap.missingSpines.join("\n"), /DELAYED_DISTRIBUTED_CONSEQUENCE/);
});

test("a complete local case is only structurally ready for an external ledger and owner", () => {
  const { boundary, makeClaim } = fixture();
  const claim = makeClaim();
  const assessment = assessRealityStewardship({ boundary, claim, now: t(2) });
  assert.equal(verifyRealityBoundary(boundary).ok, true);
  assert.equal(verifyStewardshipClaim(claim, { boundary }).ok, true);
  const selfCheck = verifyRealityStewardshipAssessment(assessment);
  assert.equal(selfCheck.ok, true);
  assert.equal(selfCheck.verificationLevel, "SELF_CHECK_ONLY");
  assert.equal(selfCheck.protocolInputsReplayed, false);
  assert.equal(selfCheck.sourceReverified, false);
  const replay = verifyRealityStewardshipAssessment(assessment, {
    boundary, claim, priorCommitmentEntries: [],
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "STRUCTURAL_INPUTS_REDERIVED");
  assert.equal(replay.protocolInputsReplayed, true);
  assert.equal(replay.sourceReverified, false);
  assert.equal(replay.measurementTruthExternallyVerified, false);
  assert.equal(replay.affectedPartyReportsExternallyVerified, false);
  assert.equal(assessment.measurementTruthExternallyVerified, false);
  assert.equal(assessment.affectedPartyReportsExternallyVerified, false);
  assert.equal(assessment.decision,
    "STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE");
  assert.equal(assessment.ownerGateInputEligible, false);
  assert.equal(assessment.externalLedgerAndOwnerReviewRequired, true);
  assert.equal(assessment.executionAuthorized, false);
  assert.equal(assessment.boundary.authority, "none");
  assert.equal(assessment.boundary.permits.EXECUTE, false);
});

test("many individually acceptable experiments cannot exceed one shared reality budget", () => {
  const { boundary, makeClaim } = fixture();
  const first = makeClaim({ load: 6 });
  assert.throws(() => createStewardshipClaim({
    ...first,
    boundary,
    requestedExternalities: [{ channelId: "shared-reality-load", amount: 6 }],
  }), /REALITY_REQUEST_MUST_COVER_ALL_BOUNDARY_CHANNELS/);
  const commitment = createRealityBudgetCommitment({
    boundary,
    claim: first,
    channelAmounts: [
      { channelId: "human-consent", amount: 0 },
      { channelId: "shared-reality-load", amount: 6 },
    ],
    commitmentEvidenceHash: h("owner-observed-first-use"),
    committedAt: t(3),
  });
  assert.equal(verifyRealityBudgetCommitment(commitment, { boundary, claim: first }).ok, true);
  assert.throws(() => createRealityBudgetCommitment({
    boundary,
    claim: first,
    channelAmounts: [
      { channelId: "human-consent", amount: 0 },
      { channelId: "shared-reality-load", amount: 0 },
    ],
    commitmentEvidenceHash: h("under-reserved"),
    committedAt: t(3),
  }), /REALITY_COMMITMENT_MUST_RESERVE_EXACT_CLAIM_REQUEST/);
  const forgedCommitment = reseal(commitment,
    "outsider/reality-budget-commitment/v1", "commitmentHash", {
      channelAmounts: [
        { channelId: "human-consent", amount: 0 },
        { channelId: "shared-reality-load", amount: 0 },
      ],
    });
  assert.equal(verifyRealityBudgetCommitment(forgedCommitment).ok, true);
  assert.equal(verifyRealityBudgetCommitment(forgedCommitment, {
    boundary, claim: first,
  }).ok, false);
  const second = makeClaim({ load: 5 });
  assert.throws(() => assessRealityStewardship({
    boundary, claim: second,
    priorCommitmentEntries: [{ commitment: forgedCommitment, claim: first }], now: t(4),
  }), /REALITY_ASSESSMENT_COMMITMENT_INVALID/);
  const assessment = assessRealityStewardship({
    boundary, claim: second,
    priorCommitmentEntries: [{ commitment, claim: first }], now: t(4),
  });
  assert.equal(assessment.decision, "REFUSE_NON_FUNGIBLE_CONSTRAINT");
  const row = assessment.budgetRows.find((item) => item.channelId === "shared-reality-load");
  assert.deepEqual({ used: row.alreadyCommitted, requested: row.requested,
    projected: row.projected, cap: row.cap, status: row.status },
  { used: 6, requested: 5, projected: 11, cap: 10, status: "REFUSE" });
  assert.equal(assessment.executionAuthorized, false);
});

test("money cannot purchase a hard prohibition or erase an affected party", () => {
  const { boundary, partyA, makeClaim } = fixture();
  const prohibited = makeClaim({ consentViolations: 1, compensation: h("money") });
  const prohibitedResult = assessRealityStewardship({ boundary, claim: prohibited, now: t(2) });
  assert.equal(prohibitedResult.decision, "REFUSE_NON_FUNGIBLE_CONSTRAINT");
  assert.equal(prohibitedResult.compensationCannotOverride, true);

  const invisibleParty = makeClaim({ represented: [partyA], compensation: h("more-money") });
  const representationResult = assessRealityStewardship({
    boundary, claim: invisibleParty, now: t(2),
  });
  assert.equal(representationResult.decision, "REFUSE_NON_FUNGIBLE_CONSTRAINT");
  assert.match(representationResult.gates.representation.reasons.join("\n"),
    /UNREPRESENTED_PARTY/);
  assert.equal(representationResult.compensationCannotOverride, true);
});

test("an Experience claim without a causal design and rights remains on hold", () => {
  const { boundary, makeClaim } = fixture();
  const claim = makeClaim({ purpose: "EXPERIENCE", causal: false });
  const result = assessRealityStewardship({ boundary, claim, now: t(2) });
  assert.equal(result.decision, "HOLD_MISSING_CONSTITUTIONAL_EVIDENCE");
  assert.deepEqual(result.gates.experienceRights.reasons, [
    "CAUSAL_DESIGN_MISSING", "EXPERIENCE_RIGHTS_MISSING", "WHY_REALITY_REQUIRED_MISSING",
  ]);
  assert.equal(result.boundary.automaticTraining, false);
});

test("success at Stop cannot close delayed consequence, recovery or challenge obligations", () => {
  const { boundary, partyA, makeClaim } = fixture();
  const claim = makeClaim();
  const execution = createRealityExecutionReceipt({
    boundary, claim,
    ownerGateReceiptHash: h("external-owner-receipt-reference"),
    executionEvidenceHash: h("execution"),
    providerRootHash: h("provider"),
    responsibilityRootHashes: [...claim.responsibilityRootHashes, h("successor-provider")],
    executedAt: t(10),
  });
  const immediate = createConsequenceReport({
    boundary, claim, execution,
    horizonId: "immediate", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "immediate-impact"),
    affectedPartyReports: partyReports(boundary, "immediate", "NO_REPORTED_IMPACT"),
    causalStatus: "OBSERVATION",
    recoveryStatus: "NOT_REQUIRED", measurementEvidenceHashes: [h("green-output")],
    observedAt: t(10),
  });
  const immediateReplay = verifyConsequenceReport(immediate, { boundary, claim, execution });
  assert.equal(immediateReplay.ok, true);
  assert.equal(immediateReplay.verificationLevel, "STRUCTURAL_INPUTS_REDERIVED");
  assert.equal(immediateReplay.protocolInputsReplayed, true);
  assert.equal(immediateReplay.sourceReverified, false);
  assert.equal(immediateReplay.measurementTruthExternallyVerified, false);
  assert.equal(immediateReplay.affectedPartyReportsExternallyVerified, false);
  assert.equal(immediate.measurementTruthExternallyVerified, false);
  assert.equal(immediate.affectedPartyReportsExternallyVerified, false);
  const early = buildConsequenceState({
    boundary, claim, execution, reports: [immediate], now: t(10.5),
  });
  assert.equal(early.status, "MONITORING_WINDOW_OPEN");
  assert.equal(early.obligationOpen, true);
  assert.equal(early.canClose, false);

  const overdue = buildConsequenceState({
    boundary, claim, execution, reports: [immediate], now: t(12),
  });
  assert.equal(overdue.status, "OBSERVATION_OVERDUE");

  const delayedPending = createConsequenceReport({
    boundary, claim, execution,
    horizonId: "delayed", outcome: "PARTIAL",
    impactMeasurements: impactRows(boundary, "delayed-impact", {
      "shared-reality-load": 2,
    }),
    affectedPartyReports: partyReports(boundary, "delayed-pending"),
    causalStatus: "CAUSAL_CLAIM",
    recoveryStatus: "PENDING", recoveryStandardHash: boundary.recoveryStandardHash,
    recoveryEvidenceHashes: [], measurementEvidenceHashes: [h("delayed-measurement")],
    observedAt: t(12),
  });
  const recovery = buildConsequenceState({
    boundary, claim, execution, reports: [immediate, delayedPending], now: t(12),
  });
  assert.equal(recovery.status, "RECOVERY_DUE");
  assert.equal(recovery.causalClaimsObserved, 1);
  assert.equal(recovery.causalExperienceUnits, 0);
  assert.equal(recovery.learningAdmission, false);

  const challenge = createStewardshipChallenge({
    boundary, claim, affectedPartyRootHash: partyA, status: "OPEN", filedAt: t(12),
  });
  const challenged = buildConsequenceState({
    boundary, claim, execution, reports: [immediate, delayedPending],
    challenges: [challenge], now: t(12),
  });
  assert.equal(challenged.status, "CHALLENGE_OPEN");
  assert.equal(challenged.openChallengeCount, 1);

  const delayedRecovered = createConsequenceReport({
    boundary, claim, execution,
    horizonId: "delayed", outcome: "PARTIAL",
    impactMeasurements: impactRows(boundary, "delayed-recovered-impact", {
      "shared-reality-load": 2,
    }),
    affectedPartyReports: partyReports(boundary, "delayed-recovered"),
    causalStatus: "OBSERVATION",
    recoveryStatus: "COMPLETE", recoveryStandardHash: boundary.recoveryStandardHash,
    recoveryEvidenceHashes: [h("recovery-proof")],
    measurementEvidenceHashes: [h("recovery-measurement")],
    observedAt: t(13),
  });
  const resolvedChallenge = createStewardshipChallenge({
    boundary, claim, affectedPartyRootHash: partyA, status: "RESOLVED", filedAt: t(12),
    resolutionHash: h("resolution"),
  });
  const recoveryNeedsExternalVerification = buildConsequenceState({
    boundary, claim, execution, reports: [immediate, delayedRecovered],
    challenges: [resolvedChallenge], now: t(13),
  });
  const stateSelfCheck = verifyConsequenceState(recoveryNeedsExternalVerification);
  assert.equal(stateSelfCheck.ok, true);
  assert.equal(stateSelfCheck.verificationLevel, "SELF_CHECK_ONLY");
  assert.equal(stateSelfCheck.protocolInputsReplayed, false);
  assert.equal(stateSelfCheck.sourceReverified, false);
  const stateReplay = verifyConsequenceState(recoveryNeedsExternalVerification, {
    boundary, claim, execution, reports: [immediate, delayedRecovered],
    challenges: [resolvedChallenge],
  });
  assert.equal(stateReplay.ok, true);
  assert.equal(stateReplay.verificationLevel, "STRUCTURAL_INPUTS_REDERIVED");
  assert.equal(stateReplay.protocolInputsReplayed, true);
  assert.equal(stateReplay.sourceReverified, false);
  assert.equal(stateReplay.measurementTruthExternallyVerified, false);
  assert.equal(stateReplay.affectedPartyReportsExternallyVerified, false);
  assert.equal(recoveryNeedsExternalVerification.status,
    "RECOVERY_EXTERNAL_VERIFICATION_REQUIRED");
  assert.equal(recoveryNeedsExternalVerification.externalClosureRequired, true);
  assert.equal(recoveryNeedsExternalVerification.externalClosureReviewReady, false);
  assert.equal(recoveryNeedsExternalVerification.externalClosureEligibilityVerified, false);
  assert.equal(recoveryNeedsExternalVerification.measurementTruthExternallyVerified, false);
  assert.equal(recoveryNeedsExternalVerification.affectedPartyReportsExternallyVerified, false);
  assert.equal(recoveryNeedsExternalVerification.canClose, false);
  assert.deepEqual(recoveryNeedsExternalVerification.responsibilityRootHashes,
    execution.responsibilityRootHashes);

  const delayedNoImpact = createConsequenceReport({
    boundary, claim, execution, horizonId: "delayed", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "delayed-clean-impact"),
    affectedPartyReports: partyReports(boundary, "delayed-clean", "NO_REPORTED_IMPACT"),
    recoveryStatus: "NOT_REQUIRED", measurementEvidenceHashes: [h("delayed-clean")],
    observedAt: t(13),
  });
  const structurallyReady = buildConsequenceState({
    boundary, claim, execution, reports: [immediate, delayedNoImpact], now: t(13),
  });
  assert.equal(structurallyReady.status,
    "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE");
  assert.equal(structurallyReady.externalClosureRequired, true);
  assert.equal(structurallyReady.externalClosureReviewReady, true);
  assert.equal(structurallyReady.externalClosureEligibilityVerified, false);

  const immediateImpact = createConsequenceReport({
    boundary, claim, execution, horizonId: "immediate", outcome: "PARTIAL",
    impactMeasurements: impactRows(boundary, "impact-immediate", {
      "shared-reality-load": 2,
    }),
    affectedPartyReports: partyReports(boundary, "impact-immediate"),
    recoveryStatus: "PENDING", recoveryStandardHash: boundary.recoveryStandardHash,
    measurementEvidenceHashes: [h("impact-immediate-measurement")], observedAt: t(10),
  });
  const delayedImpact = createConsequenceReport({
    boundary, claim, execution, horizonId: "delayed", outcome: "PARTIAL",
    impactMeasurements: impactRows(boundary, "impact-delayed", {
      "shared-reality-load": 3,
    }),
    affectedPartyReports: partyReports(boundary, "impact-delayed"),
    recoveryStatus: "PENDING", recoveryStandardHash: boundary.recoveryStandardHash,
    measurementEvidenceHashes: [h("impact-delayed-measurement")], observedAt: t(13),
  });
  const cumulativeImpact = buildConsequenceState({
    boundary, claim, execution, reports: [immediateImpact, delayedImpact], now: t(13),
  });
  assert.deepEqual(cumulativeImpact.impactTotals, [
    { channelId: "human-consent", aggregation: "CUMULATIVE_MAX",
      amount: 0, measurementCount: 2 },
    { channelId: "shared-reality-load", aggregation: "CUMULATIVE_MAX",
      amount: 3, measurementCount: 2 },
  ]);
});

test("provider replacement cannot erase the original responsibility roots", () => {
  const { boundary, makeClaim } = fixture();
  const claim = makeClaim();
  assert.throws(() => createRealityExecutionReceipt({
    boundary, claim,
    ownerGateReceiptHash: h("owner"), executionEvidenceHash: h("execution"),
    providerRootHash: h("replacement"), responsibilityRootHashes: [h("replacement")],
    executedAt: t(10),
  }), /REALITY_EXECUTION_RESPONSIBILITY_ERASED/);
  assert.throws(() => createRealityExecutionReceipt({
    boundary, claim,
    ownerGateReceiptHash: h("owner"), executionEvidenceHash: h("execution"),
    providerRootHash: h("replacement"),
    responsibilityRootHashes: [...claim.responsibilityRootHashes],
    executedAt: t(10),
  }), /REALITY_EXECUTION_PROVIDER_NOT_RESPONSIBLE/);
});

test("horizon, party and recovery semantics fail closed", () => {
  const { boundary, makeClaim } = fixture();
  const claim = makeClaim();
  const execution = createRealityExecutionReceipt({
    boundary, claim, ownerGateReceiptHash: h("owner"),
    executionEvidenceHash: h("execution"), providerRootHash: h("provider"),
    responsibilityRootHashes: claim.responsibilityRootHashes, executedAt: t(10),
  });
  assert.equal(verifyRealityExecutionReceipt(execution, { boundary, claim }).ok, true);
  assert.throws(() => createConsequenceReport({
    boundary, claim, execution, horizonId: "immediate", outcome: "SUCCESS",
    impactMeasurements: [{ channelId: "shared-reality-load", amount: 0,
      measurementEvidenceHash: h("partial-impact") }],
    affectedPartyReports: partyReports(boundary, "partial-impact", "NO_REPORTED_IMPACT"),
    measurementEvidenceHashes: [h("measurement")], observedAt: t(10),
  }), /REALITY_IMPACTS_INVALID|REALITY_IMPACT_CHANNEL_COVERAGE_INVALID/);
  assert.throws(() => createConsequenceReport({
    boundary, claim, execution, horizonId: "delayed", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "too-early-impact"),
    affectedPartyReports: partyReports(boundary, "too-early", "NO_REPORTED_IMPACT"),
    measurementEvidenceHashes: [h("measurement")], observedAt: t(10.5),
  }), /REALITY_CONSEQUENCE_BEFORE_HORIZON_MATURITY/);
  assert.throws(() => createConsequenceReport({
    boundary, claim, execution, horizonId: "immediate", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "missing-party-impact"),
    affectedPartyReports: [], measurementEvidenceHashes: [h("measurement")],
    observedAt: t(10),
  }), /REALITY_PARTY_REPORT_COVERAGE_INVALID/);
  assert.throws(() => createConsequenceReport({
    boundary, claim, execution, horizonId: "delayed", outcome: "PARTIAL",
    impactMeasurements: impactRows(boundary, "positive-impact", {
      "shared-reality-load": 1,
    }),
    affectedPartyReports: partyReports(boundary, "impact"),
    recoveryStatus: "NOT_REQUIRED", measurementEvidenceHashes: [h("measurement")],
    observedAt: t(12),
  }), /REALITY_POSITIVE_IMPACT_REQUIRES_RECOVERY/);
  const futureReport = createConsequenceReport({
    boundary, claim, execution, horizonId: "delayed", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "future-impact"),
    affectedPartyReports: partyReports(boundary, "future", "NO_REPORTED_IMPACT"),
    measurementEvidenceHashes: [h("measurement")], observedAt: t(12),
  });
  assert.throws(() => buildConsequenceState({
    boundary, claim, execution, reports: [futureReport], now: t(11.5),
  }), /REALITY_STATE_REPORT_FROM_FUTURE/);
});

test("self-resealed semantic claims never become source-verified authority or closure", () => {
  const { boundary, makeClaim } = fixture();
  const claim = makeClaim();
  const assessment = assessRealityStewardship({ boundary, claim, now: t(2) });
  const fakeAssessment = reseal(assessment, "outsider/reality-stewardship-assessment/v1",
    "assessmentHash", {
      decision: "REFUSE_NON_FUNGIBLE_CONSTRAINT",
      externalLedgerAndOwnerReviewRequired: false,
    });
  assert.equal(verifyRealityStewardshipAssessment(fakeAssessment).ok, true);
  assert.equal(verifyRealityStewardshipAssessment(fakeAssessment).sourceReverified, false);
  assert.equal(verifyRealityStewardshipAssessment(fakeAssessment, {
    boundary, claim, priorCommitmentEntries: [],
  }).ok, false);
  const fakeAssessmentTruth = reseal(assessment,
    "outsider/reality-stewardship-assessment/v1", "assessmentHash", {
      measurementTruthExternallyVerified: true,
      affectedPartyReportsExternallyVerified: true,
    });
  assert.equal(verifyRealityStewardshipAssessment(fakeAssessmentTruth).ok, false);

  const execution = createRealityExecutionReceipt({
    boundary, claim, ownerGateReceiptHash: h("owner"),
    executionEvidenceHash: h("execution"), providerRootHash: h("provider"),
    responsibilityRootHashes: claim.responsibilityRootHashes, executedAt: t(10),
  });
  const state = buildConsequenceState({ boundary, claim, execution, now: t(10) });
  const fakeConsequence = createConsequenceReport({
    boundary, claim, execution, horizonId: "immediate", outcome: "SUCCESS",
    impactMeasurements: impactRows(boundary, "opaque-only"),
    affectedPartyReports: partyReports(boundary, "opaque-only", "NO_REPORTED_IMPACT"),
    measurementEvidenceHashes: [h("opaque-measurement-hash-only")], observedAt: t(10),
  });
  const structuralOnly = verifyConsequenceReport(fakeConsequence, {
    boundary, claim, execution,
  });
  assert.equal(structuralOnly.verificationLevel, "STRUCTURAL_INPUTS_REDERIVED");
  assert.equal(structuralOnly.protocolInputsReplayed, true);
  assert.equal(structuralOnly.sourceReverified, false);
  assert.equal(structuralOnly.measurementTruthExternallyVerified, false);
  assert.equal(structuralOnly.affectedPartyReportsExternallyVerified, false);
  const forgedMeasurementTruth = reseal(fakeConsequence,
    "outsider/reality-consequence-report/v1", "consequenceHash", {
      measurementTruthExternallyVerified: true,
    });
  assert.equal(verifyConsequenceReport(forgedMeasurementTruth).ok, false);
  const forgedPartyTruth = reseal(fakeConsequence,
    "outsider/reality-consequence-report/v1", "consequenceHash", {
      affectedPartyReportsExternallyVerified: true,
    });
  assert.equal(verifyConsequenceReport(forgedPartyTruth).ok, false);
  const fakeState = reseal(state, "outsider/reality-consequence-state/v1", "stateHash", {
    status: "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE",
    externalClosureRequired: true,
    externalClosureReviewReady: true,
    responsibilityRootHashes: [],
  });
  const fakeSelfCheck = verifyConsequenceState(fakeState);
  assert.equal(fakeSelfCheck.ok, true);
  assert.equal(fakeSelfCheck.sourceReverified, false);
  assert.equal(fakeSelfCheck.externalClosureEligibilityVerified, false);
  assert.equal(verifyConsequenceState(fakeState, {
    boundary, claim, execution, reports: [], challenges: [],
  }).ok, false);
  const forgedStateTruth = reseal(state,
    "outsider/reality-consequence-state/v1", "stateHash", {
      measurementTruthExternallyVerified: true,
      affectedPartyReportsExternallyVerified: true,
    });
  assert.equal(verifyConsequenceState(forgedStateTruth).ok, false);
  const forbiddenLabel = reseal(state, "outsider/reality-consequence-state/v1", "stateHash", {
    status: "ELIGIBLE_FOR_EXTERNAL_CLOSURE", externalClosureRequired: true,
  });
  assert.equal(verifyConsequenceState(forbiddenLabel).ok, false);
});
