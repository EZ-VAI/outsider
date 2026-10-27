/*
 * Stage 4 durable claims-lifecycle frontier.
 *
 * This registry is a signed, append-only local implementation of a globally
 * namespaced claim log.  It can preserve exact source bindings, reject replay
 * and conflicts, and advance a *candidate* workflow from receipts whose
 * configured keys verify.  Neither a configured key nor a valid signature
 * establishes insurer/adjudicator/custodian standing.  Every output remains
 * HOLD and this module never moves funds or closes an obligation.
 */

import {
  closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  openSync, readFileSync, renameSync, unlinkSync, writeSync,
} from "node:fs";
import {
  createHash, createPrivateKey, createPublicKey, randomBytes,
  sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyStage34AuthorityFrontier,
  verifyStage4SettlementInstructionCandidate,
} from "./outsider-stage34-authority-frontier.js";

export const STAGE4_CLAIMS_SCHEMAS = Object.freeze({
  config: "outsider/stage4-claims-registry-config/v1",
  event: "outsider/stage4-claims-registry-event/v1",
  index: "outsider/stage4-claims-registry-index/v1",
  checkpoint: "outsider/stage4-claims-registry-checkpoint/v1",
  claim: "outsider/stage4-source-bound-claim-record/v1",
  amendment: "outsider/stage4-claim-amendment/v1",
  reserve: "outsider/stage4-local-reserve-accounting-candidate/v1",
  instruction: "outsider/stage4-payment-instruction-candidate/v1",
  receipt: "outsider/stage4-external-lifecycle-receipt/v1",
  signature: "outsider/stage4-claims-signature/v1",
  report: "outsider/stage4-claims-lifecycle-report/v1",
});

export const STAGE4_RECEIPT_KINDS = Object.freeze({
  fraud: "FRAUD_SCREENING",
  conflict: "CONFLICT_SCREENING",
  adjudication: "ADJUDICATION",
  notice: "NOTICE",
  challenge: "CHALLENGE",
  appeal: "APPEAL",
  coverage: "COVERAGE_STATUS",
  learningDiet: "LEARNING_DIET_STATUS",
  payment: "PAYMENT_EXECUTION",
  technicalRecovery: "TECHNICAL_RECOVERY",
  worldRestoration: "WORLD_RESTORATION",
  delayedConsequence: "DELAYED_CONSEQUENCE",
  closure: "OBLIGATION_CLOSURE",
});

const RECEIPT_STATES = Object.freeze({
  FRAUD_SCREENING: new Set(["CLEAR_CANDIDATE", "FLAGGED_CANDIDATE"]),
  CONFLICT_SCREENING: new Set(["CLEAR_CANDIDATE", "FLAGGED_CANDIDATE"]),
  ADJUDICATION: new Set(["PAYMENT_ELIGIBLE_CANDIDATE", "DENIED_CANDIDATE"]),
  NOTICE: new Set(["DELIVERED_CANDIDATE", "FAILED_CANDIDATE"]),
  CHALLENGE: new Set(["OPENED_CANDIDATE", "WINDOW_MATURED_NO_CHALLENGE_CANDIDATE"]),
  APPEAL: new Set(["UPHELD_CANDIDATE", "REVERSED_CANDIDATE"]),
  COVERAGE_STATUS: new Set(["REFERENCED_CANDIDATE", "VOID_CANDIDATE",
    "DISPUTED_CANDIDATE"]),
  LEARNING_DIET_STATUS: new Set(["COMPLIANT_CANDIDATE", "BREACH_CANDIDATE"]),
  PAYMENT_EXECUTION: new Set(["EXECUTION_REPORTED_CANDIDATE",
    "EXECUTION_FAILED_CANDIDATE"]),
  TECHNICAL_RECOVERY: new Set(["COMPLETE_CANDIDATE", "FAILED_CANDIDATE",
    "OPEN_CANDIDATE"]),
  WORLD_RESTORATION: new Set(["RESTORED_CANDIDATE", "NOT_RESTORED_CANDIDATE"]),
  DELAYED_CONSEQUENCE: new Set(["NO_CONSEQUENCE_AT_MATURITY_CANDIDATE",
    "CONSEQUENCE_IDENTIFIED_CANDIDATE"]),
  OBLIGATION_CLOSURE: new Set(["CLOSURE_ELIGIBLE_CANDIDATE",
    "KEEP_OPEN_CANDIDATE"]),
});

