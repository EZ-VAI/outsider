/*
 * Stage 3/4 authority frontier.
 *
 * The source-replayed Stage 2 and Reality Stewardship graphs end here.  This
 * module can describe what is locally bound and what remains externally
 * missing; it cannot turn a hash, signature, caller boolean, or registered
 * external submission into legal standing, capital, custody, coverage,
 * settlement authority, payment, restoration, or closure.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyStage2QuoteCandidate,
  verifyStage2QuoteFrontier,
} from "./outsider-stage2-quote-frontier.js";
import {
  verifyReadinessGapLedger,
} from "./outsider-readiness-gap-ledger.js";

export const STAGE34_AUTHORITY_FRONTIER_SCHEMAS = Object.freeze({
  frontier: "outsider/stage34-authority-frontier/v1",
  settlementCandidate: "outsider/stage4-settlement-instruction-candidate/v1",
});

const DOMAINS = Object.freeze({
  frontier: STAGE34_AUTHORITY_FRONTIER_SCHEMAS.frontier,
  settlementCandidate: STAGE34_AUTHORITY_FRONTIER_SCHEMAS.settlementCandidate,
  claimIdentity: "outsider/stage4-claim-identity/v1",
  priorCandidateSet: "outsider/stage4-prior-candidate-set/v1",
  priorClaimSet: "outsider/stage4-prior-claim-set/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,159}$/;

const FRONTIER_KEYS = Object.freeze([
  "schema", "schemaVersion", "createdAt", "bindings",
  "registeredExternalSubmissions", "externalSubmissionDisposition",
  "readiness", "stage3", "stage4Boundary", "frontierHash",
]);
const SETTLEMENT_KEYS = Object.freeze([
  "schema", "schemaVersion", "createdAt", "frontierHash", "ledgerHash",
  "claimIdentityHash", "bindings", "deduplication", "coverage",
  "reserve", "financialPayment", "technicalRecovery", "worldRestoration",
  "obligationClosure", "missingGapIds", "decision", "authority",
  "candidateHash",
]);

function fail(code) { throw new Error(code); }

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonicalEqual(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); } catch { return false; }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function iso(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function sortedUniqueHashes(values, code) {
  if (!Array.isArray(values) || values.length > 10_000
    || values.some((value) => !HASH.test(value ?? ""))) fail(code);
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(`${code}_DUPLICATE`);
  return sorted;
}

function zeroAuthority() {
  return {
    mode: "none",
    permitsExecution: false,
    permitsPrice: false,
    permitsGuarantee: false,
    grantsCoverage: false,
    settlementInstructionEligible: false,
    movesFunds: false,
    closesObligation: false,
  };
}

function fixedStage3() {
  return {
    mode: "ELIGIBILITY_REFERENCE_CANDIDATE_ONLY",
    currentSourcesReplayed: true,
    priceAuthorized: false,
    bindingContractVerified: false,
    standingIssuerVerified: false,
    resourceOwnerAdoptionVerified: false,
    affectedPartyStandingVerified: false,
    capitalExistenceVerified: false,
    authorizedCustodyVerified: false,
    aggregateLimitAtomicallyReserved: false,
    ownerGateIsActualWritePathVerified: false,
    recoveryRights: {
      nonWaivable: true,
      obligationOpen: true,
      survivesCoverageDispute: true,
      survivesWarrantyOrDietBreach: true,
      survivesProviderReplacement: true,
      externallyEnforceable: false,
    },
    decision: "HOLD_EXTERNAL_ISSUER_OWNER_CAPITAL_CONTRACT_AND_EVIDENCE",
    authority: zeroAuthority(),
  };
}

function fixedStage4Boundary() {
  return {
    mode: "SETTLEMENT_REFERENCE_CANDIDATE_ONLY",
    bindingStage3ContractVerified: false,
    uniqueGlobalClaimLedgerVerified: false,
    independentAdjudicationVerified: false,
    fraudConflictAndAppealFinalityVerified: false,
    authorizedCustodianRailVerified: false,
    paymentIsRestoration: false,
    paymentIsClosure: false,
    delayedConsequencesCanReopen: true,
    obligationOpen: true,
    decision: "HOLD_EXTERNAL_CONTRACT_ADJUDICATION_CUSTODY_AND_CONSEQUENCES",
    authority: zeroAuthority(),
  };
}

function fixedCoverage() {
  return {
    status: "NOT_ESTABLISHED",
    externalContractReferenceHash: null,
    coverageVerified: false,
    coverageChangeCanEraseRecovery: false,
  };
}

function fixedReserve() {
  return {
    status: "NOT_EXTERNALLY_VERIFIED",
    amount: null,
    currency: null,
    aggregateLimitChecked: false,
    atomicallyReserved: false,
    custodianAcknowledgementHash: null,
    authorizedCustodianVerified: false,
  };
}

function fixedFinancialPayment() {
  return {
    status: "NOT_AUTHORIZED",
    amount: null,
    currency: null,
    instructionHash: null,
    custodianAcknowledgementHash: null,
    executed: false,
  };
}

function fixedTechnicalRecovery() {
  return {
    status: "OPEN_UNVERIFIED",
    evidenceHash: null,
    externallyVerified: false,
    complete: false,
  };
}

function fixedWorldRestoration() {
  return {
    status: "NOT_ESTABLISHED",
    evidenceHash: null,
    externallyVerified: false,
    restored: false,
  };
}

function fixedObligationClosure() {
  return {
    status: "OPEN",
    obligationOpen: true,
    closureAuthorized: false,
    reopenable: true,
    delayedConsequencesMatured: false,
    affectedPartyChallengeComplete: false,
    recoveryNonWaivable: true,
    survivesCoverageVoidOrDietBreach: true,
  };
}

function registeredExternalSubmissions(ledger) {
  return ledger.gaps.flatMap((gap) => (gap.submissions ?? []).map((submission) => ({
    gapId: gap.gapId,
    artifactHash: submission.artifactHash,
    disposition: "SUBMITTED_UNVERIFIED",
    closureCredit: false,
  }))).sort((left, right) => `${left.gapId}\0${left.artifactHash}`
    .localeCompare(`${right.gapId}\0${right.artifactHash}`));
}

function openGapIds(ledger, stages) {
  const selected = new Set(stages);
  return ledger.gaps.filter((gap) => selected.has(gap.stage)
    && gap.status !== "SATISFIED_INTERNAL").map((gap) => gap.gapId).sort();
}

function readinessFromLedger(ledger) {
  const stage3MissingGapIds = openGapIds(ledger,
    ["MEASURE", "ATTEST", "CURATE", "PRICE", "GUARANTEE"]);
  const stage4MissingGapIds = openGapIds(ledger, ["GUARANTEE", "SETTLE"]);
  return {
    stage3MissingGapIds,
    stage4MissingGapIds,
    externalEvidenceVerified: false,
    externalInstitutionAuthorityVerified: false,
    registeredExternalSubmissionClosureCredit: 0,
    stage3BindingReady: false,
    stage4SettlementReady: false,
  };
}

function validateFrontierBindings(bindings) {
  if (!exactKeys(bindings, ["ledger", "stage2", "reality"])
    || !exactKeys(bindings.ledger, ["ledgerHash", "snapshot"])
    || !HASH.test(bindings.ledger.ledgerHash ?? "")
    || typeof bindings.ledger.snapshot !== "string"
    || !exactKeys(bindings.stage2, ["frontierHash", "quoteCandidateHash",
      "quoteIdentityHash", "claimHash", "wayHash", "worldHash", "registryHash",
      "realityEnvelopeHash", "factorPolicyHash", "modelDomainHash",
      "validityDomainHash", "rightsReferenceHash", "evidenceSetHash",
      "empiricalLedgerHash", "lossExposureBookHash", "frontierVerificationLevel",
      "quoteVerificationLevel", "sourceReverifiedDuringBuild", "quoteDecision",
      "binding", "price", "premium", "capital", "priceAuthority",
      "productionReady"])
    || [bindings.stage2.frontierHash, bindings.stage2.quoteCandidateHash,
      bindings.stage2.quoteIdentityHash, bindings.stage2.claimHash,
      bindings.stage2.wayHash, bindings.stage2.worldHash,
      bindings.stage2.registryHash, bindings.stage2.realityEnvelopeHash,
      bindings.stage2.factorPolicyHash, bindings.stage2.modelDomainHash,
      bindings.stage2.validityDomainHash, bindings.stage2.rightsReferenceHash,
      bindings.stage2.evidenceSetHash, bindings.stage2.empiricalLedgerHash,
      bindings.stage2.lossExposureBookHash].some((value) => !HASH.test(value ?? ""))
    || bindings.stage2.frontierVerificationLevel
      !== "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED"
    || bindings.stage2.quoteVerificationLevel
      !== "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED"
    || bindings.stage2.sourceReverifiedDuringBuild !== true
    || bindings.stage2.quoteDecision !== "NON_BINDING_ABSTAIN"
    || bindings.stage2.binding !== false
    || bindings.stage2.price !== null
    || bindings.stage2.premium !== null
    || bindings.stage2.capital !== null
    || bindings.stage2.priceAuthority !== false
    || bindings.stage2.productionReady !== false
    || !exactKeys(bindings.reality, ["envelopeHash", "sourceEvidenceAnchorHash",
      "boundaryHash", "claimHash", "wayHash", "worldHash", "executionHash",
      "consequenceObligationSetHash", "verificationLevel",
      "localProtocolSourcesReplayed", "rawCurateSourceObjectBytesReverified",
      "externalOwnerAdoptionVerified", "externalLedgerCompletenessVerified",
      "executionAuthorized", "closureAuthorized"])
    || [bindings.reality.envelopeHash, bindings.reality.sourceEvidenceAnchorHash,
      bindings.reality.boundaryHash, bindings.reality.claimHash,
      bindings.reality.wayHash, bindings.reality.worldHash,
      bindings.reality.executionHash,
      bindings.reality.consequenceObligationSetHash]
      .some((value) => !HASH.test(value ?? ""))
    || bindings.reality.verificationLevel
      !== "REPLAYED_INSIDE_FULL_STAGE2_FRONTIER"
    || bindings.reality.localProtocolSourcesReplayed !== true
    || bindings.reality.rawCurateSourceObjectBytesReverified !== false
    || bindings.reality.externalOwnerAdoptionVerified !== false
    || bindings.reality.externalLedgerCompletenessVerified !== false
    || bindings.reality.executionAuthorized !== false
    || bindings.reality.closureAuthorized !== false
    || bindings.stage2.claimHash !== bindings.reality.claimHash
    || bindings.stage2.wayHash !== bindings.reality.wayHash
    || bindings.stage2.worldHash !== bindings.reality.worldHash
    || bindings.stage2.realityEnvelopeHash !== bindings.reality.envelopeHash) {
    fail("STAGE34_FRONTIER_BINDINGS_INVALID");
  }
}

/**
 * Reopens the current Stage 2 known sources, replays the exact Reality graph,
 * and emits a no-authority frontier.  This entrypoint intentionally has no
 * generic `trusted`, `licensed`, `independent`, `reserve`, or `bind` switch.
 */
