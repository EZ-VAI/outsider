/*
 * Stage 1.5 CEU / experience-reuse frontier.
 *
 * This is a source-bound, externally anchorable local gate. It does not claim
 * that a configured governance key is actually adopted by any institution, and
 * it never performs a model update. Historical, retrospective, metadata-only,
 * and simulated inputs retain their empirical source character but always
 * receive zero causal-experience units (CEUs).
 *
 * A non-zero policy-conformance credit requires a prospectively registered
 * controlled design, a complete signed execution, and adjudication by a key and
 * organization independent from both design and execution. Rights, revocation,
 * exact validity-domain and learning-diet bindings are checked again at a
 * manual model-update candidate ingress.
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
import { verifyCurateEpisode } from "./outsider-curate-core.js";
import { verifyCorpusArtifactSet } from "./outsider-corpus-registry.js";
import { verifyContributionRecord } from "./outsider-experience-contribution.js";
import { verifyProspectiveSimulationPilot } from "./outsider-prospective-physical-simulation.js";

export const CEU_REUSE_SCHEMAS = Object.freeze({
  governancePolicy: "outsider/ceu-reuse-governance-policy/v1",
  prospectiveDesign: "outsider/prospective-causal-design/v1",
  execution: "outsider/prospective-causal-execution/v1",
  adjudication: "outsider/independent-causal-adjudication/v1",
  evidence: "outsider/prospective-ceu-evidence/v1",
  zeroAssessment: "outsider/zero-ceu-source-assessment/v1",
  learningDiet: "outsider/model-learning-diet/v1",
  rightsGrant: "outsider/experience-reuse-rights-grant/v1",
  revocation: "outsider/experience-reuse-revocation/v1",
  ingressRequest: "outsider/model-update-ingress-request/v1",
  ingressDecision: "outsider/model-update-ingress-decision/v1",
  config: "outsider/ceu-reuse-ledger-config/v1",
  event: "outsider/ceu-reuse-ledger-event/v1",
  index: "outsider/ceu-reuse-ledger-index/v1",
  report: "outsider/ceu-reuse-frontier-report/v1",
  signature: "outsider/ceu-reuse-signature/v1",
});

export const CEU_SOURCE_CLASSES = Object.freeze({
  realProspectiveControlled: "REAL_PROSPECTIVE_CONTROLLED",
  historical: "HISTORICAL_OBSERVATION",
  retrospective: "RETROSPECTIVE_OBSERVATION",
  metadataOnly: "METADATA_ONLY",
  simulation: "SIMULATED_EXECUTION",
  unverified: "UNVERIFIED_SOURCE",
});

export const CEU_CREDIT_CLASSES = Object.freeze({
  discovery: "DISCOVERY",
  confirmation: "CONFIRMATION",
  reuse: "REUSE_OR_CORRELATED_DUPLICATE",
  ineligible: "INELIGIBLE_ZERO_CEU",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const GENESIS = digest("outsider/ceu-reuse-ledger/genesis/v1", "genesis");
const ROLE_NAMES = Object.freeze([
  "DESIGN_REGISTRAR", "EXECUTION_ATTESTOR", "INDEPENDENT_ADJUDICATOR",
  "RIGHTS_REGISTRAR",
]);
const EVENT_TYPES = new Set([
  "REGISTER_ZERO_CEU_SOURCE", "REGISTER_PROSPECTIVE_EVIDENCE",
  "REGISTER_LEARNING_DIET", "REGISTER_RIGHTS_GRANT", "REVOKE_RIGHTS_GRANT",
  "RECORD_MODEL_UPDATE_INGRESS",
]);
const REVOCATION_REASONS = new Set([
  "RIGHTS_WITHDRAWN", "SOURCE_REVOKED", "VALIDITY_DOMAIN_INVALIDATED",
  "LEARNING_DIET_VIOLATION", "INTEGRITY_CONCERN", "GOVERNANCE_ORDER",
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `CEU_REUSE_${code}` : `CEU_REUSE_${code}:${detail}`);
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
  return canonicalizeStrict(left) === canonicalizeStrict(right);
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
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40 || !Number.isFinite(Date.parse(input))) {
    fail(`${code}_INVALID`);
  }
  const normalized = new Date(input).toISOString();
  if (normalized !== input) fail(`${code}_NON_CANONICAL`);
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

function hashes(values, code, { minimum = 0, maximum = 128 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(`${code}_INVALID`);
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length) fail(`${code}_DUPLICATE`);
  return sorted;
}

function integer(value, code, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function normalizedPublicKey(publicKeyPem, code = "PUBLIC_KEY") {
  try {
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512) fail(`${code}_INVALID`);
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail(`${code}_NOT_ED25519`);
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (String(error?.message ?? "").startsWith("CEU_REUSE_")) throw error;
    fail(`${code}_INVALID`);
  }
}

export function ceuReuseKeyId(publicKeyPem) {
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
    return { privateKey, publicKeyPem, keyId: ceuReuseKeyId(publicKeyPem) };
  } catch (error) {
    if (String(error?.message ?? "").startsWith("CEU_REUSE_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

function signaturePayload(role, artifactHash) {
  return canonicalizeStrict({ schema: CEU_REUSE_SCHEMAS.signature, role, artifactHash });
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
      || signature.keyId !== ceuReuseKeyId(signature.publicKeyPem)
      || typeof signature.value !== "string"
      || Buffer.from(signature.value, "base64").length !== 64
      || expected && (signature.keyId !== expected.keyId
        || normalizedPublicKey(signature.publicKeyPem) !== expected.publicKeyPem)) return false;
    return cryptoVerify(null, Buffer.from(signaturePayload(role, artifactHash)),
      createPublicKey(signature.publicKeyPem), Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function sealSigned(body, { hashField, role, privateKeyPem }) {
  const artifactHash = digest(body.schema, body);
  return deepFreeze({ ...body, [hashField]: artifactHash,
    signature: signatureFor(role, artifactHash, privateKeyPem) });
}

function fixedBoundary() {
  return {
    authority: "configured-policy-conformance-only",
    externalGovernanceAdoptionEstablished: false,
    globallyAuthoritativeCeuClaimed: false,
    automaticTraining: false,
    modelUpdatePerformed: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function validBoundary(value) { return same(value, fixedBoundary()); }

function normalizeAuthority(value, role) {
  if (!exactKeys(value, ["role", "keyId", "publicKeyPem", "organizationHash"])
    || value.role !== role || !KEY_ID.test(String(value.keyId ?? ""))) {
    fail("GOVERNANCE_ROLE_AUTHORITY_INVALID");
  }
  const publicKeyPem = normalizedPublicKey(value.publicKeyPem,
    "GOVERNANCE_ROLE_PUBLIC_KEY");
  if (value.keyId !== ceuReuseKeyId(publicKeyPem)) fail("GOVERNANCE_ROLE_KEY_ID_MISMATCH");
  return { role, keyId: value.keyId, publicKeyPem,
    organizationHash: hash(value.organizationHash, "GOVERNANCE_ROLE_ORGANIZATION") };
}

function normalizeCreditPolicy(value) {
  if (!exactKeys(value, ["discoveryCreditUnits", "confirmationCreditUnits",
    "reuseCreditUnits", "creditUnitName"])) fail("GOVERNANCE_CREDIT_POLICY_INVALID");
  const output = {
    discoveryCreditUnits: integer(value.discoveryCreditUnits,
      "GOVERNANCE_DISCOVERY_CREDIT", { minimum: 1, maximum: 1 }),
    confirmationCreditUnits: integer(value.confirmationCreditUnits,
      "GOVERNANCE_CONFIRMATION_CREDIT", { maximum: 1 }),
    reuseCreditUnits: integer(value.reuseCreditUnits,
      "GOVERNANCE_REUSE_CREDIT", { maximum: 1 }),
    creditUnitName: token(value.creditUnitName, "GOVERNANCE_CREDIT_UNIT_NAME"),
  };
  return output;
}

function governanceBody({ policyId, issuedAt, validFrom, validUntil,
  governanceOrganizationHash, roleAuthorities, creditPolicy }) {
  if (!Array.isArray(roleAuthorities) || roleAuthorities.length !== ROLE_NAMES.length) {
    fail("GOVERNANCE_ROLE_AUTHORITIES_INVALID");
  }
  const byRole = new Map(roleAuthorities.map((item) => [item.role, item]));
  if (byRole.size !== ROLE_NAMES.length || ROLE_NAMES.some((role) => !byRole.has(role))) {
    fail("GOVERNANCE_ROLE_AUTHORITIES_INCOMPLETE");
  }
  const authorities = ROLE_NAMES.map((role) => normalizeAuthority(byRole.get(role), role));
  const causalRoles = authorities.filter((item) => ["DESIGN_REGISTRAR",
    "EXECUTION_ATTESTOR", "INDEPENDENT_ADJUDICATOR"].includes(item.role));
  if (new Set(causalRoles.map((item) => item.keyId)).size !== causalRoles.length
    || new Set(causalRoles.map((item) => item.organizationHash)).size !== causalRoles.length) {
    fail("GOVERNANCE_CAUSAL_ROLES_NOT_INDEPENDENT");
  }
  const from = canonicalTime(validFrom, "GOVERNANCE_VALID_FROM");
  const until = canonicalTime(validUntil, "GOVERNANCE_VALID_UNTIL");
  const issued = canonicalTime(issuedAt, "GOVERNANCE_ISSUED_AT");
  if (Date.parse(until) <= Date.parse(from) || Date.parse(issued) > Date.parse(from)) {
    fail("GOVERNANCE_TIME_WINDOW_INVALID");
  }
  return {
    schema: CEU_REUSE_SCHEMAS.governancePolicy,
    schemaVersion: "1.0.0",
    policyId: token(policyId, "GOVERNANCE_POLICY_ID"),
    issuedAt: issued,
    validFrom: from,
    validUntil: until,
    governanceOrganizationHash: hash(governanceOrganizationHash,
      "GOVERNANCE_ORGANIZATION"),
    roleAuthorities: authorities,
    creditPolicy: normalizeCreditPolicy(creditPolicy),
    admissionRule: {
      sourceClass: CEU_SOURCE_CLASSES.realProspectiveControlled,
      prospectiveControlledDesignRequired: true,
      completeVerifiedExecutionRequired: true,
      independentAdjudicationRequired: true,
      globalSemanticIdentityCorrelationDedupRequired: true,
    },
    boundary: fixedBoundary(),
  };
}

export function createCeuReuseGovernancePolicy({
  policyId = "outsider-ceu-reuse-policy", issuedAt, validFrom, validUntil,
  governanceOrganizationHash, roleAuthorities,
  creditPolicy = { discoveryCreditUnits: 1, confirmationCreditUnits: 0,
    reuseCreditUnits: 0, creditUnitName: "CEU_POLICY_CONFORMANCE_UNIT" },
} = {}, { governancePrivateKeyPem } = {}) {
  if (!governancePrivateKeyPem) fail("GOVERNANCE_SIGNING_KEY_REQUIRED");
  return sealSigned(governanceBody({ policyId, issuedAt, validFrom, validUntil,
    governanceOrganizationHash, roleAuthorities, creditPolicy }), {
    hashField: "policyHash", role: "GOVERNANCE_ROOT", privateKeyPem: governancePrivateKeyPem,
  });
}

export function verifyCeuReuseGovernancePolicy(policy, {
  pinnedGovernanceKeyIds = [], at = null,
} = {}) {
  try {
    if (!Array.isArray(pinnedGovernanceKeyIds) || pinnedGovernanceKeyIds.length < 1
      || pinnedGovernanceKeyIds.some((value) => !KEY_ID.test(String(value ?? "")))) {
      fail("GOVERNANCE_TRUST_ANCHOR_REQUIRED");
    }
    if (!exactKeys(policy, ["schema", "schemaVersion", "policyId", "issuedAt",
      "validFrom", "validUntil", "governanceOrganizationHash", "roleAuthorities",
      "creditPolicy", "admissionRule", "boundary", "policyHash", "signature"])
      || policy.schema !== CEU_REUSE_SCHEMAS.governancePolicy
      || policy.schemaVersion !== "1.0.0" || !HASH.test(policy.policyHash ?? "")) {
      fail("GOVERNANCE_POLICY_INVALID");
    }
    const expected = governanceBody(policy);
    const { policyHash, signature, ...actual } = policy;
    if (!same(actual, expected) || policyHash !== digest(policy.schema, expected)
      || !verifySignature(signature, "GOVERNANCE_ROOT", policyHash)
      || !pinnedGovernanceKeyIds.includes(signature.keyId)) {
      fail("GOVERNANCE_POLICY_VERIFICATION_FAILED");
    }
    if (at !== null) {
      const instant = Date.parse(canonicalTime(at, "GOVERNANCE_CHECK_TIME"));
      if (instant < Date.parse(policy.validFrom) || instant >= Date.parse(policy.validUntil)) {
        fail("GOVERNANCE_POLICY_NOT_ACTIVE");
      }
    }
    return Object.freeze({ ok: true, policyHash, governanceKeyId: signature.keyId,
      externalAdoptionClaimed: false });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function roleAuthority(policy, role) {
  const authority = policy.roleAuthorities.find((item) => item.role === role);
  if (!authority) fail("GOVERNANCE_ROLE_NOT_FOUND", role);
  return authority;
}

function verifySignedBody(record, { schema, hashField, role, bodyBuilder, policy }) {
  if (!plain(record) || record.schema !== schema || record.schemaVersion !== "1.0.0"
    || !HASH.test(record[hashField] ?? "") || !plain(record.signature)) return false;
  const { [hashField]: artifactHash, signature, ...actual } = record;
  const expected = bodyBuilder(record);
  const authority = role === "LEDGER_OPERATOR" ? null : roleAuthority(policy, role);
  return same(actual, expected) && artifactHash === digest(schema, expected)
    && verifySignature(signature, role, artifactHash, authority);
}

function designBody(input) {
  if (!exactKeys(input.executionWindow, ["notBefore", "notAfter"])) {
    fail("DESIGN_EXECUTION_WINDOW_INVALID");
  }
  const preregisteredAt = canonicalTime(input.preregisteredAt, "DESIGN_PREREGISTERED_AT");
  const notBefore = canonicalTime(input.executionWindow.notBefore, "DESIGN_NOT_BEFORE");
  const notAfter = canonicalTime(input.executionWindow.notAfter, "DESIGN_NOT_AFTER");
  if (Date.parse(preregisteredAt) >= Date.parse(notBefore)
    || Date.parse(notAfter) <= Date.parse(notBefore)) fail("DESIGN_TIME_ORDER_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.prospectiveDesign,
    schemaVersion: "1.0.0",
    designId: token(input.designId, "DESIGN_ID"),
    sourceClass: input.sourceClass === CEU_SOURCE_CLASSES.realProspectiveControlled
      ? input.sourceClass : fail("DESIGN_SOURCE_CLASS_NOT_REAL_PROSPECTIVE"),
    preregisteredAt,
    executionWindow: { notBefore, notAfter },
    claim: {
      semanticHash: hash(input.claim?.semanticHash, "DESIGN_CLAIM_SEMANTIC_HASH"),
      identityHash: hash(input.claim?.identityHash, "DESIGN_CLAIM_IDENTITY_HASH"),
    },
    correlationRootHashes: hashes(input.correlationRootHashes,
      "DESIGN_CORRELATION_ROOTS", { minimum: 1, maximum: 64 }),
    populationHash: hash(input.populationHash, "DESIGN_POPULATION_HASH"),
    assignmentMechanismHash: hash(input.assignmentMechanismHash,
      "DESIGN_ASSIGNMENT_MECHANISM_HASH"),
    interventionHash: hash(input.interventionHash, "DESIGN_INTERVENTION_HASH"),
    controlHash: hash(input.controlHash, "DESIGN_CONTROL_HASH"),
    outcomeSpecificationHash: hash(input.outcomeSpecificationHash,
      "DESIGN_OUTCOME_SPECIFICATION_HASH"),
    validityDomainHash: hash(input.validityDomainHash, "DESIGN_VALIDITY_DOMAIN_HASH"),
    learningDietIntentHash: hash(input.learningDietIntentHash,
      "DESIGN_LEARNING_DIET_INTENT_HASH"),
    realityBoundaryHash: hash(input.realityBoundaryHash, "DESIGN_REALITY_BOUNDARY_HASH"),
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "DESIGN_AUTHORITY_ORGANIZATION_HASH"),
    designControls: {
      prospectivelyRegistered: true,
      controlledIntervention: true,
      assignmentPrecommitted: true,
      outcomePrecommitted: true,
      postOutcomeClaimMutationPermitted: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createProspectiveCausalDesign(input, { designPrivateKeyPem } = {}) {
  if (!designPrivateKeyPem) fail("DESIGN_SIGNING_KEY_REQUIRED");
  return sealSigned(designBody(input), { hashField: "designHash",
    role: "DESIGN_REGISTRAR", privateKeyPem: designPrivateKeyPem });
}

export function verifyProspectiveCausalDesign(record, { policy } = {}) {
  try {
    const authority = roleAuthority(policy, "DESIGN_REGISTRAR");
    if (!verifySignedBody(record, { schema: CEU_REUSE_SCHEMAS.prospectiveDesign,
      hashField: "designHash", role: "DESIGN_REGISTRAR", bodyBuilder: designBody, policy })
      || record.authorityOrganizationHash !== authority.organizationHash
      || Date.parse(record.preregisteredAt) < Date.parse(policy.validFrom)
      || Date.parse(record.executionWindow.notAfter) > Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("DESIGN_INVALID");
    return Object.freeze({ ok: true, designHash: record.designHash });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function executionBody(input) {
  const startedAt = canonicalTime(input.startedAt, "EXECUTION_STARTED_AT");
  const completedAt = canonicalTime(input.completedAt, "EXECUTION_COMPLETED_AT");
  if (Date.parse(completedAt) <= Date.parse(startedAt)) fail("EXECUTION_TIME_ORDER_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.execution,
    schemaVersion: "1.0.0",
    designHash: hash(input.designHash, "EXECUTION_DESIGN_HASH"),
    sourceClass: input.sourceClass === CEU_SOURCE_CLASSES.realProspectiveControlled
      ? input.sourceClass : fail("EXECUTION_SOURCE_CLASS_NOT_REAL_PROSPECTIVE"),
    datasetHash: hash(input.datasetHash, "EXECUTION_DATASET_HASH"),
    checkpointHash: hash(input.checkpointHash, "EXECUTION_CHECKPOINT_HASH"),
    startedAt,
    completedAt,
    assignmentLedgerHash: hash(input.assignmentLedgerHash,
      "EXECUTION_ASSIGNMENT_LEDGER_HASH"),
    observationLedgerHash: hash(input.observationLedgerHash,
      "EXECUTION_OBSERVATION_LEDGER_HASH"),
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "EXECUTION_AUTHORITY_ORGANIZATION_HASH"),
    executionControls: {
      completeWindow: true,
      assignmentReplayVerified: true,
      observationsBoundToCheckpoint: true,
      sourceBytesBoundToDatasetHash: true,
    },
    boundary: fixedBoundary(),
  };
}

export function createProspectiveCausalExecution(input, { executionPrivateKeyPem } = {}) {
  if (!executionPrivateKeyPem) fail("EXECUTION_SIGNING_KEY_REQUIRED");
  return sealSigned(executionBody(input), { hashField: "executionHash",
    role: "EXECUTION_ATTESTOR", privateKeyPem: executionPrivateKeyPem });
}

export function verifyProspectiveCausalExecution(record, { design, policy } = {}) {
  try {
    const designCheck = verifyProspectiveCausalDesign(design, { policy });
    const authority = roleAuthority(policy, "EXECUTION_ATTESTOR");
    if (!designCheck.ok || !verifySignedBody(record, {
      schema: CEU_REUSE_SCHEMAS.execution, hashField: "executionHash",
      role: "EXECUTION_ATTESTOR", bodyBuilder: executionBody, policy,
    }) || record.designHash !== design.designHash
      || record.authorityOrganizationHash !== authority.organizationHash
      || Date.parse(record.startedAt) < Date.parse(design.executionWindow.notBefore)
      || Date.parse(record.completedAt) > Date.parse(design.executionWindow.notAfter)
      || !validBoundary(record.boundary)) fail("EXECUTION_INVALID");
    return Object.freeze({ ok: true, executionHash: record.executionHash,
      datasetHash: record.datasetHash, checkpointHash: record.checkpointHash });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function adjudicationBody(input) {
  if (!["ADMISSIBLE", "REJECTED"].includes(input.decision)) {
    fail("ADJUDICATION_DECISION_INVALID");
  }
  return {
    schema: CEU_REUSE_SCHEMAS.adjudication,
    schemaVersion: "1.0.0",
    designHash: hash(input.designHash, "ADJUDICATION_DESIGN_HASH"),
    executionHash: hash(input.executionHash, "ADJUDICATION_EXECUTION_HASH"),
    datasetHash: hash(input.datasetHash, "ADJUDICATION_DATASET_HASH"),
    checkpointHash: hash(input.checkpointHash, "ADJUDICATION_CHECKPOINT_HASH"),
    adjudicatedAt: canonicalTime(input.adjudicatedAt, "ADJUDICATION_TIME"),
    decision: input.decision,
    outcomeAssessmentHash: hash(input.outcomeAssessmentHash,
      "ADJUDICATION_OUTCOME_ASSESSMENT_HASH"),
    validityDomainHash: hash(input.validityDomainHash,
      "ADJUDICATION_VALIDITY_DOMAIN_HASH"),
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "ADJUDICATION_AUTHORITY_ORGANIZATION_HASH"),
    adjudicationControls: {
      prospectiveDesignReplayed: true,
      executionReplayed: true,
      sourceCheckpointReplayed: true,
      organizationalIndependenceRequiredByPolicy: true,
    },
    boundary: fixedBoundary(),
  };
}

export function createIndependentCausalAdjudication(input, {
  adjudicatorPrivateKeyPem,
} = {}) {
  if (!adjudicatorPrivateKeyPem) fail("ADJUDICATION_SIGNING_KEY_REQUIRED");
  return sealSigned(adjudicationBody(input), { hashField: "adjudicationHash",
    role: "INDEPENDENT_ADJUDICATOR", privateKeyPem: adjudicatorPrivateKeyPem });
}

export function verifyIndependentCausalAdjudication(record, {
  design, execution, policy,
} = {}) {
  try {
    const executionCheck = verifyProspectiveCausalExecution(execution, { design, policy });
    const authority = roleAuthority(policy, "INDEPENDENT_ADJUDICATOR");
    const causalAuthorities = [roleAuthority(policy, "DESIGN_REGISTRAR"),
      roleAuthority(policy, "EXECUTION_ATTESTOR"), authority];
    if (!executionCheck.ok || !verifySignedBody(record, {
      schema: CEU_REUSE_SCHEMAS.adjudication, hashField: "adjudicationHash",
      role: "INDEPENDENT_ADJUDICATOR", bodyBuilder: adjudicationBody, policy,
    }) || record.designHash !== design.designHash
      || record.executionHash !== execution.executionHash
      || record.datasetHash !== execution.datasetHash
      || record.checkpointHash !== execution.checkpointHash
      || record.validityDomainHash !== design.validityDomainHash
      || record.authorityOrganizationHash !== authority.organizationHash
      || new Set(causalAuthorities.map((item) => item.keyId)).size !== 3
      || new Set(causalAuthorities.map((item) => item.organizationHash)).size !== 3
      || Date.parse(record.adjudicatedAt) <= Date.parse(execution.completedAt)
      || Date.parse(record.adjudicatedAt) >= Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("ADJUDICATION_INVALID");
    return Object.freeze({ ok: true, adjudicationHash: record.adjudicationHash,
      decision: record.decision });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function evidenceBody({ design, execution, adjudication }) {
  return {
    schema: CEU_REUSE_SCHEMAS.evidence,
    schemaVersion: "1.0.0",
    design,
    execution,
    adjudication,
    sourceClass: CEU_SOURCE_CLASSES.realProspectiveControlled,
    sourceBinding: {
      designHash: design.designHash,
      executionHash: execution.executionHash,
      adjudicationHash: adjudication.adjudicationHash,
      datasetHash: execution.datasetHash,
      checkpointHash: execution.checkpointHash,
    },
    claim: structuredClone(design.claim),
    correlationRootHashes: [...design.correlationRootHashes],
    validityDomainHash: design.validityDomainHash,
    learningDietIntentHash: design.learningDietIntentHash,
    realityBoundaryHash: design.realityBoundaryHash,
    eligibility: {
      prospectivelyRegisteredControlledDesign: true,
      completeVerifiedExecution: true,
      independentAdjudication: true,
      adjudicationAdmissible: adjudication.decision === "ADMISSIBLE",
      eligibleForConfiguredPolicyCredit: adjudication.decision === "ADMISSIBLE",
    },
    boundary: fixedBoundary(),
  };
}

export function buildProspectiveCeuEvidence({ design, execution, adjudication } = {}, {
  policy,
} = {}) {
  const checked = verifyIndependentCausalAdjudication(adjudication,
    { design, execution, policy });
  if (!checked.ok) fail("EVIDENCE_SOURCE_INVALID", checked.error);
  const body = evidenceBody({ design, execution, adjudication });
  return deepFreeze({ ...body, evidenceHash: digest(CEU_REUSE_SCHEMAS.evidence, body) });
}

export function verifyProspectiveCeuEvidence(record, { policy } = {}) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "design", "execution",
      "adjudication", "sourceClass", "sourceBinding", "claim", "correlationRootHashes",
      "validityDomainHash", "learningDietIntentHash", "realityBoundaryHash",
      "eligibility", "boundary", "evidenceHash"])
      || record.schema !== CEU_REUSE_SCHEMAS.evidence
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.evidenceHash ?? "")) {
      fail("EVIDENCE_INVALID");
    }
    const rebuilt = buildProspectiveCeuEvidence(record, { policy });
    if (!same(record, rebuilt) || !validBoundary(record.boundary)) fail("EVIDENCE_INVALID");
    return Object.freeze({ ok: true, evidenceHash: record.evidenceHash,
      eligible: record.eligibility.eligibleForConfiguredPolicyCredit });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function zeroAssessmentBody({ sourceKind, sourceClass, sourceArtifactHash,
  datasetHash, checkpointHash, empiricalStatus, verifier }) {
  return {
    schema: CEU_REUSE_SCHEMAS.zeroAssessment,
    schemaVersion: "1.0.0",
    sourceKind,
    sourceClass,
    sourceArtifactHash,
    datasetHash,
    checkpointHash,
    empiricalStatus,
    verification: {
      verifier,
      sourceArtifactReplayed: true,
      sourceRealityRetained: true,
      researchOrShadowUseDoesNotRelabelSourceReality: true,
    },
    ceuDecision: {
      causalExperienceUnits: 0,
      eligibleForConfiguredPolicyCredit: false,
      reasonCode: sourceClass === CEU_SOURCE_CLASSES.simulation
        ? "SIMULATION_IS_NOT_REAL_PROSPECTIVE_EXECUTION"
        : sourceClass === CEU_SOURCE_CLASSES.metadataOnly
          ? "METADATA_DOES_NOT_ESTABLISH_EXECUTION_OR_CAUSALITY"
          : "NO_VERIFIED_PROSPECTIVE_CONTROLLED_DESIGN_AND_INDEPENDENT_ADJUDICATION",
    },
    boundary: fixedBoundary(),
  };
}

/**
 * Replays known existing source artifacts and deterministically assigns zero
 * CEU. This function intentionally has no caller-controlled REAL promotion.
 */
