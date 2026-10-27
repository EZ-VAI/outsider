import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createStage4LifecycleReceipt,
  DurableStage4ClaimsLifecycleFrontier,
  stage4ClaimsKeyId,
  STAGE4_RECEIPT_KINDS,
  verifyFullySourceBoundStage4Candidate,
} from "../src/outsider-stage4-claims-lifecycle-frontier.js";
import {
  buildStage4SettlementInstructionCandidate,
} from "../src/outsider-stage34-authority-frontier.js";
import {
  createStage4ClaimsFullFixture, stage4ClaimsAt as at, stage4ClaimsHash as H,
} from "./helpers/stage4-claims-full-fixture.js";

function keys() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem,
    keyId: stage4ClaimsKeyId(publicKeyPem),
  };
}

const policyReferenceHash = H("stage4-policy-reference");
const policyReferences = [{
  policyId: "reference-policy", policyVersion: "2026.08",
  policyReferenceHash, coverageReferenceHash: H("coverage-reference"),
}];
const reservePools = [{ poolId: "reference-pool", currency: "USD",
  accountingLimitMinor: 100_000, poolReferenceHash: H("reserve-pool-reference") }];

let sourceFixture;
let secondSourceFixture;
let operator;
let source;
let fake;
let baseDirectory;
let primaryClaimRecordHash;
let primaryClaimStateHeadHash;
const temporaryDirectories = [];

function temporary(prefix) {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function openClone() {
  const directory = temporary("outsider-stage4-claims-test-");
  cpSync(baseDirectory, directory, { recursive: true });
  return { directory, ledger: new DurableStage4ClaimsLifecycleFrontier({
    directory, operatorPrivateKeyPem: operator.privateKeyPem,
  }) };
}

function makeReceipt(kind, assertedState, label, {
  claimIdentityHash = sourceFixture.candidate.claimIdentityHash,
  signer = source,
  verifierId = "configured-reference-source",
  observedAt = at(50),
  instructionHash = null,
  horizonId = null,
  maturityAt = null,
  subjectHash = null,
  claimStateHeadHash = primaryClaimStateHeadHash,
} = {}) {
  const consequenceKinds = new Set([
    STAGE4_RECEIPT_KINDS.technicalRecovery,
    STAGE4_RECEIPT_KINDS.worldRestoration,
    STAGE4_RECEIPT_KINDS.delayedConsequence,
    STAGE4_RECEIPT_KINDS.closure,
  ]);
  const expectedSubject = subjectHash
    ?? (kind === STAGE4_RECEIPT_KINDS.payment ? instructionHash
      : kind === STAGE4_RECEIPT_KINDS.coverage ? policyReferences[0].coverageReferenceHash
        : consequenceKinds.has(kind)
          ? sourceFixture.candidate.bindings.consequenceObligationSetHash
          : claimStateHeadHash);
  return createStage4LifecycleReceipt({
    receiptId: `receipt-${label}`,
    claimIdentityHash,
    claimStateHeadHash,
    kind,
    assertedState,
    verifierId,
    subjectHash: expectedSubject,
    evidenceHash: H(`evidence:${label}`),
    instructionHash,
    horizonId,
    maturityAt,
    observedAt,
  }, { privateKeyPem: signer.privateKeyPem });
}

function register(ledger, receipt, seconds) {
  return ledger.registerExternalReceipt(receipt, { recordedAt: at(seconds) });
}

function advanceThroughMaturedChallenge(ledger, start = 50,
  claimStateHeadHash = primaryClaimStateHeadHash) {
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.fraud, "CLEAR_CANDIDATE",
    `fraud-${start}`, { observedAt: at(start), claimStateHeadHash }), start);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.conflict, "CLEAR_CANDIDATE",
    `conflict-${start}`, { observedAt: at(start + 1), claimStateHeadHash }), start + 1);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.adjudication,
    "PAYMENT_ELIGIBLE_CANDIDATE", `adjudication-${start}`,
    { observedAt: at(start + 2), claimStateHeadHash }), start + 2);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.notice, "DELIVERED_CANDIDATE",
    `notice-${start}`, { observedAt: at(start + 3), claimStateHeadHash }), start + 3);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.challenge,
    "WINDOW_MATURED_NO_CHALLENGE_CANDIDATE", `challenge-${start}`,
    { observedAt: at(start + 4), claimStateHeadHash }), start + 4);
}

function advanceToUnchallengedPaymentCandidate(ledger, start = 50,
  claimStateHeadHash = primaryClaimStateHeadHash) {
  advanceThroughMaturedChallenge(ledger, start, claimStateHeadHash);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.coverage,
    "REFERENCED_CANDIDATE", `coverage-${start}`,
    { observedAt: at(start + 5), claimStateHeadHash }), start + 5);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.learningDiet,
    "COMPLIANT_CANDIDATE", `diet-${start}`,
    { observedAt: at(start + 6), claimStateHeadHash }), start + 6);
}