const EVENT_TYPES = new Set([
  "REGISTER_CLAIM", "REGISTER_CLAIM_AMENDMENT", "ACCOUNT_RESERVE_CANDIDATE",
  "REGISTER_EXTERNAL_RECEIPT", "ISSUE_PAYMENT_INSTRUCTION_CANDIDATE",
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,159}$/;
const NONCE = /^[A-Za-z0-9_-]{16,192}$/;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const GENESIS = digest("outsider/stage4-claims-registry/genesis/v1", "genesis");

function fail(code, detail = null) {
  throw new Error(detail === null ? `STAGE4_CLAIMS_${code}`
    : `STAGE4_CLAIMS_${code}:${detail}`);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

function digest(domain, value) {
  const bytes = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(`${domain}\0${bytes}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalTime(value, code) {
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string" || text.length > 40 || !Number.isFinite(Date.parse(text))) {
    fail(`${code}_INVALID`);
  }
  const normalized = new Date(text).toISOString();
  if (normalized !== text) fail(`${code}_NON_CANONICAL`);
  return normalized;
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function nonnegativeInteger(value, code, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail(`${code}_INVALID`);
  return value;
}

function normalizedPublicKey(publicKeyPem, code = "PUBLIC_KEY") {
  try {
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512) fail(`${code}_INVALID`);
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail(`${code}_NOT_ED25519`);
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (String(error?.message ?? "").startsWith("STAGE4_CLAIMS_")) throw error;
    fail(`${code}_INVALID`);
  }
}

export function stage4ClaimsKeyId(publicKeyPem) {
  const normalized = normalizedPublicKey(publicKeyPem);
  const der = createPublicKey(normalized).export({ type: "spki", format: "der" });
  return `ed25519:sha256:${createHash("sha256").update(der).digest("hex")}`;
}

function privateIdentity(privateKeyPem) {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") fail("PRIVATE_KEY_NOT_ED25519");
    const publicKeyPem = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: stage4ClaimsKeyId(publicKeyPem) };
  } catch (error) {
    if (String(error?.message ?? "").startsWith("STAGE4_CLAIMS_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

function signaturePayload(role, artifactHash) {
  return canonicalizeStrict({ schema: STAGE4_CLAIMS_SCHEMAS.signature,
    role, artifactHash });
}

function signatureFor(role, artifactHash, privateKeyPem) {
  const identity = privateIdentity(privateKeyPem);
  return {
    algorithm: "Ed25519",
    role,
    keyId: identity.keyId,
    publicKeyPem: identity.publicKeyPem,
    value: cryptoSign(null, Buffer.from(signaturePayload(role, artifactHash)),
      identity.privateKey).toString("base64"),
  };
}

function verifySignature(signature, role, artifactHash, expected = null) {
  try {
    if (!exactKeys(signature, ["algorithm", "role", "keyId", "publicKeyPem", "value"])
      || signature.algorithm !== "Ed25519" || signature.role !== role
      || !KEY_ID.test(signature.keyId ?? "")
      || signature.keyId !== stage4ClaimsKeyId(signature.publicKeyPem)
      || typeof signature.value !== "string"
      || Buffer.from(signature.value, "base64").length !== 64
      || expected && (signature.keyId !== expected.keyId
        || normalizedPublicKey(signature.publicKeyPem) !== expected.publicKeyPem)) return false;
    return cryptoVerify(null, Buffer.from(signaturePayload(role, artifactHash)),
      createPublicKey(signature.publicKeyPem), Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function sealSigned(body, hashField, role, privateKeyPem) {
  const artifactHash = digest(body.schema, body);
  return deepFreeze({ ...body, [hashField]: artifactHash,
    signature: signatureFor(role, artifactHash, privateKeyPem) });
}

function zeroAuthority() {
  return {
    cryptographicIntegrityCanBeVerified: true,
    institutionalAuthorityEstablished: false,
    coverageEstablished: false,
    adjudicationAuthorityEstablished: false,
    custodianAuthorityEstablished: false,
    capitalExistenceVerified: false,
    settlementInstructionEligible: false,
    movesFunds: false,
    closesObligation: false,
  };
}

function normalizePolicyReference(value) {
  const rawKeys = ["policyId", "policyVersion", "policyReferenceHash",
    "coverageReferenceHash"];
  const expandedKeys = [...rawKeys, "referenceOnly", "coverageEstablished",
    "issuerStandingVerified", "contractBindingVerified"];
  if (!exactKeys(value, rawKeys) && !exactKeys(value, expandedKeys)) {
    fail("POLICY_REFERENCE_SCHEMA_INVALID");
  }
  const normalized = {
    policyId: token(value.policyId, "POLICY_ID"),
    policyVersion: token(value.policyVersion, "POLICY_VERSION"),
    policyReferenceHash: hash(value.policyReferenceHash, "POLICY_REFERENCE_HASH"),
    coverageReferenceHash: hash(value.coverageReferenceHash, "COVERAGE_REFERENCE_HASH"),
    referenceOnly: true,
    coverageEstablished: false,
    issuerStandingVerified: false,
    contractBindingVerified: false,
  };
  if (exactKeys(value, expandedKeys) && !same(value, normalized)) {
    fail("POLICY_REFERENCE_BOUNDARY_INVALID");
  }
  return normalized;
}

function normalizeReservePool(value) {
  const rawKeys = ["poolId", "currency", "accountingLimitMinor", "poolReferenceHash"];
  const expandedKeys = [...rawKeys, "localAccountingReferenceOnly",
    "fundsExistenceVerified", "custodyVerified"];
  if (!exactKeys(value, rawKeys) && !exactKeys(value, expandedKeys)) {
    fail("RESERVE_POOL_SCHEMA_INVALID");
  }
  const normalized = {
    poolId: token(value.poolId, "RESERVE_POOL_ID"),
    currency: token(value.currency, "RESERVE_CURRENCY"),
    accountingLimitMinor: nonnegativeInteger(value.accountingLimitMinor,
      "RESERVE_ACCOUNTING_LIMIT"),
    poolReferenceHash: hash(value.poolReferenceHash, "RESERVE_POOL_REFERENCE_HASH"),
    localAccountingReferenceOnly: true,
    fundsExistenceVerified: false,
    custodyVerified: false,
  };
  if (exactKeys(value, expandedKeys) && !same(value, normalized)) {
    fail("RESERVE_POOL_BOUNDARY_INVALID");
  }
  return normalized;
}

function normalizeSourceVerifier(value) {
  const rawKeys = ["verifierId", "interfaceId", "interfaceVersion",
    "receiptKinds", "keyId", "publicKeyPem", "organizationReferenceHash"];
  const expandedKeys = [...rawKeys, "configuredKeyCanVerifySignature",
    "institutionalAuthorityEstablished", "independenceEstablished",
    "externalAdoptionEstablished"];
  if (!exactKeys(value, rawKeys) && !exactKeys(value, expandedKeys)) {
    fail("SOURCE_VERIFIER_SCHEMA_INVALID");
  }
  const publicKeyPem = normalizedPublicKey(value.publicKeyPem, "SOURCE_VERIFIER_KEY");
  if (value.keyId !== stage4ClaimsKeyId(publicKeyPem)) fail("SOURCE_VERIFIER_KEY_ID_MISMATCH");
  if (!Array.isArray(value.receiptKinds) || value.receiptKinds.length < 1
    || value.receiptKinds.length > Object.keys(RECEIPT_STATES).length
    || value.receiptKinds.some((kind) => !RECEIPT_STATES[kind])) {
    fail("SOURCE_VERIFIER_RECEIPT_KINDS_INVALID");
  }
  const receiptKinds = [...new Set(value.receiptKinds)].sort();
  if (receiptKinds.length !== value.receiptKinds.length) fail("SOURCE_VERIFIER_KIND_DUPLICATE");
  const normalized = {
    verifierId: token(value.verifierId, "SOURCE_VERIFIER_ID"),
    interfaceId: token(value.interfaceId, "SOURCE_VERIFIER_INTERFACE_ID"),
    interfaceVersion: token(value.interfaceVersion, "SOURCE_VERIFIER_INTERFACE_VERSION"),
    receiptKinds,
    keyId: value.keyId,
    publicKeyPem,
    organizationReferenceHash: hash(value.organizationReferenceHash,
      "SOURCE_VERIFIER_ORGANIZATION_REFERENCE_HASH"),
    configuredKeyCanVerifySignature: true,
    institutionalAuthorityEstablished: false,
    independenceEstablished: false,
    externalAdoptionEstablished: false,
  };
  if (exactKeys(value, expandedKeys) && !same(value, normalized)) {
    fail("SOURCE_VERIFIER_BOUNDARY_INVALID");
  }
  return normalized;
}

function configBody({ registryId, createdAt, policyReferences, reservePools,
  sourceVerifiers, operator }) {
  if (!Array.isArray(policyReferences) || policyReferences.length < 1
    || policyReferences.length > 256 || !Array.isArray(reservePools)
    || reservePools.length < 1 || reservePools.length > 256
    || !Array.isArray(sourceVerifiers) || sourceVerifiers.length > 256) {
    fail("CONFIG_CATALOG_INVALID");
  }
  const policies = policyReferences.map(normalizePolicyReference)
    .sort((a, b) => a.policyReferenceHash.localeCompare(b.policyReferenceHash));
  const pools = reservePools.map(normalizeReservePool)
    .sort((a, b) => a.poolId.localeCompare(b.poolId));
  const verifiers = sourceVerifiers.map(normalizeSourceVerifier)
    .sort((a, b) => a.verifierId.localeCompare(b.verifierId));
  if (new Set(policies.map((item) => item.policyReferenceHash)).size !== policies.length
    || new Set(pools.map((item) => item.poolId)).size !== pools.length
    || new Set(verifiers.map((item) => item.verifierId)).size !== verifiers.length) {
    fail("CONFIG_CATALOG_DUPLICATE");
  }
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.config,
    schemaVersion: "1.0.0",
    registryId: token(registryId, "REGISTRY_ID"),
    createdAt: canonicalTime(createdAt, "REGISTRY_CREATED_AT"),
    globalIdentityNamespace: "OUTSIDER_STAGE4_CLAIM_IDENTITY_SHA256_V1",
    policyReferences: policies,
    reservePools: pools,
    sourceVerifiers: verifiers,
    operator,
    durability: {
      appendOnlyHashChain: true,
      signedEventsAndIndexes: true,
      atomicSingleWriterLock: true,
      fsyncBeforeAcknowledgement: true,
      idempotentExactReplay: true,
      conflictingIdentityRejected: true,
      versionedAmendmentHeadChain: true,
      latestClaimStateHeadBindingsRequired: true,
      oldHeadArtifactsRemainAuditOnly: true,
      externalCheckpointRollbackDetection: true,
      globalCompletenessEstablished: false,
    },
    boundary: zeroAuthority(),
  };
}

function createConfig(input, operatorPrivateKeyPem) {
  const identity = privateIdentity(operatorPrivateKeyPem);
  return sealSigned(configBody({ ...input,
    operator: { keyId: identity.keyId, publicKeyPem: identity.publicKeyPem } }),
  "configHash", "REGISTRY_OPERATOR", operatorPrivateKeyPem);
}

function verifyConfig(config) {
  try {
    if (!plain(config) || config.schema !== STAGE4_CLAIMS_SCHEMAS.config
      || config.schemaVersion !== "1.0.0"
      || !exactKeys(config.operator, ["keyId", "publicKeyPem"])) fail("CONFIG_INVALID");
    const body = configBody(config);
    const expected = { keyId: config.operator.keyId,
      publicKeyPem: normalizedPublicKey(config.operator.publicKeyPem) };
    if (!same(config, { ...body, configHash: digest(config.schema, body),
      signature: config.signature })
      || config.operator.keyId !== stage4ClaimsKeyId(config.operator.publicKeyPem)
      || !verifySignature(config.signature, "REGISTRY_OPERATOR", config.configHash,
        expected)) fail("CONFIG_VERIFICATION_FAILED");
    return { ok: true, configHash: config.configHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

function receiptBody(input) {
  if (!exactKeys(input, ["receiptId", "claimIdentityHash", "claimStateHeadHash",
    "kind", "assertedState", "verifierId", "subjectHash", "evidenceHash",
    "instructionHash", "horizonId", "maturityAt", "observedAt"])) {
    fail("RECEIPT_INPUT_SCHEMA_INVALID");
  }
  const states = RECEIPT_STATES[input.kind];
  if (!states || !states.has(input.assertedState)) fail("RECEIPT_STATE_INVALID");
  const observedAt = canonicalTime(input.observedAt, "RECEIPT_OBSERVED_AT");
  const maturityAt = input.maturityAt === null ? null
    : canonicalTime(input.maturityAt, "RECEIPT_MATURITY_AT");
  const horizonRequired = input.kind === STAGE4_RECEIPT_KINDS.delayedConsequence;
  if (horizonRequired !== (typeof input.horizonId === "string")
    || horizonRequired !== (maturityAt !== null)
    || maturityAt !== null && Date.parse(observedAt) < Date.parse(maturityAt)) {
    fail("RECEIPT_HORIZON_INVALID");
  }
  const instructionRequired = input.kind === STAGE4_RECEIPT_KINDS.payment;
  if (instructionRequired !== (input.instructionHash !== null)
    || input.instructionHash !== null && !HASH.test(input.instructionHash)) {
    fail("RECEIPT_INSTRUCTION_BINDING_INVALID");
  }
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    receiptId: token(input.receiptId, "RECEIPT_ID"),
    claimIdentityHash: hash(input.claimIdentityHash, "RECEIPT_CLAIM_IDENTITY_HASH"),
    claimStateHeadHash: hash(input.claimStateHeadHash,
      "RECEIPT_CLAIM_STATE_HEAD_HASH"),
    kind: input.kind,
    assertedState: input.assertedState,
    verifierId: token(input.verifierId, "RECEIPT_VERIFIER_ID"),
    subjectHash: hash(input.subjectHash, "RECEIPT_SUBJECT_HASH"),
    evidenceHash: hash(input.evidenceHash, "RECEIPT_EVIDENCE_HASH"),
    instructionHash: input.instructionHash,
    horizonId: horizonRequired ? token(input.horizonId, "RECEIPT_HORIZON_ID") : null,
    maturityAt,
    observedAt,
    assertionBoundary: {
      signedAssertionOnly: true,
      latestClaimStateHeadRequired: true,
      institutionalAuthorityEstablished: false,
      movesFunds: false,
      closesObligation: false,
    },
    decision: "HOLD_EXTERNAL_RECEIPT_UNVERIFIED_UNTIL_REGISTRY_EVALUATION",
  };
}

export function createStage4LifecycleReceipt(input, { privateKeyPem } = {}) {
  if (!privateKeyPem) fail("RECEIPT_PRIVATE_KEY_REQUIRED");
  return sealSigned(receiptBody(input), "receiptHash", "EXTERNAL_SOURCE",
    privateKeyPem);
}

function verifyReceiptSelf(receipt) {
  try {
    if (!plain(receipt) || receipt.schema !== STAGE4_CLAIMS_SCHEMAS.receipt
      || receipt.schemaVersion !== "1.0.0") fail("RECEIPT_INVALID");
    const { receiptHash, signature, schema: _schema, schemaVersion: _version,
      assertionBoundary: _boundary, decision: _decision, ...input } = receipt;
    const body = receiptBody(input);
    if (!same(receipt, { ...body, receiptHash: digest(body.schema, body), signature })
      || !verifySignature(signature, "EXTERNAL_SOURCE", receiptHash)) {
      fail("RECEIPT_SIGNATURE_INVALID");
    }
    return { ok: true, receiptHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

export function verifyStage4LifecycleReceipt(receipt, { sourceVerifiers = [] } = {}) {
  const self = verifyReceiptSelf(receipt);
  if (!self.ok) return deepFreeze({ ...self, cryptographicSignatureValid: false,
    configuredSourceVerified: false, institutionalAuthorityVerified: false,
    settlementInstructionEligible: false,
    decision: "HOLD_INVALID_OR_UNVERIFIED_RECEIPT",
    movesFunds: false, closesObligation: false });
  const verifier = sourceVerifiers.find((item) => item.verifierId === receipt.verifierId);
  const configured = verifier !== undefined
    && verifier.receiptKinds.includes(receipt.kind)
    && verifySignature(receipt.signature, "EXTERNAL_SOURCE", receipt.receiptHash,
      { keyId: verifier.keyId, publicKeyPem: verifier.publicKeyPem });
  return deepFreeze({
    ok: true,
    receiptHash: receipt.receiptHash,
    cryptographicSignatureValid: true,
    configuredSourceVerified: configured,
    disposition: configured
      ? "CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED"
      : "SUBMITTED_UNVERIFIED_SOURCE_NOT_REGISTERED",
    institutionalAuthorityVerified: false,
    independenceVerified: false,
    settlementInstructionEligible: false,
    decision: "HOLD_CONFIGURED_SIGNATURE_IS_NOT_INSTITUTIONAL_AUTHORITY",
    movesFunds: false,
    closesObligation: false,
  });
}

/**
 * Requires both full Stage 3/4 source replay and exact local-prefix replay of
 * the Stage 4 candidate.  The result is evidence admission, never authority.
 */
export async function verifyFullySourceBoundStage4Candidate(candidate, {
  stage34Context, priorCandidates,
} = {}) {
  try {
    if (!plain(stage34Context) || !Array.isArray(priorCandidates)) {
      fail("SOURCE_CONTEXT_INVALID");
    }
    const { frontier, readinessLedger, ...fullContext } = stage34Context;
    const frontierCheck = await verifyStage34AuthorityFrontier(frontier,
      { readinessLedger, ...fullContext });
    if (!frontierCheck.ok
      || frontierCheck.verificationLevel
        !== "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED"
      || frontierCheck.sourceArtifactsReverified !== true
      || frontierCheck.externalInstitutionAuthorityVerified !== false
      || frontierCheck.movesFunds !== false || frontierCheck.closesObligation !== false) {
      fail("FRONTIER_FULL_SOURCE_REPLAY_REQUIRED", frontierCheck.error ?? "BOUNDARY");
    }
    const candidateCheck = verifyStage4SettlementInstructionCandidate(candidate,
      { frontier, readinessLedger, priorCandidates });
    if (!candidateCheck.ok
      || candidateCheck.verificationLevel !== "FRONTIER_LEDGER_AND_LOCAL_PREFIX_REPLAYED"
      || candidateCheck.settlementInstructionEligible !== false
      || candidateCheck.movesFunds !== false || candidateCheck.closesObligation !== false
      || candidate.frontierHash !== frontier.frontierHash
      || candidate.ledgerHash !== readinessLedger.ledgerHash) {
      fail("CANDIDATE_CONTEXT_REPLAY_REQUIRED", candidateCheck.error ?? "BOUNDARY");
    }
    return deepFreeze({
      ok: true,
      claimIdentityHash: candidate.claimIdentityHash,
      candidateHash: candidate.candidateHash,
      frontierHash: frontier.frontierHash,
      ledgerHash: readinessLedger.ledgerHash,
      frontierVerificationLevel: frontierCheck.verificationLevel,
      candidateVerificationLevel: candidateCheck.verificationLevel,
      sourceArtifactsReverified: true,
      externalEvidenceAuthorityVerified: false,
      externalInstitutionAuthorityVerified: false,
      settlementInstructionEligible: false,
      decision: "HOLD_FULL_SOURCE_REPLAY_DOES_NOT_CREATE_SETTLEMENT_AUTHORITY",
      movesFunds: false,
      closesObligation: false,
    });
  } catch (error) {
    return deepFreeze({ ok: false, error: error?.message ?? String(error),
      sourceArtifactsReverified: false, externalInstitutionAuthorityVerified: false,
      decision: "HOLD_SOURCE_REPLAY_NOT_VERIFIED",
      settlementInstructionEligible: false, movesFunds: false, closesObligation: false });
  }
}

function claimBody(candidate, admission, policyReference) {
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.claim,
    schemaVersion: "1.0.0",
    claimIdentityHash: candidate.claimIdentityHash,
    candidateHash: candidate.candidateHash,
    bindings: {
      frontierHash: candidate.frontierHash,
      readinessLedgerHash: candidate.ledgerHash,
      realityEnvelopeHash: candidate.bindings.realityEnvelopeHash,
      sourceEvidenceAnchorHash: candidate.bindings.sourceEvidenceAnchorHash,
      underlyingRealityClaimHash: candidate.bindings.claimHash,
      executionHash: candidate.bindings.executionHash,
      consequenceObligationSetHash: candidate.bindings.consequenceObligationSetHash,
    },
    sourceVerification: {
      frontierVerificationLevel: admission.frontierVerificationLevel,
      candidateVerificationLevel: admission.candidateVerificationLevel,
      sourceArtifactsReverifiedAtAdmission: true,
    },
    policyReference,
    coverage: {
      status: "REFERENCE_ONLY_UNVERIFIED",
      coverageEstablished: false,
      coverageCanEraseRecovery: false,
    },
    decision: "HOLD_EXTERNAL_POLICY_ADJUDICATION_CAPITAL_CUSTODY_AND_CLOSURE",
    authority: zeroAuthority(),
  };
}

function amendmentBody(input) {
  if (!exactKeys(input, ["amendmentId", "claimIdentityHash", "claimRecordHash",
    "amendmentVersion", "previousAmendmentHash", "previousClaimStateHeadHash",
    "amendedContentHash", "amendmentEvidenceHash", "amendedAt"])) {
    fail("AMENDMENT_INPUT_SCHEMA_INVALID");
  }
  const amendmentVersion = nonnegativeInteger(input.amendmentVersion,
    "AMENDMENT_VERSION", 1_000_000);
  if (amendmentVersion < 1) fail("AMENDMENT_VERSION_ZERO");
  const previousAmendmentHash = input.previousAmendmentHash === null ? null
    : hash(input.previousAmendmentHash, "AMENDMENT_PREVIOUS_HASH");
  if ((amendmentVersion === 1) !== (previousAmendmentHash === null)) {
    fail("AMENDMENT_PREVIOUS_HASH_VERSION_MISMATCH");
  }
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.amendment,
    schemaVersion: "1.0.0",
    amendmentId: token(input.amendmentId, "AMENDMENT_ID"),
    claimIdentityHash: hash(input.claimIdentityHash, "AMENDMENT_CLAIM_IDENTITY_HASH"),
    claimRecordHash: hash(input.claimRecordHash, "AMENDMENT_CLAIM_RECORD_HASH"),
    amendmentVersion,
    previousAmendmentHash,
    previousClaimStateHeadHash: hash(input.previousClaimStateHeadHash,
      "AMENDMENT_PREVIOUS_CLAIM_STATE_HEAD_HASH"),
    amendedContentHash: hash(input.amendedContentHash, "AMENDMENT_CONTENT_HASH"),
    amendmentEvidenceHash: hash(input.amendmentEvidenceHash,
      "AMENDMENT_EVIDENCE_HASH"),
    amendedAt: canonicalTime(input.amendedAt, "AMENDMENT_AMENDED_AT"),
    semantics: {
      preservesOriginalClaimRecord: true,
      invalidatesPriorHeadForNewReceipts: true,
      invalidatesPriorHeadReserveForInstruction: true,
      invalidatesPriorHeadInstructionForExecutionReceipt: true,
      institutionalAmendmentAuthorityEstablished: false,
    },
    decision: "HOLD_AMENDMENT_CONTENT_COMMITMENT_NO_INSTITUTIONAL_AUTHORITY",
    authority: zeroAuthority(),
  };
}

function buildAmendment(input) {
  const body = amendmentBody(input);
  const amendmentHash = digest(STAGE4_CLAIMS_SCHEMAS.amendment, body);
  const claimStateHeadHash = digest("outsider/stage4/claim-state-head/v1", {
    claimIdentityHash: body.claimIdentityHash,
    claimRecordHash: body.claimRecordHash,
    amendmentVersion: body.amendmentVersion,
    previousClaimStateHeadHash: body.previousClaimStateHeadHash,
    amendmentHash,
  });
  return deepFreeze({ ...body, amendmentHash, claimStateHeadHash });
}

function reserveBody(input, pool) {
  if (!exactKeys(input, ["reserveRequestId", "claimIdentityHash", "claimStateHeadHash",
    "poolId", "amountMinor", "reserveBasisHash"])) fail("RESERVE_INPUT_SCHEMA_INVALID");
  const amountMinor = nonnegativeInteger(input.amountMinor, "RESERVE_AMOUNT",
    pool.accountingLimitMinor);
  if (amountMinor < 1) fail("RESERVE_AMOUNT_ZERO");
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.reserve,
    schemaVersion: "1.0.0",
    reserveRequestId: token(input.reserveRequestId, "RESERVE_REQUEST_ID"),
    claimIdentityHash: hash(input.claimIdentityHash, "RESERVE_CLAIM_IDENTITY_HASH"),
    claimStateHeadHash: hash(input.claimStateHeadHash, "RESERVE_CLAIM_STATE_HEAD_HASH"),
    poolId: pool.poolId,
    poolReferenceHash: pool.poolReferenceHash,
    currency: pool.currency,
    amountMinor,
    reserveBasisHash: hash(input.reserveBasisHash, "RESERVE_BASIS_HASH"),
    accounting: {
      atomicLocalPerClaimAndAggregateCheckRequired: true,
      latestClaimStateHeadRequired: true,
      localAccountingCandidate: true,
      fundsReserved: false,
      capitalExistenceVerified: false,
      custodyVerified: false,
    },
    decision: "HOLD_LOCAL_ACCOUNTING_REFERENCE_NO_CAPITAL_OR_CUSTODY_CLAIM",
    authority: zeroAuthority(),
  };
}

function instructionBody(input, claim, reserve) {
  if (!exactKeys(input, ["instructionId", "claimIdentityHash", "reserveHash",
    "claimStateHeadHash", "amountMinor", "currency", "payeeReferenceHash",
    "oneUseNonce"])) {
    fail("INSTRUCTION_INPUT_SCHEMA_INVALID");
  }
  if (!NONCE.test(input.oneUseNonce ?? "")) fail("INSTRUCTION_NONCE_INVALID");
  const amountMinor = nonnegativeInteger(input.amountMinor, "INSTRUCTION_AMOUNT");
  if (amountMinor < 1) fail("INSTRUCTION_AMOUNT_ZERO");
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.instruction,
    schemaVersion: "1.0.0",
    instructionId: token(input.instructionId, "INSTRUCTION_ID"),
    claimIdentityHash: hash(input.claimIdentityHash, "INSTRUCTION_CLAIM_IDENTITY_HASH"),
    claimStateHeadHash: hash(input.claimStateHeadHash,
      "INSTRUCTION_CLAIM_STATE_HEAD_HASH"),
    claimRecordHash: claim.claimRecordHash,
    reserveHash: hash(input.reserveHash, "INSTRUCTION_RESERVE_HASH"),
    amountMinor,
    currency: token(input.currency, "INSTRUCTION_CURRENCY"),
    payeeReferenceHash: hash(input.payeeReferenceHash, "INSTRUCTION_PAYEE_REFERENCE_HASH"),
    nonceHash: digest("outsider/stage4/payment-instruction-nonce/v1", input.oneUseNonce),
    preconditions: {
      configuredSourceWorkflowCandidateComplete: true,
      reserveAccountingCandidateHash: reserve.reserveHash,
      latestClaimStateHeadRequired: true,
      policyAndCoverageRemainReferenceOnly: true,
      institutionalAdjudicationVerified: false,
      custodyVerified: false,
    },
    decision: "HOLD_NON_EXECUTABLE_PAYMENT_INSTRUCTION_CANDIDATE",
    authority: zeroAuthority(),
  };
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function assertRegularFile(file, code, maximumBytes = MAX_FILE_BYTES) {
  const stats = lstatSync(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maximumBytes) {
    fail(`${code}_INVALID`);
  }
}

function readCanonicalJson(file, code, maximumBytes = MAX_FILE_BYTES) {
  if (!existsSync(file)) fail(`${code}_MISSING`);
  assertRegularFile(file, code, maximumBytes);
  const text = readFileSync(file, "utf8");
  let value;
  try { value = JSON.parse(text); } catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== text) fail(`${code}_NOT_CANONICAL`);
  return value;
}

function atomicCanonicalJson(file, value, { exclusive = false } = {}) {
  const directory = path.dirname(file);
  const temporary = path.join(directory,
    `.${path.basename(file)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let fd = null;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeAll(fd, Buffer.from(`${canonicalizeStrict(value)}\n`));
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    if (exclusive) {
      linkSync(temporary, file);
      unlinkSync(temporary);
    } else renameSync(temporary, file);
    fsyncDirectory(directory);
  } finally {
    if (fd !== null) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function createEmptyFile(file) {
  const fd = openSync(file, "wx", 0o600);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function appendEvent(file, event) {
  const fd = openSync(file, "a", 0o600);
  try {
    writeAll(fd, Buffer.from(`${canonicalizeStrict(event)}\n`));
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function parseEvents(file) {
  assertRegularFile(file, "EVENT_LOG");
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) fail("EVENT_LOG_TRUNCATED");
  return text.slice(0, -1).split("\n").map((line) => {
    let value;
    try { value = JSON.parse(line); } catch { fail("EVENT_LOG_JSON_INVALID"); }
    if (canonicalizeStrict(value) !== line) fail("EVENT_LOG_NOT_CANONICAL");
    return value;
  });
}

function eventBody({ config, sequence, type, recordedAt, previousEventHash, payload }) {
  if (!EVENT_TYPES.has(type)) fail("EVENT_TYPE_INVALID");
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.event,
    schemaVersion: "1.0.0",
    registryId: config.registryId,
    sequence: nonnegativeInteger(sequence, "EVENT_SEQUENCE"),
    type,
    recordedAt: canonicalTime(recordedAt, "EVENT_RECORDED_AT"),
    previousEventHash: hash(previousEventHash, "EVENT_PREVIOUS_HASH"),
    payload,
  };
}

function createEvent(input, operatorPrivateKeyPem) {
  return sealSigned(eventBody(input), "eventHash", "REGISTRY_OPERATOR",
    operatorPrivateKeyPem);
}

function verifyEvents(events, config) {
  let priorHash = GENESIS;
  let priorTime = Date.parse(config.createdAt);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!plain(event) || event.schema !== STAGE4_CLAIMS_SCHEMAS.event
      || event.schemaVersion !== "1.0.0" || event.registryId !== config.registryId
      || event.sequence !== index + 1 || event.previousEventHash !== priorHash
      || !EVENT_TYPES.has(event.type)) fail("EVENT_CHAIN_INVALID");
    const payloadKeys = event.type === "REGISTER_EXTERNAL_RECEIPT"
      ? ["artifactHash", "claimIdentityHash", "disposition"]
      : ["artifactHash", "claimIdentityHash"];
    if (!exactKeys(event.payload, payloadKeys)
      || !HASH.test(event.payload.artifactHash ?? "")
      || !HASH.test(event.payload.claimIdentityHash ?? "")
      || event.type === "REGISTER_EXTERNAL_RECEIPT"
        && !["CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED",
          "SUBMITTED_UNVERIFIED_SOURCE_NOT_REGISTERED"].includes(
          event.payload.disposition)) fail("EVENT_PAYLOAD_INVALID");
    const body = eventBody({ ...event, config });
    if (Date.parse(event.recordedAt) < priorTime
      || event.eventHash !== digest(event.schema, body)
      || !verifySignature(event.signature, "REGISTRY_OPERATOR", event.eventHash,
        config.operator)) fail("EVENT_VERIFICATION_FAILED");
    priorHash = event.eventHash;
    priorTime = Date.parse(event.recordedAt);
  }
  return priorHash;
}

function artifactHashFromEvent(event) {
  return event.payload.artifactHash;
}

function artifactFile(directory, artifactHash) {
  hash(artifactHash, "ARTIFACT_HASH");
  return path.join(directory, "artifacts", `${artifactHash.slice(7)}.json`);
}

function readArtifacts(directory, events) {
  const output = new Map();
  for (const event of events) {
    const artifactHash = artifactHashFromEvent(event);
    if (!HASH.test(artifactHash ?? "")) fail("EVENT_ARTIFACT_HASH_INVALID");
    if (!output.has(artifactHash)) {
      output.set(artifactHash, readCanonicalJson(artifactFile(directory, artifactHash),
        "ARTIFACT"));
    }
  }
  return output;
}

function workflowInitial() {
  return {
    fraud: "SCREENING_OPEN",
    conflict: "SCREENING_OPEN",
    adjudication: "NOT_RECORDED",
    notice: "NOT_RECORDED",
    challenge: "NOT_MATURED",
    appeal: "NOT_APPLICABLE",
    coverage: "REFERENCE_ONLY_UNVERIFIED",
    learningDiet: "NOT_RECORDED",
    financialPayment: "NOT_AUTHORIZED",
    technicalRecovery: "OPEN_UNVERIFIED",
    worldRestoration: "NOT_ESTABLISHED",
    delayedConsequence: "HORIZONS_OPEN",
    maturedHorizonIds: [],
    consequenceHorizonIds: [],
    obligationClosure: "OPEN",
    reopenedByDelayedConsequence: false,
    reopenCount: 0,
    recoveryNonWaivable: true,
    obligationOpen: true,
  };
}

function candidateReceiptDisposition(event) {
  return event.payload.disposition
    === "CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED";
}

function applyReceipt(workflow, receipt, instructions) {
  const next = { ...workflow,
    maturedHorizonIds: [...workflow.maturedHorizonIds],
    consequenceHorizonIds: [...workflow.consequenceHorizonIds] };
  if (receipt.kind === "FRAUD_SCREENING") {
    if (next.fraud !== "SCREENING_OPEN") fail("FRAUD_SCREENING_ALREADY_FINALIZED");
    next.fraud = receipt.assertedState;
  } else if (receipt.kind === "CONFLICT_SCREENING") {
    if (next.conflict !== "SCREENING_OPEN") fail("CONFLICT_SCREENING_ALREADY_FINALIZED");
    next.conflict = receipt.assertedState;
  } else if (receipt.kind === "ADJUDICATION") {
    if (next.adjudication !== "NOT_RECORDED") fail("ADJUDICATION_ALREADY_FINALIZED");
    if (next.fraud !== "CLEAR_CANDIDATE" || next.conflict !== "CLEAR_CANDIDATE") {
      fail("ADJUDICATION_BYPASSES_SCREENING");
    }
    next.adjudication = receipt.assertedState;
  } else if (receipt.kind === "NOTICE") {
    if (next.notice !== "NOT_RECORDED" || next.adjudication === "NOT_RECORDED") {
      fail("NOTICE_OUT_OF_ORDER_OR_ALREADY_FINALIZED");
    }
    next.notice = receipt.assertedState;
  } else if (receipt.kind === "CHALLENGE") {
    if (next.notice !== "DELIVERED_CANDIDATE"
      || next.adjudication === "NOT_RECORDED"
      || next.challenge !== "NOT_MATURED") {
      fail("CHALLENGE_BEFORE_NOTICE_OR_ALREADY_FINALIZED");
    }
    next.challenge = receipt.assertedState;
    next.appeal = receipt.assertedState === "OPENED_CANDIDATE"
      ? "PENDING_CANDIDATE" : "NOT_APPLICABLE";
  } else if (receipt.kind === "APPEAL") {
    if (next.challenge !== "OPENED_CANDIDATE" || next.appeal !== "PENDING_CANDIDATE") {
      fail("APPEAL_WITHOUT_OPEN_PENDING_CHALLENGE");
    }
    next.appeal = receipt.assertedState;
  } else if (receipt.kind === "COVERAGE_STATUS") {
    if (["VOID_CANDIDATE", "DISPUTED_CANDIDATE"].includes(next.coverage)
      || next.coverage === "REFERENCED_CANDIDATE"
        && receipt.assertedState === "REFERENCED_CANDIDATE") {
      fail("COVERAGE_STATUS_FINAL_OR_DUPLICATE");
    }
    next.coverage = receipt.assertedState;
  } else if (receipt.kind === "LEARNING_DIET_STATUS") {
    if (next.learningDiet === "BREACH_CANDIDATE"
      || next.learningDiet === "COMPLIANT_CANDIDATE"
        && receipt.assertedState === "COMPLIANT_CANDIDATE") {
      fail("LEARNING_DIET_STATUS_FINAL_OR_DUPLICATE");
    }
    next.learningDiet = receipt.assertedState;
  } else if (receipt.kind === "PAYMENT_EXECUTION") {
    if (!instructions.some((item) => item.instructionHash === receipt.instructionHash)) {
      fail("PAYMENT_RECEIPT_INSTRUCTION_UNKNOWN");
    }
    if (next.financialPayment !== "NOT_AUTHORIZED") {
      fail("PAYMENT_EXECUTION_ALREADY_REPORTED");
    }
    if (!workflowAllowsInstruction(next)) {
      fail("PAYMENT_RECEIPT_WORKFLOW_NO_LONGER_ELIGIBLE");
    }
    next.financialPayment = receipt.assertedState;
  } else if (receipt.kind === "TECHNICAL_RECOVERY") {
    next.technicalRecovery = receipt.assertedState;
  } else if (receipt.kind === "WORLD_RESTORATION") {
    next.worldRestoration = receipt.assertedState;
  } else if (receipt.kind === "DELAYED_CONSEQUENCE") {
    const alreadyMatured = next.maturedHorizonIds.includes(receipt.horizonId);
    const alreadyConsequence = next.consequenceHorizonIds.includes(receipt.horizonId);
    if (alreadyConsequence
      || alreadyMatured && receipt.assertedState
        === "NO_CONSEQUENCE_AT_MATURITY_CANDIDATE") {
      fail("DELAYED_HORIZON_DUPLICATE_OR_CONFLICT");
    }
    if (!alreadyMatured) next.maturedHorizonIds.push(receipt.horizonId);
    next.maturedHorizonIds.sort();
    next.delayedConsequence = receipt.assertedState;
    if (receipt.assertedState === "CONSEQUENCE_IDENTIFIED_CANDIDATE") {
      next.consequenceHorizonIds.push(receipt.horizonId);
      next.consequenceHorizonIds.sort();
      next.obligationClosure = "REOPENED_CANDIDATE";
      next.reopenedByDelayedConsequence = true;
      next.reopenCount += 1;
      next.technicalRecovery = "REOPENED_CANDIDATE";
      next.worldRestoration = "REASSESSMENT_REQUIRED_CANDIDATE";
      next.obligationOpen = true;
    }
  } else if (receipt.kind === "OBLIGATION_CLOSURE") {
    if (receipt.assertedState === "CLOSURE_ELIGIBLE_CANDIDATE"
      && (next.technicalRecovery !== "COMPLETE_CANDIDATE"
        || next.worldRestoration !== "RESTORED_CANDIDATE"
        || next.delayedConsequence !== "NO_CONSEQUENCE_AT_MATURITY_CANDIDATE")) {
      fail("CLOSURE_BYPASSES_RECOVERY_RESTORATION_OR_HORIZON");
    }
    if (!["OPEN", "KEEP_OPEN_CANDIDATE"].includes(next.obligationClosure)) {
      fail("CLOSURE_ALREADY_FINALIZED_OR_REOPENED");
    }
    next.obligationClosure = receipt.assertedState;
    next.obligationOpen = true;
  }
  // Coverage void, diet breach, and reported payment never mutate recovery,
  // restoration, or the open obligation.
  next.recoveryNonWaivable = true;
  next.obligationOpen = true;
  return next;
}

function workflowAllowsInstruction(workflow) {
  const challengeComplete = workflow.challenge === "WINDOW_MATURED_NO_CHALLENGE_CANDIDATE"
    || workflow.challenge === "OPENED_CANDIDATE" && workflow.appeal === "UPHELD_CANDIDATE";
  return workflow.fraud === "CLEAR_CANDIDATE"
    && workflow.conflict === "CLEAR_CANDIDATE"
    && workflow.adjudication === "PAYMENT_ELIGIBLE_CANDIDATE"
    && workflow.notice === "DELIVERED_CANDIDATE"
    && workflow.coverage === "REFERENCED_CANDIDATE"
    && workflow.learningDiet === "COMPLIANT_CANDIDATE"
    && challengeComplete;
}

function validateClaimArtifact(artifact, config) {
  const keys = ["schema", "schemaVersion", "claimIdentityHash", "candidateHash",
    "bindings", "sourceVerification", "policyReference", "coverage", "decision",
    "authority", "claimRecordHash"];
  if (!exactKeys(artifact, keys) || artifact.schema !== STAGE4_CLAIMS_SCHEMAS.claim
    || artifact.schemaVersion !== "1.0.0"
    || !HASH.test(artifact.claimIdentityHash ?? "")
    || !HASH.test(artifact.candidateHash ?? "")
    || !exactKeys(artifact.bindings, ["frontierHash", "readinessLedgerHash",
      "realityEnvelopeHash", "sourceEvidenceAnchorHash", "underlyingRealityClaimHash",
      "executionHash", "consequenceObligationSetHash"])
    || Object.values(artifact.bindings).some((value) => !HASH.test(value ?? ""))
    || !exactKeys(artifact.sourceVerification, ["frontierVerificationLevel",
      "candidateVerificationLevel", "sourceArtifactsReverifiedAtAdmission"])
    || artifact.sourceVerification.frontierVerificationLevel
      !== "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED"
    || artifact.sourceVerification.candidateVerificationLevel
      !== "FRONTIER_LEDGER_AND_LOCAL_PREFIX_REPLAYED"
    || artifact.sourceVerification.sourceArtifactsReverifiedAtAdmission !== true
    || !exactKeys(artifact.coverage, ["status", "coverageEstablished",
      "coverageCanEraseRecovery"])
    || artifact.coverage.status !== "REFERENCE_ONLY_UNVERIFIED"
    || artifact.coverage.coverageEstablished !== false
    || artifact.coverage.coverageCanEraseRecovery !== false
    || artifact.decision
      !== "HOLD_EXTERNAL_POLICY_ADJUDICATION_CAPITAL_CUSTODY_AND_CLOSURE"
    || !same(artifact.authority, zeroAuthority())) fail("CLAIM_ARTIFACT_INVALID");
  const policy = normalizePolicyReference(artifact.policyReference);
  if (!config.policyReferences.some((item) => same(item, policy))) {
    fail("CLAIM_POLICY_REFERENCE_NOT_CONFIGURED");
  }
  const { claimRecordHash, ...body } = artifact;
  if (claimRecordHash !== digest(artifact.schema, body)) fail("CLAIM_ARTIFACT_HASH_INVALID");
}

function validateAmendmentArtifact(artifact) {
  const keys = ["schema", "schemaVersion", "amendmentId", "claimIdentityHash",
    "claimRecordHash", "amendmentVersion", "previousAmendmentHash",
    "previousClaimStateHeadHash", "amendedContentHash", "amendmentEvidenceHash",
    "amendedAt", "semantics", "decision", "authority", "amendmentHash",
    "claimStateHeadHash"];
  if (!exactKeys(artifact, keys)
    || artifact.schema !== STAGE4_CLAIMS_SCHEMAS.amendment
    || artifact.schemaVersion !== "1.0.0") fail("AMENDMENT_ARTIFACT_INVALID");
  const rebuilt = buildAmendment({
    amendmentId: artifact.amendmentId,
    claimIdentityHash: artifact.claimIdentityHash,
    claimRecordHash: artifact.claimRecordHash,
    amendmentVersion: artifact.amendmentVersion,
    previousAmendmentHash: artifact.previousAmendmentHash,
    previousClaimStateHeadHash: artifact.previousClaimStateHeadHash,
    amendedContentHash: artifact.amendedContentHash,
    amendmentEvidenceHash: artifact.amendmentEvidenceHash,
    amendedAt: artifact.amendedAt,
  });
  if (!same(artifact, rebuilt)) fail("AMENDMENT_ARTIFACT_DERIVATION_INVALID");
}

function amendmentsFor(claimIdentityHash, amendments) {
  return amendments.filter((item) => item.claimIdentityHash === claimIdentityHash)
    .sort((left, right) => left.amendmentVersion - right.amendmentVersion);
}

function currentClaimState(claim, amendments) {
  const chain = amendmentsFor(claim.claimIdentityHash, amendments);
  const head = chain.at(-1) ?? null;
  return {
    amendmentVersion: head?.amendmentVersion ?? 0,
    amendmentHeadHash: head?.amendmentHash ?? null,
    claimStateHeadHash: head?.claimStateHeadHash ?? claim.claimRecordHash,
    amendmentHashes: chain.map((item) => item.amendmentHash),
  };
}

function validateReserveArtifact(artifact, config) {
  const keys = ["schema", "schemaVersion", "reserveRequestId", "claimIdentityHash",
    "claimStateHeadHash", "poolId", "poolReferenceHash", "currency", "amountMinor",
    "reserveBasisHash", "accounting", "decision", "authority", "reserveHash"];
  if (!exactKeys(artifact, keys) || artifact.schema !== STAGE4_CLAIMS_SCHEMAS.reserve
    || artifact.schemaVersion !== "1.0.0" || !TOKEN.test(artifact.reserveRequestId ?? "")
    || !HASH.test(artifact.claimIdentityHash ?? "")
    || !HASH.test(artifact.claimStateHeadHash ?? "") || !TOKEN.test(artifact.poolId ?? "")
    || !HASH.test(artifact.poolReferenceHash ?? "") || !TOKEN.test(artifact.currency ?? "")
    || !Number.isSafeInteger(artifact.amountMinor) || artifact.amountMinor < 1
    || !HASH.test(artifact.reserveBasisHash ?? "")
    || !same(artifact.accounting, {
      atomicLocalPerClaimAndAggregateCheckRequired: true,
      latestClaimStateHeadRequired: true,
      localAccountingCandidate: true,
      fundsReserved: false,
      capitalExistenceVerified: false,
      custodyVerified: false,
    })
    || artifact.decision !== "HOLD_LOCAL_ACCOUNTING_REFERENCE_NO_CAPITAL_OR_CUSTODY_CLAIM"
    || !same(artifact.authority, zeroAuthority())) fail("RESERVE_ARTIFACT_INVALID");
  const pool = config.reservePools.find((item) => item.poolId === artifact.poolId);
  if (!pool || artifact.poolReferenceHash !== pool.poolReferenceHash
    || artifact.currency !== pool.currency || artifact.amountMinor > pool.accountingLimitMinor) {
    fail("RESERVE_POOL_BINDING_INVALID");
  }
  const { reserveHash, ...body } = artifact;
  if (reserveHash !== digest(artifact.schema, body)) fail("RESERVE_ARTIFACT_HASH_INVALID");
}

function validateInstructionArtifact(artifact) {
  const keys = ["schema", "schemaVersion", "instructionId", "claimIdentityHash",
    "claimStateHeadHash", "claimRecordHash", "reserveHash", "amountMinor", "currency",
    "payeeReferenceHash", "nonceHash", "preconditions", "decision", "authority",
    "instructionHash"];
  if (!exactKeys(artifact, keys)
    || artifact.schema !== STAGE4_CLAIMS_SCHEMAS.instruction
    || artifact.schemaVersion !== "1.0.0" || !TOKEN.test(artifact.instructionId ?? "")
    || !HASH.test(artifact.claimIdentityHash ?? "")
    || !HASH.test(artifact.claimStateHeadHash ?? "")
    || !HASH.test(artifact.claimRecordHash ?? "") || !HASH.test(artifact.reserveHash ?? "")
    || !Number.isSafeInteger(artifact.amountMinor) || artifact.amountMinor < 1
    || !TOKEN.test(artifact.currency ?? "") || !HASH.test(artifact.payeeReferenceHash ?? "")
    || !HASH.test(artifact.nonceHash ?? "")
    || !same(artifact.preconditions, {
      configuredSourceWorkflowCandidateComplete: true,
      reserveAccountingCandidateHash: artifact.reserveHash,
      latestClaimStateHeadRequired: true,
      policyAndCoverageRemainReferenceOnly: true,
      institutionalAdjudicationVerified: false,
      custodyVerified: false,
    })
    || artifact.decision !== "HOLD_NON_EXECUTABLE_PAYMENT_INSTRUCTION_CANDIDATE"
    || !same(artifact.authority, zeroAuthority())) fail("INSTRUCTION_ARTIFACT_INVALID");
  const { instructionHash, ...body } = artifact;
  if (instructionHash !== digest(artifact.schema, body)) {
    fail("INSTRUCTION_ARTIFACT_HASH_INVALID");
  }
}

function expectedReceiptSubject(receipt, claim, claimState) {
  if (receipt.kind === STAGE4_RECEIPT_KINDS.payment) return receipt.instructionHash;
  if (receipt.kind === STAGE4_RECEIPT_KINDS.coverage) {
    return claim.policyReference.coverageReferenceHash;
  }
  if ([STAGE4_RECEIPT_KINDS.technicalRecovery,
    STAGE4_RECEIPT_KINDS.worldRestoration,
    STAGE4_RECEIPT_KINDS.delayedConsequence,
    STAGE4_RECEIPT_KINDS.closure].includes(receipt.kind)) {
    return claim.bindings.consequenceObligationSetHash;
  }
  return claimState.claimStateHeadHash;
}

function replayState(events, artifacts, config) {
  verifyEvents(events, config);
  const claims = [];
  const amendments = [];
  const reserves = [];
  const receipts = [];
  const instructions = [];
  for (const event of events) {
    const artifact = artifacts.get(artifactHashFromEvent(event));
    if (!artifact) fail("ARTIFACT_MISSING");
    const claimIdentityHash = event.payload.claimIdentityHash;
    const claim = claims.find((item) => item.claimIdentityHash === claimIdentityHash);
    if (event.type === "REGISTER_CLAIM") {
      validateClaimArtifact(artifact, config);
      if (artifact.claimRecordHash !== event.payload.artifactHash
        || artifact.claimIdentityHash !== claimIdentityHash) fail("CLAIM_EVENT_BINDING_INVALID");
      const prior = claims.find((item) => item.claimIdentityHash === claimIdentityHash);
      if (prior) fail(prior.claimRecordHash === artifact.claimRecordHash
        ? "DUPLICATE_CLAIM_EVENT" : "CLAIM_IDENTITY_CONFLICT");
      claims.push(artifact);
    } else if (!claim) {
      fail("EVENT_BEFORE_CLAIM");
    } else if (event.type === "REGISTER_CLAIM_AMENDMENT") {
      validateAmendmentArtifact(artifact);
      const claimState = currentClaimState(claim, amendments);
      if (artifact.amendmentHash !== event.payload.artifactHash
        || artifact.claimIdentityHash !== claimIdentityHash
        || artifact.claimRecordHash !== claim.claimRecordHash
        || artifact.amendmentVersion !== claimState.amendmentVersion + 1
        || artifact.previousAmendmentHash !== claimState.amendmentHeadHash
        || artifact.previousClaimStateHeadHash !== claimState.claimStateHeadHash
        || Date.parse(artifact.amendedAt) > Date.parse(event.recordedAt)) {
        fail("AMENDMENT_CHAIN_OR_EVENT_BINDING_INVALID");
      }
      const prior = amendments.find((item) => item.amendmentId === artifact.amendmentId);
      if (prior) fail(prior.amendmentHash === artifact.amendmentHash
        ? "DUPLICATE_AMENDMENT_EVENT" : "AMENDMENT_ID_CONFLICT");
      amendments.push(artifact);
    } else if (event.type === "ACCOUNT_RESERVE_CANDIDATE") {
      validateReserveArtifact(artifact, config);
      const claimState = currentClaimState(claim, amendments);
      if (artifact.reserveHash !== event.payload.artifactHash
        || artifact.claimIdentityHash !== claimIdentityHash
        || artifact.claimStateHeadHash !== claimState.claimStateHeadHash) {
        fail("RESERVE_EVENT_BINDING_INVALID");
      }
      if (reserves.some((item) => item.reserveRequestId === artifact.reserveRequestId)) {
        fail("DUPLICATE_RESERVE_EVENT");
      }
      if (reserves.some((item) => item.claimIdentityHash === claimIdentityHash
        && item.claimStateHeadHash === artifact.claimStateHeadHash)) {
        fail("CLAIM_RESERVE_CONFLICT");
      }
      const pool = config.reservePools.find((item) => item.poolId === artifact.poolId);
      const total = reserves.filter((item) => item.poolId === artifact.poolId)
        .reduce((sum, item) => sum + item.amountMinor, 0);
      if (!pool || artifact.currency !== pool.currency
        || artifact.poolReferenceHash !== pool.poolReferenceHash
        || !Number.isSafeInteger(total + artifact.amountMinor)
        || total + artifact.amountMinor > pool.accountingLimitMinor) {
        fail("RESERVE_AGGREGATE_LIMIT_OR_POOL_INVALID");
      }
      reserves.push(artifact);
    } else if (event.type === "REGISTER_EXTERNAL_RECEIPT") {
      const claimState = currentClaimState(claim, amendments);
      const checked = verifyStage4LifecycleReceipt(artifact,
        { sourceVerifiers: config.sourceVerifiers });
      if (!checked.ok || artifact.receiptHash !== event.payload.artifactHash
        || artifact.claimIdentityHash !== claimIdentityHash
        || artifact.claimStateHeadHash !== claimState.claimStateHeadHash
        || checked.disposition !== event.payload.disposition
        || artifact.subjectHash !== expectedReceiptSubject(artifact, claim, claimState)) {
        fail("RECEIPT_EVENT_INVALID");
      }
      const prior = receipts.find((item) => item.receipt.receiptId === artifact.receiptId);
      if (prior) fail(prior.receipt.receiptHash === artifact.receiptHash
        ? "DUPLICATE_RECEIPT_EVENT" : "RECEIPT_ID_CONFLICT");
      if (candidateReceiptDisposition(event)) {
        const workflow = deriveWorkflow(claimIdentityHash,
          claimState.claimStateHeadHash, receipts, instructions);
        applyReceipt(workflow, artifact,
          instructions.filter((item) => item.claimIdentityHash === claimIdentityHash
            && item.claimStateHeadHash === claimState.claimStateHeadHash));
      }
      receipts.push({ receipt: artifact, disposition: event.payload.disposition });
    } else if (event.type === "ISSUE_PAYMENT_INSTRUCTION_CANDIDATE") {
      validateInstructionArtifact(artifact);
      const claimState = currentClaimState(claim, amendments);
      if (artifact.instructionHash !== event.payload.artifactHash
        || artifact.claimIdentityHash !== claimIdentityHash
        || artifact.claimStateHeadHash !== claimState.claimStateHeadHash
        || artifact.claimRecordHash !== claim.claimRecordHash) {
        fail("INSTRUCTION_EVENT_BINDING_INVALID");
      }
      if (instructions.some((item) => item.instructionId === artifact.instructionId)) {
        fail("DUPLICATE_INSTRUCTION_EVENT");
      }
      if (instructions.some((item) => item.nonceHash === artifact.nonceHash)) {
        fail("INSTRUCTION_NONCE_REUSE");
      }
      if (instructions.some((item) => item.claimIdentityHash === claimIdentityHash
        && item.claimStateHeadHash === artifact.claimStateHeadHash)) {
        fail("CLAIM_INSTRUCTION_ALREADY_EXISTS");
      }
      const reserve = reserves.find((item) => item.reserveHash === artifact.reserveHash
        && item.claimIdentityHash === claimIdentityHash
        && item.claimStateHeadHash === artifact.claimStateHeadHash);
      const workflow = deriveWorkflow(claimIdentityHash,
        artifact.claimStateHeadHash, receipts, instructions);
      if (!reserve || reserve.amountMinor !== artifact.amountMinor
        || reserve.currency !== artifact.currency || !workflowAllowsInstruction(workflow)) {
        fail("INSTRUCTION_PRECONDITIONS_INVALID");
      }
      instructions.push(artifact);
    }
  }
  return { claims, amendments, reserves, receipts, instructions, events, artifacts };
}

function deriveWorkflow(claimIdentityHash, claimStateHeadHash, receipts, instructions) {
  let workflow = workflowInitial();
  const claimInstructions = instructions.filter((item) =>
    item.claimIdentityHash === claimIdentityHash
    && item.claimStateHeadHash === claimStateHeadHash);
  for (const entry of receipts.filter((item) =>
    item.receipt.claimIdentityHash === claimIdentityHash
    && item.receipt.claimStateHeadHash === claimStateHeadHash
    && item.disposition === "CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED")) {
    workflow = applyReceipt(workflow, entry.receipt, claimInstructions);
  }
  return workflow;
}

function indexBody(config, state) {
  const claimViews = state.claims.map((claim) => {
    const claimState = currentClaimState(claim, state.amendments);
    const claimReserves = state.reserves.filter((item) =>
      item.claimIdentityHash === claim.claimIdentityHash);
    const reserve = claimReserves.find((item) =>
      item.claimStateHeadHash === claimState.claimStateHeadHash) ?? null;
    const instructions = state.instructions.filter((item) =>
      item.claimIdentityHash === claim.claimIdentityHash);
    const activeInstructions = instructions.filter((item) =>
      item.claimStateHeadHash === claimState.claimStateHeadHash);
    const claimReceipts = state.receipts.filter((item) =>
      item.receipt.claimIdentityHash === claim.claimIdentityHash);
    const activeReceipts = claimReceipts.filter((item) =>
      item.receipt.claimStateHeadHash === claimState.claimStateHeadHash);
    const workflow = deriveWorkflow(claim.claimIdentityHash,
      claimState.claimStateHeadHash, state.receipts, state.instructions);
    return {
      claimIdentityHash: claim.claimIdentityHash,
      claimRecordHash: claim.claimRecordHash,
      candidateHash: claim.candidateHash,
      claimStateHeadHash: claimState.claimStateHeadHash,
      amendmentVersion: claimState.amendmentVersion,
      amendmentHeadHash: claimState.amendmentHeadHash,
      amendmentHashes: claimState.amendmentHashes,
      originalClaimPreserved: true,
      reserveHash: reserve?.reserveHash ?? null,
      invalidatedReserveHashes: claimReserves.filter((item) =>
        item.claimStateHeadHash !== claimState.claimStateHeadHash)
        .map((item) => item.reserveHash).sort(),
      instructionHashes: activeInstructions.map((item) => item.instructionHash).sort(),
      invalidatedInstructionHashes: instructions.filter((item) =>
        item.claimStateHeadHash !== claimState.claimStateHeadHash)
        .map((item) => item.instructionHash).sort(),
      receiptHashes: claimReceipts.map((item) => item.receipt.receiptHash).sort(),
      activeReceiptHashes: activeReceipts.map((item) => item.receipt.receiptHash).sort(),
      invalidatedReceiptHashes: claimReceipts.filter((item) =>
        item.receipt.claimStateHeadHash !== claimState.claimStateHeadHash)
        .map((item) => item.receipt.receiptHash).sort(),
      configuredSourceReceiptCount: activeReceipts.filter((item) =>
        item.disposition === "CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED").length,
      unverifiedReceiptCount: activeReceipts.filter((item) =>
        item.disposition === "SUBMITTED_UNVERIFIED_SOURCE_NOT_REGISTERED").length,
      localWorkflowPreconditionsSatisfied: workflowAllowsInstruction(workflow),
      workflow,
      decision: "HOLD_EXTERNAL_INSTITUTION_AUTHORITY_AND_WORLD_CONSEQUENCES",
      authority: zeroAuthority(),
    };
  }).sort((a, b) => a.claimIdentityHash.localeCompare(b.claimIdentityHash));
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.index,
    schemaVersion: "1.0.0",
    registryId: config.registryId,
    configHash: config.configHash,
    updatedAt: state.events.at(-1)?.recordedAt ?? config.createdAt,
    log: {
      events: state.events.length,
      headEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
    },
    counts: {
      claims: state.claims.length,
      amendments: state.amendments.length,
      reserveAccountingCandidates: state.reserves.length,
      receipts: state.receipts.length,
      configuredSourceReceipts: state.receipts.filter((item) =>
        item.disposition === "CONFIGURED_SOURCE_SIGNATURE_VALID_AUTHORITY_UNVERIFIED").length,
      unverifiedReceipts: state.receipts.filter((item) =>
        item.disposition === "SUBMITTED_UNVERIFIED_SOURCE_NOT_REGISTERED").length,
      paymentInstructionCandidates: state.instructions.length,
      movesFunds: 0,
      obligationsClosed: 0,
    },
    reserveAccounting: config.reservePools.map((pool) => {
      const records = state.reserves.filter((item) => item.poolId === pool.poolId);
      return {
        poolId: pool.poolId,
        poolReferenceHash: pool.poolReferenceHash,
        currency: pool.currency,
        accountingLimitMinor: pool.accountingLimitMinor,
        locallyAccountedMinor: records.reduce((sum, item) => sum + item.amountMinor, 0),
        remainingLocalAccountingCapacityMinor: pool.accountingLimitMinor
          - records.reduce((sum, item) => sum + item.amountMinor, 0),
        claimCount: records.length,
        atomicLocalAccounting: true,
        capitalExistenceVerified: false,
        custodyVerified: false,
      };
    }),
    claims: claimViews,
    decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
    boundary: zeroAuthority(),
  };
}

function sealIndex(body, operatorPrivateKeyPem) {
  return sealSigned(body, "indexHash", "REGISTRY_OPERATOR", operatorPrivateKeyPem);
}

function verifyIndex(index, expected, config) {
  try {
    if (!plain(index) || index.schema !== STAGE4_CLAIMS_SCHEMAS.index
      || index.schemaVersion !== "1.0.0") fail("INDEX_INVALID");
    const { indexHash, signature, ...body } = index;
    if (!same(body, expected) || indexHash !== digest(index.schema, expected)
      || !verifySignature(signature, "REGISTRY_OPERATOR", indexHash, config.operator)
      || !same(index.boundary, zeroAuthority())) fail("INDEX_VERIFICATION_FAILED");
    return { ok: true, indexHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

function checkpointBody(config, state, index, createdAt) {
  return {
    schema: STAGE4_CLAIMS_SCHEMAS.checkpoint,
    schemaVersion: "1.0.0",
    registryId: config.registryId,
    configHash: config.configHash,
    createdAt: canonicalTime(createdAt, "CHECKPOINT_CREATED_AT"),
    eventCount: state.events.length,
    headEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
    indexHash: index.indexHash,
    boundary: zeroAuthority(),
  };
}

function verifyCheckpoint(checkpoint, config) {
  try {
    if (!plain(checkpoint) || checkpoint.schema !== STAGE4_CLAIMS_SCHEMAS.checkpoint
      || checkpoint.schemaVersion !== "1.0.0"
      || !Number.isSafeInteger(checkpoint.eventCount) || checkpoint.eventCount < 0
      || checkpoint.eventCount > 10_000_000
      || !HASH.test(checkpoint.headEventHash ?? "")
      || !HASH.test(checkpoint.indexHash ?? "")) fail("CHECKPOINT_INVALID");
    const { checkpointHash, signature, ...body } = checkpoint;
    const expected = checkpointBody(config, {
      events: Array.from({ length: checkpoint.eventCount }, (_, index) => ({
        eventHash: index === checkpoint.eventCount - 1 ? checkpoint.headEventHash : null,
      })),
    }, { indexHash: checkpoint.indexHash }, checkpoint.createdAt);
    if (!same(body, expected) || checkpointHash !== digest(checkpoint.schema, body)
      || !verifySignature(signature, "REGISTRY_OPERATOR", checkpointHash,
        config.operator)) fail("CHECKPOINT_VERIFICATION_FAILED");
    return { ok: true, checkpointHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

export class DurableStage4ClaimsLifecycleFrontier {
  constructor({ directory, operatorPrivateKeyPem = null,
    registryId = "outsider-global-stage4-claims",
    createdAt = new Date(), policyReferences = null, reservePools = null,
    sourceVerifiers = null, initializeIfMissing = true } = {}) {
    if (typeof directory !== "string" || directory.length === 0) fail("DIRECTORY_REQUIRED");
    this.directory = path.resolve(directory);
    this.artifactsDirectory = path.join(this.directory, "artifacts");
    this.configFile = path.join(this.directory, "config.json");
    this.eventsFile = path.join(this.directory, "events.jsonl");
    this.indexFile = path.join(this.directory, "index.json");
    this.lockFile = path.join(this.directory, ".write.lock");
    this.initializationLockFile = path.join(this.directory, ".initialize.lock");
    this.operatorPrivateKeyPem = operatorPrivateKeyPem;
    if (!existsSync(this.directory)) {
      if (!initializeIfMissing) fail("DIRECTORY_NOT_FOUND");
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    }
    if (!lstatSync(this.directory).isDirectory() || lstatSync(this.directory).isSymbolicLink()) {
      fail("DIRECTORY_INVALID");
    }
    if (!existsSync(this.artifactsDirectory)) {
      if (!initializeIfMissing) fail("ARTIFACT_DIRECTORY_NOT_FOUND");
      mkdirSync(this.artifactsDirectory, { recursive: true, mode: 0o700 });
    }
    if (!lstatSync(this.artifactsDirectory).isDirectory()
      || lstatSync(this.artifactsDirectory).isSymbolicLink()) fail("ARTIFACT_DIRECTORY_INVALID");
    const coreFiles = [this.configFile, this.eventsFile, this.indexFile];
    if (!coreFiles.every(existsSync)) {
      if (!initializeIfMissing) fail("INITIALIZATION_INCOMPLETE");
      let lock = null;
      try {
        try { lock = openSync(this.initializationLockFile, "wx", 0o600); }
        catch (error) { if (error?.code === "EEXIST") fail("INITIALIZATION_LOCKED"); throw error; }
        if (coreFiles.some(existsSync)) fail("INITIALIZATION_INCOMPLETE");
        if (!operatorPrivateKeyPem || !policyReferences || !reservePools || !sourceVerifiers) {
          fail("INITIALIZATION_INPUTS_REQUIRED");
        }
        const config = createConfig({ registryId, createdAt, policyReferences,
          reservePools, sourceVerifiers }, operatorPrivateKeyPem);
        const empty = { claims: [], amendments: [], reserves: [], receipts: [], instructions: [],
          events: [], artifacts: new Map() };
        atomicCanonicalJson(this.configFile, config, { exclusive: true });
        createEmptyFile(this.eventsFile);
        atomicCanonicalJson(this.indexFile,
          sealIndex(indexBody(config, empty), operatorPrivateKeyPem), { exclusive: true });
        fsyncDirectory(this.directory);
      } finally {
        if (lock !== null) {
          closeSync(lock);
          if (existsSync(this.initializationLockFile)) unlinkSync(this.initializationLockFile);
          fsyncDirectory(this.directory);
        }
      }
    }
    this.config = readCanonicalJson(this.configFile, "CONFIG", 4 * 1024 * 1024);
    const checked = verifyConfig(this.config);
    if (!checked.ok) fail("CONFIG_INVALID", checked.error);
    if (registryId !== "outsider-global-stage4-claims"
      && registryId !== this.config.registryId) fail("REGISTRY_ID_MISMATCH");
    if (operatorPrivateKeyPem
      && privateIdentity(operatorPrivateKeyPem).keyId !== this.config.operator.keyId) {
      fail("OPERATOR_KEY_MISMATCH");
    }
  }

  #requireOperator() {
    if (!this.operatorPrivateKeyPem) fail("OPERATOR_KEY_REQUIRED");
    if (privateIdentity(this.operatorPrivateKeyPem).keyId !== this.config.operator.keyId) {
      fail("OPERATOR_KEY_MISMATCH");
    }
  }

  #withLock(callback) {
    let lock = null;
    try {
      try { lock = openSync(this.lockFile, "wx", 0o600); }
      catch (error) { if (error?.code === "EEXIST") fail("STATE_LOCKED"); throw error; }
      return callback();
    } finally {
      if (lock !== null) {
        closeSync(lock);
        if (existsSync(this.lockFile)) unlinkSync(this.lockFile);
        fsyncDirectory(this.directory);
      }
    }
  }

  #load({ recoverSignedSuffix = false } = {}) {
    const config = readCanonicalJson(this.configFile, "CONFIG", 4 * 1024 * 1024);
    if (!same(config, this.config)) fail("CONFIG_DRIFT");
    const events = parseEvents(this.eventsFile);
    const artifacts = readArtifacts(this.directory, events);
    const state = replayState(events, artifacts, config);
    let index = readCanonicalJson(this.indexFile, "INDEX");
    const expected = indexBody(config, state);
    let checked = verifyIndex(index, expected, config);
    if (!checked.ok && recoverSignedSuffix && this.operatorPrivateKeyPem
      && Number.isSafeInteger(index?.log?.events) && index.log.events >= 0
      && index.log.events < events.length) {
      const prefixEvents = events.slice(0, index.log.events);
      const needed = new Set(prefixEvents.map(artifactHashFromEvent));
      const prefixArtifacts = new Map([...artifacts].filter(([key]) => needed.has(key)));
      const prefixState = replayState(prefixEvents, prefixArtifacts, config);
      if (verifyIndex(index, indexBody(config, prefixState), config).ok) {
        index = sealIndex(expected, this.operatorPrivateKeyPem);
        atomicCanonicalJson(this.indexFile, index);
        checked = verifyIndex(index, expected, config);
      }
    }
    if (!checked.ok) fail("CURRENT_INDEX_INVALID", checked.error);
    return { ...state, index, config };
  }

  #writeArtifact(artifactHash, artifact) {
    const file = artifactFile(this.directory, artifactHash);
    if (existsSync(file)) {
      if (!same(readCanonicalJson(file, "ORPHAN_ARTIFACT"), artifact)) {
        fail("ORPHAN_ARTIFACT_CONFLICT");
      }
      return;
    }
    atomicCanonicalJson(file, artifact, { exclusive: true });
  }

  #commit({ type, artifactHash, artifact, claimIdentityHash, recordedAt, disposition = null,
    prepare }) {
    this.#requireOperator();
    return this.#withLock(() => {
      const state = this.#load({ recoverSignedSuffix: true });
      const prepared = prepare(state);
      if (prepared.idempotent) return deepFreeze(prepared.result);
      const at = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      if (Date.parse(at) < Date.parse(state.index.updatedAt)) fail("EVENT_TIME_REGRESSION");
      this.#writeArtifact(artifactHash, artifact);
      const payload = { artifactHash, claimIdentityHash };
      if (type === "REGISTER_EXTERNAL_RECEIPT") payload.disposition = disposition;
      const event = createEvent({ config: state.config, sequence: state.events.length + 1,
        type, recordedAt: at, previousEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
        payload }, this.operatorPrivateKeyPem);
      const events = [...state.events, event];
      const artifacts = new Map(state.artifacts);
      artifacts.set(artifactHash, artifact);
      const next = replayState(events, artifacts, state.config);
      const index = sealIndex(indexBody(state.config, next), this.operatorPrivateKeyPem);
      appendEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, index);
      return deepFreeze(prepared.appended(event, index));
    });
  }

  async registerVerifiedClaim({ candidate, stage34Context, priorCandidates,
    policyReferenceHash }, { recordedAt = new Date() } = {}) {
    const admission = await verifyFullySourceBoundStage4Candidate(candidate,
      { stage34Context, priorCandidates });
    if (!admission.ok) fail("CLAIM_SOURCE_ADMISSION_FAILED", admission.error);
    const policyReference = this.config.policyReferences.find((item) =>
      item.policyReferenceHash === policyReferenceHash);
    if (!policyReference) fail("POLICY_REFERENCE_NOT_CONFIGURED");
    const body = claimBody(candidate, admission, policyReference);
    const claim = deepFreeze({ ...body,
      claimRecordHash: digest(STAGE4_CLAIMS_SCHEMAS.claim, body) });
    return this.#commit({ type: "REGISTER_CLAIM", artifactHash: claim.claimRecordHash,
      artifact: claim, claimIdentityHash: claim.claimIdentityHash, recordedAt,
      prepare: (state) => {
        const prior = state.claims.find((item) =>
          item.claimIdentityHash === claim.claimIdentityHash);
        if (prior && prior.claimRecordHash !== claim.claimRecordHash) {
          fail("CLAIM_IDENTITY_CONFLICT");
        }
        if (prior) return { idempotent: true, result: { appended: false,
          duplicate: true, claimIdentityHash: prior.claimIdentityHash,
          claimRecordHash: prior.claimRecordHash, indexHash: state.index.indexHash,
          decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
          movesFunds: false, closesObligation: false } };
        return { idempotent: false, appended: (event, index) => ({ appended: true,
          duplicate: false, claimIdentityHash: claim.claimIdentityHash,
          claimRecordHash: claim.claimRecordHash, eventHash: event.eventHash,
          indexHash: index.indexHash, decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
          movesFunds: false, closesObligation: false }) };
      } });
  }

  appendClaimAmendment(input, { recordedAt = new Date() } = {}) {
    const amendment = buildAmendment(input);
    if (Date.parse(canonicalTime(recordedAt, "EVENT_RECORDED_AT"))
      < Date.parse(amendment.amendedAt)) fail("AMENDMENT_RECORDED_BEFORE_AMENDED_AT");
    return this.#commit({ type: "REGISTER_CLAIM_AMENDMENT",
      artifactHash: amendment.amendmentHash, artifact: amendment,
      claimIdentityHash: amendment.claimIdentityHash, recordedAt,
      prepare: (state) => {
        const claim = state.claims.find((item) =>
          item.claimIdentityHash === amendment.claimIdentityHash);
        if (!claim) fail("CLAIM_NOT_REGISTERED");
        const priorById = state.amendments.find((item) =>
          item.amendmentId === amendment.amendmentId);
        if (priorById && priorById.amendmentHash !== amendment.amendmentHash) {
          fail("AMENDMENT_ID_CONFLICT");
        }
        if (priorById) return { idempotent: true, result: { appended: false,
          duplicate: true, amendmentHash: priorById.amendmentHash,
          claimStateHeadHash: priorById.claimStateHeadHash,
          amendmentVersion: priorById.amendmentVersion,
          indexHash: state.index.indexHash,
          decision: "HOLD_AMENDMENT_CONTENT_COMMITMENT_NO_INSTITUTIONAL_AUTHORITY",
          movesFunds: false, closesObligation: false } };
        const claimState = currentClaimState(claim, state.amendments);
        if (amendment.claimRecordHash !== claim.claimRecordHash
          || amendment.amendmentVersion !== claimState.amendmentVersion + 1
          || amendment.previousAmendmentHash !== claimState.amendmentHeadHash
          || amendment.previousClaimStateHeadHash !== claimState.claimStateHeadHash) {
          fail("AMENDMENT_STALE_OR_NONCONTIGUOUS_HEAD");
        }
        return { idempotent: false, appended: (event, index) => ({ appended: true,
          duplicate: false, amendmentHash: amendment.amendmentHash,
          claimStateHeadHash: amendment.claimStateHeadHash,
          amendmentVersion: amendment.amendmentVersion,
          eventHash: event.eventHash, indexHash: index.indexHash,
          decision: "HOLD_AMENDMENT_CONTENT_COMMITMENT_NO_INSTITUTIONAL_AUTHORITY",
          movesFunds: false, closesObligation: false }) };
      } });
  }

  accountReserveCandidate(input, { recordedAt = new Date() } = {}) {
    const pool = this.config.reservePools.find((item) => item.poolId === input?.poolId);
    if (!pool) fail("RESERVE_POOL_NOT_CONFIGURED");
    const body = reserveBody(input, pool);
    const reserve = deepFreeze({ ...body,
      reserveHash: digest(STAGE4_CLAIMS_SCHEMAS.reserve, body) });
    return this.#commit({ type: "ACCOUNT_RESERVE_CANDIDATE",
      artifactHash: reserve.reserveHash, artifact: reserve,
      claimIdentityHash: reserve.claimIdentityHash, recordedAt,
      prepare: (state) => {
        const claim = state.claims.find((item) =>
          item.claimIdentityHash === reserve.claimIdentityHash);
        if (!claim) fail("CLAIM_NOT_REGISTERED");
        const claimState = currentClaimState(claim, state.amendments);
        if (reserve.claimStateHeadHash !== claimState.claimStateHeadHash) {
          fail("RESERVE_STALE_CLAIM_STATE_HEAD");
        }
        const byId = state.reserves.find((item) =>
          item.reserveRequestId === reserve.reserveRequestId);
        if (byId && byId.reserveHash !== reserve.reserveHash) fail("RESERVE_REQUEST_ID_CONFLICT");
        if (byId) return { idempotent: true, result: { appended: false, duplicate: true,
          reserveHash: byId.reserveHash, indexHash: state.index.indexHash,
          decision: "HOLD_LOCAL_ACCOUNTING_IS_NOT_CUSTODY",
          fundsReserved: false, custodyVerified: false,
          movesFunds: false, closesObligation: false } };
        if (state.reserves.some((item) =>
          item.claimIdentityHash === reserve.claimIdentityHash
          && item.claimStateHeadHash === reserve.claimStateHeadHash)) {
          fail("CLAIM_RESERVE_CONFLICT");
        }
        const aggregate = state.reserves.filter((item) => item.poolId === pool.poolId)
          .reduce((sum, item) => sum + item.amountMinor, 0);
        if (!Number.isSafeInteger(aggregate + reserve.amountMinor)
          || aggregate + reserve.amountMinor > pool.accountingLimitMinor) {
          fail("RESERVE_AGGREGATE_LIMIT_EXCEEDED");
        }
        return { idempotent: false, appended: (event, index) => ({ appended: true,
          duplicate: false, reserveHash: reserve.reserveHash, eventHash: event.eventHash,
          indexHash: index.indexHash, atomicLocalAccountingRecorded: true,
          decision: "HOLD_LOCAL_ACCOUNTING_IS_NOT_CUSTODY",
          fundsReserved: false, custodyVerified: false,
          movesFunds: false, closesObligation: false }) };
      } });
  }

  registerExternalReceipt(receipt, { recordedAt = new Date() } = {}) {
    const checked = verifyStage4LifecycleReceipt(receipt,
      { sourceVerifiers: this.config.sourceVerifiers });
    if (!checked.ok) fail("RECEIPT_INVALID", checked.error);
    if (Date.parse(canonicalTime(recordedAt, "EVENT_RECORDED_AT"))
      < Date.parse(receipt.observedAt)) fail("RECEIPT_RECORDED_BEFORE_OBSERVATION");
    return this.#commit({ type: "REGISTER_EXTERNAL_RECEIPT",
      artifactHash: receipt.receiptHash, artifact: receipt,
      claimIdentityHash: receipt.claimIdentityHash, recordedAt,
      disposition: checked.disposition,
      prepare: (state) => {
        const claim = state.claims.find((item) =>
          item.claimIdentityHash === receipt.claimIdentityHash);
        if (!claim) fail("CLAIM_NOT_REGISTERED");
        const claimState = currentClaimState(claim, state.amendments);
        if (receipt.claimStateHeadHash !== claimState.claimStateHeadHash) {
          fail("RECEIPT_STALE_CLAIM_STATE_HEAD");
        }
        if (receipt.subjectHash !== expectedReceiptSubject(receipt, claim, claimState)) {
          fail("RECEIPT_SUBJECT_BINDING_INVALID");
        }
        const prior = state.receipts.find((item) =>
          item.receipt.receiptId === receipt.receiptId);
        if (prior && prior.receipt.receiptHash !== receipt.receiptHash) {
          fail("RECEIPT_ID_CONFLICT");
        }
        if (prior) return { idempotent: true, result: { appended: false, duplicate: true,
          receiptHash: prior.receipt.receiptHash, disposition: prior.disposition,
          indexHash: state.index.indexHash, institutionalAuthorityVerified: false,
          decision: "HOLD_RECEIPT_HAS_NO_INSTITUTIONAL_AUTHORITY",
          movesFunds: false, closesObligation: false } };
        if (checked.configuredSourceVerified) {
          const workflow = deriveWorkflow(receipt.claimIdentityHash,
            receipt.claimStateHeadHash, state.receipts, state.instructions);
          applyReceipt(workflow, receipt, state.instructions.filter((item) =>
            item.claimIdentityHash === receipt.claimIdentityHash
            && item.claimStateHeadHash === receipt.claimStateHeadHash));
        }
        return { idempotent: false, appended: (event, index) => ({ appended: true,
          duplicate: false, receiptHash: receipt.receiptHash,
          disposition: checked.disposition, eventHash: event.eventHash,
          indexHash: index.indexHash, cryptographicSignatureValid: true,
          configuredSourceVerified: checked.configuredSourceVerified,
          institutionalAuthorityVerified: false, movesFunds: false,
          decision: "HOLD_RECEIPT_HAS_NO_INSTITUTIONAL_AUTHORITY",
          closesObligation: false }) };
      } });
  }

  issuePaymentInstructionCandidate(input, { recordedAt = new Date() } = {}) {
    const state = this.#load();
    const claim = state.claims.find((item) =>
      item.claimIdentityHash === input?.claimIdentityHash);
    const reserve = state.reserves.find((item) => item.reserveHash === input?.reserveHash);
    const claimState = claim ? currentClaimState(claim, state.amendments) : null;
    if (!claim || !reserve || reserve.claimIdentityHash !== claim.claimIdentityHash
      || input?.claimStateHeadHash !== claimState.claimStateHeadHash
      || reserve.claimStateHeadHash !== claimState.claimStateHeadHash) {
      fail("INSTRUCTION_CLAIM_OR_RESERVE_INVALID");
    }
    const body = instructionBody(input, claim, reserve);
    const instruction = deepFreeze({ ...body,
      instructionHash: digest(STAGE4_CLAIMS_SCHEMAS.instruction, body) });
    return this.#commit({ type: "ISSUE_PAYMENT_INSTRUCTION_CANDIDATE",
      artifactHash: instruction.instructionHash, artifact: instruction,
      claimIdentityHash: instruction.claimIdentityHash, recordedAt,
      prepare: (fresh) => {
        const freshClaim = fresh.claims.find((item) =>
          item.claimIdentityHash === instruction.claimIdentityHash);
        const freshClaimState = freshClaim
          ? currentClaimState(freshClaim, fresh.amendments) : null;
        if (!freshClaim || instruction.claimStateHeadHash
          !== freshClaimState.claimStateHeadHash) {
          fail("INSTRUCTION_STALE_CLAIM_STATE_HEAD");
        }
        const existingId = fresh.instructions.find((item) =>
          item.instructionId === instruction.instructionId);
        if (existingId && existingId.instructionHash !== instruction.instructionHash) {
          fail("INSTRUCTION_ID_CONFLICT");
        }
        const nonce = fresh.instructions.find((item) =>
          item.nonceHash === instruction.nonceHash);
        if (nonce && nonce.instructionHash !== instruction.instructionHash) {
          fail("INSTRUCTION_NONCE_REUSE");
        }
        if (existingId) return { idempotent: true, result: { appended: false,
          duplicate: true, instructionHash: existingId.instructionHash,
          indexHash: fresh.index.indexHash, settlementInstructionEligible: false,
          decision: "HOLD_NON_EXECUTABLE_PAYMENT_INSTRUCTION_CANDIDATE",
          movesFunds: false, closesObligation: false } };
        if (fresh.instructions.some((item) =>
          item.claimIdentityHash === instruction.claimIdentityHash
          && item.claimStateHeadHash === instruction.claimStateHeadHash)) {
          fail("CLAIM_INSTRUCTION_ALREADY_EXISTS");
        }
        const currentReserve = fresh.reserves.find((item) =>
          item.reserveHash === instruction.reserveHash
          && item.claimIdentityHash === instruction.claimIdentityHash
          && item.claimStateHeadHash === instruction.claimStateHeadHash);
        const workflow = deriveWorkflow(instruction.claimIdentityHash,
          instruction.claimStateHeadHash, fresh.receipts, fresh.instructions);
        if (!currentReserve || currentReserve.amountMinor !== instruction.amountMinor
          || currentReserve.currency !== instruction.currency
          || !workflowAllowsInstruction(workflow)) fail("INSTRUCTION_PRECONDITIONS_INVALID");
        return { idempotent: false, appended: (event, index) => ({ appended: true,
          duplicate: false, instructionHash: instruction.instructionHash,
          nonceHash: instruction.nonceHash, eventHash: event.eventHash,
          indexHash: index.indexHash, settlementInstructionEligible: false,
          decision: "HOLD_NON_EXECUTABLE_PAYMENT_INSTRUCTION_CANDIDATE",
          movesFunds: false, closesObligation: false }) };
      } });
  }

  createCheckpoint({ createdAt = new Date() } = {}) {
    this.#requireOperator();
    const state = this.#load();
    if (Date.parse(canonicalTime(createdAt, "CHECKPOINT_CREATED_AT"))
      < Date.parse(state.index.updatedAt)) fail("CHECKPOINT_TIME_REGRESSION");
    const body = checkpointBody(state.config, state, state.index, createdAt);
    return sealSigned(body, "checkpointHash", "REGISTRY_OPERATOR",
      this.operatorPrivateKeyPem);
  }

  verify({ requiredCheckpoint = null } = {}) {
    try {
      const state = this.#load();
      if (requiredCheckpoint !== null) {
        const checked = verifyCheckpoint(requiredCheckpoint, state.config);
        if (!checked.ok) fail("REQUIRED_CHECKPOINT_INVALID", checked.error);
        if (requiredCheckpoint.eventCount > state.events.length) fail("ROLLBACK_DETECTED");
        if (requiredCheckpoint.eventCount === 0) {
          if (requiredCheckpoint.headEventHash !== GENESIS) fail("CHECKPOINT_PREFIX_MISMATCH");
        } else if (state.events[requiredCheckpoint.eventCount - 1]?.eventHash
          !== requiredCheckpoint.headEventHash) fail("CHECKPOINT_PREFIX_MISMATCH");
        if (requiredCheckpoint.eventCount === state.events.length
          && requiredCheckpoint.indexHash !== state.index.indexHash) {
          fail("CHECKPOINT_INDEX_ROLLBACK_OR_DRIFT");
        }
      }
      return deepFreeze({
        ok: true,
        registryId: state.config.registryId,
        configHash: state.config.configHash,
        eventCount: state.events.length,
        headEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
        indexHash: state.index.indexHash,
        cryptographicIntegrityVerified: true,
        externalCheckpointSatisfied: requiredCheckpoint !== null,
        globalCompletenessEstablished: false,
        externalInstitutionAuthorityVerified: false,
        decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
        settlementInstructionEligible: false,
        movesFunds: false,
        closesObligation: false,
      });
    } catch (error) {
      return deepFreeze({ ok: false, error: error?.message ?? String(error),
        cryptographicIntegrityVerified: false,
        externalInstitutionAuthorityVerified: false,
        decision: "HOLD_REGISTRY_VERIFICATION_FAILED",
        settlementInstructionEligible: false, movesFunds: false,
        closesObligation: false });
    }
  }

  report({ asOf = new Date() } = {}) {
    const state = this.#load();
    if (Date.parse(canonicalTime(asOf, "REPORT_AS_OF"))
      < Date.parse(state.index.updatedAt)) fail("REPORT_TIME_REGRESSION");
    const body = {
      schema: STAGE4_CLAIMS_SCHEMAS.report,
      schemaVersion: "1.0.0",
      asOf: canonicalTime(asOf, "REPORT_AS_OF"),
      registryId: state.config.registryId,
      configHash: state.config.configHash,
      indexHash: state.index.indexHash,
      log: state.index.log,
      counts: state.index.counts,
      reserveAccounting: state.index.reserveAccounting,
      claims: state.index.claims,
      distinctions: {
        cryptographicIntegrity: "VERIFIABLE_LOCAL_SIGNED_CHAIN",
        configuredSourceSignature: "KEY_MATCH_ONLY",
        institutionalAuthority: "NOT_ESTABLISHED",
        globalCompleteness: "NOT_ESTABLISHED_WITHOUT_EXTERNAL_CHECKPOINT_NETWORK",
        paymentExecution: "NOT_PERFORMED",
        obligationClosure: "NOT_PERFORMED",
      },
      decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
      boundary: zeroAuthority(),
    };
    return deepFreeze({ ...body,
      reportHash: digest(STAGE4_CLAIMS_SCHEMAS.report, body) });
  }
}

export function describeStage4ClaimsLifecycleFrontier() {
  return deepFreeze({
    schema: "outsider/stage4-claims-lifecycle-frontier-description/v1",
    input: "fully source-replayed Stage34 frontier plus exact candidate-prefix replay",
    registry: "signed append-only globally namespaced local claim registry",
    amendmentRule: "versioned linked amendments advance the head; old-head artifacts are audit only",
    receiptRule: "latest-head binding required; configured key proves signature, not authority",
    reserveRule: "atomic local per-head and aggregate accounting is not capital or custody",
    instructionRule: "coverage referenced and diet compliant are mandatory local gates",
    stateSeparation: ["financialPayment", "technicalRecovery", "worldRestoration",
      "delayedConsequence", "obligationClosure"],
    recoveryRule: "payment, coverage void, and learning-diet breach never erase recovery",
    delayedRule: "mature delayed consequence receipts can reopen candidate workflow",
    decision: "HOLD_ZERO_SETTLEMENT_AUTHORITY",
    authority: zeroAuthority(),
  });
}