export async function buildStage34AuthorityFrontier(input) {
  const keys = ["readinessLedger", "stage2Frontier", "stage2QuoteCandidate",
    "stage2Sources", "stage2PriorQuoteCandidates", "createdAt"];
  if (!exactKeys(input, keys)) fail("STAGE34_FRONTIER_INPUT_SCHEMA_INVALID");
  const ledgerCheck = verifyReadinessGapLedger(input.readinessLedger);
  if (!ledgerCheck.ok) fail(`STAGE34_READINESS_LEDGER_INVALID:${ledgerCheck.error}`);
  const stage2Replay = verifyStage2QuoteFrontier(
    input.stage2Frontier, input.stage2Sources);
  if (!stage2Replay.ok
    || stage2Replay.verificationLevel
      !== "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED"
    || stage2Replay.sourceReverified !== true
    || stage2Replay.sourceArtifactsReplayed !== true
    || stage2Replay.pricingEligible !== false
    || stage2Replay.bindingQuote !== false
    || stage2Replay.price !== null
    || stage2Replay.premium !== null
    || stage2Replay.capital !== null) {
    fail(`STAGE34_STAGE2_FRONTIER_SOURCE_REPLAY_FAILED:${stage2Replay.error ?? "BOUNDARY"}`);
  }
  const quoteReplay = verifyStage2QuoteCandidate(input.stage2QuoteCandidate, {
    frontier: input.stage2Frontier,
    sources: input.stage2Sources,
    priorCandidates: input.stage2PriorQuoteCandidates,
  });
  if (!quoteReplay.ok
    || quoteReplay.verificationLevel
      !== "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED"
    || quoteReplay.sourceReverified !== true
    || quoteReplay.sourceArtifactsReplayed !== true
    || quoteReplay.decision !== "NON_BINDING_ABSTAIN"
    || quoteReplay.binding !== false
    || quoteReplay.price !== null
    || quoteReplay.premium !== null
    || quoteReplay.capital !== null
    || quoteReplay.permitsCoverage !== false
    || quoteReplay.permitsGuarantee !== false
    || quoteReplay.permitsSettlement !== false) {
    fail(`STAGE34_STAGE2_QUOTE_SOURCE_REPLAY_FAILED:${quoteReplay.error ?? "BOUNDARY"}`);
  }
  const commonBindingKeys = ["frontierHash", "claimHash", "wayHash", "worldHash",
    "registryHash", "realityEnvelopeHash", "factorPolicyHash", "modelDomainHash",
    "validityDomainHash", "rightsReferenceHash", "evidenceSetHash"];
  if (commonBindingKeys.some((key) =>
    stage2Replay.bindingHashes?.[key] !== quoteReplay.bindingHashes?.[key])
    || quoteReplay.bindingHashes?.candidateHash
      !== input.stage2QuoteCandidate.candidateHash
    || quoteReplay.bindingHashes?.quoteIdentityHash
      !== input.stage2QuoteCandidate.quoteIdentityHash
    || input.stage2Frontier.quoteBoundary?.decision !== "NON_BINDING_ABSTAIN"
    || input.stage2QuoteCandidate.decision?.status !== "NON_BINDING_ABSTAIN") {
    fail("STAGE34_STAGE2_FRONTIER_QUOTE_BINDING_MISMATCH");
  }

  const stage2Bindings = stage2Replay.bindingHashes;
  const quoteBindings = quoteReplay.bindingHashes;
  const envelope = input.stage2Sources.realityEnvelope;
  const body = {
    schema: STAGE34_AUTHORITY_FRONTIER_SCHEMAS.frontier,
    schemaVersion: "1.0.0",
    createdAt: iso(input.createdAt, "STAGE34_FRONTIER_CREATED_AT_INVALID"),
    bindings: {
      ledger: {
        ledgerHash: input.readinessLedger.ledgerHash,
        snapshot: input.readinessLedger.snapshot,
      },
      stage2: {
        frontierHash: stage2Bindings.frontierHash,
        quoteCandidateHash: quoteBindings.candidateHash,
        quoteIdentityHash: quoteBindings.quoteIdentityHash,
        claimHash: stage2Bindings.claimHash,
        wayHash: stage2Bindings.wayHash,
        worldHash: stage2Bindings.worldHash,
        registryHash: stage2Bindings.registryHash,
        realityEnvelopeHash: stage2Bindings.realityEnvelopeHash,
        factorPolicyHash: stage2Bindings.factorPolicyHash,
        modelDomainHash: stage2Bindings.modelDomainHash,
        validityDomainHash: stage2Bindings.validityDomainHash,
        rightsReferenceHash: stage2Bindings.rightsReferenceHash,
        evidenceSetHash: stage2Bindings.evidenceSetHash,
        empiricalLedgerHash: stage2Bindings.empiricalLedgerHash,
        lossExposureBookHash: stage2Bindings.lossExposureBookHash,
        frontierVerificationLevel: stage2Replay.verificationLevel,
        quoteVerificationLevel: quoteReplay.verificationLevel,
        sourceReverifiedDuringBuild: true,
        quoteDecision: "NON_BINDING_ABSTAIN",
        binding: false,
        price: null,
        premium: null,
        capital: null,
        priceAuthority: false,
        productionReady: false,
      },
      reality: {
        envelopeHash: envelope.envelopeHash,
        sourceEvidenceAnchorHash: envelope.sourceEvidenceAnchorHash,
        boundaryHash: envelope.boundaryHash,
        claimHash: envelope.claimHash,
        wayHash: envelope.constitutionalBindings.wayHash,
        worldHash: envelope.constitutionalBindings.worldHash,
        executionHash: envelope.executionHash,
        consequenceObligationSetHash: envelope.consequenceObligations.obligationSetHash,
        verificationLevel: "REPLAYED_INSIDE_FULL_STAGE2_FRONTIER",
        localProtocolSourcesReplayed: true,
        rawCurateSourceObjectBytesReverified: false,
        externalOwnerAdoptionVerified: false,
        externalLedgerCompletenessVerified: false,
        executionAuthorized: false,
        closureAuthorized: false,
      },
    },
    registeredExternalSubmissions: registeredExternalSubmissions(input.readinessLedger),
    externalSubmissionDisposition: "REGISTERED_UNVERIFIED_NO_CLOSURE_CREDIT",
    readiness: readinessFromLedger(input.readinessLedger),
    stage3: fixedStage3(),
    stage4Boundary: fixedStage4Boundary(),
  };
  return deepFreeze({ ...body, frontierHash: digest(DOMAINS.frontier, body) });
}