function reserveInput(claimIdentityHash = sourceFixture.candidate.claimIdentityHash,
  label = "primary", amountMinor = 25_000,
  claimStateHeadHash = primaryClaimStateHeadHash) {
  return {
    reserveRequestId: `reserve-${label}`,
    claimIdentityHash,
    claimStateHeadHash,
    poolId: "reference-pool",
    amountMinor,
    reserveBasisHash: H(`reserve-basis:${label}`),
  };
}

function amendmentInput({
  id = "amendment-primary",
  version = 1,
  previousAmendmentHash = null,
  previousClaimStateHeadHash = primaryClaimStateHeadHash,
  contentLabel = "primary",
  amendedAt = at(50),
} = {}) {
  return {
    amendmentId: id,
    claimIdentityHash: sourceFixture.candidate.claimIdentityHash,
    claimRecordHash: primaryClaimRecordHash,
    amendmentVersion: version,
    previousAmendmentHash,
    previousClaimStateHeadHash,
    amendedContentHash: H(`amended-content:${contentLabel}`),
    amendmentEvidenceHash: H(`amendment-evidence:${contentLabel}`),
    amendedAt,
  };
}

function domainDigest(domain, value) {
  const bytes = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(`${domain}\0${bytes}`).digest("hex")}`;
}

function instructionInput(reserveHash, {
  id = "instruction-primary", nonce = "one_use_nonce_primary_0001",
  claimIdentityHash = sourceFixture.candidate.claimIdentityHash,
  claimStateHeadHash = primaryClaimStateHeadHash,
  amountMinor = 25_000,
} = {}) {
  return {
    instructionId: id,
    claimIdentityHash,
    claimStateHeadHash,
    reserveHash,
    amountMinor,
    currency: "USD",
    payeeReferenceHash: H(`payee:${claimIdentityHash}`),
    oneUseNonce: nonce,
  };
}

test.before(async () => {
  sourceFixture = await createStage4ClaimsFullFixture({ seed: "primary" });
  secondSourceFixture = await createStage4ClaimsFullFixture({ seed: "second" });
  assert.equal(sourceFixture.stage34Context.stage2Frontier.sourceReplay
    .empiricalSixSourceLedgerReplayed, true);
  assert.equal(Object.hasOwn(
    sourceFixture.stage34Context.stage2Frontier.sourceReplay,
    "empiricalFiveSourceLedgerReplayed"), false);
  operator = keys();
  source = keys();
  fake = keys();
  baseDirectory = temporary("outsider-stage4-claims-base-");
  const ledger = new DurableStage4ClaimsLifecycleFrontier({
    directory: baseDirectory,
    operatorPrivateKeyPem: operator.privateKeyPem,
    createdAt: at(35),
    policyReferences,
    reservePools,
    sourceVerifiers: [{
      verifierId: "configured-reference-source",
      interfaceId: "outsider.stage4.signed-json-receipt",
      interfaceVersion: "1.0.0",
      receiptKinds: Object.values(STAGE4_RECEIPT_KINDS),
      keyId: source.keyId,
      publicKeyPem: source.publicKeyPem,
      organizationReferenceHash: H("configured-source-organization-reference"),
    }],
  });
  const registered = await ledger.registerVerifiedClaim({
    candidate: sourceFixture.candidate,
    stage34Context: sourceFixture.stage34Context,
    priorCandidates: sourceFixture.priorCandidates,
    policyReferenceHash,
  }, { recordedAt: at(40) });
  assert.equal(registered.appended, true);
  primaryClaimRecordHash = registered.claimRecordHash;
  primaryClaimStateHeadHash = registered.claimRecordHash;
});

test.after(() => {
  sourceFixture?.cleanup();
  secondSourceFixture?.cleanup();
  for (const directory of temporaryDirectories.reverse()) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("only a full Stage34 source replay is admitted; registration is deterministic and idempotent",
  async () => {
    const { ledger } = openClone();
    const admission = await verifyFullySourceBoundStage4Candidate(
      sourceFixture.candidate, {
        stage34Context: sourceFixture.stage34Context,
        priorCandidates: sourceFixture.priorCandidates,
      });
    assert.equal(admission.ok, true);
    assert.equal(admission.sourceArtifactsReverified, true);
    assert.equal(admission.externalInstitutionAuthorityVerified, false);

    const replay = await ledger.registerVerifiedClaim({
      candidate: sourceFixture.candidate,
      stage34Context: sourceFixture.stage34Context,
      priorCandidates: sourceFixture.priorCandidates,
      policyReferenceHash,
    }, { recordedAt: at(41) });
    assert.equal(replay.appended, false);
    assert.equal(replay.duplicate, true);
    const report = ledger.report({ asOf: at(42) });
    assert.equal(report.counts.claims, 1);
    assert.equal(report.claims[0].authority.coverageEstablished, false);
    assert.equal(report.claims[0].authority.movesFunds, false);
    assert.equal(report.claims[0].workflow.obligationOpen, true);
  });

test("the same deterministic claim identity with a different valid candidate hash conflicts",
  async () => {
    const { ledger } = openClone();
    const otherCandidate = buildStage4SettlementInstructionCandidate({
      frontier: sourceFixture.stage34Context.frontier,
      readinessLedger: sourceFixture.stage34Context.readinessLedger,
      priorCandidates: [],
      createdAt: at(33),
    });
    assert.equal(otherCandidate.claimIdentityHash,
      sourceFixture.candidate.claimIdentityHash);
    assert.notEqual(otherCandidate.candidateHash, sourceFixture.candidate.candidateHash);
    await assert.rejects(ledger.registerVerifiedClaim({
      candidate: otherCandidate,
      stage34Context: sourceFixture.stage34Context,
      priorCandidates: [],
      policyReferenceHash,
    }, { recordedAt: at(42) }), /CLAIM_IDENTITY_CONFLICT/);
    assert.equal(ledger.verify().ok, true);
  });

test("fake adjudicator and custody receipts remain stored but unverified and inert", () => {
  const { ledger } = openClone();
  const fakeAdjudication = makeReceipt(STAGE4_RECEIPT_KINDS.adjudication,
    "PAYMENT_ELIGIBLE_CANDIDATE", "fake-adjudicator", {
      signer: fake, verifierId: "self-labelled-independent-adjudicator", observedAt: at(50),
    });
  const adjudicationResult = register(ledger, fakeAdjudication, 50);
  assert.equal(adjudicationResult.configuredSourceVerified, false);
  assert.equal(adjudicationResult.institutionalAuthorityVerified, false);
  const fakeCustody = makeReceipt(STAGE4_RECEIPT_KINDS.payment,
    "EXECUTION_REPORTED_CANDIDATE", "fake-custodian", {
      signer: fake, verifierId: "self-labelled-custodian", observedAt: at(51),
      instructionHash: H("nonexistent-instruction"),
    });
  register(ledger, fakeCustody, 51);
  const configuredButNotInstitutional = register(ledger,
    makeReceipt(STAGE4_RECEIPT_KINDS.fraud, "CLEAR_CANDIDATE",
      "configured-key-only", { observedAt: at(52) }), 52);
  assert.equal(configuredButNotInstitutional.configuredSourceVerified, true);
  assert.equal(configuredButNotInstitutional.institutionalAuthorityVerified, false);
  const report = ledger.report({ asOf: at(53) });
  assert.equal(report.counts.unverifiedReceipts, 2);
  assert.equal(report.counts.configuredSourceReceipts, 1);
  assert.equal(report.claims[0].workflow.fraud, "CLEAR_CANDIDATE");
  assert.equal(report.claims[0].workflow.adjudication, "NOT_RECORDED");
  assert.equal(report.claims[0].workflow.financialPayment, "NOT_AUTHORIZED");
  assert.equal(report.boundary.custodianAuthorityEstablished, false);
  assert.equal(report.boundary.movesFunds, false);
  assert.equal(report.boundary.closesObligation, false);
});

test("appeal cannot be bypassed before a payment instruction candidate", () => {
  const { ledger } = openClone();
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.fraud, "CLEAR_CANDIDATE",
    "appeal-fraud", { observedAt: at(50) }), 50);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.conflict, "CLEAR_CANDIDATE",
    "appeal-conflict", { observedAt: at(51) }), 51);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.adjudication,
    "PAYMENT_ELIGIBLE_CANDIDATE", "appeal-adjudication", { observedAt: at(52) }), 52);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.notice, "DELIVERED_CANDIDATE",
    "appeal-notice", { observedAt: at(53) }), 53);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.challenge, "OPENED_CANDIDATE",
    "appeal-challenge", { observedAt: at(54) }), 54);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.coverage, "REFERENCED_CANDIDATE",
    "appeal-coverage", { observedAt: at(55) }), 55);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.learningDiet, "COMPLIANT_CANDIDATE",
    "appeal-diet", { observedAt: at(56) }), 56);
  const reserve = ledger.accountReserveCandidate(reserveInput(), { recordedAt: at(57) });
  const input = instructionInput(reserve.reserveHash);
  assert.throws(() => ledger.issuePaymentInstructionCandidate(input,
    { recordedAt: at(58) }), /INSTRUCTION_PRECONDITIONS_INVALID/);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.appeal, "UPHELD_CANDIDATE",
    "appeal-upheld", { observedAt: at(59) }), 59);
  const instruction = ledger.issuePaymentInstructionCandidate(input,
    { recordedAt: at(60) });
  assert.equal(instruction.appended, true);
  assert.equal(instruction.settlementInstructionEligible, false);
  assert.equal(instruction.movesFunds, false);
});

test("coverage reference and compliant learning diet are fail-closed instruction gates", () => {
  const blocked = [
    { coverage: null, diet: "COMPLIANT_CANDIDATE", label: "missing-coverage" },
    { coverage: "VOID_CANDIDATE", diet: "COMPLIANT_CANDIDATE", label: "void" },
    { coverage: "DISPUTED_CANDIDATE", diet: "COMPLIANT_CANDIDATE",
      label: "disputed" },
    { coverage: "REFERENCED_CANDIDATE", diet: null, label: "missing-diet" },
    { coverage: "REFERENCED_CANDIDATE", diet: "BREACH_CANDIDATE",
      label: "breach" },
  ];
  for (const scenario of blocked) {
    const { ledger } = openClone();
    advanceThroughMaturedChallenge(ledger, 50);
    if (scenario.coverage) {
      register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.coverage,
        scenario.coverage, `${scenario.label}-coverage`, { observedAt: at(55) }), 55);
    }
    if (scenario.diet) {
      register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.learningDiet,
        scenario.diet, `${scenario.label}-diet`, { observedAt: at(56) }), 56);
    }
    const reserve = ledger.accountReserveCandidate(reserveInput(
      sourceFixture.candidate.claimIdentityHash, scenario.label), { recordedAt: at(57) });
    assert.throws(() => ledger.issuePaymentInstructionCandidate(instructionInput(
      reserve.reserveHash, { id: `instruction-${scenario.label}`,
        nonce: `one_use_nonce_${scenario.label.replaceAll("-", "_")}_0001` }),
    { recordedAt: at(58) }), /INSTRUCTION_PRECONDITIONS_INVALID/);
    const report = ledger.report({ asOf: at(59) });
    assert.equal(report.claims[0].localWorkflowPreconditionsSatisfied, false);
    assert.equal(report.counts.paymentInstructionCandidates, 0);
  }

  for (const invalidation of [
    { kind: STAGE4_RECEIPT_KINDS.coverage, state: "VOID_CANDIDATE", label: "post-void" },
    { kind: STAGE4_RECEIPT_KINDS.learningDiet, state: "BREACH_CANDIDATE",
      label: "post-breach" },
  ]) {
    const { ledger } = openClone();
    advanceToUnchallengedPaymentCandidate(ledger, 50);
    const reserve = ledger.accountReserveCandidate(reserveInput(
      sourceFixture.candidate.claimIdentityHash, invalidation.label),
    { recordedAt: at(57) });
    const instruction = ledger.issuePaymentInstructionCandidate(instructionInput(
      reserve.reserveHash, { id: `instruction-${invalidation.label}`,
        nonce: `one_use_nonce_${invalidation.label.replaceAll("-", "_")}_0001` }),
    { recordedAt: at(58) });
    register(ledger, makeReceipt(invalidation.kind, invalidation.state,
      invalidation.label, { observedAt: at(59) }), 59);
    assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.payment,
      "EXECUTION_REPORTED_CANDIDATE", `${invalidation.label}-payment`, {
        observedAt: at(60), instructionHash: instruction.instructionHash,
      }), 60), /PAYMENT_RECEIPT_WORKFLOW_NO_LONGER_ELIGIBLE/);
    const report = ledger.report({ asOf: at(61) });
    assert.equal(report.claims[0].localWorkflowPreconditionsSatisfied, false);
    assert.equal(report.claims[0].workflow.financialPayment, "NOT_AUTHORIZED");
    assert.equal(report.boundary.movesFunds, false);
  }
});

test("finalized screening and adjudication cannot be flipped without an explicit amendment", () => {
  const { ledger } = openClone();
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.fraud, "CLEAR_CANDIDATE",
    "final-fraud", { observedAt: at(50) }), 50);
  assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.fraud,
    "FLAGGED_CANDIDATE", "flip-fraud", { observedAt: at(51) }), 51),
  /FRAUD_SCREENING_ALREADY_FINALIZED/);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.conflict, "CLEAR_CANDIDATE",
    "final-conflict", { observedAt: at(52) }), 52);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.adjudication,
    "DENIED_CANDIDATE", "denied", { observedAt: at(53) }), 53);
  assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.adjudication,
    "PAYMENT_ELIGIBLE_CANDIDATE", "flip-adjudication", { observedAt: at(54) }), 54),
  /ADJUDICATION_ALREADY_FINALIZED/);
  const amendment = ledger.appendClaimAmendment(amendmentInput({
    id: "explicit-amendment", contentLabel: "explicit", amendedAt: at(55),
  }), { recordedAt: at(55) });
  const claim = ledger.report({ asOf: at(56) }).claims[0];
  const workflow = claim.workflow;
  assert.equal(claim.amendmentVersion, 1);
  assert.equal(claim.amendmentHeadHash, amendment.amendmentHash);
  assert.equal(claim.claimStateHeadHash, amendment.claimStateHeadHash);
  assert.equal(workflow.fraud, "SCREENING_OPEN");
  assert.equal(workflow.adjudication, "NOT_RECORDED");
  assert.equal(claim.originalClaimPreserved, true);
});

test("an amendment advances the claim-state head and invalidates all old-head artifacts", () => {
  const { ledger } = openClone();
  advanceToUnchallengedPaymentCandidate(ledger, 50);
  const oldReceipt = makeReceipt(STAGE4_RECEIPT_KINDS.fraud, "CLEAR_CANDIDATE",
    "fraud-50", { observedAt: at(50), claimStateHeadHash: primaryClaimStateHeadHash });
  const oldReserve = ledger.accountReserveCandidate(reserveInput(
    sourceFixture.candidate.claimIdentityHash, "old-head"), { recordedAt: at(57) });
  const oldInput = instructionInput(oldReserve.reserveHash, {
    id: "instruction-old-head", nonce: "one_use_nonce_old_head_0001",
  });
  const oldInstruction = ledger.issuePaymentInstructionCandidate(oldInput,
    { recordedAt: at(58) });
  const amendment = ledger.appendClaimAmendment(amendmentInput({
    id: "amendment-head-one", contentLabel: "head-one", amendedAt: at(59),
  }), { recordedAt: at(59) });

  let claim = ledger.report({ asOf: at(60) }).claims[0];
  assert.equal(claim.claimStateHeadHash, amendment.claimStateHeadHash);
  assert.equal(claim.amendmentVersion, 1);
  assert.deepEqual(claim.invalidatedReserveHashes, [oldReserve.reserveHash]);
  assert.deepEqual(claim.invalidatedInstructionHashes, [oldInstruction.instructionHash]);
  assert.equal(claim.invalidatedReceiptHashes.length, 7);
  assert.equal(claim.activeReceiptHashes.length, 0);
  assert.equal(claim.workflow.fraud, "SCREENING_OPEN");

  assert.throws(() => ledger.registerExternalReceipt(oldReceipt,
    { recordedAt: at(60) }), /RECEIPT_STALE_CLAIM_STATE_HEAD/);
  assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.fraud,
    "CLEAR_CANDIDATE", "old-head-new-receipt", { observedAt: at(60),
      claimStateHeadHash: primaryClaimStateHeadHash }), 60),
  /RECEIPT_STALE_CLAIM_STATE_HEAD/);
  assert.throws(() => ledger.accountReserveCandidate(reserveInput(
    sourceFixture.candidate.claimIdentityHash, "old-head", 25_000,
    primaryClaimStateHeadHash), { recordedAt: at(60) }),
  /RESERVE_STALE_CLAIM_STATE_HEAD/);
  assert.throws(() => ledger.issuePaymentInstructionCandidate(oldInput,
    { recordedAt: at(60) }), /INSTRUCTION_CLAIM_OR_RESERVE_INVALID/);
  assert.throws(() => ledger.issuePaymentInstructionCandidate({ ...oldInput,
    instructionId: "instruction-new-head-old-reserve",
    claimStateHeadHash: amendment.claimStateHeadHash,
    oneUseNonce: "one_use_nonce_new_head_old_reserve_0001",
  }, { recordedAt: at(60) }), /INSTRUCTION_CLAIM_OR_RESERVE_INVALID/);
  assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.payment,
    "EXECUTION_REPORTED_CANDIDATE", "old-instruction-after-amendment", {
      observedAt: at(60), instructionHash: oldInstruction.instructionHash,
      claimStateHeadHash: primaryClaimStateHeadHash,
    }), 60), /RECEIPT_STALE_CLAIM_STATE_HEAD/);

  advanceToUnchallengedPaymentCandidate(ledger, 61, amendment.claimStateHeadHash);
  const newReserve = ledger.accountReserveCandidate(reserveInput(
    sourceFixture.candidate.claimIdentityHash, "new-head", 25_000,
    amendment.claimStateHeadHash), { recordedAt: at(68) });
  assert.throws(() => ledger.issuePaymentInstructionCandidate(instructionInput(
    newReserve.reserveHash, { id: "instruction-new-head-reused-nonce",
      nonce: "one_use_nonce_old_head_0001",
      claimStateHeadHash: amendment.claimStateHeadHash }), { recordedAt: at(69) }),
  /INSTRUCTION_NONCE_REUSE/);
  const newInstruction = ledger.issuePaymentInstructionCandidate(instructionInput(
    newReserve.reserveHash, { id: "instruction-new-head",
      nonce: "one_use_nonce_new_head_0001",
      claimStateHeadHash: amendment.claimStateHeadHash }), { recordedAt: at(69) });
  const finalReport = ledger.report({ asOf: at(70) });
  claim = finalReport.claims[0];
  assert.deepEqual(claim.instructionHashes, [newInstruction.instructionHash]);
  assert.deepEqual(claim.invalidatedInstructionHashes, [oldInstruction.instructionHash]);
  assert.equal(claim.activeReceiptHashes.length, 7);
  assert.equal(claim.invalidatedReceiptHashes.length, 7);
  assert.equal(claim.localWorkflowPreconditionsSatisfied, true);
  assert.equal(claim.authority.movesFunds, false);
  assert.equal(claim.authority.closesObligation, false);
  assert.equal(finalReport.reserveAccounting[0].locallyAccountedMinor, 50_000);
  assert.equal(finalReport.boundary.movesFunds, false);
});

test("amendment version linkage rejects skips and survives reorder, truncate, and reseal attacks",
  () => {
    const { directory, ledger } = openClone();
    const firstInput = amendmentInput({ id: "amendment-chain-one",
      contentLabel: "chain-one", amendedAt: at(50) });
    const first = ledger.appendClaimAmendment(firstInput, { recordedAt: at(50) });
    const duplicate = ledger.appendClaimAmendment(firstInput, { recordedAt: at(51) });
    assert.equal(duplicate.appended, false);
    assert.equal(duplicate.amendmentHash, first.amendmentHash);
    assert.throws(() => ledger.appendClaimAmendment({ ...firstInput,
      amendedContentHash: H("amendment-id-conflict") }, { recordedAt: at(51) }),
    /AMENDMENT_ID_CONFLICT/);
    const prefixEvents = readFileSync(path.join(directory, "events.jsonl"));
    const prefixIndex = readFileSync(path.join(directory, "index.json"));
    const secondInput = amendmentInput({
      id: "amendment-chain-two", version: 2,
      previousAmendmentHash: first.amendmentHash,
      previousClaimStateHeadHash: first.claimStateHeadHash,
      contentLabel: "chain-two", amendedAt: at(51),
    });
    const second = ledger.appendClaimAmendment(secondInput, { recordedAt: at(51) });

    assert.throws(() => ledger.appendClaimAmendment(amendmentInput({
      id: "amendment-skip", version: 4,
      previousAmendmentHash: second.amendmentHash,
      previousClaimStateHeadHash: second.claimStateHeadHash,
      contentLabel: "skip", amendedAt: at(52),
    }), { recordedAt: at(52) }), /AMENDMENT_STALE_OR_NONCONTIGUOUS_HEAD/);
    assert.throws(() => ledger.appendClaimAmendment(amendmentInput({
      id: "amendment-wrong-link", version: 3,
      previousAmendmentHash: H("wrong-amendment-link"),
      previousClaimStateHeadHash: second.claimStateHeadHash,
      contentLabel: "wrong-link", amendedAt: at(52),
    }), { recordedAt: at(52) }), /AMENDMENT_STALE_OR_NONCONTIGUOUS_HEAD/);
    assert.throws(() => ledger.appendClaimAmendment(amendmentInput({
      id: "amendment-wrong-head", version: 3,
      previousAmendmentHash: second.amendmentHash,
      previousClaimStateHeadHash: H("wrong-claim-state-head"),
      contentLabel: "wrong-head", amendedAt: at(52),
    }), { recordedAt: at(52) }), /AMENDMENT_STALE_OR_NONCONTIGUOUS_HEAD/);
    const claim = ledger.report({ asOf: at(52) }).claims[0];
    assert.equal(claim.amendmentVersion, 2);
    assert.deepEqual(claim.amendmentHashes,
      [first.amendmentHash, second.amendmentHash]);
    assert.equal(ledger.verify().ok, true);
    const checkpoint = ledger.createCheckpoint({ createdAt: at(52) });

    const reorderDirectory = temporary("outsider-stage4-amendment-reorder-");
    cpSync(directory, reorderDirectory, { recursive: true });
    const reordered = readFileSync(path.join(reorderDirectory, "events.jsonl"), "utf8")
      .trimEnd().split("\n");
    [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
    writeFileSync(path.join(reorderDirectory, "events.jsonl"), `${reordered.join("\n")}\n`,
      { mode: 0o600 });
    const reorderCheck = new DurableStage4ClaimsLifecycleFrontier({
      directory: reorderDirectory,
    }).verify();
    assert.equal(reorderCheck.ok, false);
    assert.match(reorderCheck.error, /EVENT_CHAIN_INVALID|EVENT_VERIFICATION_FAILED/);

    const truncateDirectory = temporary("outsider-stage4-amendment-truncate-");
    cpSync(directory, truncateDirectory, { recursive: true });
    writeFileSync(path.join(truncateDirectory, "events.jsonl"), prefixEvents, { mode: 0o600 });
    writeFileSync(path.join(truncateDirectory, "index.json"), prefixIndex, { mode: 0o600 });
    const truncateCheck = new DurableStage4ClaimsLifecycleFrontier({
      directory: truncateDirectory,
    }).verify({ requiredCheckpoint: checkpoint });
    assert.equal(truncateCheck.ok, false);
    assert.match(truncateCheck.error, /ROLLBACK_DETECTED/);

    const resealDirectory = temporary("outsider-stage4-amendment-reseal-");
    cpSync(directory, resealDirectory, { recursive: true });
    const artifactFile = path.join(resealDirectory, "artifacts",
      `${second.amendmentHash.slice(7)}.json`);
    const artifact = JSON.parse(readFileSync(artifactFile, "utf8"));
    const { amendmentHash: ignoredAmendmentHash,
      claimStateHeadHash: ignoredStateHeadHash, ...tamperedBody } = artifact;
    tamperedBody.amendedContentHash = H("resealed-amended-content");
    const tamperedAmendmentHash = domainDigest(artifact.schema, tamperedBody);
    const tamperedStateHeadHash = domainDigest("outsider/stage4/claim-state-head/v1", {
      claimIdentityHash: artifact.claimIdentityHash,
      claimRecordHash: artifact.claimRecordHash,
      amendmentVersion: artifact.amendmentVersion,
      previousClaimStateHeadHash: artifact.previousClaimStateHeadHash,
      amendmentHash: tamperedAmendmentHash,
    });
    writeFileSync(artifactFile, `${canonicalizeStrict({ ...tamperedBody,
      amendmentHash: tamperedAmendmentHash,
      claimStateHeadHash: tamperedStateHeadHash })}\n`, { mode: 0o600 });
    const resealCheck = new DurableStage4ClaimsLifecycleFrontier({
      directory: resealDirectory,
    }).verify();
    assert.equal(resealCheck.ok, false);
    assert.match(resealCheck.error, /AMENDMENT_CHAIN_OR_EVENT_BINDING_INVALID/);
  });

test("reserve accounting is single-writer, per-head, aggregate-bounded, and never custody",
  async () => {
    const { directory, ledger } = openClone();
    const second = await ledger.registerVerifiedClaim({
      candidate: secondSourceFixture.candidate,
      stage34Context: secondSourceFixture.stage34Context,
      priorCandidates: secondSourceFixture.priorCandidates,
      policyReferenceHash,
    }, { recordedAt: at(41) });
    const primary = ledger.accountReserveCandidate(reserveInput(
      sourceFixture.candidate.claimIdentityHash, "aggregate-primary", 80_000),
    { recordedAt: at(42) });
    assert.equal(primary.atomicLocalAccountingRecorded, true);
    assert.equal(primary.fundsReserved, false);
    assert.equal(primary.movesFunds, false);
    assert.equal(primary.closesObligation, false);
    const duplicate = ledger.accountReserveCandidate(reserveInput(
      sourceFixture.candidate.claimIdentityHash, "aggregate-primary", 80_000),
    { recordedAt: at(43) });
    assert.equal(duplicate.appended, false);
    assert.throws(() => ledger.accountReserveCandidate(reserveInput(
      secondSourceFixture.candidate.claimIdentityHash, "aggregate-second", 30_000,
      second.claimRecordHash),
    { recordedAt: at(44) }), /RESERVE_AGGREGATE_LIMIT_EXCEEDED/);

    const before = readFileSync(path.join(directory, "events.jsonl"), "utf8");
    writeFileSync(path.join(directory, ".write.lock"), "held\n", { flag: "wx", mode: 0o600 });
    assert.throws(() => ledger.accountReserveCandidate(reserveInput(
      secondSourceFixture.candidate.claimIdentityHash, "concurrent", 10_000,
      second.claimRecordHash),
    { recordedAt: at(45) }), /STATE_LOCKED/);
    assert.equal(readFileSync(path.join(directory, "events.jsonl"), "utf8"), before);
    unlinkSync(path.join(directory, ".write.lock"));
    assert.equal(ledger.verify().ok, true);
  });

test("one-use payment nonce rejects replay and all instructions remain non-executable", () => {
  const { ledger } = openClone();
  advanceToUnchallengedPaymentCandidate(ledger, 50);
  const reserve = ledger.accountReserveCandidate(reserveInput(), { recordedAt: at(57) });
  const input = instructionInput(reserve.reserveHash);
  const first = ledger.issuePaymentInstructionCandidate(input, { recordedAt: at(58) });
  assert.equal(first.appended, true);
  const duplicate = ledger.issuePaymentInstructionCandidate(input, { recordedAt: at(59) });
  assert.equal(duplicate.appended, false);
  assert.throws(() => ledger.issuePaymentInstructionCandidate({ ...input,
    instructionId: "instruction-replay-different-id" }, { recordedAt: at(60) }),
  /INSTRUCTION_NONCE_REUSE/);
  assert.throws(() => ledger.issuePaymentInstructionCandidate({ ...input,
    instructionId: "instruction-second", oneUseNonce: "one_use_nonce_secondary_0002" },
  { recordedAt: at(61) }), /CLAIM_INSTRUCTION_ALREADY_EXISTS/);
  const report = ledger.report({ asOf: at(62) });
  assert.equal(report.counts.paymentInstructionCandidates, 1);
  assert.equal(report.counts.movesFunds, 0);
  assert.equal(report.boundary.settlementInstructionEligible, false);
});

test("payment, coverage VOID, and diet breach never erase recovery or close obligation", () => {
  const { ledger } = openClone();
  advanceToUnchallengedPaymentCandidate(ledger, 50);
  const reserve = ledger.accountReserveCandidate(reserveInput(), { recordedAt: at(57) });
  const instruction = ledger.issuePaymentInstructionCandidate(
    instructionInput(reserve.reserveHash), { recordedAt: at(58) });
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.payment,
    "EXECUTION_REPORTED_CANDIDATE", "payment-reported", { observedAt: at(59),
      instructionHash: instruction.instructionHash }), 59);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.technicalRecovery,
    "COMPLETE_CANDIDATE", "recovery-complete", { observedAt: at(60) }), 60);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.worldRestoration,
    "RESTORED_CANDIDATE", "world-restored", { observedAt: at(61) }), 61);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.coverage,
    "VOID_CANDIDATE", "coverage-void", { observedAt: at(62) }), 62);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.learningDiet,
    "BREACH_CANDIDATE", "diet-breach", { observedAt: at(63) }), 63);
  assert.throws(() => register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.closure,
    "CLOSURE_ELIGIBLE_CANDIDATE", "paid-means-closed", { observedAt: at(64) }), 64),
  /CLOSURE_BYPASSES_RECOVERY_RESTORATION_OR_HORIZON/);
  const claim = ledger.report({ asOf: at(65) }).claims[0];
  const workflow = claim.workflow;
  assert.equal(workflow.financialPayment, "EXECUTION_REPORTED_CANDIDATE");
  assert.equal(workflow.coverage, "VOID_CANDIDATE");
  assert.equal(workflow.learningDiet, "BREACH_CANDIDATE");
  assert.equal(workflow.technicalRecovery, "COMPLETE_CANDIDATE");
  assert.equal(workflow.worldRestoration, "RESTORED_CANDIDATE");
  assert.equal(claim.originalClaimPreserved, true);
  assert.equal(workflow.recoveryNonWaivable, true);
  assert.equal(workflow.obligationOpen, true);
  assert.equal(workflow.obligationClosure, "OPEN");
});

test("a mature delayed consequence reopens a prior closure candidate", () => {
  const { ledger } = openClone();
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.technicalRecovery,
    "COMPLETE_CANDIDATE", "delayed-recovery", { observedAt: at(50) }), 50);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.worldRestoration,
    "RESTORED_CANDIDATE", "delayed-restoration", { observedAt: at(51) }), 51);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.delayedConsequence,
    "NO_CONSEQUENCE_AT_MATURITY_CANDIDATE", "first-horizon", {
      observedAt: at(55), horizonId: "horizon-1", maturityAt: at(54),
    }), 55);
  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.closure,
    "CLOSURE_ELIGIBLE_CANDIDATE", "closure-candidate", { observedAt: at(56) }), 56);
  let workflow = ledger.report({ asOf: at(57) }).claims[0].workflow;
  assert.equal(workflow.obligationClosure, "CLOSURE_ELIGIBLE_CANDIDATE");
  assert.equal(workflow.obligationOpen, true);

  register(ledger, makeReceipt(STAGE4_RECEIPT_KINDS.delayedConsequence,
    "CONSEQUENCE_IDENTIFIED_CANDIDATE", "late-horizon", {
      observedAt: at(70), horizonId: "horizon-2", maturityAt: at(69),
    }), 70);
  workflow = ledger.report({ asOf: at(71) }).claims[0].workflow;
  assert.equal(workflow.obligationClosure, "REOPENED_CANDIDATE");
  assert.equal(workflow.reopenedByDelayedConsequence, true);
  assert.equal(workflow.reopenCount, 1);
  assert.equal(workflow.technicalRecovery, "REOPENED_CANDIDATE");
  assert.equal(workflow.worldRestoration, "REASSESSMENT_REQUIRED_CANDIDATE");
  assert.equal(workflow.obligationOpen, true);
});

test("a caller-held external checkpoint detects whole-ledger rollback", () => {
  const { directory, ledger } = openClone();
  const oldEvents = readFileSync(path.join(directory, "events.jsonl"));
  const oldIndex = readFileSync(path.join(directory, "index.json"));
  ledger.accountReserveCandidate(reserveInput(), { recordedAt: at(50) });
  const checkpoint = ledger.createCheckpoint({ createdAt: at(51) });
  assert.equal(ledger.verify({ requiredCheckpoint: checkpoint }).ok, true);

  writeFileSync(path.join(directory, "events.jsonl"), oldEvents, { mode: 0o600 });
  writeFileSync(path.join(directory, "index.json"), oldIndex, { mode: 0o600 });
  const rolledBack = new DurableStage4ClaimsLifecycleFrontier({ directory });
  const checked = rolledBack.verify({ requiredCheckpoint: checkpoint });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /ROLLBACK_DETECTED/);
  assert.equal(checked.movesFunds, false);
  assert.equal(checked.closesObligation, false);
});

test("CLI verifies the durable chain and a caller-held checkpoint without a private key", () => {
  const { directory, ledger } = openClone();
  const checkpoint = ledger.createCheckpoint({ createdAt: at(50) });
  const checkpointFile = path.join(directory, "required-checkpoint-copy.json");
  writeFileSync(checkpointFile, `${canonicalizeStrict(checkpoint)}\n`, { mode: 0o600 });
  const result = spawnSync(process.execPath, [
    "scripts/stage4-claims-lifecycle-frontier.mjs", "verify",
    "--directory", directory,
    "--required-checkpoint", checkpointFile,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const verified = JSON.parse(result.stdout);
  assert.equal(verified.ok, true);
  assert.equal(verified.externalCheckpointSatisfied, true);
  assert.equal(verified.externalInstitutionAuthorityVerified, false);
  assert.equal(verified.movesFunds, false);
  assert.equal(verified.closesObligation, false);
});

test("read-only Stage 4 CLI commands never create a missing registry", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage4-read-only-"));
  const missing = path.join(root, "missing-registry");
  for (const command of ["verify", "report"]) {
    const result = spawnSync(process.execPath, [
      "scripts/stage4-claims-lifecycle-frontier.mjs", command,
      "--directory", missing,
    ], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DIRECTORY_NOT_FOUND/);
    assert.equal(existsSync(missing), false);
  }
});
