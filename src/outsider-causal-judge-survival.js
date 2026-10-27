/*
 * Stage 1.5 causal-judge hypothesis-survival instrument.
 *
 * This module is deliberately a zero-authority local verifier. It can prove
 * that a versioned hypothesis, randomized/control assignment, complete source
 * bundle, outcome assessment and adjudication satisfy a pinned local policy.
 * It cannot prove that locally configured organizations are independent in
 * fact, that a source came from a real environment, or that an institution has
 * adopted the result. Historical/public/simulation evidence remains empirical
 * when appropriate, but contributes zero to the survival denominator.
 */

import {
  createHash, createPrivateKey, createPublicKey,
  sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const CAUSAL_JUDGE_SCHEMAS = Object.freeze({
  governancePolicy: "outsider/causal-judge-governance-policy/v1",
  hypothesis: "outsider/causal-hypothesis-preregistration/v1",
  assignment: "outsider/causal-hypothesis-randomized-assignment/v1",
  assignmentSource: "outsider/causal-hypothesis-assignment-source/v1",
  sourceManifest: "outsider/causal-judge-source-manifest/v1",
  execution: "outsider/causal-hypothesis-execution/v1",
  outcome: "outsider/causal-hypothesis-outcome-assessment/v1",
  adjudication: "outsider/causal-hypothesis-independent-adjudication/v1",
  evidenceBundle: "outsider/causal-hypothesis-evidence-bundle/v1",
  mechanismCandidate: "outsider/causal-mechanism-candidate/v1",
  report: "outsider/causal-judge-survival-report/v1",
  signature: "outsider/causal-judge-signature/v1",
});

export const CAUSAL_JUDGE_SOURCE_REALITY = Object.freeze({
  realPhysical: "REAL_PHYSICAL",
  realSoftware: "REAL_SOFTWARE",
  controlledRealApp: "CONTROLLED_REAL_APP",
  simulation: "SIMULATION",
  synthetic: "SYNTHETIC",
  unknown: "UNKNOWN",
});

export const CAUSAL_JUDGE_EVIDENCE_AUTHORITY = Object.freeze({
  prospectiveConfiguredRoleSeparation:
    "SOURCE_REPLAYED_PROSPECTIVE_CONFIGURED_ROLE_SEPARATION",
  retrospective: "SOURCE_REPLAYED_RETROSPECTIVE",
  publisherDeclared: "PUBLISHER_DECLARED",
  metadataOnly: "METADATA_ONLY",
  selfReported: "SELF_REPORTED",
});

export const CAUSAL_JUDGE_PERMITTED_USE = Object.freeze({
  measureCandidate: "MEASURE_CAUSAL_SURVIVAL_CANDIDATE",
  mechanismOnly: "MECHANISM_CANDIDATE_ONLY",
});

export const CAUSAL_JUDGE_EVIDENCE_TIMING = Object.freeze({
  prospective: "PROSPECTIVE",
  historical: "HISTORICAL",
  publicRetrospective: "PUBLIC_RETROSPECTIVE",
  metadataOnly: "METADATA_ONLY",
  simulationOnly: "SIMULATION_ONLY",
});

const ROLES = Object.freeze([
  "HYPOTHESIS_REGISTRAR", "ASSIGNMENT_ATTESTOR", "EXECUTION_ATTESTOR",
  "INDEPENDENT_OUTCOME_ASSESSOR", "INDEPENDENT_ADJUDICATOR",
]);
const SOURCE_PURPOSES = new Set([
  "RANDOMIZATION_BEACON", "ASSIGNMENT_LEDGER", "EXECUTION_TRACE",
  "OUTCOME_OBSERVATIONS", "ADJUDICATION_SUPPORT",
]);
const REQUIRED_SOURCE_PURPOSES = Object.freeze([
  "RANDOMIZATION_BEACON", "ASSIGNMENT_LEDGER", "EXECUTION_TRACE",
  "OUTCOME_OBSERVATIONS",
]);
const REALITIES = new Set(Object.values(CAUSAL_JUDGE_SOURCE_REALITY));
const AUTHORITIES = new Set(Object.values(CAUSAL_JUDGE_EVIDENCE_AUTHORITY));
const USES = new Set(Object.values(CAUSAL_JUDGE_PERMITTED_USE));
const TIMINGS = new Set(Object.values(CAUSAL_JUDGE_EVIDENCE_TIMING));
const HASH = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 256 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail == null ? `CAUSAL_JUDGE_${code}`
    : `CAUSAL_JUDGE_${code}:${detail}`);
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

function same(left, right) { return canonicalizeStrict(left) === canonicalizeStrict(right); }

function digest(domain, value) {
  const bytes = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(`${domain}\0${bytes}`).digest("hex")}`;
}

function bytesDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${code}_INVALID`);
  return value;
}

