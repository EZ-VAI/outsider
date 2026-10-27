/*
 * Stage 3 durable guarantee/reserve/one-use gate frontier.
 *
 * This is a local fail-closed accounting and evidence-binding mechanism.  It
 * does not issue a policy, create coverage, prove a reserve, establish
 * custody, adopt an owner write path, execute a capability, or move funds.
 * The only accepted source entrance is the exact, fully source-replayed
 * Stage 3/4 authority frontier and its exact NON_BINDING_ABSTAIN Stage 2 quote.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { verifyStage2QuoteCandidate } from "./outsider-stage2-quote-frontier.js";
import { verifyStage34AuthorityFrontier } from "./outsider-stage34-authority-frontier.js";

export const STAGE3_GUARANTEE_GATE_SCHEMAS = Object.freeze({
  policy: "outsider/stage3-local-request-accounting-policy/v1",
  sourceAnchor: "outsider/stage3-guarantee-gate-source-anchor/v1",
  genesis: "outsider/stage3-guarantee-gate-genesis/v1",
  state: "outsider/stage3-guarantee-gate-state/v1",
  stateEnvelope: "outsider/stage3-guarantee-gate-state-envelope/v1",
  checkpoint: "outsider/stage3-guarantee-gate-checkpoint/v1",
  capabilityCandidate: "outsider/stage3-one-use-capability-candidate/v1",
  externalReceipt: "outsider/stage3-external-reference-receipt/v1",
});

const DOMAINS = Object.freeze({
  policy: STAGE3_GUARANTEE_GATE_SCHEMAS.policy,
  sourceAnchor: STAGE3_GUARANTEE_GATE_SCHEMAS.sourceAnchor,
  genesis: STAGE3_GUARANTEE_GATE_SCHEMAS.genesis,
  genesisSignature: "outsider/stage3-guarantee-gate-genesis-signature/v1",
  state: STAGE3_GUARANTEE_GATE_SCHEMAS.state,
  stateSignature: "outsider/stage3-guarantee-gate-state-signature/v1",
  checkpoint: STAGE3_GUARANTEE_GATE_SCHEMAS.checkpoint,
  checkpointSignature: "outsider/stage3-guarantee-gate-checkpoint-signature/v1",
  gateIdentity: "outsider/stage3-guarantee-gate-identity/v1",
  capabilityCandidate: STAGE3_GUARANTEE_GATE_SCHEMAS.capabilityCandidate,
  command: "outsider/stage3-guarantee-gate-command/v1",
  event: "outsider/stage3-guarantee-gate-event/v1",
  auditCycle: "outsider/stage3-guarantee-gate-audit-cycle/v1",
  adversity: "outsider/stage3-guarantee-gate-adversity/v1",
  rotationStatement: "outsider/stage3-guarantee-gate-key-rotation/v1",
  rotationOldSignature: "outsider/stage3-guarantee-gate-key-rotation-old/v1",
  rotationNewSignature: "outsider/stage3-guarantee-gate-key-rotation-new/v1",
  externalStatement: "outsider/stage3-external-reference-statement/v1",
  externalReceipt: STAGE3_GUARANTEE_GATE_SCHEMAS.externalReceipt,
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,159}$/;
const UINT = /^(0|[1-9][0-9]{0,38})$/;
const SIGNATURE = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_UINT = (1n << 127n) - 1n;
const FILE_LIMIT = 32 * 1024 * 1024;
const EXTERNAL_ROLES = new Set([
  "RESERVE_PROVIDER", "CUSTODIAN", "ISSUER", "RESOURCE_OWNER",
]);
const ADVERSITIES = new Set([
  "COVERAGE_DISPUTE", "COVERAGE_VOID", "DIET_BREACH", "WARRANTY_BREACH",
  "PROVIDER_REPLACEMENT", "INSTITUTION_DISSOLUTION",
]);
const COMMAND_KINDS = new Set([
  "AUDIT_BYPASS_PATHS", "REQUEST_CAPABILITY", "PRESENT_CAPABILITY",
  "REVOKE_CAPABILITY", "REVOKE_GATE", "SWEEP_EXPIRY",
  "REGISTER_EXTERNAL_RECEIPT", "RECORD_ADVERSITY", "ROTATE_SIGNER",
]);

const SOURCE_BINDING_KEYS = Object.freeze([
  "stage34FrontierHash", "stage2FrontierHash", "quoteCandidateHash",
  "quoteIdentityHash", "quoteValidFrom", "quoteValidUntil", "worldPolicyHash",
  "boundaryHash", "claimHash", "wayHash", "worldHash", "realityEnvelopeHash",
  "sourceEvidenceAnchorHash", "realityExecutionHash", "consequenceObligationSetHash",
  "factorPolicyHash", "validityDomainHash", "rightsReferenceHash",
  "recoveryPlanHash", "recoveryStandardHash", "responsibilityRootHashes",
  "stage34VerificationLevel", "quoteVerificationLevel", "quoteDecision",
  "sourceReverifiedAtGenesis", "ownerAdoptionVerified", "issuerStandingVerified",
  "custodyVerified", "coverageEstablished", "reserveEstablished",
]);
const POLICY_INPUT_KEYS = Object.freeze([
  "policyIdHash", "planningUnitHash", "aggregateRequestCeilingUnits",
  "perCandidateRequestCeilingUnits", "requiredAuditHookIds", "createdAt",
]);
const POLICY_KEYS = Object.freeze([
  "schema", "schemaVersion", ...POLICY_INPUT_KEYS, "accountingBoundary", "policyHash",
]);
const SOURCE_ANCHOR_KEYS = Object.freeze([
  "schema", "schemaVersion", "stage34Frontier", "stage2QuoteCandidate", "anchorHash",
]);
const GENESIS_KEYS = Object.freeze([
  "schema", "schemaVersion", "createdAt", "expiresAt", "gateIdHash",
  "sourceAnchorHash", "sourceBindings", "localRequestPolicy", "genesisSigner",
  "decision", "authority", "genesisHash", "signature",
]);
const STATE_KEYS = Object.freeze([
  "schema", "schemaVersion", "gateIdHash", "genesisHash", "sourceAnchorHash",
  "sourceBindings", "localRequestPolicyHash", "revision", "createdAt", "updatedAt",
  "expiresAt", "lifecycle", "signers", "candidates", "requestAccounting",
  "externalReceipts", "audit", "adversities", "responsibilityRecovery",
  "events", "decision", "authority",
]);
const ENVELOPE_KEYS = Object.freeze([
  "schema", "schemaVersion", "state", "stateHash", "signing",
]);
const CHECKPOINT_KEYS = Object.freeze([
  "schema", "schemaVersion", "gateIdHash", "genesisHash", "sourceAnchorHash",
  "stateHash", "revision", "eventHeadHash", "createdAt", "signerKeyId",
  "checkpointHash", "signature",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? code : `${code}:${detail}`);
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

function hash(value, code) {
  if (!HASH.test(value ?? "")) fail(code);
  return value;
}

function token(value, code) {
  if (!TOKEN.test(value ?? "")) fail(code);
  return value;
}

function units(value, code, { positive = false } = {}) {
  if (typeof value !== "string" || !UINT.test(value)) fail(code);
  const parsed = BigInt(value);
  if (parsed > MAX_UINT || (positive && parsed === 0n)) fail(code);
  return parsed;
}

function sortedUnique(values, validator, code, maximum = 10_000) {
  if (!Array.isArray(values) || values.length > maximum) fail(code);
  for (const value of values) validator(value, code);
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length || !same(values, sorted)) fail(code);
  return sorted;
}

function zeroAuthority() {
  return {
    mode: "none",
    permitsExecution: false,
    permitsPrice: false,
    permitsCoverage: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    establishesReserve: false,
    establishesCustody: false,
    ownerWriteAdopted: false,
    movesFunds: false,
    actualResourceWrite: false,
  };
}

function fixedDecision() {
  return "HOLD_NO_ISSUER_OWNER_CUSTODY_RESERVE_COVERAGE_OR_EXECUTION_AUTHORITY";
}

function normalizedPublicKey(publicKeyLike) {
  try {
    return createPublicKey(publicKeyLike).export({ type: "spki", format: "pem" }).toString();
  } catch { fail("STAGE3_GATE_PUBLIC_KEY_INVALID"); }
}

function signerKeyIdFromPublic(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  const der = key.export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

export function stage3GateSignerKeyId(publicKeyPem) {
  return signerKeyIdFromPublic(normalizedPublicKey(publicKeyPem));
}

function signerFromPrivate(privateKeyPem) {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    const publicKeyPem = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: signerKeyIdFromPublic(publicKeyPem) };
  } catch { fail("STAGE3_GATE_PRIVATE_KEY_INVALID"); }
}

function signHash(domain, valueHash, privateKey) {
  return cryptoSign(null, Buffer.from(`${domain}\0${valueHash}`), privateKey)
    .toString("base64");
}

function verifyHashSignature(domain, valueHash, signature, publicKeyPem) {
  if (typeof signature !== "string" || signature.length > 1024
    || !SIGNATURE.test(signature)) return false;
  try {
    return cryptoVerify(null, Buffer.from(`${domain}\0${valueHash}`),
      createPublicKey(publicKeyPem), Buffer.from(signature, "base64"));
  } catch { return false; }
}

function validatePolicy(policy) {
  if (!exactKeys(policy, POLICY_KEYS)
    || policy.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.policy
    || policy.schemaVersion !== "1.0.0"
    || !HASH.test(policy.policyIdHash ?? "")
    || !HASH.test(policy.planningUnitHash ?? "")
    || iso(policy.createdAt, "STAGE3_GATE_POLICY_TIME_INVALID") !== policy.createdAt
    || !Array.isArray(policy.requiredAuditHookIds)
    || policy.requiredAuditHookIds.length < 1
    || policy.requiredAuditHookIds.length > 64
    || policy.requiredAuditHookIds.some((value) => !TOKEN.test(value ?? ""))
    || !same(policy.requiredAuditHookIds, [...new Set(policy.requiredAuditHookIds)].sort())
    || !exactKeys(policy.accountingBoundary, [
      "referenceRequestAccountingOnly", "currencyOrAssetEquivalence", "capitalExists",
      "reserveExists", "custodyExists", "coverageCreated", "financialAuthority",
    ])
    || policy.accountingBoundary.referenceRequestAccountingOnly !== true
    || policy.accountingBoundary.currencyOrAssetEquivalence !== null
    || ["capitalExists", "reserveExists", "custodyExists", "coverageCreated",
      "financialAuthority"].some((key) => policy.accountingBoundary[key] !== false)) {
    fail("STAGE3_GATE_POLICY_INVALID");
  }
  const aggregate = units(policy.aggregateRequestCeilingUnits,
    "STAGE3_GATE_POLICY_AGGREGATE_INVALID", { positive: true });
  const perCandidate = units(policy.perCandidateRequestCeilingUnits,
    "STAGE3_GATE_POLICY_PER_CANDIDATE_INVALID", { positive: true });
  if (perCandidate > aggregate) fail("STAGE3_GATE_POLICY_LIMIT_ORDER_INVALID");
  const { policyHash, ...body } = policy;
  if (policyHash !== digest(DOMAINS.policy, body)) fail("STAGE3_GATE_POLICY_HASH_INVALID");
}

export function createStage3LocalRequestPolicy(input) {
  if (!exactKeys(input, POLICY_INPUT_KEYS)) fail("STAGE3_GATE_POLICY_INPUT_INVALID");
  const body = {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.policy,
    schemaVersion: "1.0.0",
    policyIdHash: hash(input.policyIdHash, "STAGE3_GATE_POLICY_ID_INVALID"),
    planningUnitHash: hash(input.planningUnitHash, "STAGE3_GATE_PLANNING_UNIT_INVALID"),
    aggregateRequestCeilingUnits: units(input.aggregateRequestCeilingUnits,
      "STAGE3_GATE_AGGREGATE_CEILING_INVALID", { positive: true }).toString(),
    perCandidateRequestCeilingUnits: units(input.perCandidateRequestCeilingUnits,
      "STAGE3_GATE_PER_CANDIDATE_CEILING_INVALID", { positive: true }).toString(),
    requiredAuditHookIds: [...input.requiredAuditHookIds].sort(),
    createdAt: iso(input.createdAt, "STAGE3_GATE_POLICY_CREATED_AT_INVALID"),
    accountingBoundary: {
      referenceRequestAccountingOnly: true,
      currencyOrAssetEquivalence: null,
      capitalExists: false,
      reserveExists: false,
      custodyExists: false,
      coverageCreated: false,
      financialAuthority: false,
    },
  };
  const policy = deepFreeze({ ...body, policyHash: digest(DOMAINS.policy, body) });
  validatePolicy(policy);
  return policy;
}

function validateSourceBindings(value) {
  if (!exactKeys(value, SOURCE_BINDING_KEYS)) fail("STAGE3_GATE_SOURCE_BINDINGS_INVALID");
  const hashes = SOURCE_BINDING_KEYS.filter((key) => key.endsWith("Hash"))
    .filter((key) => !["quoteIdentityHash"].includes(key));
  for (const key of hashes) hash(value[key], `STAGE3_GATE_BINDING_${key.toUpperCase()}_INVALID`);
  hash(value.quoteIdentityHash, "STAGE3_GATE_QUOTE_IDENTITY_INVALID");
  iso(value.quoteValidFrom, "STAGE3_GATE_QUOTE_VALID_FROM_INVALID");
  iso(value.quoteValidUntil, "STAGE3_GATE_QUOTE_VALID_UNTIL_INVALID");
  sortedUnique(value.responsibilityRootHashes, hash,
    "STAGE3_GATE_RESPONSIBILITY_ROOTS_INVALID");
  if (value.responsibilityRootHashes.length < 1
    || value.stage34VerificationLevel
      !== "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED"
    || value.quoteVerificationLevel
      !== "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED"
    || value.quoteDecision !== "NON_BINDING_ABSTAIN"
    || value.sourceReverifiedAtGenesis !== true
    || ["ownerAdoptionVerified", "issuerStandingVerified", "custodyVerified",
      "coverageEstablished", "reserveEstablished"].some((key) => value[key] !== false)) {
    fail("STAGE3_GATE_SOURCE_AUTHORITY_BOUNDARY_INVALID");
  }
}

async function replaySourceEntrance(stage34Frontier, stage34Context, stage2QuoteCandidate) {
  if (!plain(stage34Context)) fail("STAGE3_GATE_STAGE34_CONTEXT_INVALID");
  const full = await verifyStage34AuthorityFrontier(stage34Frontier, stage34Context);
  if (!full.ok
    || full.verificationLevel
      !== "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED"
    || full.sourceArtifactsReverified !== true
    || full.externalEvidenceVerified !== false
    || full.externalInstitutionAuthorityVerified !== false
    || full.bindingGuarantee !== false
    || full.movesFunds !== false) {
    fail("STAGE3_GATE_FULL_STAGE34_SOURCE_REPLAY_REQUIRED", full.error ?? "BOUNDARY");
  }
  if (!same(stage2QuoteCandidate, stage34Context.stage2QuoteCandidate)
    || stage2QuoteCandidate.candidateHash
      !== stage34Frontier.bindings.stage2.quoteCandidateHash
    || stage2QuoteCandidate.quoteIdentityHash
      !== stage34Frontier.bindings.stage2.quoteIdentityHash) {
    fail("STAGE3_GATE_EXACT_STAGE2_QUOTE_REQUIRED");
  }
  const quote = verifyStage2QuoteCandidate(stage2QuoteCandidate, {
    frontier: stage34Context.stage2Frontier,
    sources: stage34Context.stage2Sources,
    priorCandidates: stage34Context.stage2PriorQuoteCandidates,
  });
  if (!quote.ok
    || quote.verificationLevel !== "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED"
    || quote.sourceReverified !== true
    || quote.decision !== "NON_BINDING_ABSTAIN"
    || quote.binding !== false
    || quote.price !== null || quote.premium !== null || quote.capital !== null
    || quote.permitsCoverage !== false || quote.permitsGuarantee !== false
    || quote.permitsSettlement !== false) {
    fail("STAGE3_GATE_EXACT_NON_BINDING_ABSTAIN_QUOTE_REQUIRED", quote.error ?? "BOUNDARY");
  }
  const sources = stage34Context.stage2Sources;
  const boundary = sources?.realitySources?.boundary;
  const claim = sources?.realitySources?.claim;
  const envelope = sources?.realityEnvelope;
  const bindings = {
    stage34FrontierHash: stage34Frontier.frontierHash,
    stage2FrontierHash: stage34Context.stage2Frontier.frontierHash,
    quoteCandidateHash: stage2QuoteCandidate.candidateHash,
    quoteIdentityHash: stage2QuoteCandidate.quoteIdentityHash,
    quoteValidFrom: stage2QuoteCandidate.validFrom,
    quoteValidUntil: stage2QuoteCandidate.validUntil,
    worldPolicyHash: boundary?.policyHash,
    boundaryHash: boundary?.boundaryHash,
    claimHash: claim?.claimHash,
    wayHash: claim?.wayHash,
    worldHash: boundary?.worldHash,
    realityEnvelopeHash: envelope?.envelopeHash,
    sourceEvidenceAnchorHash: envelope?.sourceEvidenceAnchorHash,
    realityExecutionHash: envelope?.executionHash,
    consequenceObligationSetHash: envelope?.consequenceObligations?.obligationSetHash,
    factorPolicyHash: stage34Frontier.bindings.stage2.factorPolicyHash,
    validityDomainHash: stage34Frontier.bindings.stage2.validityDomainHash,
    rightsReferenceHash: stage34Frontier.bindings.stage2.rightsReferenceHash,
    recoveryPlanHash: claim?.recoveryPlanHash,
    recoveryStandardHash: boundary?.recoveryStandardHash,
    responsibilityRootHashes: [...(claim?.responsibilityRootHashes ?? [])].sort(),
    stage34VerificationLevel: full.verificationLevel,
    quoteVerificationLevel: quote.verificationLevel,
    quoteDecision: "NON_BINDING_ABSTAIN",
    sourceReverifiedAtGenesis: true,
    ownerAdoptionVerified: false,
    issuerStandingVerified: false,
    custodyVerified: false,
    coverageEstablished: false,
    reserveEstablished: false,
  };
  validateSourceBindings(bindings);
  const cross = stage34Frontier.bindings;
  if (bindings.claimHash !== cross.reality.claimHash
    || bindings.wayHash !== cross.reality.wayHash
    || bindings.worldHash !== cross.reality.worldHash
    || bindings.realityEnvelopeHash !== cross.reality.envelopeHash
    || bindings.realityExecutionHash !== cross.reality.executionHash
    || bindings.consequenceObligationSetHash
      !== cross.reality.consequenceObligationSetHash
    || bindings.claimHash !== stage2QuoteCandidate.identity.claimHash
    || bindings.wayHash !== stage2QuoteCandidate.identity.wayHash
    || bindings.worldHash !== stage2QuoteCandidate.identity.worldHash) {
    fail("STAGE3_GATE_CLAIM_WAY_WORLD_REALITY_CROSS_BINDING_INVALID");
  }
  return deepFreeze({ bindings, full, quote });
}

function makeSourceAnchor(stage34Frontier, stage2QuoteCandidate) {
  const body = {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.sourceAnchor,
    schemaVersion: "1.0.0",
    stage34Frontier: structuredClone(stage34Frontier),
    stage2QuoteCandidate: structuredClone(stage2QuoteCandidate),
  };
  return deepFreeze({ ...body, anchorHash: digest(DOMAINS.sourceAnchor, body) });
}

function validateSourceAnchor(anchor) {
  if (!exactKeys(anchor, SOURCE_ANCHOR_KEYS)
    || anchor.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.sourceAnchor
    || anchor.schemaVersion !== "1.0.0"
    || !HASH.test(anchor.anchorHash ?? "")) fail("STAGE3_GATE_SOURCE_ANCHOR_INVALID");
  const { anchorHash, ...body } = anchor;
  if (anchorHash !== digest(DOMAINS.sourceAnchor, body)) {
    fail("STAGE3_GATE_SOURCE_ANCHOR_HASH_INVALID");
  }
}

function fixedResponsibilityRecovery(bindings) {
  return {
    responsibilityRootHashes: [...bindings.responsibilityRootHashes],
    recoveryPlanHash: bindings.recoveryPlanHash,
    recoveryStandardHash: bindings.recoveryStandardHash,
    nonWaivable: true,
    obligationOpen: true,
    recoveryComplete: false,
    worldRestored: false,
    closureAuthorized: false,
    survivesProviderReplacement: true,
    survivesCoverageDisputeOrVoid: true,
    survivesDietOrWarrantyBreach: true,
    survivesGateOrCandidateExpiry: true,
    survivesInstitutionDissolution: true,
    paymentCannotImplyRecovery: true,
    recoveryCannotImplyWorldRestoration: true,
    restorationCannotImplyClosure: true,
  };
}

function makeGenesis({ createdAt, expiresAt, bindings, anchor, policy, signer }) {
  const identity = {
    sourceAnchorHash: anchor.anchorHash,
    stage34FrontierHash: bindings.stage34FrontierHash,
    quoteCandidateHash: bindings.quoteCandidateHash,
    quoteIdentityHash: bindings.quoteIdentityHash,
    claimHash: bindings.claimHash,
    wayHash: bindings.wayHash,
    worldHash: bindings.worldHash,
    worldPolicyHash: bindings.worldPolicyHash,
    realityEnvelopeHash: bindings.realityEnvelopeHash,
    localRequestPolicyHash: policy.policyHash,
    genesisSignerKeyId: signer.keyId,
  };
  const gateIdHash = digest(DOMAINS.gateIdentity, identity);
  const body = {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.genesis,
    schemaVersion: "1.0.0",
    createdAt,
    expiresAt,
    gateIdHash,
    sourceAnchorHash: anchor.anchorHash,
    sourceBindings: structuredClone(bindings),
    localRequestPolicy: structuredClone(policy),
    genesisSigner: {
      algorithm: "Ed25519",
      keyId: signer.keyId,
      publicKeyPem: signer.publicKeyPem,
      cryptographicRole: "LOCAL_LEDGER_INTEGRITY_ONLY",
      institutionalStanding: false,
      custodyAuthority: false,
      issuerAuthority: false,
    },
    decision: fixedDecision(),
    authority: zeroAuthority(),
  };
  const genesisHash = digest(DOMAINS.genesis, body);
  return deepFreeze({ ...body, genesisHash,
    signature: signHash(DOMAINS.genesisSignature, genesisHash, signer.privateKey) });
}

function validateGenesis(genesis, anchor = null) {
  if (!exactKeys(genesis, GENESIS_KEYS)
    || genesis.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.genesis
    || genesis.schemaVersion !== "1.0.0"
    || !HASH.test(genesis.gateIdHash ?? "")
    || !HASH.test(genesis.sourceAnchorHash ?? "")
    || !HASH.test(genesis.genesisHash ?? "")
    || iso(genesis.createdAt, "STAGE3_GATE_GENESIS_TIME_INVALID") !== genesis.createdAt
    || iso(genesis.expiresAt, "STAGE3_GATE_GENESIS_EXPIRY_INVALID") !== genesis.expiresAt
    || Date.parse(genesis.expiresAt) <= Date.parse(genesis.createdAt)
    || !exactKeys(genesis.genesisSigner, ["algorithm", "keyId", "publicKeyPem",
      "cryptographicRole", "institutionalStanding", "custodyAuthority",
      "issuerAuthority"])
    || genesis.genesisSigner.algorithm !== "Ed25519"
    || genesis.genesisSigner.cryptographicRole !== "LOCAL_LEDGER_INTEGRITY_ONLY"
    || genesis.genesisSigner.institutionalStanding !== false
    || genesis.genesisSigner.custodyAuthority !== false
    || genesis.genesisSigner.issuerAuthority !== false
    || genesis.genesisSigner.keyId
      !== stage3GateSignerKeyId(genesis.genesisSigner.publicKeyPem)
    || genesis.decision !== fixedDecision()
    || !same(genesis.authority, zeroAuthority())) {
    fail("STAGE3_GATE_GENESIS_INVALID");
  }
  validateSourceBindings(genesis.sourceBindings);
  validatePolicy(genesis.localRequestPolicy);
  if (anchor !== null) {
    validateSourceAnchor(anchor);
    if (anchor.anchorHash !== genesis.sourceAnchorHash
      || anchor.stage34Frontier.frontierHash
        !== genesis.sourceBindings.stage34FrontierHash
      || anchor.stage2QuoteCandidate.candidateHash
        !== genesis.sourceBindings.quoteCandidateHash
      || anchor.stage2QuoteCandidate.quoteIdentityHash
        !== genesis.sourceBindings.quoteIdentityHash) {
      fail("STAGE3_GATE_GENESIS_SOURCE_ANCHOR_MISMATCH");
    }
  }
  const { genesisHash, signature, ...body } = genesis;
  if (genesisHash !== digest(DOMAINS.genesis, body)
    || !verifyHashSignature(DOMAINS.genesisSignature, genesisHash, signature,
      genesis.genesisSigner.publicKeyPem)) {
    fail("STAGE3_GATE_GENESIS_SIGNATURE_INVALID");
  }
  const expectedGateId = digest(DOMAINS.gateIdentity, {
    sourceAnchorHash: genesis.sourceAnchorHash,
    stage34FrontierHash: genesis.sourceBindings.stage34FrontierHash,
    quoteCandidateHash: genesis.sourceBindings.quoteCandidateHash,
    quoteIdentityHash: genesis.sourceBindings.quoteIdentityHash,
    claimHash: genesis.sourceBindings.claimHash,
    wayHash: genesis.sourceBindings.wayHash,
    worldHash: genesis.sourceBindings.worldHash,
    worldPolicyHash: genesis.sourceBindings.worldPolicyHash,
    realityEnvelopeHash: genesis.sourceBindings.realityEnvelopeHash,
    localRequestPolicyHash: genesis.localRequestPolicy.policyHash,
    genesisSignerKeyId: genesis.genesisSigner.keyId,
  });
  if (genesis.gateIdHash !== expectedGateId) fail("STAGE3_GATE_IDENTITY_INVALID");
}

function initialState(genesis) {
  const policy = genesis.localRequestPolicy;
  return {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.state,
    schemaVersion: "1.0.0",
    gateIdHash: genesis.gateIdHash,
    genesisHash: genesis.genesisHash,
    sourceAnchorHash: genesis.sourceAnchorHash,
    sourceBindings: structuredClone(genesis.sourceBindings),
    localRequestPolicyHash: policy.policyHash,
    revision: 0,
    createdAt: genesis.createdAt,
    updatedAt: genesis.createdAt,
    expiresAt: genesis.expiresAt,
    lifecycle: { status: "ACTIVE_HOLD", revokedAt: null, expiredAt: null },
    signers: {
      genesisKeyId: genesis.genesisSigner.keyId,
      activeKeyId: genesis.genesisSigner.keyId,
      keys: [{ keyId: genesis.genesisSigner.keyId,
        publicKeyPem: genesis.genesisSigner.publicKeyPem,
        activatedRevision: 0, retiredRevision: null }],
      rotations: [],
      cryptographicValidityIsInstitutionalStanding: false,
    },
    candidates: [],
    requestAccounting: {
      planningUnitHash: policy.planningUnitHash,
      aggregateRequestCeilingUnits: policy.aggregateRequestCeilingUnits,
      perCandidateRequestCeilingUnits: policy.perCandidateRequestCeilingUnits,
      activeRequestedUnits: "0",
      releasedRequestedUnits: "0",
      totalRequestedEverUnits: "0",
      candidateCount: 0,
      actualReserveUnits: null,
      currency: null,
      reserveEstablished: false,
      staleBalanceAccepted: false,
    },
    externalReceipts: [],
    audit: {
      requiredHookIds: [...policy.requiredAuditHookIds],
      lastCycleStatus: "NOT_RUN_FAIL_CLOSED",
      lastCycleHash: null,
      ownerGateActualWritePathVerified: false,
      alternateWritePathsExcluded: false,
      cycles: [],
    },
    adversities: [],
    responsibilityRecovery: fixedResponsibilityRecovery(genesis.sourceBindings),
    events: [],
    decision: fixedDecision(),
    authority: zeroAuthority(),
  };
}

function signState(state, signer) {
  const stateHash = digest(DOMAINS.state, state);
  return deepFreeze({
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.stateEnvelope,
    schemaVersion: "1.0.0",
    state: structuredClone(state),
    stateHash,
    signing: {
      algorithm: "Ed25519",
      keyId: signer.keyId,
      signature: signHash(DOMAINS.stateSignature, stateHash, signer.privateKey),
    },
  });
}

function validateCandidate(candidate, state) {
  if (!exactKeys(candidate, ["core", "candidateHash", "lifecycle"])
    || !exactKeys(candidate.core, [
      "schema", "schemaVersion", "candidateIdHash", "createdAt", "expiresAt",
      "beforeStateHash", "capabilityScopeHash", "sourceReferences", "reserveRequest",
      "capabilityBoundary", "decision", "authority",
    ])
    || candidate.core.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.capabilityCandidate
    || candidate.core.schemaVersion !== "1.0.0"
    || !HASH.test(candidate.core.candidateIdHash ?? "")
    || !HASH.test(candidate.core.beforeStateHash ?? "")
    || !HASH.test(candidate.core.capabilityScopeHash ?? "")
    || !HASH.test(candidate.candidateHash ?? "")
    || candidate.candidateHash !== digest(DOMAINS.capabilityCandidate, candidate.core)
    || iso(candidate.core.createdAt, "STAGE3_GATE_CANDIDATE_TIME_INVALID")
      !== candidate.core.createdAt
    || iso(candidate.core.expiresAt, "STAGE3_GATE_CANDIDATE_EXPIRY_INVALID")
      !== candidate.core.expiresAt
    || Date.parse(candidate.core.expiresAt) <= Date.parse(candidate.core.createdAt)
    || Date.parse(candidate.core.expiresAt) > Date.parse(state.expiresAt)
    || !exactKeys(candidate.core.sourceReferences, [
      "gateIdHash", "stage34FrontierHash", "stage2FrontierHash", "quoteCandidateHash",
      "quoteIdentityHash", "worldPolicyHash", "boundaryHash", "claimHash", "wayHash",
      "worldHash", "realityEnvelopeHash", "sourceEvidenceAnchorHash",
      "realityExecutionHash", "consequenceObligationSetHash",
    ])
    || Object.entries(candidate.core.sourceReferences)
      .some(([, value]) => !HASH.test(value ?? ""))
    || candidate.core.sourceReferences.gateIdHash !== state.gateIdHash
    || candidate.core.sourceReferences.stage34FrontierHash
      !== state.sourceBindings.stage34FrontierHash
    || candidate.core.sourceReferences.stage2FrontierHash
      !== state.sourceBindings.stage2FrontierHash
    || candidate.core.sourceReferences.quoteCandidateHash
      !== state.sourceBindings.quoteCandidateHash
    || candidate.core.sourceReferences.quoteIdentityHash
      !== state.sourceBindings.quoteIdentityHash
    || candidate.core.sourceReferences.worldPolicyHash
      !== state.sourceBindings.worldPolicyHash
    || candidate.core.sourceReferences.boundaryHash !== state.sourceBindings.boundaryHash
    || candidate.core.sourceReferences.claimHash !== state.sourceBindings.claimHash
    || candidate.core.sourceReferences.wayHash !== state.sourceBindings.wayHash
    || candidate.core.sourceReferences.worldHash !== state.sourceBindings.worldHash
    || candidate.core.sourceReferences.realityEnvelopeHash
      !== state.sourceBindings.realityEnvelopeHash
    || candidate.core.sourceReferences.sourceEvidenceAnchorHash
      !== state.sourceBindings.sourceEvidenceAnchorHash
    || candidate.core.sourceReferences.realityExecutionHash
      !== state.sourceBindings.realityExecutionHash
    || candidate.core.sourceReferences.consequenceObligationSetHash
      !== state.sourceBindings.consequenceObligationSetHash
    || !exactKeys(candidate.core.reserveRequest, [
      "planningUnitHash", "requestedUnits", "accountingStatus", "currency",
      "assetEquivalence", "actualReserve", "capital", "custody",
    ])
    || candidate.core.reserveRequest.planningUnitHash
      !== state.requestAccounting.planningUnitHash
    || units(candidate.core.reserveRequest.requestedUnits,
      "STAGE3_GATE_CANDIDATE_REQUEST_UNITS_INVALID", { positive: true })
      > units(state.requestAccounting.perCandidateRequestCeilingUnits,
        "STAGE3_GATE_STATE_PER_CANDIDATE_INVALID")
    || candidate.core.reserveRequest.accountingStatus
      !== "LOCAL_REFERENCE_REQUEST_ONLY"
    || candidate.core.reserveRequest.currency !== null
    || candidate.core.reserveRequest.assetEquivalence !== null
    || candidate.core.reserveRequest.actualReserve !== false
    || candidate.core.reserveRequest.capital !== false
    || candidate.core.reserveRequest.custody !== false
    || !exactKeys(candidate.core.capabilityBoundary, [
      "oneUse", "reusable", "beforeStateBound", "ownerAdoptionVerified",
      "ownerGateActualWritePathVerified", "alternateWritePathsExcluded",
      "actualResourceWrite", "executionAuthorized",
    ])
    || candidate.core.capabilityBoundary.oneUse !== true
    || candidate.core.capabilityBoundary.reusable !== false
    || candidate.core.capabilityBoundary.beforeStateBound !== true
    || ["ownerAdoptionVerified", "ownerGateActualWritePathVerified",
      "alternateWritePathsExcluded", "actualResourceWrite", "executionAuthorized"]
      .some((key) => candidate.core.capabilityBoundary[key] !== false)
    || candidate.core.decision !== fixedDecision()
    || !same(candidate.core.authority, zeroAuthority())
    || !exactKeys(candidate.lifecycle, [
      "status", "presentationCount", "presentedAt", "revokedAt", "expiredAt",
      "lastObservedBeforeStateHash", "actualResourceWrite",
    ])
    || !["ACTIVE_HOLD", "PRESENTED_ONCE_HOLD", "REVOKED_HOLD", "EXPIRED_HOLD"]
      .includes(candidate.lifecycle.status)
    || ![0, 1].includes(candidate.lifecycle.presentationCount)
    || candidate.lifecycle.actualResourceWrite !== false) {
    fail("STAGE3_GATE_CAPABILITY_CANDIDATE_INVALID");
  }
  const lifecycle = candidate.lifecycle;
  if (lifecycle.presentationCount === 0
    && (lifecycle.presentedAt !== null || lifecycle.lastObservedBeforeStateHash !== null)) {
    fail("STAGE3_GATE_CAPABILITY_PRESENTATION_INVALID");
  }
  if (lifecycle.presentationCount === 1
    && (iso(lifecycle.presentedAt, "STAGE3_GATE_PRESENTED_AT_INVALID")
      !== lifecycle.presentedAt
      || lifecycle.lastObservedBeforeStateHash !== candidate.core.beforeStateHash)) {
    fail("STAGE3_GATE_CAPABILITY_PRESENTATION_INVALID");
  }
  if (lifecycle.status === "ACTIVE_HOLD"
    && (lifecycle.presentationCount !== 0 || lifecycle.revokedAt !== null
      || lifecycle.expiredAt !== null)) fail("STAGE3_GATE_ACTIVE_LIFECYCLE_INVALID");
  if (lifecycle.status === "PRESENTED_ONCE_HOLD"
    && (lifecycle.presentationCount !== 1 || lifecycle.revokedAt !== null
      || lifecycle.expiredAt !== null)) fail("STAGE3_GATE_PRESENTED_LIFECYCLE_INVALID");
  if (lifecycle.status === "REVOKED_HOLD"
    && (iso(lifecycle.revokedAt, "STAGE3_GATE_REVOKED_AT_INVALID")
      !== lifecycle.revokedAt || lifecycle.expiredAt !== null)) {
    fail("STAGE3_GATE_REVOKED_LIFECYCLE_INVALID");
  }
  if (lifecycle.status === "EXPIRED_HOLD"
    && (iso(lifecycle.expiredAt, "STAGE3_GATE_EXPIRED_AT_INVALID")
      !== lifecycle.expiredAt || lifecycle.revokedAt !== null)) {
    fail("STAGE3_GATE_EXPIRED_LIFECYCLE_INVALID");
  }
}

function validateSignerChain(signers, state) {
  if (!exactKeys(signers, ["genesisKeyId", "activeKeyId", "keys", "rotations",
    "cryptographicValidityIsInstitutionalStanding"])
    || !HASH.test(signers.genesisKeyId ?? "")
    || !HASH.test(signers.activeKeyId ?? "")
    || signers.cryptographicValidityIsInstitutionalStanding !== false
    || !Array.isArray(signers.keys) || signers.keys.length < 1
    || !Array.isArray(signers.rotations)
    || signers.rotations.length !== signers.keys.length - 1) {
    fail("STAGE3_GATE_SIGNER_CHAIN_INVALID");
  }
  const byId = new Map();
  for (const [index, key] of signers.keys.entries()) {
    if (!exactKeys(key, ["keyId", "publicKeyPem", "activatedRevision",
      "retiredRevision"])
      || key.keyId !== stage3GateSignerKeyId(key.publicKeyPem)
      || !Number.isSafeInteger(key.activatedRevision) || key.activatedRevision < 0
      || !(key.retiredRevision === null || (Number.isSafeInteger(key.retiredRevision)
        && key.retiredRevision > key.activatedRevision))
      || byId.has(key.keyId)) fail("STAGE3_GATE_SIGNER_KEY_INVALID");
    if (index === 0 && (key.keyId !== signers.genesisKeyId
      || key.activatedRevision !== 0)) fail("STAGE3_GATE_GENESIS_SIGNER_INVALID");
    byId.set(key.keyId, key);
  }
  for (const [index, rotation] of signers.rotations.entries()) {
    if (!exactKeys(rotation, ["statement", "statementHash", "oldSignature",
      "newSignature"])
      || !exactKeys(rotation.statement, ["gateIdHash", "fromKeyId", "toKeyId",
        "newPublicKeyPem", "previousStateHash", "rotationRevision", "rotatedAt"])
      || rotation.statement.gateIdHash !== state.gateIdHash
      || rotation.statement.fromKeyId !== signers.keys[index].keyId
      || rotation.statement.toKeyId !== signers.keys[index + 1].keyId
      || rotation.statement.newPublicKeyPem !== signers.keys[index + 1].publicKeyPem
      || !HASH.test(rotation.statement.previousStateHash ?? "")
      || rotation.statement.rotationRevision !== signers.keys[index + 1].activatedRevision
      || signers.keys[index].retiredRevision !== rotation.statement.rotationRevision
      || iso(rotation.statement.rotatedAt, "STAGE3_GATE_ROTATION_TIME_INVALID")
        !== rotation.statement.rotatedAt
      || rotation.statementHash !== digest(DOMAINS.rotationStatement,
        rotation.statement)
      || !verifyHashSignature(DOMAINS.rotationOldSignature, rotation.statementHash,
        rotation.oldSignature, signers.keys[index].publicKeyPem)
      || !verifyHashSignature(DOMAINS.rotationNewSignature, rotation.statementHash,
        rotation.newSignature, signers.keys[index + 1].publicKeyPem)) {
      fail("STAGE3_GATE_ROTATION_CHAIN_INVALID");
    }
  }
  const active = signers.keys[signers.keys.length - 1];
  if (active.keyId !== signers.activeKeyId || active.retiredRevision !== null) {
    fail("STAGE3_GATE_ACTIVE_SIGNER_INVALID");
  }
  return active;
}

function signerAtRevision(signers, revision) {
  return signers.keys.find((key) => key.activatedRevision <= revision
    && (key.retiredRevision === null || revision < key.retiredRevision)) ?? null;
}

function checkpointBody(checkpoint) {
  return Object.fromEntries([
    "schema", "schemaVersion", "gateIdHash", "genesisHash", "sourceAnchorHash",
    "stateHash", "revision", "eventHeadHash", "createdAt", "signerKeyId",
  ].map((key) => [key, checkpoint[key]]));
}

function makeCheckpoint(envelope, genesis, createdAt, signer) {
  const state = envelope.state;
  const active = signerAtRevision(state.signers, state.revision);
  if (!active || active.keyId !== signer.keyId
    || state.signers.activeKeyId !== signer.keyId) {
    fail("STAGE3_GATE_CHECKPOINT_ACTIVE_SIGNER_REQUIRED");
  }
  const body = {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.checkpoint,
    schemaVersion: "1.0.0",
    gateIdHash: state.gateIdHash,
    genesisHash: state.genesisHash,
    sourceAnchorHash: state.sourceAnchorHash,
    stateHash: envelope.stateHash,
    revision: state.revision,
    eventHeadHash: state.events.length
      ? state.events[state.events.length - 1].eventHash : null,
    createdAt,
    signerKeyId: signer.keyId,
  };
  const checkpointHash = digest(DOMAINS.checkpoint, body);
  return deepFreeze({ ...body, checkpointHash,
    signature: { algorithm: "Ed25519",
      value: signHash(DOMAINS.checkpointSignature, checkpointHash,
        signer.privateKey) } });
}

function validateRequiredCheckpoint(checkpoint, envelope, genesis) {
  if (!exactKeys(checkpoint, CHECKPOINT_KEYS)
    || checkpoint.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.checkpoint
    || checkpoint.schemaVersion !== "1.0.0"
    || !HASH.test(checkpoint.gateIdHash ?? "")
    || !HASH.test(checkpoint.genesisHash ?? "")
    || !HASH.test(checkpoint.sourceAnchorHash ?? "")
    || !HASH.test(checkpoint.stateHash ?? "")
    || !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0
    || !(checkpoint.eventHeadHash === null || HASH.test(checkpoint.eventHeadHash))
    || iso(checkpoint.createdAt, "STAGE3_GATE_CHECKPOINT_TIME_INVALID")
      !== checkpoint.createdAt
    || !HASH.test(checkpoint.signerKeyId ?? "")
    || !HASH.test(checkpoint.checkpointHash ?? "")
    || !exactKeys(checkpoint.signature, ["algorithm", "value"])
    || checkpoint.signature.algorithm !== "Ed25519") {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_INVALID");
  }
  const body = checkpointBody(checkpoint);
  if (checkpoint.checkpointHash !== digest(DOMAINS.checkpoint, body)) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_HASH_INVALID");
  }
  const state = envelope.state;
  if (checkpoint.gateIdHash !== state.gateIdHash
    || checkpoint.gateIdHash !== genesis.gateIdHash) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_WRONG_GATE");
  }
  if (checkpoint.genesisHash !== state.genesisHash
    || checkpoint.genesisHash !== genesis.genesisHash) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_WRONG_GENESIS");
  }
  if (checkpoint.sourceAnchorHash !== state.sourceAnchorHash
    || checkpoint.sourceAnchorHash !== genesis.sourceAnchorHash) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_WRONG_SOURCE_ANCHOR");
  }
  if (checkpoint.revision > state.revision) {
    fail("STAGE3_GATE_ROLLBACK_BELOW_REQUIRED_CHECKPOINT");
  }
  const signer = signerAtRevision(state.signers, checkpoint.revision);
  if (!signer || signer.keyId !== checkpoint.signerKeyId
    || !verifyHashSignature(DOMAINS.checkpointSignature, checkpoint.checkpointHash,
      checkpoint.signature.value, signer.publicKeyPem)) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_SIGNATURE_INVALID");
  }
  const expectedHead = checkpoint.revision === 0
    ? null : state.events[checkpoint.revision - 1]?.eventHash;
  if (checkpoint.eventHeadHash !== expectedHead) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_EVENT_HEAD_MISMATCH");
  }
  const expectedStateHash = checkpoint.revision === state.revision
    ? envelope.stateHash
    : state.events[checkpoint.revision]?.previousStateHash;
  if (checkpoint.stateHash !== expectedStateHash) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_STATE_NOT_ANCESTOR");
  }
  const lowerTime = checkpoint.revision === 0
    ? state.createdAt : state.events[checkpoint.revision - 1].occurredAt;
  if (Date.parse(checkpoint.createdAt) < Date.parse(lowerTime)) {
    fail("STAGE3_GATE_REQUIRED_CHECKPOINT_TIME_PRECEDES_HEAD");
  }
  return {
    checkpointHash: checkpoint.checkpointHash,
    checkpointRevision: checkpoint.revision,
    checkpointStateHash: checkpoint.stateHash,
    checkpointEventHeadHash: checkpoint.eventHeadHash,
    currentRevision: state.revision,
    revisionLag: state.revision - checkpoint.revision,
    currentStateContainsCheckpoint: true,
    rollbackResistanceEstablished: true,
  };
}

function validateAudit(audit, state, policy) {
  if (!exactKeys(audit, ["requiredHookIds", "lastCycleStatus", "lastCycleHash",
    "ownerGateActualWritePathVerified", "alternateWritePathsExcluded", "cycles"])
    || !same(audit.requiredHookIds, policy.requiredAuditHookIds)
    || !["NOT_RUN_FAIL_CLOSED", "PASSED_LOCAL_DIAGNOSTIC_ONLY", "FAILED_CLOSED"]
      .includes(audit.lastCycleStatus)
    || !(audit.lastCycleHash === null || HASH.test(audit.lastCycleHash))
    || audit.ownerGateActualWritePathVerified !== false
    || audit.alternateWritePathsExcluded !== false
    || !Array.isArray(audit.cycles)) fail("STAGE3_GATE_AUDIT_STATE_INVALID");
  let previous = null;
  for (const [index, cycle] of audit.cycles.entries()) {
    if (!exactKeys(cycle, ["cycleIdHash", "occurredAt", "subjectHash", "results",
      "status", "previousCycleHash", "cycleHash"])
      || !HASH.test(cycle.cycleIdHash ?? "") || !HASH.test(cycle.subjectHash ?? "")
      || iso(cycle.occurredAt, "STAGE3_GATE_AUDIT_TIME_INVALID") !== cycle.occurredAt
      || cycle.previousCycleHash !== previous
      || !Array.isArray(cycle.results)
      || cycle.results.length !== audit.requiredHookIds.length
      || !same(cycle.results.map((result) => result.hookId), audit.requiredHookIds)
      || cycle.results.some((result) => !exactKeys(result, ["hookId", "outcome",
        "evidenceHash", "errorHash", "trustedAsAuthority"])
        || !audit.requiredHookIds.includes(result.hookId)
        || !["NO_BYPASS_OBSERVED", "BYPASS_OBSERVED", "HOOK_ERROR_OR_MISSING"]
          .includes(result.outcome)
        || !(result.evidenceHash === null || HASH.test(result.evidenceHash))
        || !(result.errorHash === null || HASH.test(result.errorHash))
        || result.trustedAsAuthority !== false)
      || !["PASSED_LOCAL_DIAGNOSTIC_ONLY", "FAILED_CLOSED"].includes(cycle.status)) {
      fail("STAGE3_GATE_AUDIT_CYCLE_INVALID");
    }
    const expectedStatus = cycle.results.every((result) =>
      result.outcome === "NO_BYPASS_OBSERVED" && result.evidenceHash !== null)
      ? "PASSED_LOCAL_DIAGNOSTIC_ONLY" : "FAILED_CLOSED";
    const { cycleHash, ...body } = cycle;
    if (cycle.status !== expectedStatus || cycleHash !== digest(DOMAINS.auditCycle, body)) {
      fail("STAGE3_GATE_AUDIT_CYCLE_HASH_INVALID");
    }
    previous = cycleHash;
    if (index === audit.cycles.length - 1
      && (audit.lastCycleHash !== cycleHash || audit.lastCycleStatus !== cycle.status)) {
      fail("STAGE3_GATE_AUDIT_HEAD_INVALID");
    }
  }
  if (audit.cycles.length === 0
    && (audit.lastCycleHash !== null || audit.lastCycleStatus !== "NOT_RUN_FAIL_CLOSED")) {
    fail("STAGE3_GATE_AUDIT_EMPTY_HEAD_INVALID");
  }
}

function validateStateEnvelope(envelope, genesis, anchor) {
  validateGenesis(genesis, anchor);
  if (!exactKeys(envelope, ENVELOPE_KEYS)
    || envelope.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.stateEnvelope
    || envelope.schemaVersion !== "1.0.0"
    || !exactKeys(envelope.state, STATE_KEYS)
    || envelope.state.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.state
    || envelope.state.schemaVersion !== "1.0.0"
    || !HASH.test(envelope.stateHash ?? "")
    || !exactKeys(envelope.signing, ["algorithm", "keyId", "signature"])
    || envelope.signing.algorithm !== "Ed25519") {
    fail("STAGE3_GATE_STATE_ENVELOPE_INVALID");
  }
  const state = envelope.state;
  {
    if (state.gateIdHash !== genesis.gateIdHash
      || state.genesisHash !== genesis.genesisHash
      || state.sourceAnchorHash !== genesis.sourceAnchorHash
      || !same(state.sourceBindings, genesis.sourceBindings)
      || state.localRequestPolicyHash !== genesis.localRequestPolicy.policyHash
      || !Number.isSafeInteger(state.revision) || state.revision < 0
      || iso(state.createdAt, "STAGE3_GATE_STATE_CREATED_AT_INVALID") !== state.createdAt
      || iso(state.updatedAt, "STAGE3_GATE_STATE_UPDATED_AT_INVALID") !== state.updatedAt
      || iso(state.expiresAt, "STAGE3_GATE_STATE_EXPIRY_INVALID") !== state.expiresAt
      || state.createdAt !== genesis.createdAt || state.expiresAt !== genesis.expiresAt
      || Date.parse(state.updatedAt) < Date.parse(state.createdAt)
      || !exactKeys(state.lifecycle, ["status", "revokedAt", "expiredAt"])
      || !["ACTIVE_HOLD", "REVOKED_HOLD", "EXPIRED_HOLD"]
        .includes(state.lifecycle.status)
      || state.decision !== fixedDecision()
      || !same(state.authority, zeroAuthority())
      || !same(state.responsibilityRecovery,
        fixedResponsibilityRecovery(state.sourceBindings))) {
      fail("STAGE3_GATE_STATE_BOUNDARY_INVALID");
    }
    if (state.lifecycle.status === "ACTIVE_HOLD"
      && (state.lifecycle.revokedAt !== null || state.lifecycle.expiredAt !== null)) {
      fail("STAGE3_GATE_LIFECYCLE_INVALID");
    }
    if (state.lifecycle.status === "REVOKED_HOLD"
      && (iso(state.lifecycle.revokedAt, "STAGE3_GATE_REVOKED_AT_INVALID")
        !== state.lifecycle.revokedAt || state.lifecycle.expiredAt !== null)) {
      fail("STAGE3_GATE_LIFECYCLE_INVALID");
    }
    if (state.lifecycle.status === "EXPIRED_HOLD"
      && (iso(state.lifecycle.expiredAt, "STAGE3_GATE_EXPIRED_AT_INVALID")
        !== state.lifecycle.expiredAt || state.lifecycle.revokedAt !== null)) {
      fail("STAGE3_GATE_LIFECYCLE_INVALID");
    }
    const activeSigner = validateSignerChain(state.signers, state);
    if (envelope.signing.keyId !== activeSigner.keyId
      || envelope.stateHash !== digest(DOMAINS.state, state)
      || !verifyHashSignature(DOMAINS.stateSignature, envelope.stateHash,
        envelope.signing.signature, activeSigner.publicKeyPem)) {
      fail("STAGE3_GATE_STATE_SIGNATURE_INVALID");
    }
    if (!Array.isArray(state.candidates)
      || !same(state.candidates, [...state.candidates].sort((left, right) =>
        left.core.candidateIdHash.localeCompare(right.core.candidateIdHash)))
      || new Set(state.candidates.map((candidate) => candidate.core.candidateIdHash)).size
        !== state.candidates.length) fail("STAGE3_GATE_CANDIDATE_SET_INVALID");
    for (const candidate of state.candidates) validateCandidate(candidate, state);

    if (!exactKeys(state.requestAccounting, [
      "planningUnitHash", "aggregateRequestCeilingUnits",
      "perCandidateRequestCeilingUnits", "activeRequestedUnits",
      "releasedRequestedUnits", "totalRequestedEverUnits", "candidateCount",
      "actualReserveUnits", "currency", "reserveEstablished", "staleBalanceAccepted",
    ])
      || state.requestAccounting.planningUnitHash
        !== genesis.localRequestPolicy.planningUnitHash
      || state.requestAccounting.aggregateRequestCeilingUnits
        !== genesis.localRequestPolicy.aggregateRequestCeilingUnits
      || state.requestAccounting.perCandidateRequestCeilingUnits
        !== genesis.localRequestPolicy.perCandidateRequestCeilingUnits
      || state.requestAccounting.candidateCount !== state.candidates.length
      || state.requestAccounting.actualReserveUnits !== null
      || state.requestAccounting.currency !== null
      || state.requestAccounting.reserveEstablished !== false
      || state.requestAccounting.staleBalanceAccepted !== false) {
      fail("STAGE3_GATE_REQUEST_ACCOUNTING_INVALID");
    }
    const total = state.candidates.reduce((sum, candidate) => sum
      + units(candidate.core.reserveRequest.requestedUnits,
        "STAGE3_GATE_ACCOUNTING_CANDIDATE_UNITS_INVALID"), 0n);
    const active = state.candidates.filter((candidate) =>
      candidate.lifecycle.status === "ACTIVE_HOLD").reduce((sum, candidate) => sum
      + BigInt(candidate.core.reserveRequest.requestedUnits), 0n);
    const released = total - active;
    if (units(state.requestAccounting.totalRequestedEverUnits,
      "STAGE3_GATE_TOTAL_REQUESTED_INVALID") !== total
      || units(state.requestAccounting.activeRequestedUnits,
        "STAGE3_GATE_ACTIVE_REQUESTED_INVALID") !== active
      || units(state.requestAccounting.releasedRequestedUnits,
        "STAGE3_GATE_RELEASED_REQUESTED_INVALID") !== released
      || active > units(state.requestAccounting.aggregateRequestCeilingUnits,
        "STAGE3_GATE_AGGREGATE_REQUEST_INVALID")) {
      fail("STAGE3_GATE_REQUEST_ACCOUNTING_CONSERVATION_INVALID");
    }

    if (!Array.isArray(state.externalReceipts)
      || !same(state.externalReceipts, [...state.externalReceipts]
        .sort((left, right) => left.receiptHash.localeCompare(right.receiptHash)))
      || new Set(state.externalReceipts.map((item) => item.receiptHash)).size
        !== state.externalReceipts.length
      || state.externalReceipts.some((item) => !exactKeys(item, [
        "receiptHash", "role", "providerIdHash", "cryptographicValidity",
        "providerSpecificVerifierId", "institutionalStatus",
        "issuerStandingVerified", "custodyVerified", "reserveVerified",
        "ownerAdoptionVerified", "coverageCreated", "authorityGranted",
      ])
        || !HASH.test(item.receiptHash ?? "") || !EXTERNAL_ROLES.has(item.role)
        || !HASH.test(item.providerIdHash ?? "")
        || !["VALID_SELF_PRESENTED_KEY", "INVALID_SIGNATURE"]
          .includes(item.cryptographicValidity)
        || item.providerSpecificVerifierId !== null
        || item.institutionalStatus !== "UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER"
        || ["issuerStandingVerified", "custodyVerified", "reserveVerified",
          "ownerAdoptionVerified", "coverageCreated", "authorityGranted"]
          .some((key) => item[key] !== false))) {
      fail("STAGE3_GATE_EXTERNAL_RECEIPT_BOUNDARY_INVALID");
    }
    validateAudit(state.audit, state, genesis.localRequestPolicy);
    if (!Array.isArray(state.adversities)
      || state.adversities.some((item) => !exactKeys(item, ["kind", "occurredAt",
        "evidenceHash", "adversityHash"])
        || !ADVERSITIES.has(item.kind)
        || iso(item.occurredAt, "STAGE3_GATE_ADVERSITY_TIME_INVALID")
          !== item.occurredAt
        || !HASH.test(item.evidenceHash ?? "")
        || item.adversityHash !== digest(DOMAINS.adversity, {
          kind: item.kind, occurredAt: item.occurredAt,
          evidenceHash: item.evidenceHash,
        }))) fail("STAGE3_GATE_ADVERSITY_INVALID");

    if (!Array.isArray(state.events) || state.events.length !== state.revision) {
      fail("STAGE3_GATE_EVENT_COUNT_INVALID");
    }
    let priorEventHash = null;
    const commands = new Set();
    for (const [index, event] of state.events.entries()) {
      if (!exactKeys(event, ["revision", "commandId", "commandHash", "kind",
        "occurredAt", "previousStateHash", "previousEventHash", "outcome",
        "eventHash"])
        || event.revision !== index + 1 || !TOKEN.test(event.commandId ?? "")
        || !HASH.test(event.commandHash ?? "") || !COMMAND_KINDS.has(event.kind)
        || iso(event.occurredAt, "STAGE3_GATE_EVENT_TIME_INVALID") !== event.occurredAt
        || !HASH.test(event.previousStateHash ?? "")
        || event.previousEventHash !== priorEventHash
        || !TOKEN.test(event.outcome ?? "") || commands.has(event.commandId)) {
        fail("STAGE3_GATE_EVENT_INVALID");
      }
      const { eventHash, ...body } = event;
      if (eventHash !== digest(DOMAINS.event, body)) fail("STAGE3_GATE_EVENT_HASH_INVALID");
      commands.add(event.commandId); priorEventHash = eventHash;
    }
    if (state.events.length > 0
      && (state.updatedAt !== state.events[state.events.length - 1].occurredAt
        || state.signers.rotations.some((rotation) => {
          const event = state.events[rotation.statement.rotationRevision - 1];
          return event?.kind !== "ROTATE_SIGNER"
            || event.revision !== rotation.statement.rotationRevision
            || event.occurredAt !== rotation.statement.rotatedAt
            || event.previousStateHash !== rotation.statement.previousStateHash;
        }))) {
      fail("STAGE3_GATE_EVENT_HEAD_INVALID");
    }
  }
}

export function verifyStage3GuaranteeGateArtifacts({ genesis, sourceAnchor, envelope,
  requiredCheckpoint = null }) {
  try {
    validateStateEnvelope(envelope, genesis, sourceAnchor);
    const checkpoint = requiredCheckpoint === null ? null
      : validateRequiredCheckpoint(requiredCheckpoint, envelope, genesis);
    return deepFreeze({
      ok: true,
      verificationLevel: checkpoint === null
        ? "CURRENT_STATE_CHAIN_ONLY"
        : "CURRENT_STATE_CHAIN_WITH_REQUIRED_CHECKPOINT_ANCESTRY",
      sourceArtifactsReverified: false,
      cryptographicIntegrityValid: true,
      localSignerChainValid: true,
      genesisSignerExternallyTrusted: false,
      rollbackResistanceEstablished: checkpoint !== null,
      rollbackResistanceScope: checkpoint === null
        ? "NONE_NO_CALLER_HELD_WATERMARK"
        : "RELATIVE_TO_SUPPLIED_REQUIRED_CHECKPOINT",
      checkpointIndependentRetentionVerified: false,
      requiredCheckpointHash: checkpoint?.checkpointHash ?? null,
      requiredCheckpointRevision: checkpoint?.checkpointRevision ?? null,
      requiredCheckpointEventHeadHash: checkpoint?.checkpointEventHeadHash ?? null,
      checkpointRevisionLag: checkpoint?.revisionLag ?? null,
      currentStateContainsRequiredCheckpoint:
        checkpoint?.currentStateContainsCheckpoint ?? false,
      institutionalStandingVerified: false,
      custodyVerified: false,
      reserveVerified: false,
      coverageEstablished: false,
      guaranteeIssued: false,
      capabilityExecutionAuthorized: false,
      movesFunds: false,
      actualResourceWrite: false,
      obligationOpen: true,
      stateHash: envelope.stateHash,
      revision: envelope.state.revision,
    });
  } catch (error) {
    return deepFreeze({ ok: false, error: error?.message ?? String(error),
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false, cryptographicIntegrityValid: false,
      localSignerChainValid: false, genesisSignerExternallyTrusted: false,
      rollbackResistanceEstablished: false,
      rollbackResistanceScope: "NONE_VERIFICATION_FAILED",
      checkpointIndependentRetentionVerified: false,
      requiredCheckpointHash: requiredCheckpoint?.checkpointHash ?? null,
      institutionalStandingVerified: false, custodyVerified: false,
      reserveVerified: false, coverageEstablished: false, guaranteeIssued: false,
      capabilityExecutionAuthorized: false, movesFunds: false,
      actualResourceWrite: false, obligationOpen: true });
  }
}

export function verifyStage3GuaranteeGateCheckpoint(checkpoint,
  { genesis, sourceAnchor, envelope }) {
  return verifyStage3GuaranteeGateArtifacts({ genesis, sourceAnchor, envelope,
    requiredCheckpoint: checkpoint });
}

function externalReceiptStatement(input) {
  return {
    role: input.role,
    providerIdHash: input.providerIdHash,
    issuedAt: input.issuedAt,
    payloadHash: input.payloadHash,
    claimHash: input.claimHash,
    worldHash: input.worldHash,
    quoteCandidateHash: input.quoteCandidateHash,
  };
}

export function signStage3ExternalReferenceReceipt(input, { privateKeyPem } = {}) {
  const keys = ["role", "providerIdHash", "issuedAt", "payloadHash", "claimHash",
    "worldHash", "quoteCandidateHash"];
  if (!exactKeys(input, keys) || !EXTERNAL_ROLES.has(input.role)) {
    fail("STAGE3_GATE_EXTERNAL_RECEIPT_INPUT_INVALID");
  }
  for (const key of keys.filter((key) => key.endsWith("Hash"))) {
    hash(input[key], `STAGE3_GATE_EXTERNAL_${key.toUpperCase()}_INVALID`);
  }
  iso(input.issuedAt, "STAGE3_GATE_EXTERNAL_RECEIPT_TIME_INVALID");
  const signer = signerFromPrivate(privateKeyPem);
  const statement = externalReceiptStatement(input);
  const statementHash = digest(DOMAINS.externalStatement, statement);
  const body = {
    schema: STAGE3_GUARANTEE_GATE_SCHEMAS.externalReceipt,
    schemaVersion: "1.0.0",
    statement,
    statementHash,
    signature: {
      algorithm: "Ed25519", keyId: signer.keyId, publicKeyPem: signer.publicKeyPem,
      value: signHash(DOMAINS.externalReceipt, statementHash, signer.privateKey),
    },
  };
  return deepFreeze({ ...body, receiptHash: digest(DOMAINS.externalReceipt, body) });
}

export function inspectStage3ExternalReferenceReceipt(receipt) {
  try {
    if (!exactKeys(receipt, ["schema", "schemaVersion", "statement", "statementHash",
      "signature", "receiptHash"])
      || receipt.schema !== STAGE3_GUARANTEE_GATE_SCHEMAS.externalReceipt
      || receipt.schemaVersion !== "1.0.0"
      || !exactKeys(receipt.statement, ["role", "providerIdHash", "issuedAt",
        "payloadHash", "claimHash", "worldHash", "quoteCandidateHash"])
      || !EXTERNAL_ROLES.has(receipt.statement.role)
      || ["providerIdHash", "payloadHash", "claimHash", "worldHash",
        "quoteCandidateHash"].some((key) => !HASH.test(receipt.statement[key] ?? ""))
      || iso(receipt.statement.issuedAt, "STAGE3_GATE_EXTERNAL_RECEIPT_TIME_INVALID")
        !== receipt.statement.issuedAt
      || !exactKeys(receipt.signature, ["algorithm", "keyId", "publicKeyPem", "value"])
      || receipt.signature.algorithm !== "Ed25519"
      || receipt.signature.keyId !== stage3GateSignerKeyId(receipt.signature.publicKeyPem)
      || receipt.statementHash !== digest(DOMAINS.externalStatement, receipt.statement)
      || receipt.receiptHash !== digest(DOMAINS.externalReceipt, {
        schema: receipt.schema, schemaVersion: receipt.schemaVersion,
        statement: receipt.statement, statementHash: receipt.statementHash,
        signature: receipt.signature,
      })) fail("STAGE3_GATE_EXTERNAL_RECEIPT_INVALID");
    const cryptographicValid = verifyHashSignature(DOMAINS.externalReceipt,
      receipt.statementHash, receipt.signature.value, receipt.signature.publicKeyPem);
    return deepFreeze({
      ok: true,
      receiptHash: receipt.receiptHash,
      cryptographicValid,
      cryptographicValidity: cryptographicValid
        ? "VALID_SELF_PRESENTED_KEY" : "INVALID_SIGNATURE",
      providerSpecificVerifierId: null,
      institutionalStatus: "UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER",
      issuerStandingVerified: false,
      custodyVerified: false,
      reserveVerified: false,
      ownerAdoptionVerified: false,
      coverageCreated: false,
      authorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({ ok: false, error: error?.message ?? String(error),
      cryptographicValid: false, institutionalStatus: "UNVERIFIED_INVALID_STRUCTURE",
      issuerStandingVerified: false, custodyVerified: false, reserveVerified: false,
      ownerAdoptionVerified: false, coverageCreated: false, authorityGranted: false });
  }
}

function recomputeAccounting(state) {
  const total = state.candidates.reduce((sum, candidate) => sum
    + BigInt(candidate.core.reserveRequest.requestedUnits), 0n);
  const active = state.candidates.filter((candidate) =>
    candidate.lifecycle.status === "ACTIVE_HOLD").reduce((sum, candidate) => sum
    + BigInt(candidate.core.reserveRequest.requestedUnits), 0n);
  state.requestAccounting.activeRequestedUnits = active.toString();
  state.requestAccounting.releasedRequestedUnits = (total - active).toString();
  state.requestAccounting.totalRequestedEverUnits = total.toString();
  state.requestAccounting.candidateCount = state.candidates.length;
}

function revokeActiveCandidates(state, at) {
  state.candidates = state.candidates.map((candidate) => {
    if (candidate.lifecycle.status !== "ACTIVE_HOLD") return candidate;
    return { ...candidate, lifecycle: { ...candidate.lifecycle,
      status: "REVOKED_HOLD", revokedAt: at } };
  });
}

function expireState(state, at) {
  state.candidates = state.candidates.map((candidate) => {
    if (candidate.lifecycle.status !== "ACTIVE_HOLD"
      || Date.parse(at) < Date.parse(candidate.core.expiresAt)) return candidate;
    return { ...candidate, lifecycle: { ...candidate.lifecycle,
      status: "EXPIRED_HOLD", expiredAt: at } };
  });
  if (state.lifecycle.status === "ACTIVE_HOLD"
    && Date.parse(at) >= Date.parse(state.expiresAt)) {
    state.lifecycle = { status: "EXPIRED_HOLD", revokedAt: null, expiredAt: at };
    state.candidates = state.candidates.map((candidate) => {
      if (candidate.lifecycle.status !== "ACTIVE_HOLD") return candidate;
      return { ...candidate, lifecycle: { ...candidate.lifecycle,
        status: "EXPIRED_HOLD", expiredAt: at } };
    });
  }
  recomputeAccounting(state);
}

function sourceReferences(state) {
  const bound = state.sourceBindings;
  return {
    gateIdHash: state.gateIdHash,
    stage34FrontierHash: bound.stage34FrontierHash,
    stage2FrontierHash: bound.stage2FrontierHash,
    quoteCandidateHash: bound.quoteCandidateHash,
    quoteIdentityHash: bound.quoteIdentityHash,
    worldPolicyHash: bound.worldPolicyHash,
    boundaryHash: bound.boundaryHash,
    claimHash: bound.claimHash,
    wayHash: bound.wayHash,
    worldHash: bound.worldHash,
    realityEnvelopeHash: bound.realityEnvelopeHash,
    sourceEvidenceAnchorHash: bound.sourceEvidenceAnchorHash,
    realityExecutionHash: bound.realityExecutionHash,
    consequenceObligationSetHash: bound.consequenceObligationSetHash,
  };
}

function commandHash(command) {
  return digest(DOMAINS.command, command);
}

function requireActiveAndAudited(state, at) {
  if (state.lifecycle.status !== "ACTIVE_HOLD") fail("STAGE3_GATE_NOT_ACTIVE");
  if (Date.parse(at) >= Date.parse(state.expiresAt)) fail("STAGE3_GATE_EXPIRED");
  if (state.audit.lastCycleStatus !== "PASSED_LOCAL_DIAGNOSTIC_ONLY") {
    fail("STAGE3_GATE_BYPASS_AUDIT_NOT_PASSING_FAIL_CLOSED");
  }
}

function applyCommand(envelope, genesis, anchor, command, signingMaterial,
  newSigningMaterial = null) {
  validateStateEnvelope(envelope, genesis, anchor);
  if (!exactKeys(command, ["kind", "commandId", "occurredAt", "expectedRevision",
    "expectedStateHash", "payload"])
    || !COMMAND_KINDS.has(command.kind) || !TOKEN.test(command.commandId ?? "")
    || iso(command.occurredAt, "STAGE3_GATE_COMMAND_TIME_INVALID")
      !== command.occurredAt
    || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0
    || !HASH.test(command.expectedStateHash ?? "") || !plain(command.payload)) {
    fail("STAGE3_GATE_COMMAND_INVALID");
  }
  const hashed = commandHash(command);
  const priorEvent = envelope.state.events.find((event) =>
    event.commandId === command.commandId);
  if (priorEvent) {
    if (priorEvent.commandHash !== hashed) fail("STAGE3_GATE_IDEMPOTENCY_KEY_COLLISION");
    return { envelope, idempotentReplay: true, commandHash: hashed,
      outcome: priorEvent.outcome };
  }
  if (command.expectedRevision !== envelope.state.revision
    || command.expectedStateHash !== envelope.stateHash) {
    fail("STAGE3_GATE_CAS_MISMATCH_STALE_STATE");
  }
  if (Date.parse(command.occurredAt) < Date.parse(envelope.state.updatedAt)) {
    fail("STAGE3_GATE_COMMAND_TIME_REGRESSION");
  }
  const activeKey = envelope.state.signers.activeKeyId;
  if (signingMaterial.keyId !== activeKey) fail("STAGE3_GATE_ACTIVE_SIGNER_REQUIRED");
  const state = structuredClone(envelope.state);
  let outcome = "HOLD_RECORDED";

  if (command.kind === "AUDIT_BYPASS_PATHS") {
    if (!exactKeys(command.payload, ["cycleIdHash", "subjectHash", "results"])) {
      fail("STAGE3_GATE_AUDIT_COMMAND_INVALID");
    }
    hash(command.payload.cycleIdHash, "STAGE3_GATE_AUDIT_CYCLE_ID_INVALID");
    hash(command.payload.subjectHash, "STAGE3_GATE_AUDIT_SUBJECT_INVALID");
    if (!Array.isArray(command.payload.results)
      || command.payload.results.length !== state.audit.requiredHookIds.length
      || !same(command.payload.results.map((item) => item.hookId),
        state.audit.requiredHookIds)) fail("STAGE3_GATE_AUDIT_RESULTS_INVALID");
    const results = command.payload.results.map((result) => {
      if (!exactKeys(result, ["hookId", "outcome", "evidenceHash", "errorHash"])
        || !state.audit.requiredHookIds.includes(result.hookId)
        || !["NO_BYPASS_OBSERVED", "BYPASS_OBSERVED", "HOOK_ERROR_OR_MISSING"]
          .includes(result.outcome)
        || !(result.evidenceHash === null || HASH.test(result.evidenceHash))
        || !(result.errorHash === null || HASH.test(result.errorHash))) {
        fail("STAGE3_GATE_AUDIT_RESULT_INVALID");
      }
      return { ...result, trustedAsAuthority: false };
    });
    const status = results.every((result) =>
      result.outcome === "NO_BYPASS_OBSERVED" && result.evidenceHash !== null)
      ? "PASSED_LOCAL_DIAGNOSTIC_ONLY" : "FAILED_CLOSED";
    const body = { cycleIdHash: command.payload.cycleIdHash,
      occurredAt: command.occurredAt, subjectHash: command.payload.subjectHash,
      results, status, previousCycleHash: state.audit.lastCycleHash };
    const cycle = { ...body, cycleHash: digest(DOMAINS.auditCycle, body) };
    state.audit.cycles.push(cycle);
    state.audit.lastCycleStatus = status;
    state.audit.lastCycleHash = cycle.cycleHash;
    if (status === "FAILED_CLOSED") {
      revokeActiveCandidates(state, command.occurredAt);
      recomputeAccounting(state);
      outcome = "HOLD_AUDIT_FAILED_CLOSED_AND_ACTIVE_CANDIDATES_REVOKED";
    } else outcome = "HOLD_LOCAL_DIAGNOSTIC_PASS_NO_OWNER_ADOPTION";
  } else if (command.kind === "REQUEST_CAPABILITY") {
    requireActiveAndAudited(state, command.occurredAt);
    if (!exactKeys(command.payload, ["candidateIdHash", "requestedUnits", "expiresAt",
      "beforeStateHash", "capabilityScopeHash"])) {
      fail("STAGE3_GATE_REQUEST_COMMAND_INVALID");
    }
    hash(command.payload.candidateIdHash, "STAGE3_GATE_CANDIDATE_ID_INVALID");
    hash(command.payload.beforeStateHash, "STAGE3_GATE_BEFORE_STATE_INVALID");
    hash(command.payload.capabilityScopeHash, "STAGE3_GATE_CAPABILITY_SCOPE_INVALID");
    const requested = units(command.payload.requestedUnits,
      "STAGE3_GATE_REQUEST_UNITS_INVALID", { positive: true });
    const expiresAt = iso(command.payload.expiresAt,
      "STAGE3_GATE_CANDIDATE_EXPIRY_INVALID");
    if (Date.parse(expiresAt) <= Date.parse(command.occurredAt)
      || Date.parse(expiresAt) > Date.parse(state.expiresAt)
      || Date.parse(expiresAt) > Date.parse(state.sourceBindings.quoteValidUntil)) {
      fail("STAGE3_GATE_CANDIDATE_EXPIRY_OUTSIDE_SOURCE_WINDOW");
    }
    if (state.candidates.some((candidate) =>
      candidate.core.candidateIdHash === command.payload.candidateIdHash)) {
      fail("STAGE3_GATE_CANDIDATE_ID_REUSE");
    }
    const per = BigInt(state.requestAccounting.perCandidateRequestCeilingUnits);
    const active = BigInt(state.requestAccounting.activeRequestedUnits);
    const aggregate = BigInt(state.requestAccounting.aggregateRequestCeilingUnits);
    if (requested > per) fail("STAGE3_GATE_PER_CANDIDATE_REQUEST_EXCEEDED");
    if (active + requested > aggregate) fail("STAGE3_GATE_AGGREGATE_REQUEST_EXCEEDED");
    const core = {
      schema: STAGE3_GUARANTEE_GATE_SCHEMAS.capabilityCandidate,
      schemaVersion: "1.0.0",
      candidateIdHash: command.payload.candidateIdHash,
      createdAt: command.occurredAt,
      expiresAt,
      beforeStateHash: command.payload.beforeStateHash,
      capabilityScopeHash: command.payload.capabilityScopeHash,
      sourceReferences: sourceReferences(state),
      reserveRequest: {
        planningUnitHash: state.requestAccounting.planningUnitHash,
        requestedUnits: requested.toString(),
        accountingStatus: "LOCAL_REFERENCE_REQUEST_ONLY",
        currency: null,
        assetEquivalence: null,
        actualReserve: false,
        capital: false,
        custody: false,
      },
      capabilityBoundary: {
        oneUse: true,
        reusable: false,
        beforeStateBound: true,
        ownerAdoptionVerified: false,
        ownerGateActualWritePathVerified: false,
        alternateWritePathsExcluded: false,
        actualResourceWrite: false,
        executionAuthorized: false,
      },
      decision: fixedDecision(),
      authority: zeroAuthority(),
    };
    state.candidates.push({ core, candidateHash: digest(DOMAINS.capabilityCandidate, core),
      lifecycle: { status: "ACTIVE_HOLD", presentationCount: 0,
        presentedAt: null, revokedAt: null, expiredAt: null,
        lastObservedBeforeStateHash: null, actualResourceWrite: false } });
    state.candidates.sort((left, right) =>
      left.core.candidateIdHash.localeCompare(right.core.candidateIdHash));
    recomputeAccounting(state);
    outcome = "HOLD_ONE_USE_REFERENCE_CANDIDATE_CREATED_NO_RESERVE";
  } else if (command.kind === "PRESENT_CAPABILITY") {
    requireActiveAndAudited(state, command.occurredAt);
    if (!exactKeys(command.payload, ["candidateIdHash", "observedBeforeStateHash"])) {
      fail("STAGE3_GATE_PRESENT_COMMAND_INVALID");
    }
    const candidate = state.candidates.find((item) =>
      item.core.candidateIdHash === command.payload.candidateIdHash);
    if (!candidate) fail("STAGE3_GATE_CANDIDATE_NOT_FOUND");
    if (candidate.lifecycle.status !== "ACTIVE_HOLD"
      || candidate.lifecycle.presentationCount !== 0) fail("STAGE3_GATE_CAPABILITY_REUSE");
    if (Date.parse(command.occurredAt) >= Date.parse(candidate.core.expiresAt)) {
      fail("STAGE3_GATE_CAPABILITY_EXPIRED");
    }
    if (command.payload.observedBeforeStateHash !== candidate.core.beforeStateHash) {
      fail("STAGE3_GATE_BEFORE_STATE_MISMATCH");
    }
    candidate.lifecycle = { status: "PRESENTED_ONCE_HOLD", presentationCount: 1,
      presentedAt: command.occurredAt, revokedAt: null, expiredAt: null,
      lastObservedBeforeStateHash: command.payload.observedBeforeStateHash,
      actualResourceWrite: false };
    recomputeAccounting(state);
    outcome = "HOLD_PRESENTED_ONCE_NO_OWNER_ADOPTION_OR_RESOURCE_WRITE";
  } else if (command.kind === "REVOKE_CAPABILITY") {
    if (!exactKeys(command.payload, ["candidateIdHash", "reasonHash"])) {
      fail("STAGE3_GATE_REVOKE_CAPABILITY_COMMAND_INVALID");
    }
    hash(command.payload.reasonHash, "STAGE3_GATE_REVOCATION_REASON_INVALID");
    const candidate = state.candidates.find((item) =>
      item.core.candidateIdHash === command.payload.candidateIdHash);
    if (!candidate) fail("STAGE3_GATE_CANDIDATE_NOT_FOUND");
    if (["REVOKED_HOLD", "EXPIRED_HOLD"].includes(candidate.lifecycle.status)) {
      fail("STAGE3_GATE_CAPABILITY_ALREADY_TERMINAL");
    }
    candidate.lifecycle = { ...candidate.lifecycle, status: "REVOKED_HOLD",
      revokedAt: command.occurredAt, expiredAt: null };
    recomputeAccounting(state);
    outcome = "HOLD_CAPABILITY_REVOKED_RECOVERY_SURVIVES";
  } else if (command.kind === "REVOKE_GATE") {
    if (!exactKeys(command.payload, ["reasonHash"])) fail("STAGE3_GATE_REVOKE_COMMAND_INVALID");
    hash(command.payload.reasonHash, "STAGE3_GATE_REVOCATION_REASON_INVALID");
    if (state.lifecycle.status !== "ACTIVE_HOLD") fail("STAGE3_GATE_ALREADY_TERMINAL");
    state.lifecycle = { status: "REVOKED_HOLD", revokedAt: command.occurredAt,
      expiredAt: null };
    revokeActiveCandidates(state, command.occurredAt);
    recomputeAccounting(state);
    outcome = "HOLD_GATE_REVOKED_RECOVERY_SURVIVES";
  } else if (command.kind === "SWEEP_EXPIRY") {
    if (!exactKeys(command.payload, [])) fail("STAGE3_GATE_SWEEP_COMMAND_INVALID");
    expireState(state, command.occurredAt);
    outcome = "HOLD_EXPIRY_SWEPT_RECOVERY_SURVIVES";
  } else if (command.kind === "REGISTER_EXTERNAL_RECEIPT") {
    if (!exactKeys(command.payload, ["receipt"])) fail("STAGE3_GATE_RECEIPT_COMMAND_INVALID");
    const inspected = inspectStage3ExternalReferenceReceipt(command.payload.receipt);
    if (!inspected.ok) fail("STAGE3_GATE_EXTERNAL_RECEIPT_INVALID", inspected.error);
    const receipt = command.payload.receipt;
    if (receipt.statement.claimHash !== state.sourceBindings.claimHash
      || receipt.statement.worldHash !== state.sourceBindings.worldHash
      || receipt.statement.quoteCandidateHash !== state.sourceBindings.quoteCandidateHash) {
      fail("STAGE3_GATE_EXTERNAL_RECEIPT_SOURCE_BINDING_MISMATCH");
    }
    if (state.externalReceipts.some((item) => item.receiptHash === receipt.receiptHash)) {
      fail("STAGE3_GATE_EXTERNAL_RECEIPT_REPLAY");
    }
    state.externalReceipts.push({
      receiptHash: receipt.receiptHash,
      role: receipt.statement.role,
      providerIdHash: receipt.statement.providerIdHash,
      cryptographicValidity: inspected.cryptographicValidity,
      providerSpecificVerifierId: null,
      institutionalStatus: "UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER",
      issuerStandingVerified: false,
      custodyVerified: false,
      reserveVerified: false,
      ownerAdoptionVerified: false,
      coverageCreated: false,
      authorityGranted: false,
    });
    state.externalReceipts.sort((left, right) =>
      left.receiptHash.localeCompare(right.receiptHash));
    outcome = "HOLD_EXTERNAL_RECEIPT_REGISTERED_UNVERIFIED";
  } else if (command.kind === "RECORD_ADVERSITY") {
    if (!exactKeys(command.payload, ["kind", "evidenceHash"])
      || !ADVERSITIES.has(command.payload.kind)) fail("STAGE3_GATE_ADVERSITY_COMMAND_INVALID");
    hash(command.payload.evidenceHash, "STAGE3_GATE_ADVERSITY_EVIDENCE_INVALID");
    expireState(state, command.occurredAt);
    const body = { kind: command.payload.kind, occurredAt: command.occurredAt,
      evidenceHash: command.payload.evidenceHash };
    state.adversities.push({ ...body, adversityHash: digest(DOMAINS.adversity, body) });
    if (["PROVIDER_REPLACEMENT", "INSTITUTION_DISSOLUTION"]
      .includes(command.payload.kind)) {
      revokeActiveCandidates(state, command.occurredAt);
      recomputeAccounting(state);
    }
    if (command.payload.kind === "INSTITUTION_DISSOLUTION"
      && state.lifecycle.status === "ACTIVE_HOLD") {
      state.lifecycle = { status: "REVOKED_HOLD", revokedAt: command.occurredAt,
        expiredAt: null };
    }
    outcome = "HOLD_ADVERSITY_RECORDED_NONWAIVABLE_RECOVERY_SURVIVES";
  } else if (command.kind === "ROTATE_SIGNER") {
    if (!exactKeys(command.payload, ["newPublicKeyPem"]) || newSigningMaterial === null) {
      fail("STAGE3_GATE_ROTATION_COMMAND_INVALID");
    }
    const normalized = normalizedPublicKey(command.payload.newPublicKeyPem);
    if (normalized !== newSigningMaterial.publicKeyPem
      || state.signers.keys.some((item) => item.keyId === newSigningMaterial.keyId)) {
      fail("STAGE3_GATE_ROTATION_NEW_KEY_INVALID");
    }
    const revision = state.revision + 1;
    const statement = { gateIdHash: state.gateIdHash,
      fromKeyId: signingMaterial.keyId, toKeyId: newSigningMaterial.keyId,
      newPublicKeyPem: newSigningMaterial.publicKeyPem,
      previousStateHash: envelope.stateHash, rotationRevision: revision,
      rotatedAt: command.occurredAt };
    const statementHash = digest(DOMAINS.rotationStatement, statement);
    const rotation = { statement, statementHash,
      oldSignature: signHash(DOMAINS.rotationOldSignature, statementHash,
        signingMaterial.privateKey),
      newSignature: signHash(DOMAINS.rotationNewSignature, statementHash,
        newSigningMaterial.privateKey) };
    state.signers.keys[state.signers.keys.length - 1].retiredRevision = revision;
    state.signers.keys.push({ keyId: newSigningMaterial.keyId,
      publicKeyPem: newSigningMaterial.publicKeyPem,
      activatedRevision: revision, retiredRevision: null });
    state.signers.rotations.push(rotation);
    state.signers.activeKeyId = newSigningMaterial.keyId;
    outcome = "HOLD_LOCAL_LEDGER_SIGNER_ROTATED_NO_INSTITUTIONAL_AUTHORITY";
  }

  state.revision += 1;
  state.updatedAt = command.occurredAt;
  const eventBody = { revision: state.revision, commandId: command.commandId,
    commandHash: hashed, kind: command.kind, occurredAt: command.occurredAt,
    previousStateHash: envelope.stateHash,
    previousEventHash: state.events.length
      ? state.events[state.events.length - 1].eventHash : null,
    outcome };
  state.events.push({ ...eventBody, eventHash: digest(DOMAINS.event, eventBody) });
  const resultSigner = command.kind === "ROTATE_SIGNER"
    ? newSigningMaterial : signingMaterial;
  const next = signState(state, resultSigner);
  validateStateEnvelope(next, genesis, anchor);
  return { envelope: next, idempotentReplay: false, commandHash: hashed, outcome };
}

async function readJson(file, code) {
  const info = await lstat(file).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink() || info.size > FILE_LIMIT) fail(code);
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { fail(code); }
}

async function writeExclusive(file, value) {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
}

async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicReplace(file, value) {
  const temporary = `${file}.next-${process.pid}-${randomBytes(8).toString("hex")}`;
  await writeExclusive(temporary, value);
  await rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

async function acquireLock(file) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const handle = await open(file, "wx", 0o600);
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.sync();
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  fail("STAGE3_GATE_LOCK_BUSY_FAIL_CLOSED");
}

async function releaseLock(file, handle) {
  try { await handle.close(); } finally { await unlink(file).catch(() => {}); }
}

const FILES = Object.freeze({
  anchor: "stage3-guarantee-gate-source-anchor.json",
  genesis: "stage3-guarantee-gate-genesis.json",
  state: "stage3-guarantee-gate-state.json",
  lock: ".stage3-guarantee-gate-cas.lock",
});

async function loadArtifacts(directory) {
  const absolute = path.resolve(directory);
  const directoryInfo = await lstat(absolute).catch(() => null);
  if (!directoryInfo || !directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
    fail("STAGE3_GATE_DIRECTORY_INVALID_OR_SYMLINK");
  }
  const anchor = await readJson(path.join(absolute, FILES.anchor),
    "STAGE3_GATE_SOURCE_ANCHOR_FILE_INVALID");
  const genesis = await readJson(path.join(absolute, FILES.genesis),
    "STAGE3_GATE_GENESIS_FILE_INVALID");
  const envelope = await readJson(path.join(absolute, FILES.state),
    "STAGE3_GATE_STATE_FILE_INVALID");
  return { absolute, anchor, genesis, envelope };
}

export class Stage3GuaranteeGateStore {
  #requiredCheckpoint;

  constructor(directory, { requiredCheckpoint = null } = {}) {
    this.directory = path.resolve(directory);
    this.#requiredCheckpoint = requiredCheckpoint === null
      ? null : deepFreeze(structuredClone(requiredCheckpoint));
  }

  static async create(input) {
    const keys = ["directory", "stage34Frontier", "stage34Context",
      "stage2QuoteCandidate", "localRequestPolicy", "createdAt", "expiresAt",
      "signerPrivateKeyPem"];
    if (!exactKeys(input, keys) || typeof input.directory !== "string"
      || input.directory.length === 0) fail("STAGE3_GATE_CREATE_INPUT_INVALID");
    validatePolicy(input.localRequestPolicy);
    const replayed = await replaySourceEntrance(input.stage34Frontier,
      input.stage34Context, input.stage2QuoteCandidate);
    const createdAt = iso(input.createdAt, "STAGE3_GATE_CREATED_AT_INVALID");
    const expiresAt = iso(input.expiresAt, "STAGE3_GATE_EXPIRY_INVALID");
    if (Date.parse(createdAt) < Date.parse(input.stage34Frontier.createdAt)
      || Date.parse(createdAt) < Date.parse(input.stage2QuoteCandidate.validFrom)
      || Date.parse(expiresAt) <= Date.parse(createdAt)
      || Date.parse(expiresAt) > Date.parse(input.stage2QuoteCandidate.validUntil)
      || Date.parse(expiresAt) > Date.parse(
        input.stage34Context.stage2Sources.realitySources.boundary.validUntil)
      || Date.parse(input.localRequestPolicy.createdAt) > Date.parse(createdAt)) {
      fail("STAGE3_GATE_WINDOW_OUTSIDE_SOURCE_VALIDITY");
    }
    const signer = signerFromPrivate(input.signerPrivateKeyPem);
    const anchor = makeSourceAnchor(input.stage34Frontier, input.stage2QuoteCandidate);
    const genesis = makeGenesis({ createdAt, expiresAt, bindings: replayed.bindings,
      anchor, policy: input.localRequestPolicy, signer });
    const envelope = signState(initialState(genesis), signer);
    validateStateEnvelope(envelope, genesis, anchor);
    const directory = path.resolve(input.directory);
    await mkdir(directory, { mode: 0o700 });
    await writeExclusive(path.join(directory, FILES.anchor), anchor);
    await writeExclusive(path.join(directory, FILES.genesis), genesis);
    await writeExclusive(path.join(directory, FILES.state), envelope);
    await syncDirectory(directory);
    return new Stage3GuaranteeGateStore(directory);
  }

  static async open(directory, { requiredCheckpoint = null } = {}) {
    const loaded = await loadArtifacts(directory);
    const checked = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
      sourceAnchor: loaded.anchor, envelope: loaded.envelope, requiredCheckpoint });
    if (!checked.ok) fail("STAGE3_GATE_OPEN_VERIFICATION_FAILED", checked.error);
    return new Stage3GuaranteeGateStore(loaded.absolute, { requiredCheckpoint });
  }

  async snapshot() {
    const loaded = await loadArtifacts(this.directory);
    const checked = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
      sourceAnchor: loaded.anchor, envelope: loaded.envelope,
      requiredCheckpoint: this.#requiredCheckpoint });
    if (!checked.ok) fail("STAGE3_GATE_SNAPSHOT_VERIFICATION_FAILED", checked.error);
    return deepFreeze({ genesis: loaded.genesis, sourceAnchor: loaded.anchor,
      envelope: loaded.envelope, verification: checked });
  }

  async #apply(input, privateKeyPem, newPrivateKeyPem = null) {
    const signer = signerFromPrivate(privateKeyPem);
    const newSigner = newPrivateKeyPem === null ? null : signerFromPrivate(newPrivateKeyPem);
    const lockFile = path.join(this.directory, FILES.lock);
    const lock = await acquireLock(lockFile);
    try {
      const loaded = await loadArtifacts(this.directory);
      const before = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
        sourceAnchor: loaded.anchor, envelope: loaded.envelope,
        requiredCheckpoint: this.#requiredCheckpoint });
      if (!before.ok) fail("STAGE3_GATE_TRANSITION_CHECKPOINT_OR_STATE_INVALID",
        before.error);
      const result = applyCommand(loaded.envelope, loaded.genesis, loaded.anchor,
        input, signer, newSigner);
      const after = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
        sourceAnchor: loaded.anchor, envelope: result.envelope,
        requiredCheckpoint: this.#requiredCheckpoint });
      if (!after.ok) fail("STAGE3_GATE_TRANSITION_RESULT_INVALID", after.error);
      if (!result.idempotentReplay) {
        await atomicReplace(path.join(this.directory, FILES.state), result.envelope);
      }
      return deepFreeze({ ...result, authority: zeroAuthority(), decision: fixedDecision(),
        sourceArtifactsReverifiedDuringTransition: false,
        institutionalStandingVerified: false, custodyVerified: false,
        reserveVerified: false, coverageEstablished: false,
        actualResourceWrite: false, movesFunds: false });
    } finally { await releaseLock(lockFile, lock); }
  }

  async createCheckpoint(input, privateKeyPem) {
    if (!exactKeys(input, ["createdAt", "expectedRevision", "expectedStateHash"])
      || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !HASH.test(input.expectedStateHash ?? "")) {
      fail("STAGE3_GATE_CHECKPOINT_INPUT_INVALID");
    }
    const createdAt = iso(input.createdAt, "STAGE3_GATE_CHECKPOINT_TIME_INVALID");
    const signer = signerFromPrivate(privateKeyPem);
    const lockFile = path.join(this.directory, FILES.lock);
    const lock = await acquireLock(lockFile);
    try {
      const loaded = await loadArtifacts(this.directory);
      const checked = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
        sourceAnchor: loaded.anchor, envelope: loaded.envelope,
        requiredCheckpoint: this.#requiredCheckpoint });
      if (!checked.ok) fail("STAGE3_GATE_CHECKPOINT_STATE_INVALID", checked.error);
      if (loaded.envelope.state.revision !== input.expectedRevision
        || loaded.envelope.stateHash !== input.expectedStateHash) {
        fail("STAGE3_GATE_CHECKPOINT_CAS_MISMATCH_STALE_STATE");
      }
      if (Date.parse(createdAt) < Date.parse(loaded.envelope.state.updatedAt)) {
        fail("STAGE3_GATE_CHECKPOINT_TIME_PRECEDES_STATE");
      }
      const checkpoint = makeCheckpoint(loaded.envelope, loaded.genesis,
        createdAt, signer);
      validateRequiredCheckpoint(checkpoint, loaded.envelope, loaded.genesis);
      this.#requiredCheckpoint = checkpoint;
      return checkpoint;
    } finally { await releaseLock(lockFile, lock); }
  }

  async runBypassAudit(input, privateKeyPem) {
    const keys = ["commandId", "expectedRevision", "expectedStateHash", "occurredAt",
      "cycleIdHash", "subjectHash", "hooks"];
    if (!exactKeys(input, keys) || !plain(input.hooks)) {
      fail("STAGE3_GATE_RUN_AUDIT_INPUT_INVALID");
    }
    const snapshot = await this.snapshot();
    const required = snapshot.envelope.state.audit.requiredHookIds;
    const results = [];
    for (const hookId of required) {
      const hook = input.hooks[hookId];
      if (typeof hook !== "function") {
        results.push({ hookId, outcome: "HOOK_ERROR_OR_MISSING", evidenceHash: null,
          errorHash: digest("outsider/stage3-audit-error/v1", { hookId,
            error: "HOOK_MISSING" }) });
        continue;
      }
      try {
        const result = await hook(deepFreeze(structuredClone({
          gateIdHash: snapshot.envelope.state.gateIdHash,
          stateHash: snapshot.envelope.stateHash,
          subjectHash: input.subjectHash,
          sourceBindings: snapshot.envelope.state.sourceBindings,
        })));
        if (!exactKeys(result, ["outcome", "evidenceHash"])
          || !["NO_BYPASS_OBSERVED", "BYPASS_OBSERVED"].includes(result.outcome)
          || !HASH.test(result.evidenceHash ?? "")) {
          throw new Error("HOOK_RESULT_INVALID");
        }
        results.push({ hookId, outcome: result.outcome,
          evidenceHash: result.evidenceHash, errorHash: null });
      } catch (error) {
        results.push({ hookId, outcome: "HOOK_ERROR_OR_MISSING", evidenceHash: null,
          errorHash: digest("outsider/stage3-audit-error/v1", { hookId,
            error: String(error?.message ?? error).slice(0, 256) }) });
      }
    }
    return this.#apply({ kind: "AUDIT_BYPASS_PATHS", commandId: input.commandId,
      expectedRevision: input.expectedRevision,
      expectedStateHash: input.expectedStateHash,
      occurredAt: input.occurredAt,
      payload: { cycleIdHash: input.cycleIdHash, subjectHash: input.subjectHash,
        results } }, privateKeyPem);
  }

  requestCapability(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "REQUEST_CAPABILITY" }, privateKeyPem);
  }

  presentCapability(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "PRESENT_CAPABILITY" }, privateKeyPem);
  }

  revokeCapability(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "REVOKE_CAPABILITY" }, privateKeyPem);
  }

  revokeGate(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "REVOKE_GATE" }, privateKeyPem);
  }

  sweepExpiry(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "SWEEP_EXPIRY" }, privateKeyPem);
  }

  registerExternalReceipt(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "REGISTER_EXTERNAL_RECEIPT" }, privateKeyPem);
  }

  recordAdversity(input, privateKeyPem) {
    return this.#apply({ ...input, kind: "RECORD_ADVERSITY" }, privateKeyPem);
  }

  rotateSigner(input, currentPrivateKeyPem, newPrivateKeyPem) {
    const newSigner = signerFromPrivate(newPrivateKeyPem);
    return this.#apply({ ...input, kind: "ROTATE_SIGNER",
      payload: { newPublicKeyPem: newSigner.publicKeyPem } },
    currentPrivateKeyPem, newPrivateKeyPem);
  }
}

export async function verifyStage3GuaranteeGateDirectory(directory,
  { requiredCheckpoint = null } = {}) {
  try {
    const loaded = await loadArtifacts(directory);
    return verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
      sourceAnchor: loaded.anchor, envelope: loaded.envelope, requiredCheckpoint });
  } catch (error) {
    return deepFreeze({ ok: false, error: error?.message ?? String(error),
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false, cryptographicIntegrityValid: false,
      localSignerChainValid: false, genesisSignerExternallyTrusted: false,
      rollbackResistanceEstablished: false,
      rollbackResistanceScope: "NONE_VERIFICATION_FAILED",
      checkpointIndependentRetentionVerified: false,
      requiredCheckpointHash: requiredCheckpoint?.checkpointHash ?? null,
      institutionalStandingVerified: false, custodyVerified: false,
      reserveVerified: false, coverageEstablished: false, guaranteeIssued: false,
      capabilityExecutionAuthorized: false, movesFunds: false,
      actualResourceWrite: false, obligationOpen: true });
  }
}

export async function verifyStage3GuaranteeGateFull({ directory, stage34Context,
  requiredCheckpoint = null }) {
  try {
    const loaded = await loadArtifacts(directory);
    const local = verifyStage3GuaranteeGateArtifacts({ genesis: loaded.genesis,
      sourceAnchor: loaded.anchor, envelope: loaded.envelope, requiredCheckpoint });
    if (!local.ok) fail("STAGE3_GATE_FULL_LOCAL_STATE_OR_CHECKPOINT_INVALID", local.error);
    const replayed = await replaySourceEntrance(loaded.anchor.stage34Frontier,
      stage34Context, loaded.anchor.stage2QuoteCandidate);
    if (!same(replayed.bindings, loaded.genesis.sourceBindings)) {
      fail("STAGE3_GATE_FULL_SOURCE_BINDING_MISMATCH");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: requiredCheckpoint === null
        ? "FULL_STAGE34_STAGE2_QUOTE_SOURCES_PLUS_CURRENT_STATE_CHAIN_ONLY"
        : "FULL_STAGE34_STAGE2_QUOTE_SOURCES_PLUS_REQUIRED_CHECKPOINT_ANCESTRY",
      stateVerificationLevel: local.verificationLevel,
      sourceArtifactsReverified: true,
      cryptographicIntegrityValid: true,
      localSignerChainValid: true,
      genesisSignerExternallyTrusted: false,
      rollbackResistanceEstablished: local.rollbackResistanceEstablished,
      rollbackResistanceScope: local.rollbackResistanceScope,
      checkpointIndependentRetentionVerified: false,
      requiredCheckpointHash: local.requiredCheckpointHash,
      requiredCheckpointRevision: local.requiredCheckpointRevision,
      requiredCheckpointEventHeadHash: local.requiredCheckpointEventHeadHash,
      checkpointRevisionLag: local.checkpointRevisionLag,
      currentStateContainsRequiredCheckpoint:
        local.currentStateContainsRequiredCheckpoint,
      institutionalStandingVerified: false,
      custodyVerified: false,
      reserveVerified: false,
      coverageEstablished: false,
      guaranteeIssued: false,
      capabilityExecutionAuthorized: false,
      movesFunds: false,
      actualResourceWrite: false,
      obligationOpen: true,
      stateHash: loaded.envelope.stateHash,
      revision: loaded.envelope.state.revision,
    });
  } catch (error) {
    return deepFreeze({ ok: false, error: error?.message ?? String(error),
      sourceArtifactsReverified: false, cryptographicIntegrityValid: false,
      localSignerChainValid: false, genesisSignerExternallyTrusted: false,
      stateVerificationLevel: "INVALID",
      rollbackResistanceEstablished: false,
      rollbackResistanceScope: "NONE_VERIFICATION_FAILED",
      checkpointIndependentRetentionVerified: false,
      requiredCheckpointHash: requiredCheckpoint?.checkpointHash ?? null,
      institutionalStandingVerified: false, custodyVerified: false,
      reserveVerified: false, coverageEstablished: false, guaranteeIssued: false,
      capabilityExecutionAuthorized: false, movesFunds: false,
      actualResourceWrite: false, obligationOpen: true });
  }
}

export function describeStage3GuaranteeGate() {
  return deepFreeze({
    schema: "outsider/stage3-guarantee-gate-description/v1",
    sourceEntrance: [
      "FULL_STAGE2_FRONTIER_QUOTE_AND_REALITY_SOURCES_REPLAYED Stage34 frontier",
      "exact FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED NON_BINDING_ABSTAIN quote",
    ],
    durableMechanisms: [
      "signed hash-chained state", "atomic file-lock CAS", "idempotent command keys",
      "caller-held signed content-addressed rollback checkpoint",
      "aggregate and per-candidate local reference-request accounting",
      "expiry and revocation", "dual-proof signer rotation",
      "one-use before-state-bound presentation candidate", "fail-closed bypass hooks",
    ],
    institutionalBoundary:
      "cryptographic validity never establishes issuer standing, custody, reserve, owner adoption, coverage, guarantee, execution, or funds",
    recoveryBoundary:
      "responsibility and recovery survive provider replacement, coverage dispute or void, diet or warranty breach, expiry, and institution dissolution",
    rollbackBoundary:
      "without a required caller-held checkpoint verification is CURRENT_STATE_CHAIN_ONLY and cannot detect whole-file rollback",
    decision: fixedDecision(),
    authority: zeroAuthority(),
  });
}
