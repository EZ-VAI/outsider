import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  GAP_CATEGORIES,
  STAGES,
  buildStage3GuaranteeBridgeCandidate,
  buildStage4SettlementBridgeCandidate,
  createReadinessGapLedger,
  describeReadinessGapLedger,
  verifyReadinessGapLedger,
  verifyStage3GuaranteeBridgeCandidate,
  verifyStage4SettlementBridgeCandidate,
} from "../src/outsider-readiness-gap-ledger.js";

const h = (value) => `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
const t = "2026-08-21T00:00:00.000Z";

function submission(gapId, label = gapId) {
  return {
    schema: "outsider/readiness-external-submission/v1",
    gapId,
    artifactHash: h(label),
    sourceKind: "external-artifact",
    submittedAt: t,
  };
}

test("the ledger covers the complete frozen 0.5/1/1.5/2/3/4 ladder and four gap classes", () => {
  const ledger = createReadinessGapLedger();
  assert.deepEqual(ledger.stages.map((stage) => stage.id), [0.5, 1, 1.5, 2, 3, 4]);
  assert.deepEqual(ledger.stages.map((stage) => stage.key),
    ["MEASURE", "ATTEST", "CURATE", "PRICE", "GUARANTEE", "SETTLE"]);
  assert.deepEqual(GAP_CATEGORIES,
    ["INTERNAL_ENGINEERING", "EXTERNAL_PLATFORM_CAPABILITY",
      "EXTERNAL_EVIDENCE", "EXTERNAL_INSTITUTION_AUTHORITY"]);
  assert.deepEqual(STAGES.map((stage) => stage.key), ledger.stages.map((stage) => stage.key));
  for (const stage of ledger.stages) {
    assert.ok(stage.byCategory.INTERNAL_ENGINEERING.total > 0, stage.key);
    assert.equal(stage.productionReady, false);
    assert.equal(stage.authority, "none");
  }
  const price = ledger.stages.find((stage) => stage.key === "PRICE");
  assert.equal(price.claimCeiling,
    "NONZERO_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_TARGET_PREMIUM_AND_QUOTE_NULL");
  assert.equal(ledger.snapshot, "OUTSIDER_EMPIRICAL_EVIDENCE_TREE_2026-08-22");
  assert.equal(verifyReadinessGapLedger(ledger).ok, true);
});

test("internal work and external blockers can never be silently merged", () => {
  const ledger = createReadinessGapLedger();
  for (const gap of ledger.gaps) {
    if (gap.category === "INTERNAL_ENGINEERING") {
      assert.equal(gap.closureScope, "LOCAL_CLOSABLE");
      assert.ok(["SATISFIED_INTERNAL", "OPEN_INTERNAL"].includes(gap.status));
    } else {
      assert.equal(gap.closureScope, "EXTERNAL_BLOCKED");
      assert.equal(gap.status, "BLOCKED_EXTERNAL");
      assert.match(gap.acceptedClosureInterface, /^REGISTERED_SOURCE_AWARE_VERIFIER_ONLY:/);
    }
    assert.equal(gap.genericCallerBooleanAccepted, false);
  }
});

test("a hash-only external submission is recorded but receives zero closure credit", () => {
  const item = submission("S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY");
  const ledger = createReadinessGapLedger({ externalSubmissions: [item] });
  const gap = ledger.gaps.find((row) => row.gapId === item.gapId);
  assert.equal(gap.status, "BLOCKED_EXTERNAL");
  assert.equal(gap.submissions.length, 1);
  assert.equal(gap.submissions[0].disposition, "SUBMITTED_UNVERIFIED");
  assert.equal(gap.submissions[0].closureCredit, false);
  assert.equal(ledger.stages.find((stage) => stage.key === "GUARANTEE")
    .externalInstitutionAuthorityComplete, false);
  assert.equal(verifyReadinessGapLedger(ledger).ok, true);
});

test("an upstream platform capability cannot be fabricated by a local adapter or hash", () => {
  const item = submission("S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY",
    "codex-host-capability");
  const ledger = createReadinessGapLedger({ externalSubmissions: [item] });
  const gap = ledger.gaps.find((row) => row.gapId === item.gapId);
  assert.equal(gap.category, "EXTERNAL_PLATFORM_CAPABILITY");
  assert.equal(gap.status, "BLOCKED_EXTERNAL");
  assert.equal(gap.submissions[0].closureCredit, false);
  assert.equal(ledger.stages.find((stage) => stage.key === "MEASURE")
    .externalPlatformCapabilityComplete, false);
  assert.equal(verifyReadinessGapLedger(ledger).externalPlatformCapabilityVerified, false);
});

test("caller booleans cannot self-close an external evidence or authority gap", () => {
  assert.throws(() => createReadinessGapLedger({ externalSubmissions: [{
    ...submission("S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY"),
    licensed: true,
  }] }), /READINESS_EXTERNAL_SUBMISSION_SCHEMA_INVALID/);
  assert.throws(() => createReadinessGapLedger({ externalSubmissions: [{
    ...submission("S4_INDEPENDENT_CLAIMS_ADJUDICATOR"),
    independent: true,
  }] }), /READINESS_EXTERNAL_SUBMISSION_SCHEMA_INVALID/);
  assert.throws(() => createReadinessGapLedger({ externalSubmissions: [{
    ...submission("S2_INDEPENDENT_ACTUARIAL_REVIEW"),
    reviewed: true,
  }] }), /READINESS_EXTERNAL_SUBMISSION_SCHEMA_INVALID/);
});

test("an external submission cannot be used to change an internal engineering state", () => {
  assert.throws(() => createReadinessGapLedger({ externalSubmissions: [
    submission("S2_EXACT_CROSS_STAGE_PRICE_BRIDGE"),
  ] }), /READINESS_EXTERNAL_SUBMISSION_CANNOT_CLOSE_INTERNAL_GAP/);
});

test("ledger replay rejects authority, external-credit and status tampering", () => {
  const ledger = createReadinessGapLedger({ externalSubmissions: [
    submission("S3_RESOURCE_OWNER_ADOPTION"),
  ] });
  const authority = structuredClone(ledger);
  authority.authority.permitsGuarantee = true;
  assert.equal(verifyReadinessGapLedger(authority).ok, false);

  const credit = structuredClone(ledger);
  credit.gaps.find((gap) => gap.gapId === "S3_RESOURCE_OWNER_ADOPTION")
    .submissions[0].closureCredit = true;
  assert.equal(verifyReadinessGapLedger(credit).ok, false);

  const promoted = structuredClone(ledger);
  promoted.gaps.find((gap) => gap.gapId === "S3_RESOURCE_OWNER_ADOPTION").status
    = "SATISFIED_INTERNAL";
  assert.equal(verifyReadinessGapLedger(promoted).ok, false);
});

function stage3Fixture(ledger) {
  return buildStage3GuaranteeBridgeCandidate({
    ledger,
    stage1RecordHash: h("stage1"),
    curateCheckpointHash: h("curate"),
    priceResearchHash: h("price-shadow"),
    stewardshipEnvelopeHash: h("stewardship"),
    claimHash: h("claim"),
    wayHash: h("way"),
    worldHash: h("world"),
    policyHash: h("policy"),
    externalSubmissionHashes: ledger.gaps.flatMap((gap) =>
      gap.submissions.map((item) => item.artifactHash)),
  });
}

test("Stage 3 can bind a local candidate graph but can never bind a guarantee", () => {
  const ledger = createReadinessGapLedger({ externalSubmissions: [
    submission("S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY", "issuer"),
    submission("S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES", "custody"),
  ] });
  const candidate = stage3Fixture(ledger);
  assert.equal(candidate.localGraphComplete, true);
  assert.equal(candidate.externalSubmissionHashes.length, 2);
  assert.equal(candidate.externalSubmissionDisposition,
    "REGISTERED_UNVERIFIED_NO_CLOSURE_CREDIT");
  assert.equal(candidate.decision, "HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_AND_EVIDENCE");
  assert.equal(candidate.authority.bindingGuarantee, false);
  assert.equal(candidate.authority.grantsCoverage, false);
  assert.equal(candidate.authority.grantsExecution, false);
  assert.equal(verifyStage3GuaranteeBridgeCandidate(candidate).ok, true);
});

test("Stage 3 rejects unregistered external hashes and caller authority switches", () => {
  const ledger = createReadinessGapLedger();
  assert.throws(() => buildStage3GuaranteeBridgeCandidate({
    ledger,
    stage1RecordHash: h("stage1"), curateCheckpointHash: null,
    priceResearchHash: h("price"), stewardshipEnvelopeHash: h("stewardship"),
    claimHash: h("claim"), wayHash: h("way"), worldHash: h("world"),
    policyHash: h("policy"), externalSubmissionHashes: [h("not-registered")],
  }), /NOT_REGISTERED/);
  assert.throws(() => buildStage3GuaranteeBridgeCandidate({
    ledger,
    stage1RecordHash: h("stage1"), curateCheckpointHash: null,
    priceResearchHash: h("price"), stewardshipEnvelopeHash: h("stewardship"),
    claimHash: h("claim"), wayHash: h("way"), worldHash: h("world"),
    policyHash: h("policy"), externalSubmissionHashes: [], licensed: true,
  }), /STAGE3_BRIDGE_INPUT_SCHEMA_INVALID/);
});

test("Stage 4 remains open/reopenable and separates payment from restoration", () => {
  const ledger = createReadinessGapLedger({ externalSubmissions: [
    submission("S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE", "adjudication"),
    submission("S4_PAYMENT_AND_RECOVERY_EVIDENCE", "payment"),
  ] });
  const stage3 = stage3Fixture(ledger);
  const candidate = buildStage4SettlementBridgeCandidate({
    ledger,
    stage3Candidate: stage3,
    executionReceiptHash: h("execution"),
    claimEvidenceHash: h("claim-evidence"),
    consequenceStateHash: h("consequence"),
    recoveryStateHash: h("recovery"),
    externalSubmissionHashes: ledger.gaps.flatMap((gap) =>
      gap.submissions.map((item) => item.artifactHash)),
  });
  assert.equal(candidate.decision,
    "HOLD_EXTERNAL_BINDING_ADJUDICATION_CUSTODY_AND_CONSEQUENCES");
  assert.equal(candidate.authority.settlementInstructionEligible, false);
  assert.equal(candidate.authority.movesFunds, false);
  assert.equal(candidate.authority.closesObligation, false);
  assert.equal(candidate.restorationEstablished, false);
  assert.equal(candidate.obligationOpen, true);
  assert.equal(candidate.reopenable, true);
  assert.equal(verifyStage4SettlementBridgeCandidate(candidate).ok, true);
});

test("candidate verifiers reject local resealing of authority fields", () => {
  const ledger = createReadinessGapLedger();
  const stage3 = stage3Fixture(ledger);
  const forged3 = structuredClone(stage3);
  forged3.authority.bindingGuarantee = true;
  assert.equal(verifyStage3GuaranteeBridgeCandidate(forged3).ok, false);

  const stage4 = buildStage4SettlementBridgeCandidate({
    ledger, stage3Candidate: stage3,
    executionReceiptHash: h("execution"), claimEvidenceHash: h("claim-evidence"),
    consequenceStateHash: h("consequence"), recoveryStateHash: h("recovery"),
    externalSubmissionHashes: [],
  });
  const forged4 = structuredClone(stage4);
  forged4.authority.movesFunds = true;
  assert.equal(verifyStage4SettlementBridgeCandidate(forged4).ok, false);
});

test("the machine-readable closure plan puts evidence and institutions before binding", () => {
  const ledger = createReadinessGapLedger();
  assert.deepEqual(ledger.closurePlan.map((wave) => wave.wave), [1, 2, 3, 4, 5, 6]);
  assert.match(ledger.closurePlan[3].key, /COUNTERPARTIES/);
  assert.match(ledger.closurePlan[4].key, /GUARANTEE/);
  assert.match(ledger.closurePlan[5].key, /SETTLE/);
  const description = describeReadinessGapLedger();
  assert.equal(description.schema, "outsider/readiness-gap-ledger-description/v2");
  assert.match(description.rule, /generic caller booleans/i);
  assert.ok(description.stage3DefinitionOfDone.length >= 8);
  assert.ok(description.stage4DefinitionOfDone.length >= 8);
  assert.equal(description.stage2PricingProgress.referenceSemantics,
    "NON_EVIDENTIARY_CODE_REFERENCE_ONLY");
  assert.equal(description.stage2PricingProgress.rmaReceiptHashDisclosedHere, false);
  assert.equal(Object.hasOwn(description.stage2PricingProgress,
    "canonicalRmaShadowPricingArtifactHash"), false);
  assert.equal(description.stage2PricingProgress.sourceArtifactsReverified, false);
  assert.equal(description.stage2PricingProgress.currentChainEstablished, false);
  assert.equal(description.stage2PricingProgress.closureCredit, false);
  assert.equal(description.stage2PricingProgress
    .sourceDomainHistoricalLossCostIndication, "NONZERO");
  assert.equal(description.stage2PricingProgress.targetTechnicalPremium, null);
  assert.equal(description.stage2PricingProgress.targetQuotedPrice, null);
  assert.equal(description.stage2PricingProgress.pricePermission, false);
  assert.equal(description.stage2PricingProgress.targetPriceState, "NULL_NOT_ZERO");
  assert.equal(description.stage2PricingProgress.stage3QuoteInput, false);
  assert.equal(description.stage2PricingProgress.rmaAndCasNumericAmountsPooled, false);
});