/** Structural replay never authenticates the Stage 2 or Reality source bytes. */
export function verifyStage34AuthorityFrontierStructure(frontier,
  { readinessLedger } = {}) {
  try {
    if (!exactKeys(frontier, FRONTIER_KEYS)
      || frontier.schema !== STAGE34_AUTHORITY_FRONTIER_SCHEMAS.frontier
      || frontier.schemaVersion !== "1.0.0"
      || !HASH.test(frontier.frontierHash ?? "")
      || iso(frontier.createdAt, "STAGE34_FRONTIER_CREATED_AT_INVALID")
        !== frontier.createdAt) {
      fail("STAGE34_FRONTIER_SCHEMA_INVALID");
    }
    const { frontierHash, ...body } = frontier;
    if (frontierHash !== digest(DOMAINS.frontier, body)) {
      fail("STAGE34_FRONTIER_HASH_INVALID");
    }
    validateFrontierBindings(frontier.bindings);
    if (frontier.externalSubmissionDisposition
        !== "REGISTERED_UNVERIFIED_NO_CLOSURE_CREDIT"
      || !canonicalEqual(frontier.stage3, fixedStage3())
      || !canonicalEqual(frontier.stage4Boundary, fixedStage4Boundary())) {
      fail("STAGE34_FRONTIER_AUTHORITY_BOUNDARY_INVALID");
    }
    if (!Array.isArray(frontier.registeredExternalSubmissions)
      || frontier.registeredExternalSubmissions.some((submission) =>
        !exactKeys(submission,
          ["gapId", "artifactHash", "disposition", "closureCredit"])
        || !TOKEN.test(submission.gapId ?? "")
        || !HASH.test(submission.artifactHash ?? "")
        || submission.disposition !== "SUBMITTED_UNVERIFIED"
        || submission.closureCredit !== false)) {
      fail("STAGE34_FRONTIER_EXTERNAL_SUBMISSIONS_INVALID");
    }
    if (readinessLedger !== undefined) {
      const ledgerCheck = verifyReadinessGapLedger(readinessLedger);
      if (!ledgerCheck.ok
        || frontier.bindings.ledger.ledgerHash !== readinessLedger.ledgerHash
        || frontier.bindings.ledger.snapshot !== readinessLedger.snapshot
        || !canonicalEqual(frontier.registeredExternalSubmissions,
          registeredExternalSubmissions(readinessLedger))
        || !canonicalEqual(frontier.readiness, readinessFromLedger(readinessLedger))) {
        fail("STAGE34_FRONTIER_LEDGER_REPLAY_MISMATCH");
      }
    } else if (!exactKeys(frontier.readiness, ["stage3MissingGapIds",
      "stage4MissingGapIds", "externalEvidenceVerified",
      "externalInstitutionAuthorityVerified",
      "registeredExternalSubmissionClosureCredit", "stage3BindingReady",
      "stage4SettlementReady"])
      || frontier.readiness.externalEvidenceVerified !== false
      || frontier.readiness.externalInstitutionAuthorityVerified !== false
      || frontier.readiness.registeredExternalSubmissionClosureCredit !== 0
      || frontier.readiness.stage3BindingReady !== false
      || frontier.readiness.stage4SettlementReady !== false
      || !canonicalEqual(frontier.readiness.stage3MissingGapIds,
        [...frontier.readiness.stage3MissingGapIds].sort())
      || !canonicalEqual(frontier.readiness.stage4MissingGapIds,
        [...frontier.readiness.stage4MissingGapIds].sort())) {
      fail("STAGE34_FRONTIER_READINESS_INVALID");
    }
    return {
      ok: true,
      verificationLevel: "SELF_SEALED_STRUCTURE_AND_LEDGER_ONLY",
      sourceArtifactsReverified: false,
      externalEvidenceVerified: false,
      externalInstitutionAuthorityVerified: false,
      bindingGuarantee: false,
      settlementInstructionEligible: false,
      movesFunds: false,
      closesObligation: false,
      frontierHash,
    };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error),
      sourceArtifactsReverified: false, bindingGuarantee: false,
      settlementInstructionEligible: false, movesFunds: false,
      closesObligation: false };
  }
}

