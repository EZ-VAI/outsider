/*
 * Source-neutral quality policy for real cases and real experience.
 *
 * Reality, quality, rights and authority are separate axes. Public evidence is
 * not downgraded because Outsider did not collect it. Outsider-collected
 * evidence is not upgraded because Outsider did. The capability vector below
 * is derived only from explicit, claim-relevant quality dimensions.
 *
 * This module verifies policy evaluation and self-sealed structure only. It
 * does not authenticate caller-supplied quality facts. Source-aware adapters
 * must replay their bytes and exact-compare the resulting assessment before a
 * downstream artifact may call those facts source-reverified.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const REAL_CASE_QUALITY_SCHEMAS = Object.freeze({
  assessment: "outsider/real-case-quality-assessment/v1",
  policy: "outsider/real-case-quality-policy/v1",
});

export const REALITY_STATUSES = Object.freeze([
  "REAL_CASE_RECORDED",
  "REAL_EXPERIENCE_AGGREGATE",
  "REAL_INSTITUTIONAL_OPERATION",
  "CONTROLLED_REAL_EXECUTION",
  "SIMULATED_EXECUTION",
  "SYNTHETIC_GENERATED",
  "METADATA_ONLY",
]);

export const COLLECTION_RELATIONSHIPS = Object.freeze([
  "OUTSIDER_COLLECTED",
  "THIRD_PARTY_PUBLIC",
  "REGULATOR_PUBLISHED",
  "SUBJECT_REPORTED_TO_REGULATOR",
  "HUMAN_ADJUDICATED_PUBLIC_RECORD",
  "MIXED_OR_UNKNOWN",
]);

export const QUALITY_STATUSES = Object.freeze([
  "VERIFIED",
  "PARTIAL",
  "UNESTABLISHED",
  "CONTRADICTED",
  "NOT_APPLICABLE",
]);

export const QUALITY_DIMENSIONS = Object.freeze([
  "byteIdentity",
  "sourceProvenance",
  "realityLink",
  "populationFrame",
  "recordCompleteness",
  "revisionAndDedup",
  "measurementDefinition",
  "temporalOrdering",
  "exposureDenominator",
  "outcomeSensing",
  "independentOutcomeReview",
  "economicAmount",
  "adjudicationFinality",
  "dependenceStructure",
  "causalDesign",
  "capitalMeasurement",
  "custodyExecution",
  "institutionalAuthority",
  "affectedPartyStanding",
  "rightsAndConsent",
  "targetDomainTransfer",
  "privacyProjection",
  "longitudinalMaturity",
]);

export const EVIDENCE_CAPABILITIES = Object.freeze([
  "REAL_CASE_RECOGNITION",
  "CASE_TAXONOMY",
  "SELECTED_SCOPE_COMPOSITION",
  "REPORTED_OUTCOME_SENSING",
  "INDEPENDENT_OUTCOME_SENSING",
  "EXPOSURE_FREQUENCY",
  "ECONOMIC_SEVERITY",
  "RESERVE_DEVELOPMENT",
  "CAUSAL_EFFECT",
  "CAPITAL_ADEQUACY",
  "CUSTODY_EXECUTION",
  "ADJUDICATION_FINALITY",
  "LONGITUDINAL_RECOVERY",
]);

export const OPERATIONAL_CAPABILITIES = Object.freeze([
  "AUTOMATIC_TRAINING",
  "TARGET_DOMAIN_PRICE",
  "ISSUE_GUARANTEE",
  "SETTLE_CLAIM",
  "CLOSE_OR_REOPEN_OBLIGATION",
]);

export const REAL_CASE_QUALITY_INVARIANTS = Object.freeze([
  "REAL_WORLD_RECORDS_RETAIN_REAL_CASE_OR_REAL_EXPERIENCE_STATUS",
  "COLLECTOR_RELATIONSHIP_DOES_NOT_CHANGE_EPISTEMIC_ADMISSION",
  "PUBLIC_DISCOVERY_DOES_NOT_DOWNGRADE_DATA",
  "OUTSIDER_COLLECTION_DOES_NOT_UPGRADE_DATA",
  "SOURCE_REPLAY_AUTHENTICATES_BYTES_NOT_UNDERLYING_TRUTH",
  "QUALITY_ADMISSION_IS_CAPABILITY_SPECIFIC_NOT_A_SINGLE_SCORE",
  "RIGHTS_DO_NOT_CHANGE_WHAT_HAPPENED",
  "REALITY_DOES_NOT_GRANT_CAUSAL_PRICE_GUARANTEE_OR_SETTLEMENT_AUTHORITY",
  "UNMET_REQUIRED_DIMENSIONS_FAIL_CLOSED_WITHOUT_POLLUTING_ADMITTED_ROWS",
]);

const REAL = new Set([
  "REAL_CASE_RECORDED",
  "REAL_EXPERIENCE_AGGREGATE",
  "REAL_INSTITUTIONAL_OPERATION",
  "CONTROLLED_REAL_EXECUTION",
]);
const STATUS = new Set(QUALITY_STATUSES);
const RELATIONSHIP = new Set(COLLECTION_RELATIONSHIPS);
const REALITY = new Set(REALITY_STATUSES);
const HASH = /^sha256:[0-9a-f]{64}$/u;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function text(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) fail(code);
  return value;
}

function normalizedDimension(value, id) {
  if (!exactKeys(value, ["status", "basis", "evidenceHashes"])) {
    fail("REAL_CASE_QUALITY_DIMENSION_SCHEMA_INVALID");
  }
  if (!STATUS.has(value.status)) fail("REAL_CASE_QUALITY_DIMENSION_STATUS_INVALID");
  const basis = text(value.basis, "REAL_CASE_QUALITY_DIMENSION_BASIS_INVALID");
  if (!Array.isArray(value.evidenceHashes)
    || value.evidenceHashes.some((hash) => !HASH.test(hash))
    || new Set(value.evidenceHashes).size !== value.evidenceHashes.length) {
    fail("REAL_CASE_QUALITY_DIMENSION_HASHES_INVALID");
  }
  if (value.status === "VERIFIED" && value.evidenceHashes.length === 0) {
    fail("REAL_CASE_QUALITY_VERIFIED_DIMENSION_UNBOUND");
  }
  return { id, status: value.status, basis, evidenceHashes: [...value.evidenceHashes].sort() };
}

function normalizeDimensions(value) {
  if (!exactKeys(value, QUALITY_DIMENSIONS)) fail("REAL_CASE_QUALITY_DIMENSIONS_INVALID");
  return Object.fromEntries(QUALITY_DIMENSIONS.map((id) => {
    const { status, basis, evidenceHashes } = normalizedDimension(value[id], id);
    return [id, { status, basis, evidenceHashes }];
  }));
}

function isAtLeast(dimensions, id, accepted) {
  return accepted.includes(dimensions[id].status);
}

function blockers(dimensions, requirements) {
  return Object.entries(requirements)
    .filter(([id, accepted]) => !isAtLeast(dimensions, id, accepted))
    .map(([id]) => id)
    .sort();
}

const VERIFIED = Object.freeze(["VERIFIED"]);
const PARTIAL_OR_VERIFIED = Object.freeze(["PARTIAL", "VERIFIED"]);

const REQUIREMENTS = deepFreeze({
  REAL_CASE_RECOGNITION: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: PARTIAL_OR_VERIFIED,
  },
  CASE_TAXONOMY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: PARTIAL_OR_VERIFIED,
    measurementDefinition: PARTIAL_OR_VERIFIED,
    privacyProjection: PARTIAL_OR_VERIFIED,
  },
  SELECTED_SCOPE_COMPOSITION: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    populationFrame: PARTIAL_OR_VERIFIED,
    recordCompleteness: PARTIAL_OR_VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    privacyProjection: PARTIAL_OR_VERIFIED,
  },
  REPORTED_OUTCOME_SENSING: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: PARTIAL_OR_VERIFIED,
    measurementDefinition: VERIFIED,
    outcomeSensing: PARTIAL_OR_VERIFIED,
  },
  INDEPENDENT_OUTCOME_SENSING: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    outcomeSensing: VERIFIED,
    independentOutcomeReview: VERIFIED,
  },
  EXPOSURE_FREQUENCY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    populationFrame: VERIFIED,
    recordCompleteness: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    temporalOrdering: VERIFIED,
    exposureDenominator: VERIFIED,
    outcomeSensing: VERIFIED,
    dependenceStructure: VERIFIED,
  },
  ECONOMIC_SEVERITY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    outcomeSensing: VERIFIED,
    economicAmount: VERIFIED,
    adjudicationFinality: VERIFIED,
  },
  RESERVE_DEVELOPMENT: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    populationFrame: PARTIAL_OR_VERIFIED,
    recordCompleteness: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    temporalOrdering: VERIFIED,
    economicAmount: VERIFIED,
    dependenceStructure: PARTIAL_OR_VERIFIED,
  },
  CAUSAL_EFFECT: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    populationFrame: VERIFIED,
    recordCompleteness: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    temporalOrdering: VERIFIED,
    outcomeSensing: VERIFIED,
    independentOutcomeReview: VERIFIED,
    dependenceStructure: VERIFIED,
    causalDesign: VERIFIED,
  },
  CAPITAL_ADEQUACY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    recordCompleteness: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    temporalOrdering: VERIFIED,
    economicAmount: VERIFIED,
    dependenceStructure: VERIFIED,
    capitalMeasurement: VERIFIED,
  },
  CUSTODY_EXECUTION: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: VERIFIED,
    temporalOrdering: VERIFIED,
    custodyExecution: VERIFIED,
    institutionalAuthority: VERIFIED,
    affectedPartyStanding: VERIFIED,
  },
  ADJUDICATION_FINALITY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: VERIFIED,
    measurementDefinition: VERIFIED,
    adjudicationFinality: VERIFIED,
    institutionalAuthority: VERIFIED,
    affectedPartyStanding: VERIFIED,
  },
  LONGITUDINAL_RECOVERY: {
    byteIdentity: VERIFIED,
    sourceProvenance: VERIFIED,
    realityLink: VERIFIED,
    revisionAndDedup: VERIFIED,
    temporalOrdering: VERIFIED,
    outcomeSensing: VERIFIED,
    independentOutcomeReview: VERIFIED,
    affectedPartyStanding: VERIFIED,
    longitudinalMaturity: VERIFIED,
  },
});

function evidenceCapabilityVector(realityStatus, dimensions) {
  return Object.fromEntries(EVIDENCE_CAPABILITIES.map((capability) => {
    const missing = blockers(dimensions, REQUIREMENTS[capability]);
    if (!REAL.has(realityStatus)) missing.unshift("realWorldCaseOrExperience");
    return [capability, {
      qualityRequirementsSatisfiedFromDeclaredFacts: missing.length === 0,
      admissionRequiresSourceAwareBinding: true,
      blockerDimensions: [...new Set(missing)].sort(),
    }];
  }));
}

function operationalCapabilityVector(evidence, dimensions) {
  const trainingBlockers = [];
  if (!evidence.CASE_TAXONOMY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    trainingBlockers.push("CASE_TAXONOMY");
  }
  if (!isAtLeast(dimensions, "rightsAndConsent", VERIFIED)) trainingBlockers.push("rightsAndConsent");
  if (!isAtLeast(dimensions, "targetDomainTransfer", VERIFIED)) trainingBlockers.push("targetDomainTransfer");
  if (!isAtLeast(dimensions, "privacyProjection", VERIFIED)) trainingBlockers.push("privacyProjection");

  const priceBlockers = [];
  if (!evidence.EXPOSURE_FREQUENCY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    priceBlockers.push("EXPOSURE_FREQUENCY");
  }
  if (!evidence.ECONOMIC_SEVERITY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    priceBlockers.push("ECONOMIC_SEVERITY");
  }
  if (!isAtLeast(dimensions, "targetDomainTransfer", VERIFIED)) priceBlockers.push("targetDomainTransfer");

  const guaranteeBlockers = [...priceBlockers];
  if (!evidence.CAPITAL_ADEQUACY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    guaranteeBlockers.push("CAPITAL_ADEQUACY");
  }
  if (!evidence.CUSTODY_EXECUTION.qualityRequirementsSatisfiedFromDeclaredFacts) {
    guaranteeBlockers.push("CUSTODY_EXECUTION");
  }

  const settleBlockers = [];
  if (!evidence.ADJUDICATION_FINALITY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    settleBlockers.push("ADJUDICATION_FINALITY");
  }
  if (!evidence.CUSTODY_EXECUTION.qualityRequirementsSatisfiedFromDeclaredFacts) {
    settleBlockers.push("CUSTODY_EXECUTION");
  }
  if (!evidence.LONGITUDINAL_RECOVERY.qualityRequirementsSatisfiedFromDeclaredFacts) {
    settleBlockers.push("LONGITUDINAL_RECOVERY");
  }

  const closeBlockers = [...settleBlockers];
  if (!isAtLeast(dimensions, "institutionalAuthority", VERIFIED)) {
    closeBlockers.push("institutionalAuthority");
  }

  return {
    AUTOMATIC_TRAINING: { qualityRequirementsSatisfiedFromDeclaredFacts: trainingBlockers.length === 0,
      authorized: false, authorizationRequiresTargetSpecificEvidence: true,
      blockers: [...new Set(trainingBlockers)].sort() },
    TARGET_DOMAIN_PRICE: { qualityRequirementsSatisfiedFromDeclaredFacts: priceBlockers.length === 0,
      authorized: false, authorizationRequiresTargetSpecificEvidence: true,
      blockers: [...new Set(priceBlockers)].sort() },
    ISSUE_GUARANTEE: { qualityRequirementsSatisfiedFromDeclaredFacts: guaranteeBlockers.length === 0,
      authorized: false, authorizationRequiresTargetSpecificEvidence: true,
      blockers: [...new Set(guaranteeBlockers)].sort() },
    SETTLE_CLAIM: { qualityRequirementsSatisfiedFromDeclaredFacts: settleBlockers.length === 0,
      authorized: false, authorizationRequiresTargetSpecificEvidence: true,
      blockers: [...new Set(settleBlockers)].sort() },
    CLOSE_OR_REOPEN_OBLIGATION: { qualityRequirementsSatisfiedFromDeclaredFacts: closeBlockers.length === 0,
      authorized: false, authorizationRequiresTargetSpecificEvidence: true,
      blockers: [...new Set(closeBlockers)].sort() },
  };
}

export function evaluateRealCaseQualityPolicy({ realityStatus, dimensions }) {
  if (!REALITY.has(realityStatus)) fail("REAL_CASE_QUALITY_REALITY_STATUS_INVALID");
  const normalized = normalizeDimensions(dimensions);
  const evidenceCapabilities = evidenceCapabilityVector(realityStatus, normalized);
  const operationalCapabilities = operationalCapabilityVector(evidenceCapabilities, normalized);
  return deepFreeze({
    schema: REAL_CASE_QUALITY_SCHEMAS.policy,
    schemaVersion: "1.0.0",
    invariants: [...REAL_CASE_QUALITY_INVARIANTS],
    realityStatus,
    evidenceCapabilities,
    operationalCapabilities,
    collectorRelationshipUsedByPolicy: false,
    singleQualityScoreUsed: false,
    sourceFactsAuthenticatedByThisPolicy: false,
  });
}

function assessmentBody({ sourceId, sourceRevision, observationUnit,
  realityStatus, collectionRelationship, dimensions }) {
  if (!REALITY.has(realityStatus)) fail("REAL_CASE_QUALITY_REALITY_STATUS_INVALID");
  if (!RELATIONSHIP.has(collectionRelationship)) {
    fail("REAL_CASE_QUALITY_COLLECTION_RELATIONSHIP_INVALID");
  }
  const normalized = normalizeDimensions(dimensions);
  const policy = evaluateRealCaseQualityPolicy({ realityStatus, dimensions: normalized });
  return {
    schema: REAL_CASE_QUALITY_SCHEMAS.assessment,
    schemaVersion: "1.0.0",
    sourceId: text(sourceId, "REAL_CASE_QUALITY_SOURCE_ID_INVALID"),
    sourceRevision: text(sourceRevision, "REAL_CASE_QUALITY_SOURCE_REVISION_INVALID"),
    observationUnit: text(observationUnit, "REAL_CASE_QUALITY_OBSERVATION_UNIT_INVALID"),
    realityStatus,
    collectionRelationship,
    dimensions: normalized,
    policy,
    truthBoundary: {
      verificationLevel: "SELF_SEALED_DECLARED_QUALITY_FACTS",
      sourceArtifactsReverified: false,
      underlyingCaseTruthAuthenticated: false,
      policyEvaluationReproducible: true,
      collectionRelationshipAffectsAdmission: false,
      rightsAffectRealityStatus: false,
      realityStatusGrantsOperationalAuthority: false,
    },
  };
}

export function createRealCaseQualityAssessment(input) {
  if (!exactKeys(input, ["sourceId", "sourceRevision", "observationUnit",
    "realityStatus", "collectionRelationship", "dimensions"])) {
    fail("REAL_CASE_QUALITY_ASSESSMENT_INPUT_INVALID");
  }
  const body = assessmentBody(input);
  return deepFreeze({ ...body, assessmentHash: digest(REAL_CASE_QUALITY_SCHEMAS.assessment, body) });
}

export function verifyRealCaseQualityAssessment(value) {
  try {
    if (!exactKeys(value, ["schema", "schemaVersion", "sourceId", "sourceRevision",
      "observationUnit", "realityStatus", "collectionRelationship", "dimensions",
      "policy", "truthBoundary", "assessmentHash"])) fail("REAL_CASE_QUALITY_ASSESSMENT_SCHEMA_INVALID");
    if (value.schema !== REAL_CASE_QUALITY_SCHEMAS.assessment || value.schemaVersion !== "1.0.0") {
      fail("REAL_CASE_QUALITY_ASSESSMENT_SCHEMA_INVALID");
    }
    const expected = createRealCaseQualityAssessment({
      sourceId: value.sourceId,
      sourceRevision: value.sourceRevision,
      observationUnit: value.observationUnit,
      realityStatus: value.realityStatus,
      collectionRelationship: value.collectionRelationship,
      dimensions: value.dimensions,
    });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(value)) {
      fail("REAL_CASE_QUALITY_ASSESSMENT_MISMATCH");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "SELF_SEALED_DECLARED_QUALITY_FACTS",
      assessmentHash: value.assessmentHash,
      policyEvaluationReproduced: true,
      sourceArtifactsReverified: false,
      underlyingCaseTruthAuthenticated: false,
      operationalAuthorityEstablished: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      error: error instanceof Error ? error.message : String(error),
      policyEvaluationReproduced: false,
      sourceArtifactsReverified: false,
      underlyingCaseTruthAuthenticated: false,
      operationalAuthorityEstablished: false,
    });
  }
}