export function assessExistingSourceForCeu({ kind, artifact, sources = null } = {}) {
  let fields;
  if (kind === "CURATE_HISTORICAL_EPISODE") {
    const checked = verifyCurateEpisode(artifact);
    if (!checked.ok) fail("ZERO_SOURCE_CURATE_INVALID", checked.error);
    fields = {
      sourceKind: kind,
      sourceClass: CEU_SOURCE_CLASSES.historical,
      sourceArtifactHash: artifact.episodeHash,
      datasetHash: artifact.source.datasetManifestHash,
      checkpointHash: artifact.source.sourceObjectHash,
      empiricalStatus: "EMPIRICAL_RECORDED_SOURCE_PROJECTION",
      verifier: "verifyCurateEpisode",
    };
  } else if (kind === "CORPUS_ARTIFACT_SET") {
    const checked = verifyCorpusArtifactSet(artifact);
    if (!checked.ok) fail("ZERO_SOURCE_CORPUS_ARTIFACT_SET_INVALID", checked.error);
    const metadataOnly = artifact.sourceProof.verificationLevel
      === "PINNED_METADATA_ONLY_REPRODUCED";
    fields = {
      sourceKind: kind,
      sourceClass: metadataOnly ? CEU_SOURCE_CLASSES.metadataOnly
        : CEU_SOURCE_CLASSES.retrospective,
      sourceArtifactHash: artifact.artifactSetHash,
      datasetHash: artifact.recordSetCommitment,
      checkpointHash: artifact.sourceProof.verificationHash,
      empiricalStatus: metadataOnly ? "PUBLISHER_METADATA_ONLY"
        : "SOURCE_REPLAYED_RETROSPECTIVE_EVIDENCE",
      verifier: "verifyCorpusArtifactSet",
    };
  } else if (kind === "STAGE05_CONTRIBUTION_RECORD") {
    const checked = verifyContributionRecord(artifact);
    if (!checked.ok) fail("ZERO_SOURCE_CONTRIBUTION_RECORD_INVALID", checked.error);
    fields = {
      sourceKind: kind,
      sourceClass: CEU_SOURCE_CLASSES.retrospective,
      sourceArtifactHash: artifact.recordHash,
      datasetHash: artifact.source.manifestHash,
      checkpointHash: artifact.source.projectionHash,
      empiricalStatus: "EMPIRICAL_RECORDED_SOFTWARE_RUN_PROJECTION",
      verifier: "verifyContributionRecord",
    };
  } else if (kind === "PROSPECTIVE_SIMULATION_PILOT") {
    const checked = verifyProspectiveSimulationPilot(artifact, sources);
    if (!checked.ok) fail("ZERO_SOURCE_SIMULATION_INVALID", checked.error);
    fields = {
      sourceKind: kind,
      sourceClass: CEU_SOURCE_CLASSES.simulation,
      sourceArtifactHash: artifact.reportHash,
      datasetHash: sources.ledger.ledgerHash,
      checkpointHash: sources.ceuDecision.ceuDecisionHash,
      empiricalStatus: "EXECUTED_TRACE_IN_SIMULATED_ENVIRONMENT",
      verifier: "verifyProspectiveSimulationPilot",
    };
  } else {
    fail("ZERO_SOURCE_KIND_UNSUPPORTED");
  }
  const body = zeroAssessmentBody(fields);
  return deepFreeze({ ...body,
    assessmentHash: digest(CEU_REUSE_SCHEMAS.zeroAssessment, body) });
}