/** Reopens both source graphs and byte-compares the rebuilt frontier. */
export async function verifyStage34AuthorityFrontier(frontier, context) {
  try {
    const keys = ["readinessLedger", "stage2Frontier", "stage2QuoteCandidate",
      "stage2Sources", "stage2PriorQuoteCandidates"];
    if (!exactKeys(context, keys)) fail("STAGE34_FRONTIER_VERIFY_CONTEXT_INVALID");
    const rebuilt = await buildStage34AuthorityFrontier({
      ...context,
      createdAt: frontier.createdAt,
    });
    if (!canonicalEqual(frontier, rebuilt)) fail("STAGE34_FRONTIER_SOURCE_REPLAY_MISMATCH");
    return {
      ok: true,
      verificationLevel: "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED",
      sourceArtifactsReverified: true,
      stage2FrontierDerivationVerified: true,
      stage2QuoteDerivationVerified: true,
      realityProtocolDerivationVerified: true,
      externalEvidenceVerified: false,
      externalInstitutionAuthorityVerified: false,
      bindingGuarantee: false,
      settlementInstructionEligible: false,
      movesFunds: false,
      closesObligation: false,
      frontierHash: frontier.frontierHash,
    };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error),
      sourceArtifactsReverified: false, bindingGuarantee: false,
      settlementInstructionEligible: false, movesFunds: false,
      closesObligation: false };
  }
}

