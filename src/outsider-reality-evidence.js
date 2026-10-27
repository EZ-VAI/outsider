/*
 * Claim-scoped reality evidence coordinates.
 *
 * A source can be highly real and highly useful for claims about its own
 * facts, phenomena, taxonomy, rates, or task distribution without thereby
 * becoming evidence of an Outsider-owned outcome, an Outsider causal effect,
 * a target price, or authority.  This research-only policy module encodes
 * that distinction as a non-compensating vector and explicit role gates.
 * It structurally verifies bound profiles; it does not replay source bytes or
 * grant execution, pricing, guarantee, settlement, or closure authority.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";

export const REALITY_EVIDENCE_SCHEMAS = Object.freeze({
  profile: "outsider/reality-evidence-profile/v2",
  assessment: "outsider/reality-evidence-assessment/v2",
});

export const REALITY_EVIDENCE_CLAIM_TYPES = Object.freeze([
  "SOURCE_FACT",
  "WORLD_PHENOMENON",
  "TAXONOMY",
  "SOURCE_DOMAIN_RATE",
  "SOURCE_DEFINED_TASK_UNIVERSE",
  "OWN_OUTCOME",
  "OUTSIDER_CAUSAL_EFFECT",
  "TARGET_PRICE",
  "EXTERNAL_GRANT_DOCUMENT_EVIDENCE",
]);

export const REALITY_EVIDENCE_ROLES = Object.freeze([
  "SCHEMA_REFERENCE",
  "WORLD_PHENOMENON_EVIDENCE",
  "TAXONOMY_EVIDENCE",
  "SOURCE_DOMAIN_BACKTEST",
  "TASK_UNIVERSE_REFERENCE",
  "TARGET_PRIOR_CANDIDATE",
  "TARGET_OUTCOME_EVIDENCE",
  "OUTSIDER_CAUSAL_EVIDENCE",
  "TARGET_PRICE_EVIDENCE",
  "EXTERNAL_GRANT_DOCUMENT_REFERENCE",
]);

const COORDINATE_VALUES = Object.freeze({
  environmentReality: Object.freeze([
    "REAL_PHYSICAL", "REAL_DIGITAL", "CONTROLLED_SIMULATION", "SYNTHETIC",
    "UNVERIFIED",
  ]),
  empiricalStatus: Object.freeze([
    "EMPIRICAL_RECORDED", "MANIFEST_DEFINITION", "SYNTHETIC_CONFORMANCE",
    "CALLER_ASSERTED",
  ]),
  sourceIntegrity: Object.freeze([
    "PINNED_REPLAY_VERIFIED", "PINNED_NOT_REPLAYED", "CALLER_ASSERTED",
  ]),
  observationExternality: Object.freeze([
    "INDEPENDENT_TRUST_DOMAIN", "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
    "ACTOR_CONTROLLED", "NOT_ESTABLISHED",
  ]),
  temporalBinding: Object.freeze([
    "PROSPECTIVE_CENSUS", "PRECOMMITTED_NOT_CENSUSED", "POST_OUTCOME",
    "NOT_APPLICABLE",
  ]),
  targetAlignment: Object.freeze([
    "SAME_TARGET_DOMAIN", "VALIDATED_TRANSFER_TO_TARGET", "SOURCE_DOMAIN_ONLY",
    "NOT_ESTABLISHED",
  ]),
  denominatorClosure: Object.freeze([
    "COMPLETE", "PARTIAL", "ABSENT", "NOT_APPLICABLE",
  ]),
  causalIdentification: Object.freeze([
    "VALID_INTERVENTION_CONTRAST", "PARTIALLY_IDENTIFIED",
    "OBSERVATIONAL_ONLY", "NONE",
  ]),
  priceGrounding: Object.freeze([
    "TARGET_LOSS_AND_EXPOSURE_BOUND", "SOURCE_LOSS_AND_EXPOSURE_ONLY", "NONE",
  ]),
  authorityBasis: Object.freeze([
    "EXTERNALLY_VERIFIED_GRANT", "DECLARED_NOT_VERIFIED", "NONE",
  ]),
});

const COORDINATE_WEIGHTS = Object.freeze({
  environmentReality: Object.freeze({ REAL_PHYSICAL: "HIGH", REAL_DIGITAL: "HIGH",
    CONTROLLED_SIMULATION: "MEDIUM", SYNTHETIC: "LOW", UNVERIFIED: "NONE" }),
  empiricalStatus: Object.freeze({ EMPIRICAL_RECORDED: "HIGH",
    MANIFEST_DEFINITION: "MEDIUM", SYNTHETIC_CONFORMANCE: "LOW",
    CALLER_ASSERTED: "NONE" }),
  sourceIntegrity: Object.freeze({ PINNED_REPLAY_VERIFIED: "HIGH",
    PINNED_NOT_REPLAYED: "MEDIUM", CALLER_ASSERTED: "NONE" }),
  observationExternality: Object.freeze({ INDEPENDENT_TRUST_DOMAIN: "HIGH",
    PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER: "HIGH", ACTOR_CONTROLLED: "LOW",
    NOT_ESTABLISHED: "NONE" }),
  temporalBinding: Object.freeze({ PROSPECTIVE_CENSUS: "HIGH",
    PRECOMMITTED_NOT_CENSUSED: "MEDIUM", POST_OUTCOME: "LOW",
    NOT_APPLICABLE: "NONE" }),
  targetAlignment: Object.freeze({ SAME_TARGET_DOMAIN: "HIGH",
    VALIDATED_TRANSFER_TO_TARGET: "HIGH", SOURCE_DOMAIN_ONLY: "LOW",
    NOT_ESTABLISHED: "NONE" }),
  denominatorClosure: Object.freeze({ COMPLETE: "HIGH", PARTIAL: "MEDIUM",
    ABSENT: "NONE", NOT_APPLICABLE: "NONE" }),
  causalIdentification: Object.freeze({ VALID_INTERVENTION_CONTRAST: "HIGH",
    PARTIALLY_IDENTIFIED: "MEDIUM", OBSERVATIONAL_ONLY: "LOW", NONE: "NONE" }),
  priceGrounding: Object.freeze({ TARGET_LOSS_AND_EXPOSURE_BOUND: "HIGH",
    SOURCE_LOSS_AND_EXPOSURE_ONLY: "LOW", NONE: "NONE" }),
  authorityBasis: Object.freeze({ EXTERNALLY_VERIFIED_GRANT: "HIGH",
    DECLARED_NOT_VERIFIED: "LOW", NONE: "NONE" }),
});

const REAL_ENVIRONMENTS = Object.freeze(["REAL_PHYSICAL", "REAL_DIGITAL"]);
const EXTERNAL_OBSERVATION = Object.freeze([
  "INDEPENDENT_TRUST_DOMAIN", "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
]);

export const REALITY_EVIDENCE_CLAIM_GATES = deepFreeze({
  SOURCE_FACT: {
    claimScope: "PINNED_SOURCE_ARTIFACT_FACTS_ONLY",
    requiredRoles: ["SCHEMA_REFERENCE"],
    coordinates: { sourceIntegrity: ["PINNED_REPLAY_VERIFIED"] },
    bindings: ["sourceVerificationHash"],
  },
  WORLD_PHENOMENON: {
    claimScope: "RECORDED_SOURCE_DOMAIN_PHENOMENON_NOT_CAUSAL_ATTRIBUTION",
    requiredRoles: ["WORLD_PHENOMENON_EVIDENCE"],
    coordinates: {
      environmentReality: REAL_ENVIRONMENTS,
      empiricalStatus: ["EMPIRICAL_RECORDED"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      observationExternality: EXTERNAL_OBSERVATION,
    },
    bindings: ["sourceVerificationHash", "outcomeEvidenceHash", "observerIdentityHash"],
  },
  TAXONOMY: {
    claimScope: "SOURCE_GROUNDED_TAXONOMY_ONLY",
    requiredRoles: ["TAXONOMY_EVIDENCE"],
    coordinates: {
      environmentReality: ["REAL_PHYSICAL", "REAL_DIGITAL", "CONTROLLED_SIMULATION"],
      empiricalStatus: ["EMPIRICAL_RECORDED", "MANIFEST_DEFINITION"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
    },
    bindings: ["sourceVerificationHash"],
  },
  SOURCE_DOMAIN_RATE: {
    claimScope: "COMPLETE_DEFINED_SOURCE_DOMAIN_DENOMINATOR_ONLY",
    requiredRoles: ["SOURCE_DOMAIN_BACKTEST"],
    coordinates: {
      environmentReality: REAL_ENVIRONMENTS,
      empiricalStatus: ["EMPIRICAL_RECORDED"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      denominatorClosure: ["COMPLETE"],
    },
    bindings: ["sourceVerificationHash", "denominatorDefinitionHash",
      "outcomeEvidenceHash"],
  },
  SOURCE_DEFINED_TASK_UNIVERSE: {
    claimScope: "SOURCE_DEFINED_TASK_UNIVERSE_NOT_EMPIRICAL_FREQUENCY_OR_TARGET_DISTRIBUTION",
    requiredRoles: ["TASK_UNIVERSE_REFERENCE"],
    coordinates: {
      environmentReality: ["REAL_PHYSICAL", "REAL_DIGITAL", "CONTROLLED_SIMULATION"],
      empiricalStatus: ["MANIFEST_DEFINITION"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      denominatorClosure: ["COMPLETE"],
    },
    bindings: ["sourceVerificationHash", "denominatorDefinitionHash"],
    additionalLimitations: ["EMPIRICAL_TASK_FREQUENCY", "TARGET_TASK_DISTRIBUTION",
      "TASK_EXECUTION", "TASK_OUTCOME"],
  },
  OWN_OUTCOME: {
    claimScope: "PROSPECTIVE_OUTSIDER_TARGET_OUTCOME_ONLY",
    requiredRoles: ["TARGET_OUTCOME_EVIDENCE"],
    coordinates: {
      environmentReality: REAL_ENVIRONMENTS,
      empiricalStatus: ["EMPIRICAL_RECORDED"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      observationExternality: ["INDEPENDENT_TRUST_DOMAIN"],
      temporalBinding: ["PROSPECTIVE_CENSUS"],
      targetAlignment: ["SAME_TARGET_DOMAIN"],
      denominatorClosure: ["COMPLETE"],
    },
    bindings: ["sourceVerificationHash", "cohortManifestHash", "outcomeEvidenceHash",
      "observerIdentityHash", "denominatorDefinitionHash"],
  },
  OUTSIDER_CAUSAL_EFFECT: {
    claimScope: "PINNED_INTERVENTION_CONTRAST_FOR_OUTSIDER_EFFECT_ONLY",
    requiredRoles: ["TARGET_OUTCOME_EVIDENCE", "OUTSIDER_CAUSAL_EVIDENCE"],
    coordinates: {
      environmentReality: REAL_ENVIRONMENTS,
      empiricalStatus: ["EMPIRICAL_RECORDED"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      observationExternality: ["INDEPENDENT_TRUST_DOMAIN"],
      temporalBinding: ["PROSPECTIVE_CENSUS"],
      targetAlignment: ["SAME_TARGET_DOMAIN"],
      denominatorClosure: ["COMPLETE"],
      causalIdentification: ["VALID_INTERVENTION_CONTRAST"],
    },
    bindings: ["sourceVerificationHash", "cohortManifestHash", "outcomeEvidenceHash",
      "observerIdentityHash", "denominatorDefinitionHash", "causalDesignHash",
      "judgeDefinitionHash"],
  },
  TARGET_PRICE: {
    claimScope: "EPISTEMIC_TARGET_PRICE_EVIDENCE_NOT_PERMISSION_TO_PRICE",
    requiredRoles: ["TARGET_PRIOR_CANDIDATE", "TARGET_PRICE_EVIDENCE"],
    coordinates: {
      environmentReality: REAL_ENVIRONMENTS,
      empiricalStatus: ["EMPIRICAL_RECORDED"],
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      observationExternality: EXTERNAL_OBSERVATION,
      targetAlignment: ["SAME_TARGET_DOMAIN", "VALIDATED_TRANSFER_TO_TARGET"],
      denominatorClosure: ["COMPLETE"],
      priceGrounding: ["TARGET_LOSS_AND_EXPOSURE_BOUND"],
    },
    bindings: ["sourceVerificationHash", "outcomeEvidenceHash", "observerIdentityHash",
      "denominatorDefinitionHash", "pricingDefinitionHash"],
  },
  EXTERNAL_GRANT_DOCUMENT_EVIDENCE: {
    claimScope: "EVIDENCE_OF_BOUND_EXTERNAL_GRANT_NOT_A_GRANT_BY_THIS_MODULE",
    requiredRoles: ["EXTERNAL_GRANT_DOCUMENT_REFERENCE"],
    coordinates: {
      sourceIntegrity: ["PINNED_REPLAY_VERIFIED"],
      targetAlignment: ["SAME_TARGET_DOMAIN"],
      authorityBasis: ["EXTERNALLY_VERIFIED_GRANT"],
    },
    bindings: ["sourceVerificationHash", "authorityGrantHash"],
  },
});

const STRONG_CLAIMS = Object.freeze([
  "OWN_OUTCOME", "OUTSIDER_CAUSAL_EFFECT", "TARGET_PRICE",
  "EXTERNAL_GRANT_DOCUMENT_EVIDENCE",
]);

export const REALITY_EVIDENCE_ROLE_PROMOTION_RULES = deepFreeze({
  strategy: "EXPLICIT_ROLE_PLUS_ALL_CLAIM_GATES_NO_ACCUMULATION",
  lowerRoleCombinationCanPromote: false,
  scalarWeightCanPromote: false,
  promotions: {
    TARGET_OUTCOME_EVIDENCE: {
      automatic: false,
      cannotBeInferredFrom: ["SCHEMA_REFERENCE", "WORLD_PHENOMENON_EVIDENCE",
        "TAXONOMY_EVIDENCE", "SOURCE_DOMAIN_BACKTEST",
        "TASK_UNIVERSE_REFERENCE", "TARGET_PRIOR_CANDIDATE"],
      claimGate: "OWN_OUTCOME",
    },
    OUTSIDER_CAUSAL_EVIDENCE: {
      automatic: false,
      prerequisiteRoles: ["TARGET_OUTCOME_EVIDENCE"],
      claimGate: "OUTSIDER_CAUSAL_EFFECT",
    },
    TARGET_PRICE_EVIDENCE: {
      automatic: false,
      prerequisiteRoles: ["TARGET_PRIOR_CANDIDATE"],
      claimGate: "TARGET_PRICE",
    },
    EXTERNAL_GRANT_DOCUMENT_REFERENCE: {
      automatic: false,
      cannotBeInferredFromAnyEvidenceRole: true,
      claimGate: "EXTERNAL_GRANT_DOCUMENT_EVIDENCE",
    },
  },
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const PROFILE_KEYS = ["sourceRefHash", "roles", "coordinates", "bindings"];
const COORDINATE_KEYS = Object.keys(COORDINATE_VALUES);
const BINDING_KEYS = [
  "sourceArtifactHashes", "sourceVerificationHash", "sourceDomainHash",
  "targetDomainHash", "cohortManifestHash", "outcomeEvidenceHash",
  "observerIdentityHash", "denominatorDefinitionHash", "transferValidationHash",
  "causalDesignHash", "judgeDefinitionHash", "pricingDefinitionHash",
  "authorityGrantHash",
];

function fail(code) {
  throw new TypeError(`REALITY_EVIDENCE_${code}`);
}

function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:reality-evidence:${domain}:v2\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function digestBytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!HASH.test(String(value ?? ""))) fail(code);
  return value;
}

function sortedUniqueRoles(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > REALITY_EVIDENCE_ROLES.length
    || value.some((role) => !REALITY_EVIDENCE_ROLES.includes(role))) {
    fail("ROLES_INVALID");
  }
  const roles = [...new Set(value)].sort();
  if (roles.length !== value.length) fail("ROLES_DUPLICATE");
  return roles;
}

function normalizeCoordinates(value) {
  if (!exactKeys(value, COORDINATE_KEYS)) fail("COORDINATES_SHAPE_INVALID");
  const output = {};
  for (const key of COORDINATE_KEYS) {
    if (!COORDINATE_VALUES[key].includes(value[key])) {
      fail(`COORDINATE_${key.toUpperCase()}_INVALID`);
    }
    output[key] = value[key];
  }
  if (output.environmentReality === "SYNTHETIC"
    && !["SYNTHETIC_CONFORMANCE", "CALLER_ASSERTED"].includes(output.empiricalStatus)) {
    fail("SYNTHETIC_EMPIRICAL_STATUS_INVALID");
  }
  if (output.environmentReality === "UNVERIFIED"
    && output.empiricalStatus !== "CALLER_ASSERTED") {
    fail("UNVERIFIED_EMPIRICAL_STATUS_INVALID");
  }
  return output;
}

function normalizeBindings(value, coordinates) {
  if (!exactKeys(value, BINDING_KEYS)
    || !Array.isArray(value.sourceArtifactHashes)
    || value.sourceArtifactHashes.length === 0
    || value.sourceArtifactHashes.length > 64
    || value.sourceArtifactHashes.some((item) => !HASH.test(String(item ?? "")))) {
    fail("BINDINGS_SHAPE_INVALID");
  }
  const sourceArtifactHashes = [...new Set(value.sourceArtifactHashes)].sort();
  if (sourceArtifactHashes.length !== value.sourceArtifactHashes.length) {
    fail("SOURCE_ARTIFACT_HASH_DUPLICATE");
  }
  const output = { sourceArtifactHashes };
  for (const key of BINDING_KEYS.slice(1)) {
    output[key] = hash(value[key], `BINDING_${key.toUpperCase()}_INVALID`, {
      nullable: !["sourceDomainHash"].includes(key),
    });
  }
  if (coordinates.sourceIntegrity === "PINNED_REPLAY_VERIFIED"
    && output.sourceVerificationHash === null) fail("SOURCE_VERIFICATION_REQUIRED");
  if (coordinates.observationExternality === "INDEPENDENT_TRUST_DOMAIN"
    && (output.observerIdentityHash === null || output.outcomeEvidenceHash === null)) {
    fail("INDEPENDENT_OBSERVER_BINDING_REQUIRED");
  }
  if (coordinates.observationExternality === "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER"
    && output.observerIdentityHash === null) fail("PUBLISHER_IDENTITY_BINDING_REQUIRED");
  if (coordinates.temporalBinding === "PROSPECTIVE_CENSUS"
    && output.cohortManifestHash === null) fail("PROSPECTIVE_CENSUS_BINDING_REQUIRED");
  if (coordinates.denominatorClosure === "COMPLETE"
    && output.denominatorDefinitionHash === null) fail("DENOMINATOR_BINDING_REQUIRED");
  if (coordinates.targetAlignment === "SAME_TARGET_DOMAIN"
    && (output.targetDomainHash === null
      || output.targetDomainHash !== output.sourceDomainHash)) {
    fail("SAME_TARGET_DOMAIN_BINDING_INVALID");
  }
  if (coordinates.targetAlignment === "VALIDATED_TRANSFER_TO_TARGET"
    && (output.targetDomainHash === null || output.targetDomainHash === output.sourceDomainHash
      || output.transferValidationHash === null)) {
    fail("TARGET_TRANSFER_BINDING_REQUIRED");
  }
  if (coordinates.targetAlignment === "SOURCE_DOMAIN_ONLY"
    && output.targetDomainHash !== null) fail("SOURCE_ONLY_TARGET_BINDING_INVALID");
  if (coordinates.causalIdentification === "VALID_INTERVENTION_CONTRAST"
    && (output.causalDesignHash === null || output.judgeDefinitionHash === null)) {
    fail("CAUSAL_BINDING_REQUIRED");
  }
  if (coordinates.priceGrounding === "TARGET_LOSS_AND_EXPOSURE_BOUND"
    && (output.pricingDefinitionHash === null || output.targetDomainHash === null
      || output.denominatorDefinitionHash === null || output.outcomeEvidenceHash === null)) {
    fail("TARGET_PRICE_BINDING_REQUIRED");
  }
  if (coordinates.authorityBasis === "EXTERNALLY_VERIFIED_GRANT"
    && output.authorityGrantHash === null) fail("AUTHORITY_GRANT_BINDING_REQUIRED");
  return output;
}

function fixedBoundary() {
  return {
    lane: "STAGE_0_5_RESEARCH_ONLY",
    authority: "none",
    callerSuppliedEvidenceCanEstablishHighWeight: false,
    highWeightAuthority: "CLOSED_SOURCE_BOUND_BUILT_IN_VERIFIER_ONLY",
    sourceReplayPerformedByThisModule: false,
    sourceBytesReplayedByThisModule: false,
    sourceTruthEstablishedByThisModule: false,
    scalarScore: null,
    crossCoordinateCompensation: false,
    automaticRolePromotion: false,
    automaticTraining: false,
    financialEffect: "none",
    permits: {
      EXECUTE: false,
      PRICE: false,
      GUARANTEE: false,
      SETTLE: false,
      CLOSE: false,
    },
  };
}

export function createRealityEvidenceProfile(input = {}) {
  if (!exactKeys(input, PROFILE_KEYS)) fail("PROFILE_INPUT_SHAPE_INVALID");
  const coordinates = normalizeCoordinates(input.coordinates);
  const body = {
    schema: REALITY_EVIDENCE_SCHEMAS.profile,
    schemaVersion: "2.0.0",
    sourceRefHash: hash(input.sourceRefHash, "SOURCE_REF_HASH_INVALID"),
    roles: sortedUniqueRoles(input.roles),
    coordinates,
    bindings: normalizeBindings(input.bindings, coordinates),
    boundary: fixedBoundary(),
  };
  return deepFreeze({ ...body, profileHash: digest("profile", body) });
}

export function verifyRealityEvidenceProfile(profile) {
  try {
    if (!exactKeys(profile, ["schema", "schemaVersion", ...PROFILE_KEYS, "boundary",
      "profileHash"]) || profile.schema !== REALITY_EVIDENCE_SCHEMAS.profile
      || profile.schemaVersion !== "2.0.0" || !HASH.test(profile.profileHash ?? "")
      || !same(profile.boundary, fixedBoundary())) fail("PROFILE_SHAPE_OR_BOUNDARY_INVALID");
    const rebuilt = createRealityEvidenceProfile({
      sourceRefHash: profile.sourceRefHash,
      roles: profile.roles,
      coordinates: profile.coordinates,
      bindings: profile.bindings,
    });
    if (!same(profile, rebuilt)) fail("PROFILE_CANONICAL_REPLAY_MISMATCH");
    return { ok: true, profileHash: profile.profileHash,
      structuralProfileVerified: true, sourceBytesReplayedByThisVerifier: false,
      sourceTruthEstablishedByThisVerifier: false };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function coordinateWeights() {
  return Object.fromEntries(COORDINATE_KEYS.map((key) => [key, "NONE"]));
}

function evaluateClaim(profile, claimType) {
  const rule = REALITY_EVIDENCE_CLAIM_GATES[claimType];
  if (!rule) fail("CLAIM_TYPE_INVALID");
  const missingRoles = rule.requiredRoles.filter((role) => !profile.roles.includes(role));
  const failedGates = [];
  for (const [coordinate, allowed] of Object.entries(rule.coordinates)) {
    if (!allowed.includes(profile.coordinates[coordinate])) {
      failedGates.push(`COORDINATE:${coordinate}`);
    }
  }
  for (const binding of rule.bindings) {
    if (profile.bindings[binding] === null) failedGates.push(`BINDING:${binding}`);
  }
  if (claimType === "TARGET_PRICE"
    && profile.coordinates.targetAlignment === "VALIDATED_TRANSFER_TO_TARGET"
    && profile.bindings.transferValidationHash === null) {
    failedGates.push("BINDING:transferValidationHash");
  }
  const structurallyEligible = missingRoles.length === 0 && failedGates.length === 0;
  return {
    status: structurallyEligible ? "ELIGIBLE_PENDING_SOURCE_REPLAY" : "DENIED",
    claimWeight: "NONE",
    requiredRoles: [...rule.requiredRoles],
    missingRoles,
    failedGates,
    structurallyEligible,
    promotionPermitted: false,
    highWeightAuthorized: false,
    sourceBoundPromotionRequired: structurallyEligible,
    evaluationRule: "ALL_REQUIRED_ROLES_AND_GATES_MUST_PASS",
    claimScopeOnly: true,
    claimScope: rule.claimScope,
    doesNotEstablish: [...new Set([
      ...STRONG_CLAIMS.filter((claim) => claim !== claimType),
      ...(rule.additionalLimitations ?? []),
    ])],
  };
}

const DEFINITION_BODY = deepFreeze({
  schemas: REALITY_EVIDENCE_SCHEMAS,
  claimTypes: REALITY_EVIDENCE_CLAIM_TYPES,
  roles: REALITY_EVIDENCE_ROLES,
  coordinateValues: COORDINATE_VALUES,
  coordinateWeights: COORDINATE_WEIGHTS,
  claimGates: REALITY_EVIDENCE_CLAIM_GATES,
  rolePromotionRules: REALITY_EVIDENCE_ROLE_PROMOTION_RULES,
  implementationSourceHashes: {
    realityEvidenceModule: digestBytes(readFileSync(new URL(import.meta.url))),
    canonicalizerModule: digestBytes(readFileSync(new URL("./canonical.js", import.meta.url))),
  },
});

export const REALITY_EVIDENCE_DEFINITION_HASH = digest("definition", DEFINITION_BODY);
export const REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES =
  DEFINITION_BODY.implementationSourceHashes;

export function createRealityEvidenceAssessment({ profile, claimType,
  claimBodyHash } = {}) {
  const checked = verifyRealityEvidenceProfile(profile);
  if (!checked.ok) fail(`PROFILE_INVALID:${checked.error}`);
  if (!REALITY_EVIDENCE_CLAIM_TYPES.includes(claimType)) fail("CLAIM_TYPE_INVALID");
  const body = {
    schema: REALITY_EVIDENCE_SCHEMAS.assessment,
    schemaVersion: "2.0.0",
    profileHash: profile.profileHash,
    claimType,
    claimBodyHash: hash(claimBodyHash, "CLAIM_BODY_HASH_INVALID"),
    definitionHash: REALITY_EVIDENCE_DEFINITION_HASH,
    verificationContext: {
      sourceVerificationCommitment: profile.bindings.sourceVerificationHash,
      sourceReplayPerformedByThisModule: false,
      sourceTruthEstablishedByThisModule: false,
      highWeightInterpretation:
        "GENERIC_STRUCTURAL_ELIGIBILITY_ONLY_CLOSED_SOURCE_BOUND_VERIFIER_REQUIRED",
    },
    coordinateWeights: coordinateWeights(),
    decision: evaluateClaim(profile, claimType),
    boundary: fixedBoundary(),
  };
  return deepFreeze({ ...body, assessmentHash: digest("assessment", body) });
}

export function verifyRealityEvidenceAssessment(assessment, { profile,
  claimBodyHash } = {}) {
  try {
    hash(claimBodyHash, "EXPECTED_CLAIM_BODY_HASH_INVALID");
    if (!exactKeys(assessment, ["schema", "schemaVersion", "profileHash", "claimType",
      "claimBodyHash",
      "definitionHash", "verificationContext", "coordinateWeights", "decision",
      "boundary", "assessmentHash"])
      || assessment.schema !== REALITY_EVIDENCE_SCHEMAS.assessment
      || assessment.schemaVersion !== "2.0.0"
      || assessment.definitionHash !== REALITY_EVIDENCE_DEFINITION_HASH
      || !HASH.test(assessment.claimBodyHash ?? "")
      || assessment.claimBodyHash !== claimBodyHash
      || !HASH.test(assessment.assessmentHash ?? "")
      || !same(assessment.boundary, fixedBoundary())) {
      fail("ASSESSMENT_SHAPE_OR_BOUNDARY_INVALID");
    }
    const replayed = createRealityEvidenceAssessment({ profile,
      claimType: assessment.claimType, claimBodyHash });
    if (!same(assessment, replayed)) fail("ASSESSMENT_CANONICAL_REPLAY_MISMATCH");
    return {
      ok: true,
      assessmentHash: assessment.assessmentHash,
      profileHash: assessment.profileHash,
      claimType: assessment.claimType,
      claimBodyHash: assessment.claimBodyHash,
      status: assessment.decision.status,
      claimWeight: assessment.decision.claimWeight,
      promotionPermitted: assessment.decision.promotionPermitted,
      highWeightAuthorized: false,
      scalarScore: null,
      sourceReplayPerformedByThisVerifier: false,
      sourceBytesReplayedByThisVerifier: false,
      authority: "none",
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