function sourceId(value, code = "SOURCE_ID") {
  if (typeof value !== "string" || !SOURCE_ID.test(value)) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function hashes(values, code, { minimum = 0, maximum = 256 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(`${code}_INVALID`);
  const output = [...new Set(values)].sort();
  if (output.length !== values.length) fail(`${code}_DUPLICATE`);
  return output;
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

function integer(value, code, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function asBytes(value, code) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  fail(`${code}_BYTES_REQUIRED`);
}

function normalizedPublicKey(publicKeyPem, code = "PUBLIC_KEY") {
  try {
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512) fail(`${code}_INVALID`);
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail(`${code}_NOT_ED25519`);
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (String(error?.message ?? "").startsWith("CAUSAL_JUDGE_")) throw error;
    fail(`${code}_INVALID`);
  }
}

export function causalJudgeKeyId(publicKeyPem) {
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
    return { privateKey, publicKeyPem, keyId: causalJudgeKeyId(publicKeyPem) };
  } catch (error) {
    if (String(error?.message ?? "").startsWith("CAUSAL_JUDGE_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

function signaturePayload(role, artifactHash) {
  return canonicalizeStrict({ schema: CAUSAL_JUDGE_SCHEMAS.signature, role, artifactHash });
}

function signArtifact(role, artifactHash, privateKeyPem) {
  const identity = privateIdentity(privateKeyPem);
  return {
    algorithm: "Ed25519", role, keyId: identity.keyId,
    publicKeyPem: identity.publicKeyPem,
    value: cryptoSign(null, Buffer.from(signaturePayload(role, artifactHash)),
      identity.privateKey).toString("base64"),
  };
}

function verifySignature(signature, role, artifactHash, authority = null) {
  try {
    if (!exactKeys(signature, ["algorithm", "role", "keyId", "publicKeyPem", "value"])
      || signature.algorithm !== "Ed25519" || signature.role !== role
      || !KEY_ID.test(signature.keyId ?? "")
      || signature.keyId !== causalJudgeKeyId(signature.publicKeyPem)
      || typeof signature.value !== "string"
      || Buffer.from(signature.value, "base64").length !== 64
      || authority && (signature.keyId !== authority.keyId
        || normalizedPublicKey(signature.publicKeyPem) !== authority.publicKeyPem)) return false;
    return cryptoVerify(null, Buffer.from(signaturePayload(role, artifactHash)),
      createPublicKey(signature.publicKeyPem), Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function sealSigned(body, hashField, role, privateKeyPem) {
  if (!privateKeyPem) fail(`${role}_SIGNING_KEY_REQUIRED`);
  const artifactHash = digest(body.schema, body);
  return deepFreeze({ ...body, [hashField]: artifactHash,
    signature: signArtifact(role, artifactHash, privateKeyPem) });
}

function boundary() {
  return {
    authority: "LOCAL_CONFIGURED_POLICY_CONFORMANCE_ONLY",
    externalRealityEstablished: false,
    institutionalIndependenceEstablished: false,
    authoritativeMeasuredSurvivalEstablished: false,
    causalExperienceUnits: 0,
    learningPermitted: false,
    productionUsePermitted: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function validBoundary(value) { return same(value, boundary()); }

function sourceAxes(value, { measurement = false } = {}) {
  if (!exactKeys(value, ["sourceReality", "evidenceAuthority", "permittedUse",
    "evidenceTiming"]) || !REALITIES.has(value.sourceReality)
    || !AUTHORITIES.has(value.evidenceAuthority) || !USES.has(value.permittedUse)
    || !TIMINGS.has(value.evidenceTiming)) fail("SOURCE_AXES_INVALID");
  if (measurement && (![
    CAUSAL_JUDGE_SOURCE_REALITY.realPhysical,
    CAUSAL_JUDGE_SOURCE_REALITY.realSoftware,
    CAUSAL_JUDGE_SOURCE_REALITY.controlledRealApp,
  ].includes(value.sourceReality)
    || value.evidenceAuthority
      !== CAUSAL_JUDGE_EVIDENCE_AUTHORITY.prospectiveConfiguredRoleSeparation
    || value.permittedUse !== CAUSAL_JUDGE_PERMITTED_USE.measureCandidate
    || value.evidenceTiming !== CAUSAL_JUDGE_EVIDENCE_TIMING.prospective)) {
    fail("SOURCE_AXES_NOT_PROSPECTIVE_MEASUREMENT");
  }
  return { ...value };
}

function authority(value, role) {
  if (!exactKeys(value, ["role", "actorType", "keyId", "publicKeyPem",
    "organizationHash"]) || value.role !== role
    || value.actorType !== "HUMAN_OR_INSTITUTION" || !KEY_ID.test(value.keyId ?? "")) {
    fail("ROLE_AUTHORITY_INVALID", role);
  }
  const publicKeyPem = normalizedPublicKey(value.publicKeyPem, "ROLE_PUBLIC_KEY");
  if (value.keyId !== causalJudgeKeyId(publicKeyPem)) fail("ROLE_KEY_ID_MISMATCH", role);
  return { role, actorType: value.actorType, keyId: value.keyId, publicKeyPem,
    organizationHash: hash(value.organizationHash, "ROLE_ORGANIZATION") };
}

function policyBody(input) {
  if (!Array.isArray(input.roleAuthorities) || input.roleAuthorities.length !== ROLES.length) {
    fail("POLICY_ROLE_AUTHORITIES_INCOMPLETE");
  }
  const byRole = new Map(input.roleAuthorities.map((item) => [item.role, item]));
  if (byRole.size !== ROLES.length || ROLES.some((role) => !byRole.has(role))) {
    fail("POLICY_ROLE_AUTHORITIES_INCOMPLETE");
  }
  const roleAuthorities = ROLES.map((role) => authority(byRole.get(role), role));
  if (new Set(roleAuthorities.map((item) => item.keyId)).size !== ROLES.length
    || new Set(roleAuthorities.map((item) => item.organizationHash)).size !== ROLES.length) {
    fail("POLICY_ROLES_NOT_INDEPENDENT");
  }
  const issuedAt = canonicalTime(input.issuedAt, "POLICY_ISSUED_AT");
  const validFrom = canonicalTime(input.validFrom, "POLICY_VALID_FROM");
  const validUntil = canonicalTime(input.validUntil, "POLICY_VALID_UNTIL");
  if (Date.parse(issuedAt) > Date.parse(validFrom)
    || Date.parse(validUntil) <= Date.parse(validFrom)) fail("POLICY_TIME_WINDOW_INVALID");
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.governancePolicy,
    schemaVersion: "1.0.0",
    policyId: token(input.policyId, "POLICY_ID"), issuedAt, validFrom, validUntil,
    governanceOrganizationHash: hash(input.governanceOrganizationHash,
      "POLICY_GOVERNANCE_ORGANIZATION"),
    roleAuthorities,
    protocol: {
      hypothesisPreregisteredBeforeAssignmentAndExecution: true,
      randomizedControlAssignmentRequired: true,
      fullSourceReplayRequired: true,
      independentOutcomeAndAdjudicationRequired: true,
      completePlannedTestsRequired: true,
      semanticIdentityCorrelationDedupRequired: true,
      modelOrSignerSelfEvaluationPermitted: false,
    },
    boundary: boundary(),
  };
}

export function createCausalJudgeGovernancePolicy(input = {}, {
  governancePrivateKeyPem,
} = {}) {
  return sealSigned(policyBody(input), "policyHash", "GOVERNANCE_ROOT",
    governancePrivateKeyPem);
}

export function verifyCausalJudgeGovernancePolicy(policy, {
  pinnedGovernanceKeyIds = [], at = null,
} = {}) {
  try {
    if (!Array.isArray(pinnedGovernanceKeyIds) || pinnedGovernanceKeyIds.length < 1
      || pinnedGovernanceKeyIds.some((item) => !KEY_ID.test(String(item ?? "")))) {
      fail("POLICY_TRUST_ANCHOR_REQUIRED");
    }
    if (!plain(policy) || policy.schema !== CAUSAL_JUDGE_SCHEMAS.governancePolicy
      || policy.schemaVersion !== "1.0.0" || !HASH.test(policy.policyHash ?? "")) {
      fail("POLICY_INVALID");
    }
    const { policyHash, signature, ...actual } = policy;
    const expected = policyBody(policy);
    if (!same(actual, expected) || policyHash !== digest(policy.schema, expected)
      || !verifySignature(signature, "GOVERNANCE_ROOT", policyHash)
      || !pinnedGovernanceKeyIds.includes(signature.keyId) || !validBoundary(policy.boundary)) {
      fail("POLICY_VERIFICATION_FAILED");
    }
    if (at !== null) {
      const instant = Date.parse(canonicalTime(at, "POLICY_CHECK_TIME"));
      if (instant < Date.parse(policy.validFrom) || instant >= Date.parse(policy.validUntil)) {
        fail("POLICY_NOT_ACTIVE");
      }
    }
    return Object.freeze({ ok: true, policyHash,
      governanceKeyId: signature.keyId, externalAdoptionClaimed: false });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function roleAuthority(policy, role) {
  const found = policy?.roleAuthorities?.find((item) => item.role === role);
  if (!found) fail("POLICY_ROLE_NOT_FOUND", role);
  return found;
}

function verifySignedBody(record, { schema, hashField, role, builder, policy }) {
  if (!plain(record) || record.schema !== schema || record.schemaVersion !== "1.0.0"
    || !HASH.test(record[hashField] ?? "") || !plain(record.signature)) return false;
  const { [hashField]: artifactHash, signature, ...actual } = record;
  let expected;
  try { expected = builder(record); } catch { return false; }
  return same(actual, expected) && artifactHash === digest(schema, expected)
    && verifySignature(signature, role, artifactHash, roleAuthority(policy, role));
}

function plannedTests(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    fail("HYPOTHESIS_PLANNED_TESTS_INVALID");
  }
  const output = value.map((item) => {
    if (!exactKeys(item, ["testId", "interventionHash", "controlHash",
      "outcomeSpecificationHash", "minimumUnitsPerArm"])) {
      fail("HYPOTHESIS_PLANNED_TEST_INVALID");
    }
    return {
      testId: token(item.testId, "HYPOTHESIS_TEST_ID"),
      interventionHash: hash(item.interventionHash, "HYPOTHESIS_INTERVENTION"),
      controlHash: hash(item.controlHash, "HYPOTHESIS_CONTROL"),
      outcomeSpecificationHash: hash(item.outcomeSpecificationHash,
        "HYPOTHESIS_OUTCOME_SPECIFICATION"),
      minimumUnitsPerArm: integer(item.minimumUnitsPerArm,
        "HYPOTHESIS_MINIMUM_UNITS_PER_ARM", { minimum: 1, maximum: 100000 }),
    };
  }).sort((left, right) => left.testId.localeCompare(right.testId));
  if (new Set(output.map((item) => item.testId)).size !== output.length) {
    fail("HYPOTHESIS_TEST_ID_DUPLICATE");
  }
  return output;
}

function hypothesisBody(input) {
  const registeredAt = canonicalTime(input.registeredAt, "HYPOTHESIS_REGISTERED_AT");
  if (!exactKeys(input.assignmentWindow, ["notBefore", "notAfter"])
    || !exactKeys(input.executionWindow, ["notBefore", "notAfter"])) {
    fail("HYPOTHESIS_WINDOWS_INVALID");
  }
  const assignmentWindow = {
    notBefore: canonicalTime(input.assignmentWindow.notBefore,
      "HYPOTHESIS_ASSIGNMENT_NOT_BEFORE"),
    notAfter: canonicalTime(input.assignmentWindow.notAfter,
      "HYPOTHESIS_ASSIGNMENT_NOT_AFTER"),
  };
  const executionWindow = {
    notBefore: canonicalTime(input.executionWindow.notBefore,
      "HYPOTHESIS_EXECUTION_NOT_BEFORE"),
    notAfter: canonicalTime(input.executionWindow.notAfter,
      "HYPOTHESIS_EXECUTION_NOT_AFTER"),
  };
  if (Date.parse(registeredAt) >= Date.parse(assignmentWindow.notBefore)
    || Date.parse(assignmentWindow.notAfter) > Date.parse(executionWindow.notBefore)
    || Date.parse(assignmentWindow.notAfter) <= Date.parse(assignmentWindow.notBefore)
    || Date.parse(executionWindow.notAfter) <= Date.parse(executionWindow.notBefore)) {
    fail("HYPOTHESIS_TIME_ORDER_INVALID");
  }
  if (!SEMVER.test(String(input.hypothesisVersion ?? ""))) {
    fail("HYPOTHESIS_VERSION_INVALID");
  }
  if (!exactKeys(input.proposedBy, ["actorType", "actorHash"])
    || !["HUMAN", "MODEL"].includes(input.proposedBy.actorType)) {
    fail("HYPOTHESIS_PROPOSER_INVALID");
  }
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.hypothesis,
    schemaVersion: "1.0.0",
    hypothesisId: token(input.hypothesisId, "HYPOTHESIS_ID"),
    hypothesisVersion: input.hypothesisVersion,
    semanticHash: hash(input.semanticHash, "HYPOTHESIS_SEMANTIC_HASH"),
    identityHash: hash(input.identityHash, "HYPOTHESIS_IDENTITY_HASH"),
    mechanismHash: hash(input.mechanismHash, "HYPOTHESIS_MECHANISM_HASH"),
    falsificationRuleHash: hash(input.falsificationRuleHash,
      "HYPOTHESIS_FALSIFICATION_RULE_HASH"),
    proposedBy: { actorType: input.proposedBy.actorType,
      actorHash: hash(input.proposedBy.actorHash, "HYPOTHESIS_PROPOSER_HASH") },
    registeredAt, assignmentWindow, executionWindow,
    populationHash: hash(input.populationHash, "HYPOTHESIS_POPULATION_HASH"),
    plannedTests: plannedTests(input.plannedTests),
    correlationRootHashes: hashes(input.correlationRootHashes,
      "HYPOTHESIS_CORRELATION_ROOTS", { minimum: 1, maximum: 128 }),
    sourceAxes: sourceAxes(input.sourceAxes, { measurement: true }),
    registrarOrganizationHash: hash(input.registrarOrganizationHash,
      "HYPOTHESIS_REGISTRAR_ORGANIZATION"),
    protocolControls: {
      immutableVersionedHypothesis: true,
      preregisteredBeforeAssignment: true,
      preregisteredBeforeExecution: true,
      postOutcomeMutationPermitted: false,
      proposerMaySelfEvaluate: false,
    },
    boundary: boundary(),
  };
}

export function createCausalHypothesisPreregistration(input, {
  registrarPrivateKeyPem,
} = {}) {
  return sealSigned(hypothesisBody(input), "hypothesisHash", "HYPOTHESIS_REGISTRAR",
    registrarPrivateKeyPem);
}

export function verifyCausalHypothesisPreregistration(record, { policy } = {}) {
  try {
    const role = roleAuthority(policy, "HYPOTHESIS_REGISTRAR");
    if (!verifySignedBody(record, { schema: CAUSAL_JUDGE_SCHEMAS.hypothesis,
      hashField: "hypothesisHash", role: "HYPOTHESIS_REGISTRAR",
      builder: hypothesisBody, policy })
      || record.registrarOrganizationHash !== role.organizationHash
      || Date.parse(record.registeredAt) < Date.parse(policy.validFrom)
      || Date.parse(record.executionWindow.notAfter) > Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("HYPOTHESIS_INVALID");
    return Object.freeze({ ok: true, hypothesisHash: record.hypothesisHash });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function randomScore(randomnessBytes, testId, unitHash) {
  return createHash("sha256").update("outsider/causal-judge-randomization/v1\0")
    .update(randomnessBytes).update("\0").update(testId).update("\0").update(unitHash)
    .digest("hex");
}

function normalizedUnits(testId, units, minimumPerArm, randomnessBytes) {
  if (!Array.isArray(units) || units.length < minimumPerArm * 2 || units.length > 200000) {
    fail("ASSIGNMENT_UNITS_INVALID", testId);
  }
  const normalized = units.map((item) => {
    if (!exactKeys(item, ["unitHash", "correlationRootHashes"])) {
      fail("ASSIGNMENT_UNIT_INVALID", testId);
    }
    return { unitHash: hash(item.unitHash, "ASSIGNMENT_UNIT_HASH"),
      correlationRootHashes: hashes(item.correlationRootHashes,
        "ASSIGNMENT_UNIT_CORRELATION_ROOTS", { minimum: 1, maximum: 32 }) };
  });
  if (new Set(normalized.map((item) => item.unitHash)).size !== normalized.length) {
    fail("ASSIGNMENT_UNIT_DUPLICATE", testId);
  }
  const ranked = normalized.map((item) => ({ ...item,
    rank: randomScore(randomnessBytes, testId, item.unitHash) }))
    .sort((left, right) => left.rank.localeCompare(right.rank)
      || left.unitHash.localeCompare(right.unitHash));
  const interventionCount = Math.floor(ranked.length / 2);
  return ranked.map((item, index) => ({ unitHash: item.unitHash,
    correlationRootHashes: item.correlationRootHashes,
    arm: index < interventionCount ? "INTERVENTION" : "CONTROL" }))
    .sort((left, right) => left.unitHash.localeCompare(right.unitHash));
}

function assignmentSourceBody(assignment) {
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.assignmentSource,
    schemaVersion: "1.0.0",
    hypothesisHash: assignment.hypothesisHash,
    randomizationSourceId: assignment.randomizationSourceId,
    randomizationSourceHash: assignment.randomizationSourceHash,
    randomizationAlgorithm: assignment.randomizationAlgorithm,
    testAssignments: assignment.testAssignments,
  };
}

export function renderCausalJudgeAssignmentSource(assignment) {
  return Buffer.from(`${canonicalizeStrict(assignmentSourceBody(assignment))}\n`, "utf8");
}

function assignmentBody(input, { hypothesis, randomizationBytes }) {
  const hypothesisCheck = verifyCausalHypothesisPreregistration(hypothesis,
    { policy: input.policy });
  if (!hypothesisCheck.ok) fail("ASSIGNMENT_HYPOTHESIS_INVALID", hypothesisCheck.error);
  const assignedAt = canonicalTime(input.assignedAt, "ASSIGNMENT_TIME");
  if (Date.parse(assignedAt) < Date.parse(hypothesis.assignmentWindow.notBefore)
    || Date.parse(assignedAt) >= Date.parse(hypothesis.assignmentWindow.notAfter)
    || Date.parse(assignedAt) <= Date.parse(hypothesis.registeredAt)) {
    fail("ASSIGNMENT_TIME_ORDER_INVALID");
  }
  const randomBytes = asBytes(randomizationBytes, "ASSIGNMENT_RANDOMIZATION");
  if (randomBytes.length < 16 || randomBytes.length > MAX_SOURCE_BYTES) {
    fail("ASSIGNMENT_RANDOMIZATION_SIZE_INVALID");
  }
  if (!Array.isArray(input.testUnits)) fail("ASSIGNMENT_TEST_UNITS_INVALID");
  const unitsByTest = new Map(input.testUnits.map((row) => [row.testId, row.units]));
  if (unitsByTest.size !== input.testUnits.length
    || unitsByTest.size !== hypothesis.plannedTests.length
    || hypothesis.plannedTests.some((test) => !unitsByTest.has(test.testId))) {
    fail("ASSIGNMENT_PLANNED_TEST_SET_MISMATCH");
  }
  const body = {
    schema: CAUSAL_JUDGE_SCHEMAS.assignment,
    schemaVersion: "1.0.0",
    hypothesisHash: hypothesis.hypothesisHash,
    assignedAt,
    randomizationSourceId: sourceId(input.randomizationSourceId,
      "ASSIGNMENT_RANDOMIZATION_SOURCE_ID"),
    assignmentLedgerSourceId: sourceId(input.assignmentLedgerSourceId,
      "ASSIGNMENT_LEDGER_SOURCE_ID"),
    randomizationSourceHash: bytesDigest(randomBytes),
    randomizationAlgorithm: "SHA256_BALANCED_BLOCK_V1",
    testAssignments: hypothesis.plannedTests.map((test) => ({ testId: test.testId,
      units: normalizedUnits(test.testId, unitsByTest.get(test.testId),
        test.minimumUnitsPerArm, randomBytes) })),
    assignmentOrganizationHash: hash(input.assignmentOrganizationHash,
      "ASSIGNMENT_ORGANIZATION"),
    assignmentControls: {
      randomized: true, interventionAndControlRequired: true,
      assignmentBeforeExecution: true, correlationRootsDisclosed: true,
    },
    boundary: boundary(),
  };
  const sourceBytes = Buffer.from(`${canonicalizeStrict(assignmentSourceBody(body))}\n`, "utf8");
  return { ...body, assignmentLedgerSourceHash: bytesDigest(sourceBytes) };
}

export function createRandomizedControlAssignment(input, {
  policy, hypothesis, assignmentPrivateKeyPem, randomizationBytes,
} = {}) {
  return sealSigned(assignmentBody({ ...input, policy }, { hypothesis, randomizationBytes }),
    "assignmentHash", "ASSIGNMENT_ATTESTOR", assignmentPrivateKeyPem);
}

function replayAssignment(record, { policy, hypothesis, sources }) {
  const randomBytes = sourceBytes(sources, record.randomizationSourceId);
  const expected = assignmentBody({ ...record, policy,
    testUnits: record.testAssignments.map((test) => ({ testId: test.testId,
      units: test.units.map(({ unitHash, correlationRootHashes }) =>
        ({ unitHash, correlationRootHashes })) })) }, { hypothesis,
    randomizationBytes: randomBytes });
  const ledgerBytes = sourceBytes(sources, record.assignmentLedgerSourceId);
  if (bytesDigest(ledgerBytes) !== record.assignmentLedgerSourceHash
    || !ledgerBytes.equals(renderCausalJudgeAssignmentSource(record))) {
    fail("ASSIGNMENT_LEDGER_SOURCE_REPLAY_FAILED");
  }
  return expected;
}

export function verifyRandomizedControlAssignment(record, {
  policy, hypothesis, sources,
} = {}) {
  try {
    const expected = replayAssignment(record, { policy, hypothesis, sources });
    const role = roleAuthority(policy, "ASSIGNMENT_ATTESTOR");
    const { assignmentHash, signature, ...actual } = record;
    if (!same(actual, expected) || assignmentHash !== digest(record.schema, expected)
      || !verifySignature(signature, "ASSIGNMENT_ATTESTOR", assignmentHash, role)
      || record.assignmentOrganizationHash !== role.organizationHash
      || !validBoundary(record.boundary)) fail("ASSIGNMENT_INVALID");
    return Object.freeze({ ok: true, assignmentHash,
      sourceReplayed: true, randomizedControlVerified: true });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function sourceBytes(sources, id) {
  if (!plain(sources) || !Object.prototype.hasOwnProperty.call(sources, id)) {
    fail("SOURCE_BYTES_MISSING", id);
  }
  return asBytes(sources[id], `SOURCE_${id}`);
}

function manifestEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 1024) {
    fail("SOURCE_MANIFEST_ENTRIES_INVALID");
  }
  const output = entries.map((entry) => {
    if (!exactKeys(entry, ["sourceId", "purpose", "mediaType", "sha256", "sizeBytes"])
      || !SOURCE_PURPOSES.has(entry.purpose)
      || typeof entry.mediaType !== "string" || entry.mediaType.length < 1
      || entry.mediaType.length > 128) fail("SOURCE_MANIFEST_ENTRY_INVALID");
    return { sourceId: sourceId(entry.sourceId), purpose: entry.purpose,
      mediaType: entry.mediaType, sha256: hash(entry.sha256, "SOURCE_MANIFEST_SHA256"),
      sizeBytes: integer(entry.sizeBytes, "SOURCE_MANIFEST_SIZE", {
        minimum: 1, maximum: MAX_SOURCE_BYTES }) };
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (new Set(output.map((item) => item.sourceId)).size !== output.length) {
    fail("SOURCE_MANIFEST_ID_DUPLICATE");
  }
  return output;
}

export function createCausalJudgeSourceManifest(sourceDescriptors) {
  if (!Array.isArray(sourceDescriptors)) fail("SOURCE_DESCRIPTORS_INVALID");
  const entries = sourceDescriptors.map(({ sourceId: id, purpose, mediaType, bytes }) => {
    const content = asBytes(bytes, `SOURCE_${id}`);
    if (content.length < 1 || content.length > MAX_SOURCE_BYTES) fail("SOURCE_SIZE_INVALID", id);
    return { sourceId: sourceId(id), purpose, mediaType,
      sha256: bytesDigest(content), sizeBytes: content.length };
  });
  const body = { schema: CAUSAL_JUDGE_SCHEMAS.sourceManifest,
    schemaVersion: "1.0.0", entries: manifestEntries(entries) };
  return deepFreeze({ ...body, manifestHash: digest(body.schema, body) });
}

export function verifyCausalJudgeSourceManifest(record, sources, {
  requireMeasurementPurposes = true, requireExactSourceSet = true,
} = {}) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "entries", "manifestHash"])
      || record.schema !== CAUSAL_JUDGE_SCHEMAS.sourceManifest
      || record.schemaVersion !== "1.0.0") fail("SOURCE_MANIFEST_INVALID");
    const body = { schema: record.schema, schemaVersion: record.schemaVersion,
      entries: manifestEntries(record.entries) };
    const { manifestHash, ...actual } = record;
    if (!same(actual, body)
      || record.manifestHash !== digest(record.schema, body)) fail("SOURCE_MANIFEST_HASH_INVALID");
    if (!plain(sources)) fail("SOURCE_MAP_INVALID");
    const sourceKeys = Object.keys(sources).sort();
    const manifestKeys = record.entries.map((entry) => entry.sourceId).sort();
    if (requireExactSourceSet && !same(sourceKeys, manifestKeys)) fail("SOURCE_SET_NOT_EXACT");
    let total = 0;
    for (const entry of record.entries) {
      const content = sourceBytes(sources, entry.sourceId);
      total += content.length;
      if (content.length !== entry.sizeBytes || bytesDigest(content) !== entry.sha256) {
        fail("SOURCE_REPLAY_MISMATCH", entry.sourceId);
      }
    }
    if (total > MAX_TOTAL_SOURCE_BYTES) fail("SOURCE_BUNDLE_OVERSIZE");
    if (requireMeasurementPurposes) {
      const purposes = new Set(record.entries.map((entry) => entry.purpose));
      if (REQUIRED_SOURCE_PURPOSES.some((purpose) => !purposes.has(purpose))) {
        fail("SOURCE_PURPOSES_INCOMPLETE");
      }
    }
    return Object.freeze({ ok: true, manifestHash: record.manifestHash,
      sourceCount: record.entries.length, totalBytes: total, fullSourceReplayed: true });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function testExecutions(value, hypothesis, assignment, sourceManifest) {
  if (!Array.isArray(value) || value.length !== hypothesis.plannedTests.length) {
    fail("EXECUTION_PLANNED_TEST_SET_INCOMPLETE");
  }
  const sourceIds = new Set(sourceManifest.entries.map((entry) => entry.sourceId));
  const purposeBySource = new Map(sourceManifest.entries.map((entry) =>
    [entry.sourceId, entry.purpose]));
  const assignmentByTest = new Map(assignment.testAssignments.map((row) => [row.testId, row]));
  const output = value.map((row) => {
    if (!exactKeys(row, ["testId", "unitOutcomes"])) fail("EXECUTION_TEST_INVALID");
    const planned = hypothesis.plannedTests.find((item) => item.testId === row.testId);
    const assigned = assignmentByTest.get(row.testId);
    if (!planned || !assigned || !Array.isArray(row.unitOutcomes)
      || row.unitOutcomes.length !== assigned.units.length) fail("EXECUTION_TEST_INCOMPLETE");
    const unitOutcomes = row.unitOutcomes.map((outcome) => {
      if (!exactKeys(outcome, ["unitHash", "arm", "outcomeHash", "sourceIds"])
        || !["INTERVENTION", "CONTROL"].includes(outcome.arm)) {
        fail("EXECUTION_UNIT_OUTCOME_INVALID");
      }
      const ids = [...new Set((outcome.sourceIds ?? []).map((id) => sourceId(id)))].sort();
      if (ids.length < 1 || ids.some((id) => !sourceIds.has(id))) {
        fail("EXECUTION_UNIT_SOURCE_UNBOUND");
      }
      const purposes = new Set(ids.map((id) => purposeBySource.get(id)));
      if (!purposes.has("EXECUTION_TRACE") || !purposes.has("OUTCOME_OBSERVATIONS")) {
        fail("EXECUTION_UNIT_SOURCE_PURPOSES_INCOMPLETE");
      }
      return { unitHash: hash(outcome.unitHash, "EXECUTION_UNIT_HASH"), arm: outcome.arm,
        outcomeHash: hash(outcome.outcomeHash, "EXECUTION_OUTCOME_HASH"), sourceIds: ids };
    }).sort((left, right) => left.unitHash.localeCompare(right.unitHash));
    if (!same(unitOutcomes.map(({ unitHash, arm }) => ({ unitHash, arm })),
      assigned.units.map(({ unitHash, arm }) => ({ unitHash, arm })))) {
      fail("EXECUTION_ASSIGNMENT_REPLAY_MISMATCH");
    }
    return { testId: row.testId, unitOutcomes };
  }).sort((left, right) => left.testId.localeCompare(right.testId));
  if (!same(output.map((row) => row.testId), hypothesis.plannedTests.map((row) => row.testId))) {
    fail("EXECUTION_PLANNED_TEST_SET_INCOMPLETE");
  }
  return output;
}

function executionBody(input, { hypothesis, assignment }) {
  const startedAt = canonicalTime(input.startedAt, "EXECUTION_STARTED_AT");
  const completedAt = canonicalTime(input.completedAt, "EXECUTION_COMPLETED_AT");
  if (Date.parse(startedAt) < Date.parse(hypothesis.executionWindow.notBefore)
    || Date.parse(startedAt) <= Date.parse(assignment.assignedAt)
    || Date.parse(completedAt) <= Date.parse(startedAt)
    || Date.parse(completedAt) > Date.parse(hypothesis.executionWindow.notAfter)) {
    fail("EXECUTION_TIME_ORDER_INVALID");
  }
  const manifest = input.sourceManifest;
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.execution,
    schemaVersion: "1.0.0",
    hypothesisHash: hypothesis.hypothesisHash,
    assignmentHash: assignment.assignmentHash,
    sourceAxes: sourceAxes(input.sourceAxes, { measurement: true }),
    sourceManifest: manifest,
    sourceManifestHash: hash(manifest?.manifestHash, "EXECUTION_SOURCE_MANIFEST_HASH"),
    startedAt, completedAt,
    testExecutions: testExecutions(input.testExecutions, hypothesis, assignment, manifest),
    executionOrganizationHash: hash(input.executionOrganizationHash,
      "EXECUTION_ORGANIZATION"),
    executionControls: {
      allAssignedUnitsObserved: true, allPlannedTestsCompleted: true,
      interventionAndControlObserved: true, sourceManifestClosed: true,
    },
    boundary: boundary(),
  };
}

export function createProspectiveCausalJudgeExecution(input, {
  hypothesis, assignment, executionPrivateKeyPem,
} = {}) {
  return sealSigned(executionBody(input, { hypothesis, assignment }), "executionHash",
    "EXECUTION_ATTESTOR", executionPrivateKeyPem);
}

export function verifyProspectiveCausalJudgeExecution(record, {
  policy, hypothesis, assignment, sources,
} = {}) {
  try {
    const hypothesisCheck = verifyCausalHypothesisPreregistration(hypothesis, { policy });
    const assignmentCheck = verifyRandomizedControlAssignment(assignment,
      { policy, hypothesis, sources });
    const manifestCheck = verifyCausalJudgeSourceManifest(record.sourceManifest, sources,
      { requireMeasurementPurposes: true, requireExactSourceSet: true });
    const role = roleAuthority(policy, "EXECUTION_ATTESTOR");
    const manifestById = new Map((record.sourceManifest?.entries ?? []).map((entry) =>
      [entry.sourceId, entry]));
    const randomizationEntry = manifestById.get(assignment.randomizationSourceId);
    const assignmentEntry = manifestById.get(assignment.assignmentLedgerSourceId);
    if (!hypothesisCheck.ok || !assignmentCheck.ok || !manifestCheck.ok
      || !verifySignedBody(record, { schema: CAUSAL_JUDGE_SCHEMAS.execution,
        hashField: "executionHash", role: "EXECUTION_ATTESTOR",
        builder: (value) => executionBody(value, { hypothesis, assignment }), policy })
      || record.hypothesisHash !== hypothesis.hypothesisHash
      || record.assignmentHash !== assignment.assignmentHash
      || record.sourceManifestHash !== record.sourceManifest.manifestHash
      || randomizationEntry?.purpose !== "RANDOMIZATION_BEACON"
      || randomizationEntry?.sha256 !== assignment.randomizationSourceHash
      || assignmentEntry?.purpose !== "ASSIGNMENT_LEDGER"
      || assignmentEntry?.sha256 !== assignment.assignmentLedgerSourceHash
      || !same(record.sourceAxes, hypothesis.sourceAxes)
      || record.executionOrganizationHash !== role.organizationHash
      || !validBoundary(record.boundary)) fail("EXECUTION_INVALID");
    return Object.freeze({ ok: true, executionHash: record.executionHash,
      sourceManifestHash: record.sourceManifestHash, fullSourceReplayed: true,
      plannedTestsComplete: true });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function outcomeBody(input, { hypothesis, execution }) {
  const assessedAt = canonicalTime(input.assessedAt, "OUTCOME_ASSESSED_AT");
  if (Date.parse(assessedAt) <= Date.parse(execution.completedAt)) {
    fail("OUTCOME_TIME_ORDER_INVALID");
  }
  if (!Array.isArray(input.testResults)
    || input.testResults.length !== hypothesis.plannedTests.length) {
    fail("OUTCOME_TEST_SET_INCOMPLETE");
  }
  const results = input.testResults.map((row) => {
    if (!exactKeys(row, ["testId", "survived", "assessmentHash"])
      || typeof row.survived !== "boolean") fail("OUTCOME_TEST_RESULT_INVALID");
    return { testId: token(row.testId, "OUTCOME_TEST_ID"), survived: row.survived,
      assessmentHash: hash(row.assessmentHash, "OUTCOME_ASSESSMENT_HASH") };
  }).sort((left, right) => left.testId.localeCompare(right.testId));
  if (!same(results.map((row) => row.testId), hypothesis.plannedTests.map((row) => row.testId))) {
    fail("OUTCOME_TEST_SET_INCOMPLETE");
  }
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.outcome,
    schemaVersion: "1.0.0",
    hypothesisHash: hypothesis.hypothesisHash,
    executionHash: execution.executionHash,
    sourceManifestHash: execution.sourceManifestHash,
    assessedAt, testResults: results,
    hypothesisSurvivedAllPlannedTests: results.every((row) => row.survived),
    assessorOrganizationHash: hash(input.assessorOrganizationHash,
      "OUTCOME_ASSESSOR_ORGANIZATION"),
    assessmentControls: {
      modelSelfEvaluationPermitted: false,
      registrarOrExecutorSelfEvaluationPermitted: false,
      completePlannedTestSetAssessed: true,
      sourceReplayRequired: true,
    },
    boundary: boundary(),
  };
}

export function createIndependentOutcomeAssessment(input, {
  hypothesis, execution, assessorPrivateKeyPem,
} = {}) {
  return sealSigned(outcomeBody(input, { hypothesis, execution }), "outcomeHash",
    "INDEPENDENT_OUTCOME_ASSESSOR", assessorPrivateKeyPem);
}

export function verifyIndependentOutcomeAssessment(record, {
  policy, hypothesis, assignment, execution, sources,
} = {}) {
  try {
    const executionCheck = verifyProspectiveCausalJudgeExecution(execution,
      { policy, hypothesis, assignment, sources });
    const role = roleAuthority(policy, "INDEPENDENT_OUTCOME_ASSESSOR");
    if (!executionCheck.ok || !verifySignedBody(record, {
      schema: CAUSAL_JUDGE_SCHEMAS.outcome, hashField: "outcomeHash",
      role: "INDEPENDENT_OUTCOME_ASSESSOR",
      builder: (value) => outcomeBody(value, { hypothesis, execution }), policy })
      || record.assessorOrganizationHash !== role.organizationHash
      || Date.parse(record.assessedAt) >= Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("OUTCOME_INVALID");
    return Object.freeze({ ok: true, outcomeHash: record.outcomeHash,
      survived: record.hypothesisSurvivedAllPlannedTests });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function adjudicationBody(input, { hypothesis, execution, outcome }) {
  if (!["ADMISSIBLE", "REJECTED"].includes(input.decision)) {
    fail("ADJUDICATION_DECISION_INVALID");
  }
  const adjudicatedAt = canonicalTime(input.adjudicatedAt, "ADJUDICATION_TIME");
  if (Date.parse(adjudicatedAt) <= Date.parse(outcome.assessedAt)) {
    fail("ADJUDICATION_TIME_ORDER_INVALID");
  }
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.adjudication,
    schemaVersion: "1.0.0",
    hypothesisHash: hypothesis.hypothesisHash,
    executionHash: execution.executionHash,
    outcomeHash: outcome.outcomeHash,
    sourceManifestHash: execution.sourceManifestHash,
    adjudicatedAt, decision: input.decision,
    adjudicationRecordHash: hash(input.adjudicationRecordHash,
      "ADJUDICATION_RECORD_HASH"),
    adjudicatorOrganizationHash: hash(input.adjudicatorOrganizationHash,
      "ADJUDICATOR_ORGANIZATION"),
    adjudicationControls: {
      hypothesisReplayRequired: true, assignmentReplayRequired: true,
      executionAndSourceReplayRequired: true, outcomeReplayRequired: true,
      sameSignerOrOrganizationPermitted: false,
    },
    boundary: boundary(),
  };
}

export function createIndependentCausalJudgeAdjudication(input, {
  hypothesis, execution, outcome, adjudicatorPrivateKeyPem,
} = {}) {
  return sealSigned(adjudicationBody(input, { hypothesis, execution, outcome }),
    "adjudicationHash", "INDEPENDENT_ADJUDICATOR", adjudicatorPrivateKeyPem);
}

export function verifyIndependentCausalJudgeAdjudication(record, {
  policy, hypothesis, assignment, execution, outcome, sources,
} = {}) {
  try {
    const outcomeCheck = verifyIndependentOutcomeAssessment(outcome,
      { policy, hypothesis, assignment, execution, sources });
    const role = roleAuthority(policy, "INDEPENDENT_ADJUDICATOR");
    if (!outcomeCheck.ok || !verifySignedBody(record, {
      schema: CAUSAL_JUDGE_SCHEMAS.adjudication, hashField: "adjudicationHash",
      role: "INDEPENDENT_ADJUDICATOR",
      builder: (value) => adjudicationBody(value, { hypothesis, execution, outcome }), policy })
      || record.adjudicatorOrganizationHash !== role.organizationHash
      || Date.parse(record.adjudicatedAt) >= Date.parse(policy.validUntil)
      || !validBoundary(record.boundary)) fail("ADJUDICATION_INVALID");
    return Object.freeze({ ok: true, adjudicationHash: record.adjudicationHash,
      decision: record.decision });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}

function evidenceBundleBody({ hypothesis, assignment, execution, outcome, adjudication }) {
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.evidenceBundle,
    schemaVersion: "1.0.0",
    hypothesis, assignment, execution, outcome, adjudication,
    bindings: {
      hypothesisHash: hypothesis.hypothesisHash,
      assignmentHash: assignment.assignmentHash,
      executionHash: execution.executionHash,
      outcomeHash: outcome.outcomeHash,
      adjudicationHash: adjudication.adjudicationHash,
      sourceManifestHash: execution.sourceManifestHash,
      policyHash: null,
    },
    sourceAxes: { ...hypothesis.sourceAxes },
    semanticHash: hypothesis.semanticHash,
    identityHash: hypothesis.identityHash,
    correlationRootHashes: [...new Set([
      ...hypothesis.correlationRootHashes,
      ...assignment.testAssignments.flatMap((test) =>
        test.units.flatMap((unit) => unit.correlationRootHashes)),
    ])].sort(),
    localConformanceDecision: adjudication.decision === "ADMISSIBLE"
      ? "ELIGIBLE_LOCAL_CONFORMANCE_ONLY" : "ABSTAIN",
    survivedAllPlannedTests: adjudication.decision === "ADMISSIBLE"
      ? outcome.hypothesisSurvivedAllPlannedTests : null,
    boundary: boundary(),
  };
}

export function buildCausalJudgeEvidenceBundle({
  hypothesis, assignment, execution, outcome, adjudication,
} = {}, { policy, sources } = {}) {
  const checked = verifyIndependentCausalJudgeAdjudication(adjudication,
    { policy, hypothesis, assignment, execution, outcome, sources });
  if (!checked.ok) fail("EVIDENCE_CHAIN_INVALID", checked.error);
  const body = evidenceBundleBody({ hypothesis, assignment, execution, outcome, adjudication });
  body.bindings.policyHash = policy.policyHash;
  return deepFreeze({ ...body, evidenceHash: digest(body.schema, body) });
}

export function verifyCausalJudgeEvidenceBundle(record, {
  policy, pinnedGovernanceKeyIds = [], sources,
} = {}) {
  try {
    const policyCheck = verifyCausalJudgeGovernancePolicy(policy,
      { pinnedGovernanceKeyIds, at: record?.adjudication?.adjudicatedAt ?? null });
    if (!policyCheck.ok || !exactKeys(record, ["schema", "schemaVersion", "hypothesis",
      "assignment", "execution", "outcome", "adjudication", "bindings", "sourceAxes",
      "semanticHash", "identityHash", "correlationRootHashes", "localConformanceDecision",
      "survivedAllPlannedTests", "boundary", "evidenceHash"])
      || record.schema !== CAUSAL_JUDGE_SCHEMAS.evidenceBundle
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.evidenceHash ?? "")) {
      fail("EVIDENCE_BUNDLE_INVALID");
    }
    const rebuilt = buildCausalJudgeEvidenceBundle(record, { policy, sources });
    if (!same(record, rebuilt) || !validBoundary(record.boundary)) {
      fail("EVIDENCE_BUNDLE_REPLAY_MISMATCH");
    }
    return Object.freeze({ ok: true, evidenceHash: record.evidenceHash,
      fullSourceReplayed: true,
      decision: record.localConformanceDecision,
      eligibleForLocalConformanceDenominator:
        record.localConformanceDecision === "ELIGIBLE_LOCAL_CONFORMANCE_ONLY",
      survived: record.survivedAllPlannedTests,
      authoritativeMeasuredSurvivalEstablished: false,
      causalExperienceUnits: 0, learningPermitted: false,
      PRICE: false, productionUsePermitted: false });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error),
      decision: "ABSTAIN", eligibleForLocalConformanceDenominator: false,
      authoritativeMeasuredSurvivalEstablished: false,
      causalExperienceUnits: 0, learningPermitted: false,
      PRICE: false, productionUsePermitted: false });
  }
}

function mechanismBody(input) {
  const axes = sourceAxes(input.sourceAxes);
  if (axes.permittedUse !== CAUSAL_JUDGE_PERMITTED_USE.mechanismOnly
    || axes.evidenceTiming === CAUSAL_JUDGE_EVIDENCE_TIMING.prospective
    || axes.evidenceAuthority
      === CAUSAL_JUDGE_EVIDENCE_AUTHORITY.prospectiveConfiguredRoleSeparation) {
    fail("MECHANISM_CANDIDATE_AXES_INVALID");
  }
  return {
    schema: CAUSAL_JUDGE_SCHEMAS.mechanismCandidate,
    schemaVersion: "1.0.0",
    candidateId: token(input.candidateId, "MECHANISM_CANDIDATE_ID"),
    semanticHash: hash(input.semanticHash, "MECHANISM_SEMANTIC_HASH"),
    sourceArtifactHash: hash(input.sourceArtifactHash, "MECHANISM_SOURCE_ARTIFACT_HASH"),
    sourceAxes: axes,
    sourceManifest: input.sourceManifest,
    sourceManifestHash: hash(input.sourceManifest?.manifestHash,
      "MECHANISM_SOURCE_MANIFEST_HASH"),
    assessment: {
      empiricalSourceRealityRetained: true,
      mechanismCandidate: true,
      survivalDenominatorContribution: 0,
      reasonCode: axes.sourceReality === CAUSAL_JUDGE_SOURCE_REALITY.simulation
        ? "SIMULATION_ONLY" : axes.evidenceTiming === CAUSAL_JUDGE_EVIDENCE_TIMING.metadataOnly
          ? "METADATA_ONLY" : "NOT_PROSPECTIVE_CONTROLLED_EVIDENCE",
    },
    boundary: boundary(),
  };
}

export function createMechanismCandidateAssessment(input, { sources } = {}) {
  const body = mechanismBody(input);
  const checked = verifyCausalJudgeSourceManifest(body.sourceManifest, sources,
    { requireMeasurementPurposes: false, requireExactSourceSet: true });
  if (!checked.ok) fail("MECHANISM_SOURCE_REPLAY_FAILED", checked.error);
  return deepFreeze({ ...body, candidateHash: digest(body.schema, body) });
}

export function verifyMechanismCandidateAssessment(record, { sources } = {}) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "candidateId", "semanticHash",
      "sourceArtifactHash", "sourceAxes", "sourceManifest", "sourceManifestHash",
      "assessment", "boundary", "candidateHash"])
      || record.schema !== CAUSAL_JUDGE_SCHEMAS.mechanismCandidate
      || record.schemaVersion !== "1.0.0") fail("MECHANISM_CANDIDATE_INVALID");
    const rebuilt = createMechanismCandidateAssessment(record, { sources });
    if (!same(record, rebuilt) || !validBoundary(record.boundary)) {
      fail("MECHANISM_CANDIDATE_REPLAY_MISMATCH");
    }
    return Object.freeze({ ok: true, candidateHash: record.candidateHash,
      fullSourceReplayed: true, empiricalSourceRealityRetained: true,
      survivalDenominatorContribution: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error),
    survivalDenominatorContribution: 0 }); }
}

function components(rows) {
  const parents = rows.map((_, index) => index);
  const find = (value) => {
    while (parents[value] !== value) { parents[value] = parents[parents[value]];
      value = parents[value]; }
    return value;
  };
  const join = (a, b) => { const ra = find(a); const rb = find(b);
    if (ra !== rb) parents[Math.max(ra, rb)] = Math.min(ra, rb); };
  const owners = new Map();
  rows.forEach((row, index) => {
    const keys = [row.semanticHash, row.identityHash, ...row.correlationRootHashes];
    for (const key of keys) {
      if (owners.has(key)) join(index, owners.get(key)); else owners.set(key, index);
    }
  });
  const grouped = new Map();
  rows.forEach((row, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(row);
  });
  return [...grouped.values()].map((items) => items.sort((a, b) =>
    a.evidenceHash.localeCompare(b.evidenceHash))).sort((a, b) =>
    a[0].evidenceHash.localeCompare(b[0].evidenceHash));
}

export function buildCausalJudgeSurvivalReport({
  policy, bundles = [], mechanismCandidates = [], createdAt,
} = {}, { pinnedGovernanceKeyIds = [], sources = {} } = {}) {
  const reportTime = canonicalTime(createdAt, "REPORT_CREATED_AT");
  const checkedPolicy = verifyCausalJudgeGovernancePolicy(policy,
    { pinnedGovernanceKeyIds, at: reportTime });
  if (!checkedPolicy.ok) fail("REPORT_POLICY_INVALID", checkedPolicy.error);
  if (!Array.isArray(bundles) || !Array.isArray(mechanismCandidates)) {
    fail("REPORT_INPUTS_INVALID");
  }
  if (bundles.some((bundle) => !Number.isFinite(Date.parse(bundle?.adjudication?.adjudicatedAt))
    || Date.parse(reportTime) <= Date.parse(bundle.adjudication.adjudicatedAt))) {
    fail("REPORT_CREATED_BEFORE_EVIDENCE");
  }
  const manifestIds = new Set();
  const bundleAssessments = bundles.map((bundle, inputIndex) => {
    bundle?.execution?.sourceManifest?.entries?.forEach((entry) => manifestIds.add(entry.sourceId));
    const selected = Object.fromEntries((bundle?.execution?.sourceManifest?.entries ?? [])
      .filter((entry) => Object.prototype.hasOwnProperty.call(sources, entry.sourceId))
      .map((entry) => [entry.sourceId, sources[entry.sourceId]]));
    const checked = verifyCausalJudgeEvidenceBundle(bundle,
      { policy, pinnedGovernanceKeyIds, sources: selected });
    return { inputIndex, evidenceHash: HASH.test(bundle?.evidenceHash ?? "")
      ? bundle.evidenceHash : null, decision: checked.ok ? checked.decision : "ABSTAIN",
    eligible: checked.ok && checked.eligibleForLocalConformanceDenominator,
    survived: checked.ok ? checked.survived : null,
    reason: checked.ok ? (checked.decision === "ABSTAIN" ? "ADJUDICATION_REJECTED" : null)
      : checked.error };
  });
  const mechanismAssessments = mechanismCandidates.map((candidate, inputIndex) => {
    candidate?.sourceManifest?.entries?.forEach((entry) => manifestIds.add(entry.sourceId));
    const selected = Object.fromEntries((candidate?.sourceManifest?.entries ?? [])
      .filter((entry) => Object.prototype.hasOwnProperty.call(sources, entry.sourceId))
      .map((entry) => [entry.sourceId, sources[entry.sourceId]]));
    const checked = verifyMechanismCandidateAssessment(candidate, { sources: selected });
    return { inputIndex, candidateHash: HASH.test(candidate?.candidateHash ?? "")
      ? candidate.candidateHash : null, verified: checked.ok,
    sourceReality: candidate?.sourceAxes?.sourceReality ?? null,
    denominatorContribution: 0, reason: checked.ok ? candidate.assessment.reasonCode : checked.error };
  });
  const extraSources = Object.keys(sources).filter((id) => !manifestIds.has(id));
  if (extraSources.length > 0) fail("REPORT_UNREFERENCED_SOURCE_BYTES", extraSources.sort().join(","));
  const counts = new Map();
  for (const row of bundleAssessments) if (row.evidenceHash) {
    counts.set(row.evidenceHash, (counts.get(row.evidenceHash) ?? 0) + 1);
  }
  const duplicateDisclosure = [...counts.entries()].filter(([, count]) => count > 1)
    .map(([evidenceHash, count]) => ({ evidenceHash, collapsed: count - 1 }));
  const uniqueEligible = [];
  const seen = new Set();
  for (let index = 0; index < bundles.length; index += 1) {
    const row = bundleAssessments[index];
    if (!row.eligible || !row.evidenceHash || seen.has(row.evidenceHash)) continue;
    seen.add(row.evidenceHash);
    uniqueEligible.push(bundles[index]);
  }
  const componentRows = components(uniqueEligible).map((items) => {
    const outcomes = [...new Set(items.map((item) => item.survivedAllPlannedTests))];
    const outcomeConflict = outcomes.length !== 1;
    return {
      componentHash: digest("outsider/causal-judge-correlation-component/v1",
        items.map((item) => item.evidenceHash)),
      evidenceHashes: items.map((item) => item.evidenceHash),
      semanticHashes: [...new Set(items.map((item) => item.semanticHash))].sort(),
      correlationRootHashes: [...new Set(items.flatMap((item) =>
        item.correlationRootHashes))].sort(),
      nominalCandidates: items.length,
      denominatorContribution: outcomeConflict ? 0 : 1,
      survivedContribution: outcomeConflict ? 0 : (outcomes[0] ? 1 : 0),
      decision: outcomeConflict ? "ABSTAIN_CORRELATED_OUTCOME_CONFLICT"
        : "ONE_CORRELATION_SAFE_LOCAL_CONFORMANCE_UNIT",
    };
  });
  const denominator = componentRows.reduce((sum, row) => sum + row.denominatorContribution, 0);
  const numerator = componentRows.reduce((sum, row) => sum + row.survivedContribution, 0);
  const body = {
    schema: CAUSAL_JUDGE_SCHEMAS.report,
    schemaVersion: "1.0.0",
    createdAt: reportTime,
    policyHash: policy.policyHash,
    inputSummary: { proposedHypothesisBundles: bundles.length,
      mechanismCandidates: mechanismCandidates.length },
    bundleAssessments,
    mechanismAssessments,
    d1DuplicateDisclosure: {
      inputBundles: bundles.length,
      uniqueEvidenceHashes: counts.size,
      exactDuplicatesCollapsed: [...counts.values()].reduce((sum, count) =>
        sum + Math.max(0, count - 1), 0),
      duplicates: duplicateDisclosure,
    },
    correlationDedup: {
      eligibleUniqueBundles: uniqueEligible.length,
      correlationComponents: componentRows,
      localConformanceDenominator: denominator,
      localConformanceSurvived: numerator,
      localConformanceSurvivalRate: denominator === 0 ? null : numerator / denominator,
    },
    authoritativeMeasurement: {
      denominator: 0, numerator: 0, survivalRate: null,
      established: false,
      reason: "LOCAL_KEYS_AND_SOURCE_REPLAY_DO_NOT_ESTABLISH_EXTERNAL_REALITY_OR_INSTITUTIONAL_INDEPENDENCE",
    },
    downstream: { causalExperienceUnits: 0, learningPermitted: false,
      PRICE: false, productionUsePermitted: false },
    boundary: boundary(),
  };
  return deepFreeze({ ...body, reportHash: digest(body.schema, body) });
}

export function verifyCausalJudgeSurvivalReport(record, {
  policy, pinnedGovernanceKeyIds = [], bundles = [], mechanismCandidates = [], sources = {},
} = {}) {
  try {
    if (!plain(record) || record.schema !== CAUSAL_JUDGE_SCHEMAS.report
      || record.schemaVersion !== "1.0.0" || !HASH.test(record.reportHash ?? "")) {
      fail("REPORT_INVALID");
    }
    const rebuilt = buildCausalJudgeSurvivalReport({ policy, bundles,
      mechanismCandidates, createdAt: record.createdAt }, { pinnedGovernanceKeyIds, sources });
    if (!same(record, rebuilt) || !validBoundary(record.boundary)
      || record.authoritativeMeasurement.established !== false
      || record.authoritativeMeasurement.denominator !== 0
      || Object.values(record.downstream).some((value) => value !== 0 && value !== false)) {
      fail("REPORT_REPLAY_MISMATCH");
    }
    return Object.freeze({ ok: true, reportHash: record.reportHash,
      fullSourceReplayed: true,
      proposedHypothesisBundles: record.inputSummary.proposedHypothesisBundles,
      eligibleLocalConformance: record.correlationDedup.localConformanceDenominator,
      authoritativeMeasuredDenominator: 0,
      causalExperienceUnits: 0, learningPermitted: false,
      PRICE: false, productionUsePermitted: false });
  } catch (error) { return Object.freeze({ ok: false, error: error?.message ?? String(error) }); }
}