function verifyPriorCandidateSet(priorCandidates) {
  if (!Array.isArray(priorCandidates) || priorCandidates.length > 10_000) {
    fail("STAGE4_PRIOR_CANDIDATES_INVALID");
  }
  const candidateHashes = [];
  const claimIdentityHashes = [];
  for (const prior of priorCandidates) {
    const checked = verifyStage4SettlementInstructionCandidate(prior);
    if (!checked.ok) fail(`STAGE4_PRIOR_CANDIDATE_INVALID:${checked.error}`);
    candidateHashes.push(prior.candidateHash);
    claimIdentityHashes.push(prior.claimIdentityHash);
  }
  return {
    priorCandidateHashes: sortedUniqueHashes(candidateHashes,
      "STAGE4_PRIOR_CANDIDATE_HASHES_INVALID"),
    priorClaimIdentityHashes: sortedUniqueHashes(claimIdentityHashes,
      "STAGE4_PRIOR_CLAIM_IDENTITIES_INVALID"),
  };
}

/**
 * Creates a Stage 4 instruction candidate from the held frontier.  It accepts
 * no claim object, reserve, coverage, adjudication, payment, recovery,
 * restoration, or closure switch: all are externally blocked and fixed here.
 */
export function buildStage4SettlementInstructionCandidate(input) {
  const keys = ["frontier", "readinessLedger", "priorCandidates", "createdAt"];
  if (!exactKeys(input, keys)) fail("STAGE4_CANDIDATE_INPUT_SCHEMA_INVALID");
  const frontierCheck = verifyStage34AuthorityFrontierStructure(input.frontier,
    { readinessLedger: input.readinessLedger });
  if (!frontierCheck.ok) fail(`STAGE4_FRONTIER_INVALID:${frontierCheck.error}`);
  const prior = verifyPriorCandidateSet(input.priorCandidates);
  const bindings = {
    realityEnvelopeHash: input.frontier.bindings.reality.envelopeHash,
    sourceEvidenceAnchorHash: input.frontier.bindings.reality.sourceEvidenceAnchorHash,
    claimHash: input.frontier.bindings.reality.claimHash,
    executionHash: input.frontier.bindings.reality.executionHash,
    consequenceObligationSetHash:
      input.frontier.bindings.reality.consequenceObligationSetHash,
  };
  const claimIdentityHash = digest(DOMAINS.claimIdentity, bindings);
  if (prior.priorClaimIdentityHashes.includes(claimIdentityHash)) {
    fail("STAGE4_DUPLICATE_CLAIM_IDENTITY");
  }
  const deduplication = {
    ...prior,
    priorCandidateSetHash: digest(DOMAINS.priorCandidateSet,
      prior.priorCandidateHashes),
    priorClaimSetHash: digest(DOMAINS.priorClaimSet,
      prior.priorClaimIdentityHashes),
    duplicateFound: false,
    localPrefixChecked: true,
    globalCompletenessVerified: false,
  };
  const body = {
    schema: STAGE34_AUTHORITY_FRONTIER_SCHEMAS.settlementCandidate,
    schemaVersion: "1.0.0",
    createdAt: iso(input.createdAt, "STAGE4_CANDIDATE_CREATED_AT_INVALID"),
    frontierHash: input.frontier.frontierHash,
    ledgerHash: input.readinessLedger.ledgerHash,
    claimIdentityHash,
    bindings,
    deduplication,
    coverage: fixedCoverage(),
    reserve: fixedReserve(),
    financialPayment: fixedFinancialPayment(),
    technicalRecovery: fixedTechnicalRecovery(),
    worldRestoration: fixedWorldRestoration(),
    obligationClosure: fixedObligationClosure(),
    missingGapIds: openGapIds(input.readinessLedger, ["GUARANTEE", "SETTLE"]),
    decision: "HOLD_EXTERNAL_CONTRACT_CLAIM_ADJUDICATION_RESERVE_CUSTODY_AND_RECOVERY",
    authority: zeroAuthority(),
  };
  return deepFreeze({ ...body,
    candidateHash: digest(DOMAINS.settlementCandidate, body) });
}