export function verifyZeroCeuSourceAssessment(record, source) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "sourceKind", "sourceClass",
      "sourceArtifactHash", "datasetHash", "checkpointHash", "empiricalStatus",
      "verification", "ceuDecision", "boundary", "assessmentHash"])
      || record.schema !== CEU_REUSE_SCHEMAS.zeroAssessment
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.assessmentHash ?? "")
      || record.ceuDecision.causalExperienceUnits !== 0
      || record.ceuDecision.eligibleForConfiguredPolicyCredit !== false
      || !validBoundary(record.boundary)) fail("ZERO_ASSESSMENT_INVALID");
    if (source !== undefined) {
      const rebuilt = assessExistingSourceForCeu({ kind: record.sourceKind,
        artifact: source?.artifact ?? source, sources: source?.sources ?? null });
      if (!same(record, rebuilt)) fail("ZERO_ASSESSMENT_SOURCE_REPLAY_MISMATCH");
    } else {
      const { assessmentHash, ...body } = record;
      const rebuilt = zeroAssessmentBody({ ...record,
        verifier: record.verification.verifier });
      if (!same(body, rebuilt)
        || assessmentHash !== digest(CEU_REUSE_SCHEMAS.zeroAssessment, body)) {
        fail("ZERO_ASSESSMENT_HASH_MISMATCH");
      }
    }
    return Object.freeze({ ok: true, assessmentHash: record.assessmentHash,
      causalExperienceUnits: 0, sourceClass: record.sourceClass });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function learningDietBody(input) {
  const validFrom = canonicalTime(input.validFrom, "LEARNING_DIET_VALID_FROM");
  const validUntil = canonicalTime(input.validUntil, "LEARNING_DIET_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(validFrom)) fail("LEARNING_DIET_WINDOW_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.learningDiet,
    schemaVersion: "1.0.0",
    dietId: token(input.dietId, "LEARNING_DIET_ID"),
    evidenceHash: hash(input.evidenceHash, "LEARNING_DIET_EVIDENCE_HASH"),
    datasetHash: hash(input.datasetHash, "LEARNING_DIET_DATASET_HASH"),
    checkpointHash: hash(input.checkpointHash, "LEARNING_DIET_CHECKPOINT_HASH"),
    validityDomainHash: hash(input.validityDomainHash,
      "LEARNING_DIET_VALIDITY_DOMAIN_HASH"),
    learningDietIntentHash: hash(input.learningDietIntentHash,
      "LEARNING_DIET_INTENT_HASH"),
    permittedModelHashes: hashes(input.permittedModelHashes,
      "LEARNING_DIET_MODEL_HASHES", { minimum: 1, maximum: 64 }),
    permittedBaseCheckpointHashes: hashes(input.permittedBaseCheckpointHashes,
      "LEARNING_DIET_BASE_CHECKPOINT_HASHES", { minimum: 1, maximum: 64 }),
    permittedCandidateCheckpointHashes: hashes(input.permittedCandidateCheckpointHashes,
      "LEARNING_DIET_CANDIDATE_CHECKPOINT_HASHES", { minimum: 1, maximum: 64 }),
    excludedFeatureSetHash: hash(input.excludedFeatureSetHash,
      "LEARNING_DIET_EXCLUDED_FEATURE_SET_HASH"),
    updateProcedureHash: hash(input.updateProcedureHash,
      "LEARNING_DIET_UPDATE_PROCEDURE_HASH"),
    validFrom,
    validUntil,
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "LEARNING_DIET_AUTHORITY_ORGANIZATION_HASH"),
    controls: {
      exactDatasetRequired: true,
      exactModelAndCheckpointAllowlistRequired: true,
      validityDomainExactMatchRequired: true,
      humanReviewRequired: true,
      automaticTraining: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createLearningDiet(input, { rightsPrivateKeyPem } = {}) {
  if (!rightsPrivateKeyPem) fail("LEARNING_DIET_SIGNING_KEY_REQUIRED");
  return sealSigned(learningDietBody(input), { hashField: "learningDietHash",
    role: "RIGHTS_REGISTRAR", privateKeyPem: rightsPrivateKeyPem });
}

export function verifyLearningDiet(record, { evidence, policy } = {}) {
  try {
    const evidenceCheck = verifyProspectiveCeuEvidence(evidence, { policy });
    const authority = roleAuthority(policy, "RIGHTS_REGISTRAR");
    if (!evidenceCheck.ok || !evidenceCheck.eligible || !verifySignedBody(record, {
      schema: CEU_REUSE_SCHEMAS.learningDiet, hashField: "learningDietHash",
      role: "RIGHTS_REGISTRAR", bodyBuilder: learningDietBody, policy,
    }) || record.evidenceHash !== evidence.evidenceHash
      || record.datasetHash !== evidence.sourceBinding.datasetHash
      || record.checkpointHash !== evidence.sourceBinding.checkpointHash
      || record.validityDomainHash !== evidence.validityDomainHash
      || record.learningDietIntentHash !== evidence.learningDietIntentHash
      || record.authorityOrganizationHash !== authority.organizationHash
      || Date.parse(record.validFrom) < Date.parse(evidence.adjudication.adjudicatedAt)
      || Date.parse(record.validUntil) > Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("LEARNING_DIET_INVALID");
    return Object.freeze({ ok: true, learningDietHash: record.learningDietHash });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function rightsGrantBody(input) {
  const validFrom = canonicalTime(input.validFrom, "RIGHTS_GRANT_VALID_FROM");
  const validUntil = canonicalTime(input.validUntil, "RIGHTS_GRANT_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(validFrom)) fail("RIGHTS_GRANT_WINDOW_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.rightsGrant,
    schemaVersion: "1.0.0",
    grantId: token(input.grantId, "RIGHTS_GRANT_ID"),
    evidenceHash: hash(input.evidenceHash, "RIGHTS_GRANT_EVIDENCE_HASH"),
    datasetHash: hash(input.datasetHash, "RIGHTS_GRANT_DATASET_HASH"),
    checkpointHash: hash(input.checkpointHash, "RIGHTS_GRANT_CHECKPOINT_HASH"),
    validityDomainHash: hash(input.validityDomainHash,
      "RIGHTS_GRANT_VALIDITY_DOMAIN_HASH"),
    learningDietHash: hash(input.learningDietHash, "RIGHTS_GRANT_LEARNING_DIET_HASH"),
    realityBoundaryHash: hash(input.realityBoundaryHash,
      "RIGHTS_GRANT_REALITY_BOUNDARY_HASH"),
    reuseExternalityPolicyHash: hash(input.reuseExternalityPolicyHash,
      "RIGHTS_GRANT_REUSE_EXTERNALITY_POLICY_HASH"),
    maxUpdateAdmissions: integer(input.maxUpdateAdmissions,
      "RIGHTS_GRANT_MAX_UPDATE_ADMISSIONS", { minimum: 1, maximum: 1_000 }),
    maxDistinctModels: integer(input.maxDistinctModels,
      "RIGHTS_GRANT_MAX_DISTINCT_MODELS", { minimum: 1, maximum: 1_000 }),
    validFrom,
    validUntil,
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "RIGHTS_GRANT_AUTHORITY_ORGANIZATION_HASH"),
    permissions: {
      manualModelUpdateCandidateReview: true,
      automaticTraining: false,
      productionDeployment: false,
      PRICE: false,
      GUARANTEE: false,
      SETTLE: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createExperienceReuseRightsGrant(input, { rightsPrivateKeyPem } = {}) {
  if (!rightsPrivateKeyPem) fail("RIGHTS_GRANT_SIGNING_KEY_REQUIRED");
  return sealSigned(rightsGrantBody(input), { hashField: "grantHash",
    role: "RIGHTS_REGISTRAR", privateKeyPem: rightsPrivateKeyPem });
}

export function verifyExperienceReuseRightsGrant(record, {
  evidence, learningDiet, policy,
} = {}) {
  try {
    const dietCheck = verifyLearningDiet(learningDiet, { evidence, policy });
    const authority = roleAuthority(policy, "RIGHTS_REGISTRAR");
    if (!dietCheck.ok || !verifySignedBody(record, {
      schema: CEU_REUSE_SCHEMAS.rightsGrant, hashField: "grantHash",
      role: "RIGHTS_REGISTRAR", bodyBuilder: rightsGrantBody, policy,
    }) || record.evidenceHash !== evidence.evidenceHash
      || record.datasetHash !== evidence.sourceBinding.datasetHash
      || record.checkpointHash !== evidence.sourceBinding.checkpointHash
      || record.validityDomainHash !== evidence.validityDomainHash
      || record.learningDietHash !== learningDiet.learningDietHash
      || record.realityBoundaryHash !== evidence.realityBoundaryHash
      || record.authorityOrganizationHash !== authority.organizationHash
      || Date.parse(record.validFrom) < Date.parse(learningDiet.validFrom)
      || Date.parse(record.validUntil) > Date.parse(learningDiet.validUntil)
      || !validBoundary(record.boundary)) fail("RIGHTS_GRANT_INVALID");
    return Object.freeze({ ok: true, grantHash: record.grantHash,
      maxUpdateAdmissions: record.maxUpdateAdmissions });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function revocationBody(input) {
  if (!REVOCATION_REASONS.has(input.reasonCode)) fail("REVOCATION_REASON_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.revocation,
    schemaVersion: "1.0.0",
    revocationId: token(input.revocationId, "REVOCATION_ID"),
    grantHash: hash(input.grantHash, "REVOCATION_GRANT_HASH"),
    evidenceHash: hash(input.evidenceHash, "REVOCATION_EVIDENCE_HASH"),
    effectiveAt: canonicalTime(input.effectiveAt, "REVOCATION_EFFECTIVE_AT"),
    reasonCode: input.reasonCode,
    evidenceCommitmentHash: hash(input.evidenceCommitmentHash,
      "REVOCATION_EVIDENCE_COMMITMENT_HASH"),
    authorityOrganizationHash: hash(input.authorityOrganizationHash,
      "REVOCATION_AUTHORITY_ORGANIZATION_HASH"),
    effect: {
      blocksFutureModelUpdateIngress: true,
      deletesHistoricalCredit: false,
      erasesSourceEvidence: false,
      authorizesSettlement: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createExperienceReuseRevocation(input, { rightsPrivateKeyPem } = {}) {
  if (!rightsPrivateKeyPem) fail("REVOCATION_SIGNING_KEY_REQUIRED");
  return sealSigned(revocationBody(input), { hashField: "revocationHash",
    role: "RIGHTS_REGISTRAR", privateKeyPem: rightsPrivateKeyPem });
}

export function verifyExperienceReuseRevocation(record, { grant, policy } = {}) {
  try {
    const authority = roleAuthority(policy, "RIGHTS_REGISTRAR");
    if (!verifySignedBody(record, { schema: CEU_REUSE_SCHEMAS.revocation,
      hashField: "revocationHash", role: "RIGHTS_REGISTRAR",
      bodyBuilder: revocationBody, policy })
      || record.grantHash !== grant.grantHash
      || record.evidenceHash !== grant.evidenceHash
      || record.authorityOrganizationHash !== authority.organizationHash
      || Date.parse(record.effectiveAt) < Date.parse(grant.validFrom)
      || !validBoundary(record.boundary)) fail("REVOCATION_INVALID");
    return Object.freeze({ ok: true, revocationHash: record.revocationHash,
      effectiveAt: record.effectiveAt });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function ingressRequestBody(input) {
  return {
    schema: CEU_REUSE_SCHEMAS.ingressRequest,
    schemaVersion: "1.0.0",
    requestId: token(input.requestId, "INGRESS_REQUEST_ID"),
    evidenceHash: hash(input.evidenceHash, "INGRESS_EVIDENCE_HASH"),
    grantHash: hash(input.grantHash, "INGRESS_GRANT_HASH"),
    learningDietHash: hash(input.learningDietHash, "INGRESS_LEARNING_DIET_HASH"),
    datasetHash: hash(input.datasetHash, "INGRESS_DATASET_HASH"),
    sourceCheckpointHash: hash(input.sourceCheckpointHash,
      "INGRESS_SOURCE_CHECKPOINT_HASH"),
    modelHash: hash(input.modelHash, "INGRESS_MODEL_HASH"),
    baseCheckpointHash: hash(input.baseCheckpointHash, "INGRESS_BASE_CHECKPOINT_HASH"),
    candidateCheckpointHash: hash(input.candidateCheckpointHash,
      "INGRESS_CANDIDATE_CHECKPOINT_HASH"),
    validityDomainHash: hash(input.validityDomainHash,
      "INGRESS_VALIDITY_DOMAIN_HASH"),
    requestedAt: canonicalTime(input.requestedAt, "INGRESS_REQUESTED_AT"),
    requestedByHash: hash(input.requestedByHash, "INGRESS_REQUESTED_BY_HASH"),
    requestedOperation: input.requestedOperation
      === "MANUAL_MODEL_UPDATE_CANDIDATE_REVIEW"
      ? input.requestedOperation : fail("INGRESS_OPERATION_INVALID"),
    executionBoundary: {
      candidateEvaluationOnly: true,
      automaticTrainingRequested: false,
      modelUpdatePerformed: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createModelUpdateIngressRequest(input) {
  const body = ingressRequestBody(input);
  return deepFreeze({ ...body,
    requestHash: digest(CEU_REUSE_SCHEMAS.ingressRequest, body) });
}

export function verifyModelUpdateIngressRequest(record) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "requestId", "evidenceHash",
      "grantHash", "learningDietHash", "datasetHash", "sourceCheckpointHash",
      "modelHash", "baseCheckpointHash", "candidateCheckpointHash",
      "validityDomainHash", "requestedAt", "requestedByHash", "requestedOperation",
      "executionBoundary", "boundary", "requestHash"])
      || record.schema !== CEU_REUSE_SCHEMAS.ingressRequest
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.requestHash ?? "")) {
      fail("INGRESS_REQUEST_INVALID");
    }
    const body = ingressRequestBody(record);
    if (!same({ ...body, requestHash: digest(record.schema, body) }, record)
      || !validBoundary(record.boundary)) fail("INGRESS_REQUEST_INVALID");
    return Object.freeze({ ok: true, requestHash: record.requestHash });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function ingressCheck(check, passed, reason) {
  return { check, status: passed ? "PASS" : "HOLD", reason };
}

function priorAdmitted(priorDecisions, grantHash) {
  return priorDecisions.filter((item) => item.decision === "ADMIT_MANUAL_UPDATE_CANDIDATE"
    && item.request.grantHash === grantHash);
}

export function evaluateModelUpdateIngress(request, {
  evidence, learningDiet, grant, revocations = [], priorDecisions = [], policy,
  pinnedGovernanceKeyIds = [],
} = {}) {
  const requestCheck = verifyModelUpdateIngressRequest(request);
  if (!requestCheck.ok) fail("INGRESS_REQUEST_SOURCE_INVALID", requestCheck.error);
  const policyCheck = verifyCeuReuseGovernancePolicy(policy, {
    pinnedGovernanceKeyIds, at: request.requestedAt,
  });
  const evidenceCheck = verifyProspectiveCeuEvidence(evidence, { policy });
  const dietCheck = verifyLearningDiet(learningDiet, { evidence, policy });
  const grantCheck = verifyExperienceReuseRightsGrant(grant,
    { evidence, learningDiet, policy });
  const validRevocations = revocations.map((item) => verifyExperienceReuseRevocation(item,
    { grant, policy }));
  if (validRevocations.some((item) => !item.ok)) fail("INGRESS_REVOCATION_SET_INVALID");
  const instant = Date.parse(request.requestedAt);
  const effectiveRevocations = revocations.filter((item) => Date.parse(item.effectiveAt) <= instant);
  const admittedBefore = priorAdmitted(priorDecisions, grant.grantHash);
  const distinctModels = new Set(admittedBefore.map((item) => item.request.modelHash));
  const nextDistinctModels = new Set([...distinctModels, request.modelHash]);
  const candidateConflict = priorDecisions.some((item) =>
    item.decision === "ADMIT_MANUAL_UPDATE_CANDIDATE"
    && item.request.candidateCheckpointHash === request.candidateCheckpointHash
    && item.request.requestHash !== request.requestHash);
  const exactBindings = evidenceCheck.ok && dietCheck.ok && grantCheck.ok
    && request.evidenceHash === evidence.evidenceHash
    && request.grantHash === grant.grantHash
    && request.learningDietHash === learningDiet.learningDietHash
    && request.datasetHash === evidence.sourceBinding.datasetHash
    && request.datasetHash === grant.datasetHash
    && request.datasetHash === learningDiet.datasetHash
    && request.sourceCheckpointHash === evidence.sourceBinding.checkpointHash
    && request.sourceCheckpointHash === grant.checkpointHash
    && request.sourceCheckpointHash === learningDiet.checkpointHash
    && request.validityDomainHash === evidence.validityDomainHash
    && request.validityDomainHash === grant.validityDomainHash
    && request.validityDomainHash === learningDiet.validityDomainHash;
  const dietAllows = learningDiet?.permittedModelHashes?.includes(request.modelHash)
    && learningDiet.permittedBaseCheckpointHashes.includes(request.baseCheckpointHash)
    && learningDiet.permittedCandidateCheckpointHashes.includes(
      request.candidateCheckpointHash);
  const timeValid = policyCheck.ok
    && instant >= Date.parse(learningDiet.validFrom)
    && instant < Date.parse(learningDiet.validUntil)
    && instant >= Date.parse(grant.validFrom) && instant < Date.parse(grant.validUntil);
  const budgetAvailable = admittedBefore.length < grant.maxUpdateAdmissions
    && nextDistinctModels.size <= grant.maxDistinctModels;
  const checks = [
    ingressCheck("governance-policy", policyCheck.ok,
      policyCheck.ok ? "PINNED_POLICY_ACTIVE" : "PINNED_POLICY_NOT_VERIFIED_OR_ACTIVE"),
    ingressCheck("prospective-causal-evidence", evidenceCheck.ok && evidenceCheck.eligible,
      evidenceCheck.ok && evidenceCheck.eligible
        ? "PROSPECTIVE_EXECUTION_AND_INDEPENDENT_ADJUDICATION_VERIFIED"
        : "PROSPECTIVE_ELIGIBLE_EVIDENCE_ABSENT"),
    ingressCheck("rights-grant", grantCheck.ok,
      grantCheck.ok ? "SIGNED_RIGHTS_GRANT_VERIFIED" : "RIGHTS_GRANT_INVALID"),
    ingressCheck("validity-window", timeValid,
      timeValid ? "POLICY_DIET_AND_GRANT_ACTIVE" : "POLICY_DIET_OR_GRANT_NOT_ACTIVE"),
    ingressCheck("exact-source-bindings", exactBindings,
      exactBindings ? "DATASET_CHECKPOINT_DOMAIN_AND_ARTIFACT_HASHES_MATCH"
        : "SOURCE_OR_VALIDITY_BINDING_MISMATCH"),
    ingressCheck("learning-diet", dietCheck.ok && dietAllows,
      dietCheck.ok && dietAllows ? "EXACT_MODEL_AND_CHECKPOINTS_ALLOWLISTED"
        : "MODEL_OR_CHECKPOINT_OUTSIDE_LEARNING_DIET"),
    ingressCheck("revocation", effectiveRevocations.length === 0,
      effectiveRevocations.length === 0 ? "NO_EFFECTIVE_REVOCATION"
        : "RIGHTS_GRANT_REVOKED"),
    ingressCheck("reuse-externality-budget", budgetAvailable,
      budgetAvailable ? "UPDATE_AND_DISTINCT_MODEL_BUDGET_AVAILABLE"
        : "REUSE_EXTERNALITY_BUDGET_EXHAUSTED"),
    ingressCheck("candidate-checkpoint-uniqueness", !candidateConflict,
      candidateConflict ? "CANDIDATE_CHECKPOINT_CONFLICT"
        : "CANDIDATE_CHECKPOINT_NOT_PREVIOUSLY_ADMITTED"),
    ingressCheck("automatic-training", request.executionBoundary.automaticTrainingRequested
      === false, "AUTOMATIC_TRAINING_DISABLED"),
  ];
  const admitted = checks.every((item) => item.status === "PASS");
  const body = {
    schema: CEU_REUSE_SCHEMAS.ingressDecision,
    schemaVersion: "1.0.0",
    request,
    evaluatedArtifacts: {
      policyHash: policy.policyHash,
      evidenceHash: evidence.evidenceHash,
      learningDietHash: learningDiet.learningDietHash,
      grantHash: grant.grantHash,
      effectiveRevocationHashes: effectiveRevocations
        .map((item) => item.revocationHash).sort(),
    },
    checks,
    decision: admitted ? "ADMIT_MANUAL_UPDATE_CANDIDATE" : "HOLD",
    admittedToManualReviewCandidate: admitted,
    effect: {
      causalExperienceUnitsIssued: 0,
      causalExperienceUnitsConsumed: 0,
      automaticTraining: false,
      modelUpdatePerformed: false,
      productionDeploymentAuthorized: false,
      PRICE: false,
      GUARANTEE: false,
      SETTLE: false,
    },
    boundary: fixedBoundary(),
  };
  return deepFreeze({ ...body,
    decisionHash: digest(CEU_REUSE_SCHEMAS.ingressDecision, body) });
}

export function verifyModelUpdateIngressDecision(record, context) {
  try {
    if (!plain(record) || record.schema !== CEU_REUSE_SCHEMAS.ingressDecision
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.decisionHash ?? "")) {
      fail("INGRESS_DECISION_INVALID");
    }
    const rebuilt = evaluateModelUpdateIngress(record.request, context);
    if (!same(record, rebuilt) || record.effect.automaticTraining !== false
      || record.effect.modelUpdatePerformed !== false
      || !validBoundary(record.boundary)) fail("INGRESS_DECISION_INVALID");
    return Object.freeze({ ok: true, decisionHash: record.decisionHash,
      decision: record.decision });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function overlap(left, right) {
  const values = new Set(left);
  return right.some((value) => values.has(value));
}

function creditForEvidence(evidence, priorEntries, policy) {
  if (evidence.eligibility.eligibleForConfiguredPolicyCredit !== true) {
    return { creditClass: CEU_CREDIT_CLASSES.ineligible, creditUnits: 0,
      dedupEvidenceHashes: [] };
  }
  const admittedPrior = priorEntries.filter(({ evidence: prior }) =>
    prior.eligibility.eligibleForConfiguredPolicyCredit === true);
  const correlated = admittedPrior.filter(({ evidence: prior }) =>
    prior.claim.identityHash === evidence.claim.identityHash
    || overlap(prior.correlationRootHashes, evidence.correlationRootHashes));
  if (correlated.length > 0) {
    return { creditClass: CEU_CREDIT_CLASSES.reuse,
      creditUnits: policy.creditPolicy.reuseCreditUnits,
      dedupEvidenceHashes: correlated.map((item) => item.evidence.evidenceHash).sort() };
  }
  const confirmations = admittedPrior.filter(({ evidence: prior }) =>
    prior.claim.semanticHash === evidence.claim.semanticHash);
  if (confirmations.length > 0) {
    return { creditClass: CEU_CREDIT_CLASSES.confirmation,
      creditUnits: policy.creditPolicy.confirmationCreditUnits,
      dedupEvidenceHashes: confirmations.map((item) => item.evidence.evidenceHash).sort() };
  }
  return { creditClass: CEU_CREDIT_CLASSES.discovery,
    creditUnits: policy.creditPolicy.discoveryCreditUnits, dedupEvidenceHashes: [] };
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
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > maximumBytes) fail(`${code}_INVALID`);
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
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`);
  let fd = null;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeAll(fd, bytes);
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

function appendCanonicalEvent(file, event) {
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
    let event;
    try { event = JSON.parse(line); } catch { fail("EVENT_LOG_JSON_INVALID"); }
    if (canonicalizeStrict(event) !== line) fail("EVENT_LOG_NOT_CANONICAL");
    return event;
  });
}

function configBody({ ledgerId, createdAt, policy = null, governancePolicyHash = null,
  governanceRootKeyId = null, operator }) {
  return {
    schema: CEU_REUSE_SCHEMAS.config,
    schemaVersion: "1.0.0",
    ledgerId: token(ledgerId, "LEDGER_ID"),
    createdAt: canonicalTime(createdAt, "LEDGER_CREATED_AT"),
    governancePolicyHash: hash(governancePolicyHash ?? policy?.policyHash,
      "CONFIG_GOVERNANCE_POLICY_HASH"),
    governanceRootKeyId: KEY_ID.test(String(governanceRootKeyId
      ?? policy?.signature?.keyId ?? ""))
      ? governanceRootKeyId ?? policy.signature.keyId
      : fail("CONFIG_GOVERNANCE_ROOT_KEY_ID_INVALID"),
    operator,
    eventPolicy: {
      appendOnlyHashChain: true,
      signedEvents: true,
      atomicSingleWriterLock: true,
      exactArtifactHashReplay: true,
      duplicateEvidenceIdempotent: true,
      conflictingIdentityRejected: true,
    },
    boundary: fixedBoundary(),
  };
}

function createLedgerConfig({ ledgerId, createdAt, policy, operatorPrivateKeyPem }) {
  const identity = privateIdentity(operatorPrivateKeyPem);
  const body = configBody({ ledgerId, createdAt, policy,
    operator: { keyId: identity.keyId, publicKeyPem: identity.publicKeyPem } });
  return sealSigned(body, { hashField: "configHash", role: "LEDGER_OPERATOR",
    privateKeyPem: operatorPrivateKeyPem });
}

function verifyLedgerConfig(config, policy) {
  try {
    if (!exactKeys(config, ["schema", "schemaVersion", "ledgerId", "createdAt",
      "governancePolicyHash", "governanceRootKeyId", "operator", "eventPolicy",
      "boundary", "configHash", "signature"])
      || config.schema !== CEU_REUSE_SCHEMAS.config || config.schemaVersion !== "1.0.0"
      || !exactKeys(config.operator, ["keyId", "publicKeyPem"]) || !validBoundary(config.boundary)) {
      fail("CONFIG_INVALID");
    }
    const body = configBody(config);
    const expectedOperator = { keyId: config.operator.keyId,
      publicKeyPem: normalizedPublicKey(config.operator.publicKeyPem) };
    if (!same({ ...body, configHash: digest(config.schema, body), signature: config.signature },
      config) || config.governancePolicyHash !== policy.policyHash
      || config.governanceRootKeyId !== policy.signature.keyId
      || config.operator.keyId !== ceuReuseKeyId(config.operator.publicKeyPem)
      || !verifySignature(config.signature, "LEDGER_OPERATOR", config.configHash,
        expectedOperator)) fail("CONFIG_VERIFICATION_FAILED");
    return { ok: true, configHash: config.configHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

function eventBody({ config, sequence, type, recordedAt, previousEventHash, payload }) {
  if (!EVENT_TYPES.has(type)) fail("EVENT_TYPE_INVALID");
  return {
    schema: CEU_REUSE_SCHEMAS.event,
    schemaVersion: "1.0.0",
    ledgerId: config.ledgerId,
    sequence: integer(sequence, "EVENT_SEQUENCE", { minimum: 1 }),
    type,
    recordedAt: canonicalTime(recordedAt, "EVENT_RECORDED_AT"),
    previousEventHash: hash(previousEventHash, "EVENT_PREVIOUS_HASH"),
    payload,
  };
}

function createLedgerEvent(input, operatorPrivateKeyPem) {
  return sealSigned(eventBody(input), { hashField: "eventHash", role: "LEDGER_OPERATOR",
    privateKeyPem: operatorPrivateKeyPem });
}

function verifyLedgerEvents(events, config) {
  let previous = GENESIS;
  let priorTime = Date.parse(config.createdAt);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!exactKeys(event, ["schema", "schemaVersion", "ledgerId", "sequence", "type",
      "recordedAt", "previousEventHash", "payload", "eventHash", "signature"])
      || event.schema !== CEU_REUSE_SCHEMAS.event || event.schemaVersion !== "1.0.0"
      || event.sequence !== index + 1 || event.ledgerId !== config.ledgerId
      || event.previousEventHash !== previous || !EVENT_TYPES.has(event.type)) {
      fail("EVENT_CHAIN_INVALID");
    }
    const body = eventBody({ ...event, config });
    const currentTime = Date.parse(event.recordedAt);
    if (currentTime < priorTime || event.eventHash !== digest(event.schema, body)
      || !verifySignature(event.signature, "LEDGER_OPERATOR", event.eventHash,
        config.operator)) fail("EVENT_VERIFICATION_FAILED");
    previous = event.eventHash;
    priorTime = currentTime;
  }
  return previous;
}

function artifactFile(directory, artifactHash) {
  hash(artifactHash, "ARTIFACT_HASH");
  return path.join(directory, "artifacts", `${artifactHash.slice("sha256:".length)}.json`);
}

function payloadHash(event) {
  const fields = {
    REGISTER_ZERO_CEU_SOURCE: "assessmentHash",
    REGISTER_PROSPECTIVE_EVIDENCE: "evidenceHash",
    REGISTER_LEARNING_DIET: "learningDietHash",
    REGISTER_RIGHTS_GRANT: "grantHash",
    REVOKE_RIGHTS_GRANT: "revocationHash",
    RECORD_MODEL_UPDATE_INGRESS: "decisionHash",
  };
  return event.payload[fields[event.type]];
}

function readArtifacts(directory, events) {
  const output = new Map();
  for (const event of events) {
    const artifactHash = payloadHash(event);
    if (!HASH.test(String(artifactHash ?? ""))) fail("EVENT_ARTIFACT_HASH_INVALID");
    if (!output.has(artifactHash)) {
      output.set(artifactHash, readCanonicalJson(artifactFile(directory, artifactHash),
        "ARTIFACT"));
    }
  }
  return output;
}

function findById(items, idField, id) {
  return items.find((item) => item[idField] === id);
}

function expectedEvidencePayload(evidence, evidenceEntries, policy) {
  const credit = creditForEvidence(evidence, evidenceEntries, policy);
  return { evidenceHash: evidence.evidenceHash, ...credit };
}

function replayLedger({ config, policy, pinnedGovernanceKeyIds, events, artifacts }) {
  verifyLedgerEvents(events, config);
  const zeroAssessments = [];
  const evidenceEntries = [];
  const learningDiets = [];
  const grants = [];
  const revocations = [];
  const ingressDecisions = [];
  for (const event of events) {
    const artifact = artifacts.get(payloadHash(event));
    if (!artifact) fail("ARTIFACT_MISSING");
    if (event.type === "REGISTER_ZERO_CEU_SOURCE") {
      const checked = verifyZeroCeuSourceAssessment(artifact);
      if (!checked.ok || !same(event.payload, { assessmentHash: artifact.assessmentHash })) {
        fail("ZERO_SOURCE_EVENT_INVALID");
      }
      const prior = findById(zeroAssessments, "sourceArtifactHash", artifact.sourceArtifactHash);
      if (prior && prior.assessmentHash !== artifact.assessmentHash) fail("ZERO_SOURCE_CONFLICT");
      if (!prior) zeroAssessments.push(artifact);
    } else if (event.type === "REGISTER_PROSPECTIVE_EVIDENCE") {
      const checked = verifyProspectiveCeuEvidence(artifact, { policy });
      if (!checked.ok) fail("PROSPECTIVE_EVIDENCE_EVENT_INVALID", checked.error);
      const exact = evidenceEntries.find((item) => item.evidence.evidenceHash
        === artifact.evidenceHash);
      if (exact) fail("DUPLICATE_EVIDENCE_EVENT");
      const conflicts = evidenceEntries.filter(({ evidence }) =>
        evidence.design.designHash === artifact.design.designHash
        || evidence.sourceBinding.datasetHash === artifact.sourceBinding.datasetHash
        || evidence.sourceBinding.checkpointHash === artifact.sourceBinding.checkpointHash);
      if (conflicts.length > 0) fail("PROSPECTIVE_EVIDENCE_BINDING_CONFLICT");
      const expected = expectedEvidencePayload(artifact, evidenceEntries, policy);
      if (!same(event.payload, expected)) fail("EVIDENCE_CREDIT_DERIVATION_MISMATCH");
      evidenceEntries.push({ evidence: artifact, credit: {
        creditClass: expected.creditClass, creditUnits: expected.creditUnits,
        dedupEvidenceHashes: expected.dedupEvidenceHashes,
      } });
    } else if (event.type === "REGISTER_LEARNING_DIET") {
      const evidence = evidenceEntries.find((item) => item.evidence.evidenceHash
        === artifact.evidenceHash)?.evidence;
      const checked = verifyLearningDiet(artifact, { evidence, policy });
      if (!checked.ok || !same(event.payload,
        { learningDietHash: artifact.learningDietHash })) fail("LEARNING_DIET_EVENT_INVALID");
      const prior = findById(learningDiets, "dietId", artifact.dietId);
      if (prior) fail(prior.learningDietHash === artifact.learningDietHash
        ? "DUPLICATE_LEARNING_DIET_EVENT" : "LEARNING_DIET_ID_CONFLICT");
      learningDiets.push(artifact);
    } else if (event.type === "REGISTER_RIGHTS_GRANT") {
      const evidence = evidenceEntries.find((item) => item.evidence.evidenceHash
        === artifact.evidenceHash)?.evidence;
      const diet = learningDiets.find((item) => item.learningDietHash
        === artifact.learningDietHash);
      const checked = verifyExperienceReuseRightsGrant(artifact,
        { evidence, learningDiet: diet, policy });
      if (!checked.ok || !same(event.payload, { grantHash: artifact.grantHash })) {
        fail("RIGHTS_GRANT_EVENT_INVALID");
      }
      const prior = findById(grants, "grantId", artifact.grantId);
      if (prior) fail(prior.grantHash === artifact.grantHash
        ? "DUPLICATE_RIGHTS_GRANT_EVENT" : "RIGHTS_GRANT_ID_CONFLICT");
      grants.push(artifact);
    } else if (event.type === "REVOKE_RIGHTS_GRANT") {
      const grant = grants.find((item) => item.grantHash === artifact.grantHash);
      const checked = verifyExperienceReuseRevocation(artifact, { grant, policy });
      if (!checked.ok || !same(event.payload, { revocationHash: artifact.revocationHash })) {
        fail("REVOCATION_EVENT_INVALID");
      }
      const prior = findById(revocations, "revocationId", artifact.revocationId);
      if (prior) fail(prior.revocationHash === artifact.revocationHash
        ? "DUPLICATE_REVOCATION_EVENT" : "REVOCATION_ID_CONFLICT");
      revocations.push(artifact);
    } else if (event.type === "RECORD_MODEL_UPDATE_INGRESS") {
      const evidence = evidenceEntries.find((item) => item.evidence.evidenceHash
        === artifact.request?.evidenceHash)?.evidence;
      const diet = learningDiets.find((item) => item.learningDietHash
        === artifact.request?.learningDietHash);
      const grant = grants.find((item) => item.grantHash === artifact.request?.grantHash);
      const relevantRevocations = revocations.filter((item) => item.grantHash === grant?.grantHash);
      const checked = verifyModelUpdateIngressDecision(artifact, { evidence,
        learningDiet: diet, grant, revocations: relevantRevocations,
        priorDecisions: ingressDecisions, policy, pinnedGovernanceKeyIds });
      if (!checked.ok || !same(event.payload, { decisionHash: artifact.decisionHash,
        requestHash: artifact.request.requestHash, decision: artifact.decision })) {
        fail("INGRESS_EVENT_INVALID", checked.error);
      }
      const prior = ingressDecisions.find((item) => item.request.requestId
        === artifact.request.requestId);
      if (prior) fail(prior.request.requestHash === artifact.request.requestHash
        ? "DUPLICATE_INGRESS_EVENT" : "INGRESS_REQUEST_ID_CONFLICT");
      ingressDecisions.push(artifact);
    }
  }
  return { zeroAssessments, evidenceEntries, learningDiets, grants, revocations,
    ingressDecisions, events, artifacts };
}

function indexBody(config, state) {
  const credits = state.evidenceEntries.map(({ evidence, credit }) => ({
    evidenceHash: evidence.evidenceHash,
    claimSemanticHash: evidence.claim.semanticHash,
    claimIdentityHash: evidence.claim.identityHash,
    correlationRootHashes: evidence.correlationRootHashes,
    datasetHash: evidence.sourceBinding.datasetHash,
    checkpointHash: evidence.sourceBinding.checkpointHash,
    ...credit,
  }));
  const admitted = state.ingressDecisions.filter((item) =>
    item.decision === "ADMIT_MANUAL_UPDATE_CANDIDATE");
  return {
    schema: CEU_REUSE_SCHEMAS.index,
    schemaVersion: "1.0.0",
    ledgerId: config.ledgerId,
    configHash: config.configHash,
    governancePolicyHash: config.governancePolicyHash,
    updatedAt: state.events.at(-1)?.recordedAt ?? config.createdAt,
    log: { events: state.events.length,
      headEventHash: state.events.at(-1)?.eventHash ?? GENESIS },
    counts: {
      zeroCeuSources: state.zeroAssessments.length,
      prospectiveEvidence: state.evidenceEntries.length,
      learningDiets: state.learningDiets.length,
      rightsGrants: state.grants.length,
      revocations: state.revocations.length,
      ingressDecisions: state.ingressDecisions.length,
      admittedManualCandidates: admitted.length,
      automaticModelUpdates: 0,
    },
    credit: {
      configuredPolicyConformanceUnits: credits.reduce((sum, item) =>
        sum + item.creditUnits, 0),
      discoveries: credits.filter((item) => item.creditClass
        === CEU_CREDIT_CLASSES.discovery).length,
      confirmations: credits.filter((item) => item.creditClass
        === CEU_CREDIT_CLASSES.confirmation).length,
      correlatedReuse: credits.filter((item) => item.creditClass
        === CEU_CREDIT_CLASSES.reuse).length,
      entries: credits,
    },
    artifacts: {
      zeroAssessmentHashes: state.zeroAssessments.map((item) => item.assessmentHash).sort(),
      learningDietHashes: state.learningDiets.map((item) => item.learningDietHash).sort(),
      grantHashes: state.grants.map((item) => item.grantHash).sort(),
      revocationHashes: state.revocations.map((item) => item.revocationHash).sort(),
      ingressDecisionHashes: state.ingressDecisions.map((item) => item.decisionHash).sort(),
    },
    boundary: fixedBoundary(),
  };
}

function sealIndex(body, operatorPrivateKeyPem) {
  return sealSigned(body, { hashField: "indexHash", role: "LEDGER_OPERATOR",
    privateKeyPem: operatorPrivateKeyPem });
}

function verifyIndex(index, expectedBody, config) {
  try {
    if (!plain(index) || index.schema !== CEU_REUSE_SCHEMAS.index
      || index.schemaVersion !== "1.0.0" || !HASH.test(index.indexHash ?? "")) {
      fail("INDEX_INVALID");
    }
    const { indexHash, signature, ...body } = index;
    if (!same(body, expectedBody) || indexHash !== digest(index.schema, expectedBody)
      || !verifySignature(signature, "LEDGER_OPERATOR", indexHash, config.operator)
      || !validBoundary(index.boundary)) fail("INDEX_VERIFICATION_FAILED");
    return { ok: true, indexHash };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

export class DurableCeuReuseFrontier {
  constructor({ directory, governancePolicy = null, pinnedGovernanceKeyIds = [],
    operatorPrivateKeyPem = null, ledgerId = "outsider-global-ceu-reuse-frontier",
    createdAt = new Date(),
  } = {}) {
    if (typeof directory !== "string" || directory.length === 0) fail("DIRECTORY_REQUIRED");
    this.directory = path.resolve(directory);
    this.artifactsDirectory = path.join(this.directory, "artifacts");
    this.policyFile = path.join(this.directory, "governance-policy.json");
    this.configFile = path.join(this.directory, "config.json");
    this.eventsFile = path.join(this.directory, "events.jsonl");
    this.indexFile = path.join(this.directory, "index.json");
    this.lockFile = path.join(this.directory, ".write.lock");
    this.initializationLockFile = path.join(this.directory, ".initialize.lock");
    this.operatorPrivateKeyPem = operatorPrivateKeyPem;
    this.pinnedGovernanceKeyIds = [...pinnedGovernanceKeyIds];
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const directoryStats = lstatSync(this.directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      fail("DIRECTORY_INVALID");
    }
    mkdirSync(this.artifactsDirectory, { recursive: true, mode: 0o700 });
    const artifactStats = lstatSync(this.artifactsDirectory);
    if (!artifactStats.isDirectory() || artifactStats.isSymbolicLink()) {
      fail("ARTIFACT_DIRECTORY_INVALID");
    }
    const coreFiles = [this.policyFile, this.configFile, this.eventsFile, this.indexFile];
    if (!coreFiles.every(existsSync)) {
      let lock = null;
      try {
        try { lock = openSync(this.initializationLockFile, "wx", 0o600); }
        catch (error) {
          if (error?.code === "EEXIST") fail("INITIALIZATION_LOCKED");
          throw error;
        }
        if (coreFiles.some(existsSync)) fail("INITIALIZATION_INCOMPLETE");
        if (!governancePolicy || !operatorPrivateKeyPem) {
          fail("INITIALIZATION_POLICY_AND_OPERATOR_KEY_REQUIRED");
        }
        const created = canonicalTime(createdAt, "LEDGER_CREATED_AT");
        const policyCheck = verifyCeuReuseGovernancePolicy(governancePolicy,
          { pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds, at: created });
        if (!policyCheck.ok) fail("INITIALIZATION_POLICY_INVALID", policyCheck.error);
        const config = createLedgerConfig({ ledgerId, createdAt: created,
          policy: governancePolicy, operatorPrivateKeyPem });
        const emptyState = { zeroAssessments: [], evidenceEntries: [], learningDiets: [],
          grants: [], revocations: [], ingressDecisions: [], events: [], artifacts: new Map() };
        atomicCanonicalJson(this.policyFile, governancePolicy, { exclusive: true });
        atomicCanonicalJson(this.configFile, config, { exclusive: true });
        createEmptyFile(this.eventsFile);
        atomicCanonicalJson(this.indexFile,
          sealIndex(indexBody(config, emptyState), operatorPrivateKeyPem), { exclusive: true });
        fsyncDirectory(this.directory);
      } finally {
        if (lock !== null) {
          closeSync(lock);
          if (existsSync(this.initializationLockFile)) unlinkSync(this.initializationLockFile);
          fsyncDirectory(this.directory);
        }
      }
    }
    this.policy = readCanonicalJson(this.policyFile, "GOVERNANCE_POLICY", 4 * 1024 * 1024);
    if (governancePolicy && !same(governancePolicy, this.policy)) fail("GOVERNANCE_POLICY_DRIFT");
    const policyCheck = verifyCeuReuseGovernancePolicy(this.policy,
      { pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds });
    if (!policyCheck.ok) fail("GOVERNANCE_POLICY_INVALID", policyCheck.error);
    this.config = readCanonicalJson(this.configFile, "CONFIG", 4 * 1024 * 1024);
    const configCheck = verifyLedgerConfig(this.config, this.policy);
    if (!configCheck.ok) fail("CONFIG_INVALID", configCheck.error);
    if (ledgerId !== this.config.ledgerId && ledgerId !== "outsider-global-ceu-reuse-frontier") {
      fail("LEDGER_ID_MISMATCH");
    }
    if (operatorPrivateKeyPem
      && privateIdentity(operatorPrivateKeyPem).keyId !== this.config.operator.keyId) {
      fail("OPERATOR_SIGNING_KEY_MISMATCH");
    }
  }

  #requireOperatorKey() {
    if (!this.operatorPrivateKeyPem) fail("OPERATOR_SIGNING_KEY_REQUIRED");
    if (privateIdentity(this.operatorPrivateKeyPem).keyId !== this.config.operator.keyId) {
      fail("OPERATOR_SIGNING_KEY_MISMATCH");
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

  #load({ recoverSignedEventSuffix = false } = {}) {
    const policy = readCanonicalJson(this.policyFile, "GOVERNANCE_POLICY", 4 * 1024 * 1024);
    if (!same(policy, this.policy)) fail("GOVERNANCE_POLICY_DRIFT");
    const config = readCanonicalJson(this.configFile, "CONFIG", 4 * 1024 * 1024);
    if (!same(config, this.config)) fail("CONFIG_DRIFT");
    const events = parseEvents(this.eventsFile);
    const artifacts = readArtifacts(this.directory, events);
    const state = replayLedger({ config, policy,
      pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds, events, artifacts });
    let index = readCanonicalJson(this.indexFile, "INDEX");
    let expected = indexBody(config, state);
    let checked = verifyIndex(index, expected, config);
    if (!checked.ok && recoverSignedEventSuffix && this.operatorPrivateKeyPem
      && Number.isSafeInteger(index?.log?.events) && index.log.events >= 0
      && index.log.events < events.length) {
      const prefixEvents = events.slice(0, index.log.events);
      const referenced = new Set(prefixEvents.map(payloadHash));
      const prefixArtifacts = new Map([...artifacts].filter(([key]) => referenced.has(key)));
      const prefixState = replayLedger({ config, policy,
        pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds,
        events: prefixEvents, artifacts: prefixArtifacts });
      const prefixCheck = verifyIndex(index, indexBody(config, prefixState), config);
      if (prefixCheck.ok) {
        index = sealIndex(expected, this.operatorPrivateKeyPem);
        atomicCanonicalJson(this.indexFile, index);
        checked = verifyIndex(index, expected, config);
      }
    }
    if (!checked.ok) fail("CURRENT_INDEX_INVALID", checked.error);
    return { ...state, index, config, policy };
  }

  #writeArtifact(artifactHash, artifact) {
    const file = artifactFile(this.directory, artifactHash);
    if (existsSync(file)) {
      const existing = readCanonicalJson(file, "ORPHAN_ARTIFACT");
      if (!same(existing, artifact)) fail("ORPHAN_ARTIFACT_CONFLICT");
      return;
    }
    atomicCanonicalJson(file, artifact, { exclusive: true });
  }

  #commit({ type, artifactHash, artifact, recordedAt, prepare }) {
    this.#requireOperatorKey();
    return this.#withLock(() => {
      const state = this.#load({ recoverSignedEventSuffix: true });
      const prepared = prepare(state);
      if (prepared.idempotent) return deepFreeze(prepared.result);
      const time = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      if (Date.parse(time) < Date.parse(state.index.updatedAt)) fail("EVENT_TIME_REGRESSION");
      this.#writeArtifact(artifactHash, artifact);
      const event = createLedgerEvent({ config: state.config,
        sequence: state.events.length + 1, type, recordedAt: time,
        previousEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
        payload: prepared.payload }, this.operatorPrivateKeyPem);
      const events = [...state.events, event];
      const artifacts = new Map(state.artifacts);
      artifacts.set(artifactHash, artifact);
      const nextState = replayLedger({ config: state.config, policy: state.policy,
        pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds, events, artifacts });
      const nextIndex = sealIndex(indexBody(state.config, nextState),
        this.operatorPrivateKeyPem);
      appendCanonicalEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return deepFreeze(prepared.resultForAppend(event, nextIndex));
    });
  }

  appendZeroCeuSource(source, { recordedAt = new Date() } = {}) {
    const assessment = assessExistingSourceForCeu(source);
    return this.#commit({ type: "REGISTER_ZERO_CEU_SOURCE",
      artifactHash: assessment.assessmentHash, artifact: assessment, recordedAt,
      prepare: (state) => {
        const exact = state.zeroAssessments.find((item) => item.assessmentHash
          === assessment.assessmentHash);
        if (exact) return { idempotent: true, result: { appended: false,
          duplicate: true, assessmentHash: exact.assessmentHash,
          causalExperienceUnits: 0, indexHash: state.index.indexHash } };
        const conflict = state.zeroAssessments.find((item) => item.sourceArtifactHash
          === assessment.sourceArtifactHash);
        if (conflict) fail("ZERO_SOURCE_CONFLICT");
        return { idempotent: false, payload: { assessmentHash: assessment.assessmentHash },
          resultForAppend: (event, index) => ({ appended: true, duplicate: false,
            assessmentHash: assessment.assessmentHash, causalExperienceUnits: 0,
            eventHash: event.eventHash, indexHash: index.indexHash }) };
      } });
  }

  appendProspectiveEvidence(sources, { recordedAt = new Date() } = {}) {
    const evidence = buildProspectiveCeuEvidence(sources, { policy: this.policy });
    if (Date.parse(canonicalTime(recordedAt, "EVENT_RECORDED_AT"))
      < Date.parse(evidence.adjudication.adjudicatedAt)) fail("EVIDENCE_RECORDED_BEFORE_ADJUDICATION");
    return this.#commit({ type: "REGISTER_PROSPECTIVE_EVIDENCE",
      artifactHash: evidence.evidenceHash, artifact: evidence, recordedAt,
      prepare: (state) => {
        const exact = state.evidenceEntries.find((item) => item.evidence.evidenceHash
          === evidence.evidenceHash);
        if (exact) return { idempotent: true, result: { appended: false, duplicate: true,
          evidenceHash: evidence.evidenceHash, ...exact.credit,
          indexHash: state.index.indexHash } };
        const conflict = state.evidenceEntries.find(({ evidence: prior }) =>
          prior.design.designHash === evidence.design.designHash
          || prior.sourceBinding.datasetHash === evidence.sourceBinding.datasetHash
          || prior.sourceBinding.checkpointHash === evidence.sourceBinding.checkpointHash);
        if (conflict) fail("PROSPECTIVE_EVIDENCE_BINDING_CONFLICT");
        const payload = expectedEvidencePayload(evidence, state.evidenceEntries, this.policy);
        return { idempotent: false, payload,
          resultForAppend: (event, index) => ({ appended: true, duplicate: false,
            ...payload, eventHash: event.eventHash, indexHash: index.indexHash }) };
      } });
  }

  appendLearningDiet(learningDiet, { recordedAt = new Date() } = {}) {
    return this.#commit({ type: "REGISTER_LEARNING_DIET",
      artifactHash: learningDiet.learningDietHash, artifact: learningDiet, recordedAt,
      prepare: (state) => {
        const exact = state.learningDiets.find((item) => item.learningDietHash
          === learningDiet.learningDietHash);
        if (exact) return { idempotent: true, result: { appended: false, duplicate: true,
          learningDietHash: exact.learningDietHash, indexHash: state.index.indexHash } };
        const idConflict = findById(state.learningDiets, "dietId", learningDiet.dietId);
        if (idConflict) fail("LEARNING_DIET_ID_CONFLICT");
        const evidence = state.evidenceEntries.find((item) => item.evidence.evidenceHash
          === learningDiet.evidenceHash)?.evidence;
        const checked = verifyLearningDiet(learningDiet, { evidence, policy: this.policy });
        if (!checked.ok) fail("LEARNING_DIET_ADMISSION_INVALID", checked.error);
        return { idempotent: false,
          payload: { learningDietHash: learningDiet.learningDietHash },
          resultForAppend: (event, index) => ({ appended: true, duplicate: false,
            learningDietHash: learningDiet.learningDietHash, eventHash: event.eventHash,
            indexHash: index.indexHash }) };
      } });
  }

  appendRightsGrant(grant, { recordedAt = new Date() } = {}) {
    return this.#commit({ type: "REGISTER_RIGHTS_GRANT", artifactHash: grant.grantHash,
      artifact: grant, recordedAt, prepare: (state) => {
        const exact = state.grants.find((item) => item.grantHash === grant.grantHash);
        if (exact) return { idempotent: true, result: { appended: false, duplicate: true,
          grantHash: exact.grantHash, indexHash: state.index.indexHash } };
        if (findById(state.grants, "grantId", grant.grantId)) fail("RIGHTS_GRANT_ID_CONFLICT");
        const evidence = state.evidenceEntries.find((item) => item.evidence.evidenceHash
          === grant.evidenceHash)?.evidence;
        const diet = state.learningDiets.find((item) => item.learningDietHash
          === grant.learningDietHash);
        const checked = verifyExperienceReuseRightsGrant(grant,
          { evidence, learningDiet: diet, policy: this.policy });
        if (!checked.ok) fail("RIGHTS_GRANT_ADMISSION_INVALID", checked.error);
        return { idempotent: false, payload: { grantHash: grant.grantHash },
          resultForAppend: (event, index) => ({ appended: true, duplicate: false,
            grantHash: grant.grantHash, eventHash: event.eventHash,
            indexHash: index.indexHash }) };
      } });
  }

  appendRevocation(revocation, { recordedAt = new Date() } = {}) {
    return this.#commit({ type: "REVOKE_RIGHTS_GRANT",
      artifactHash: revocation.revocationHash, artifact: revocation, recordedAt,
      prepare: (state) => {
        const exact = state.revocations.find((item) => item.revocationHash
          === revocation.revocationHash);
        if (exact) return { idempotent: true, result: { appended: false, duplicate: true,
          revocationHash: exact.revocationHash, indexHash: state.index.indexHash } };
        if (findById(state.revocations, "revocationId", revocation.revocationId)) {
          fail("REVOCATION_ID_CONFLICT");
        }
        const grant = state.grants.find((item) => item.grantHash === revocation.grantHash);
        const checked = verifyExperienceReuseRevocation(revocation,
          { grant, policy: this.policy });
        if (!checked.ok) fail("REVOCATION_ADMISSION_INVALID", checked.error);
        return { idempotent: false, payload: { revocationHash: revocation.revocationHash },
          resultForAppend: (event, index) => ({ appended: true, duplicate: false,
            revocationHash: revocation.revocationHash, eventHash: event.eventHash,
            indexHash: index.indexHash }) };
      } });
  }

  evaluateAndRecordModelUpdateIngress(request, { recordedAt = new Date() } = {}) {
    const requestCheck = verifyModelUpdateIngressRequest(request);
    if (!requestCheck.ok) fail("INGRESS_REQUEST_ADMISSION_INVALID", requestCheck.error);
    if (Date.parse(canonicalTime(recordedAt, "EVENT_RECORDED_AT"))
      < Date.parse(request.requestedAt)) fail("INGRESS_RECORDED_BEFORE_REQUEST");
    this.#requireOperatorKey();
    return this.#withLock(() => {
      const state = this.#load({ recoverSignedEventSuffix: true });
      const byId = state.ingressDecisions.find((item) => item.request.requestId
        === request.requestId);
      if (byId) {
        if (byId.request.requestHash !== request.requestHash) fail("INGRESS_REQUEST_ID_CONFLICT");
        /* A replay is audit-idempotent, not a second authorization. This is
         * especially important after a grant has been revoked or its budget was
         * consumed by the original candidate admission. */
        return deepFreeze({ appended: false, duplicate: true,
          requestHash: request.requestHash, decisionHash: byId.decisionHash,
          historicalDecision: byId.decision,
          decision: "HOLD_DUPLICATE_REQUEST_NO_NEW_UPDATE_AUTHORITY",
          currentlyAuthorizesNewUpdate: false, indexHash: state.index.indexHash });
      }
      const evidence = state.evidenceEntries.find((item) => item.evidence.evidenceHash
        === request.evidenceHash)?.evidence;
      const diet = state.learningDiets.find((item) => item.learningDietHash
        === request.learningDietHash);
      const grant = state.grants.find((item) => item.grantHash === request.grantHash);
      if (!evidence || !diet || !grant) fail("INGRESS_REFERENCED_ARTIFACT_NOT_REGISTERED");
      const revocations = state.revocations.filter((item) => item.grantHash === grant.grantHash);
      const decision = evaluateModelUpdateIngress(request, { evidence,
        learningDiet: diet, grant, revocations, priorDecisions: state.ingressDecisions,
        policy: this.policy, pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds });
      const eventTime = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      if (Date.parse(eventTime) < Date.parse(state.index.updatedAt)) fail("EVENT_TIME_REGRESSION");
      this.#writeArtifact(decision.decisionHash, decision);
      const payload = { decisionHash: decision.decisionHash,
        requestHash: request.requestHash, decision: decision.decision };
      const event = createLedgerEvent({ config: state.config,
        sequence: state.events.length + 1, type: "RECORD_MODEL_UPDATE_INGRESS",
        recordedAt: eventTime, previousEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
        payload }, this.operatorPrivateKeyPem);
      const events = [...state.events, event];
      const artifacts = new Map(state.artifacts);
      artifacts.set(decision.decisionHash, decision);
      const nextState = replayLedger({ config: state.config, policy: state.policy,
        pinnedGovernanceKeyIds: this.pinnedGovernanceKeyIds, events, artifacts });
      const nextIndex = sealIndex(indexBody(state.config, nextState),
        this.operatorPrivateKeyPem);
      appendCanonicalEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return deepFreeze({ appended: true, duplicate: false,
        requestHash: request.requestHash, decisionHash: decision.decisionHash,
        decision: decision.decision, eventHash: event.eventHash,
        indexHash: nextIndex.indexHash });
    });
  }

  report({ asOf = new Date() } = {}) {
    const state = this.#load();
    const at = canonicalTime(asOf, "REPORT_AS_OF");
    const instant = Date.parse(at);
    const activePolicy = instant >= Date.parse(this.policy.validFrom)
      && instant < Date.parse(this.policy.validUntil);
    const grantStates = state.grants.map((grant) => {
      const effectiveRevocations = state.revocations.filter((item) =>
        item.grantHash === grant.grantHash && Date.parse(item.effectiveAt) <= instant);
      const withinWindow = instant >= Date.parse(grant.validFrom)
        && instant < Date.parse(grant.validUntil);
      return { grantHash: grant.grantHash,
        state: effectiveRevocations.length > 0 ? "REVOKED"
          : withinWindow && activePolicy ? "ACTIVE" : "INACTIVE_OR_EXPIRED",
        effectiveRevocationHashes: effectiveRevocations
          .map((item) => item.revocationHash).sort() };
    });
    const currentlyUnrevokedCandidates = state.ingressDecisions.filter((decision) => {
      if (decision.decision !== "ADMIT_MANUAL_UPDATE_CANDIDATE") return false;
      const grantState = grantStates.find((item) => item.grantHash
        === decision.request.grantHash);
      return grantState?.state === "ACTIVE";
    }).length;
    const body = {
      schema: CEU_REUSE_SCHEMAS.report,
      schemaVersion: "1.0.0",
      ledgerId: state.config.ledgerId,
      asOf: at,
      anchors: {
        governancePolicyHash: this.policy.policyHash,
        governanceRootKeyId: this.policy.signature.keyId,
        configHash: state.config.configHash,
        indexHash: state.index.indexHash,
        eventChainHead: state.index.log.headEventHash,
      },
      counts: state.index.counts,
      credit: state.index.credit,
      rights: { activePolicy, grants: grantStates },
      ingress: {
        historicallyAdmittedManualCandidates:
          state.index.counts.admittedManualCandidates,
        currentlyUnrevokedManualCandidates: currentlyUnrevokedCandidates,
        automaticModelUpdates: 0,
      },
      externalGaps: {
        externalGovernanceAdoptionEstablished: false,
        institutionalEnforcementEstablished: false,
        sourceRightsTruthEstablishedByLedgerAlone: false,
        realProspectiveEvidencePresent: state.evidenceEntries.length > 0,
      },
      boundary: fixedBoundary(),
    };
    return deepFreeze({ ...body, reportHash: digest(CEU_REUSE_SCHEMAS.report, body) });
  }

  verify() {
    try {
      const state = this.#load();
      return Object.freeze({ ok: true, indexHash: state.index.indexHash,
        events: state.events.length, configuredPolicyConformanceUnits:
          state.index.credit.configuredPolicyConformanceUnits });
    } catch (error) {
      return Object.freeze({ ok: false, error: error?.message ?? String(error) });
    }
  }
}

export function verifyCeuReuseFrontierDirectory({ directory, governancePolicy = null,
  pinnedGovernanceKeyIds = [], asOf = new Date(),
} = {}) {
  try {
    const ledger = new DurableCeuReuseFrontier({ directory, governancePolicy,
      pinnedGovernanceKeyIds, operatorPrivateKeyPem: null });
    const checked = ledger.verify();
    if (!checked.ok) fail("DIRECTORY_INVALID", checked.error);
    return Object.freeze({ ok: true, report: ledger.report({ asOf }) });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}