function validateSettlementStructure(candidate) {
  if (!exactKeys(candidate, SETTLEMENT_KEYS)
    || candidate.schema !== STAGE34_AUTHORITY_FRONTIER_SCHEMAS.settlementCandidate
    || candidate.schemaVersion !== "1.0.0"
    || !HASH.test(candidate.candidateHash ?? "")
    || !HASH.test(candidate.frontierHash ?? "") || !HASH.test(candidate.ledgerHash ?? "")
    || !HASH.test(candidate.claimIdentityHash ?? "")
    || iso(candidate.createdAt, "STAGE4_CANDIDATE_CREATED_AT_INVALID")
      !== candidate.createdAt
    || !exactKeys(candidate.bindings, ["realityEnvelopeHash", "sourceEvidenceAnchorHash",
      "claimHash", "executionHash", "consequenceObligationSetHash"])
    || Object.values(candidate.bindings).some((value) => !HASH.test(value ?? ""))
    || candidate.claimIdentityHash !== digest(DOMAINS.claimIdentity, candidate.bindings)
    || !exactKeys(candidate.deduplication, ["priorCandidateHashes",
      "priorClaimIdentityHashes", "priorCandidateSetHash", "priorClaimSetHash",
      "duplicateFound", "localPrefixChecked", "globalCompletenessVerified"])
    || !canonicalEqual(candidate.deduplication.priorCandidateHashes,
      sortedUniqueHashes(candidate.deduplication.priorCandidateHashes,
        "STAGE4_CANDIDATE_PRIOR_HASHES_INVALID"))
    || !canonicalEqual(candidate.deduplication.priorClaimIdentityHashes,
      sortedUniqueHashes(candidate.deduplication.priorClaimIdentityHashes,
        "STAGE4_CANDIDATE_PRIOR_CLAIMS_INVALID"))
    || candidate.deduplication.priorCandidateSetHash !== digest(
      DOMAINS.priorCandidateSet, candidate.deduplication.priorCandidateHashes)
    || candidate.deduplication.priorClaimSetHash !== digest(
      DOMAINS.priorClaimSet, candidate.deduplication.priorClaimIdentityHashes)
    || candidate.deduplication.priorClaimIdentityHashes.includes(candidate.claimIdentityHash)
    || candidate.deduplication.duplicateFound !== false
    || candidate.deduplication.localPrefixChecked !== true
    || candidate.deduplication.globalCompletenessVerified !== false
    || !canonicalEqual(candidate.coverage, fixedCoverage())
    || !canonicalEqual(candidate.reserve, fixedReserve())
    || !canonicalEqual(candidate.financialPayment, fixedFinancialPayment())
    || !canonicalEqual(candidate.technicalRecovery, fixedTechnicalRecovery())
    || !canonicalEqual(candidate.worldRestoration, fixedWorldRestoration())
    || !canonicalEqual(candidate.obligationClosure, fixedObligationClosure())
    || candidate.decision
      !== "HOLD_EXTERNAL_CONTRACT_CLAIM_ADJUDICATION_RESERVE_CUSTODY_AND_RECOVERY"
    || !canonicalEqual(candidate.authority, zeroAuthority())
    || !Array.isArray(candidate.missingGapIds)
    || candidate.missingGapIds.some((gapId) => !TOKEN.test(gapId ?? ""))
    || new Set(candidate.missingGapIds).size !== candidate.missingGapIds.length
    || !canonicalEqual(candidate.missingGapIds, [...candidate.missingGapIds].sort())) {
    fail("STAGE4_CANDIDATE_BOUNDARY_INVALID");
  }
  const { candidateHash, ...body } = candidate;
  if (candidateHash !== digest(DOMAINS.settlementCandidate, body)) {
    fail("STAGE4_CANDIDATE_HASH_INVALID");
  }
}

export function verifyStage4SettlementInstructionCandidate(candidate, context = null) {
  try {
    validateSettlementStructure(candidate);
    let contextReplayed = false;
    if (context !== null) {
      if (!exactKeys(context, ["frontier", "readinessLedger", "priorCandidates"])) {
        fail("STAGE4_CANDIDATE_VERIFY_CONTEXT_INVALID");
      }
      const rebuilt = buildStage4SettlementInstructionCandidate({
        ...context,
        createdAt: candidate.createdAt,
      });
      if (!canonicalEqual(candidate, rebuilt)) fail("STAGE4_CANDIDATE_CONTEXT_MISMATCH");
      contextReplayed = true;
    }
    return {
      ok: true,
      verificationLevel: contextReplayed
        ? "FRONTIER_LEDGER_AND_LOCAL_PREFIX_REPLAYED"
        : "SELF_SEALED_STRUCTURE_ONLY",
      sourceArtifactsReverified: false,
      externalEvidenceVerified: false,
      externalInstitutionAuthorityVerified: false,
      settlementInstructionEligible: false,
      movesFunds: false,
      closesObligation: false,
      obligationOpen: true,
      reopenable: true,
      candidateHash: candidate.candidateHash,
    };
  } catch (error) {
    return { ok: false, error: error?.message ?? String(error),
      sourceArtifactsReverified: false, settlementInstructionEligible: false,
      movesFunds: false, closesObligation: false };
  }
}

export function describeStage34AuthorityFrontier() {
  return deepFreeze({
    schema: "outsider/stage34-authority-frontier-description/v1",
    inputs: [
      "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED Stage 2 frontier",
      "exact FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED NON_BINDING_ABSTAIN quote",
      "canonical readiness gap ledger",
    ],
    stage3Output: "non-binding eligibility/reference candidate permanently on HOLD",
    stage4Output: "non-executable settlement instruction candidate permanently on HOLD",
    externalSubmissionRule:
      "registration is unverified provenance only and always receives zero closure credit",
    stateSeparation: ["financialPayment", "technicalRecovery",
      "worldRestoration", "obligationClosure"],
    nonWaivableRecoveryRule:
      "coverage dispute, void claim, warranty or learning-diet breach cannot erase recovery",
    authority: zeroAuthority(),
  });
}
