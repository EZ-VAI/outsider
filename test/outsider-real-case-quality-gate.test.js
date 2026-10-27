import assert from "node:assert/strict";
import test from "node:test";

import {
  COLLECTION_RELATIONSHIPS,
  QUALITY_DIMENSIONS,
  createRealCaseQualityAssessment,
  evaluateRealCaseQualityPolicy,
  verifyRealCaseQualityAssessment,
} from "../src/outsider-real-case-quality-gate.js";

const H = `sha256:${"a".repeat(64)}`;

function dimensions(overrides = {}) {
  return Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, overrides[id] ?? {
    status: "UNESTABLISHED",
    basis: `UNESTABLISHED_${id}`,
    evidenceHashes: [],
  }]));
}

function verified(basis) {
  return { status: "VERIFIED", basis, evidenceHashes: [H] };
}

function partial(basis) {
  return { status: "PARTIAL", basis, evidenceHashes: [H] };
}

function caseDimensions() {
  return dimensions({
    byteIdentity: verified("PINNED_BYTES"),
    sourceProvenance: verified("OFFICIAL_SOURCE"),
    realityLink: verified("REAL_EVENT_RECORD"),
    revisionAndDedup: partial("LATEST_VERSION_SELECTED_DUPLICATE_RISK_DISCLOSED"),
    measurementDefinition: verified("FIELD_DICTIONARY_PINNED"),
    privacyProjection: verified("IDENTIFIERS_REMOVED"),
    outcomeSensing: partial("REPORTER_OBSERVED_OUTCOME"),
  });
}

test("a verified real-world record is recognized as a real case without pretending it is causal", () => {
  const policy = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED",
    dimensions: caseDimensions(),
  });
  assert.equal(policy.evidenceCapabilities.REAL_CASE_RECOGNITION
    .qualityRequirementsSatisfiedFromDeclaredFacts, true);
  assert.equal(policy.evidenceCapabilities.CASE_TAXONOMY
    .qualityRequirementsSatisfiedFromDeclaredFacts, true);
  assert.equal(policy.evidenceCapabilities.REPORTED_OUTCOME_SENSING
    .qualityRequirementsSatisfiedFromDeclaredFacts, true);
  assert.equal(policy.evidenceCapabilities.INDEPENDENT_OUTCOME_SENSING
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(policy.evidenceCapabilities.CAUSAL_EFFECT
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("public and Outsider-collected bytes receive identical epistemic admissions", () => {
  const input = {
    sourceId: "EXAMPLE_REAL_CASES",
    sourceRevision: "PINNED_REVISION",
    observationUnit: "CASE",
    realityStatus: "REAL_CASE_RECORDED",
    dimensions: caseDimensions(),
  };
  const publicAssessment = createRealCaseQualityAssessment({
    ...input, collectionRelationship: "REGULATOR_PUBLISHED",
  });
  const ownAssessment = createRealCaseQualityAssessment({
    ...input, collectionRelationship: "OUTSIDER_COLLECTED",
  });
  assert.deepEqual(publicAssessment.policy.evidenceCapabilities,
    ownAssessment.policy.evidenceCapabilities);
  assert.deepEqual(publicAssessment.policy.operationalCapabilities,
    ownAssessment.policy.operationalCapabilities);
  assert.equal(publicAssessment.policy.collectorRelationshipUsedByPolicy, false);
  assert.notEqual(publicAssessment.assessmentHash, ownAssessment.assessmentHash);
});

test("complete real exposure can support source-domain frequency when every quality gate passes", () => {
  const d = dimensions(Object.fromEntries([
    "byteIdentity", "sourceProvenance", "realityLink", "populationFrame",
    "recordCompleteness", "revisionAndDedup", "measurementDefinition",
    "temporalOrdering", "exposureDenominator", "outcomeSensing",
    "dependenceStructure", "privacyProjection",
  ].map((id) => [id, verified(`VERIFIED_${id}`)])));
  const policy = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_EXPERIENCE_AGGREGATE", dimensions: d,
  });
  assert.equal(policy.evidenceCapabilities.EXPOSURE_FREQUENCY
    .qualityRequirementsSatisfiedFromDeclaredFacts, true);
  assert.equal(policy.evidenceCapabilities.ECONOMIC_SEVERITY
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("an adverse-event numerator without exposure never contaminates frequency", () => {
  const d = caseDimensions();
  d.recordCompleteness = verified("COMPLETE_REPORT_FILE");
  d.revisionAndDedup = verified("LATEST_REPORT_VERSION_AND_DUPLICATE_ROOTS");
  d.populationFrame = partial("REPORTING_SCOPE_ONLY");
  d.temporalOrdering = verified("RECEIPT_AND_EVENT_DATES_DEFINED");
  d.dependenceStructure = partial("REPORT_AND_DEVICE_ROOTS_DISCLOSED");
  const policy = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED", dimensions: d,
  });
  assert.equal(policy.evidenceCapabilities.REPORTED_OUTCOME_SENSING
    .qualityRequirementsSatisfiedFromDeclaredFacts, true);
  assert.equal(policy.evidenceCapabilities.EXPOSURE_FREQUENCY
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert(policy.evidenceCapabilities.EXPOSURE_FREQUENCY.blockerDimensions
    .includes("exposureDenominator"));
});

test("rights limit use without rewriting whether a case happened", () => {
  const d = caseDimensions();
  const before = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED", dimensions: d,
  });
  d.rightsAndConsent = verified("EXACT_REUSE_GRANT");
  const after = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED", dimensions: d,
  });
  assert.deepEqual(before.evidenceCapabilities, after.evidenceCapabilities);
  assert.equal(before.operationalCapabilities.AUTOMATIC_TRAINING.authorized, false);
  assert.equal(after.operationalCapabilities.AUTOMATIC_TRAINING.authorized, false);
  assert.equal(after.operationalCapabilities.AUTOMATIC_TRAINING
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert(after.operationalCapabilities.AUTOMATIC_TRAINING.blockers
    .includes("targetDomainTransfer"));
});

test("self-sealed quality facts never authenticate their source or grant authority", () => {
  const assessment = createRealCaseQualityAssessment({
    sourceId: "EXAMPLE_REAL_CASES",
    sourceRevision: "PINNED_REVISION",
    observationUnit: "CASE",
    realityStatus: "REAL_CASE_RECORDED",
    collectionRelationship: "REGULATOR_PUBLISHED",
    dimensions: caseDimensions(),
  });
  const verification = verifyRealCaseQualityAssessment(assessment);
  assert.equal(verification.ok, true);
  assert.equal(verification.sourceArtifactsReverified, false);
  assert.equal(verification.underlyingCaseTruthAuthenticated, false);
  assert.equal(verification.operationalAuthorityEstablished, false);
});

test("even caller-declared perfect quality cannot self-authorize operational use", () => {
  const d = dimensions(Object.fromEntries(QUALITY_DIMENSIONS.map((id) => (
    [id, verified(`CALLER_DECLARED_${id}`)]
  ))));
  const policy = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_EXPERIENCE_AGGREGATE",
    dimensions: d,
  });
  for (const value of Object.values(policy.operationalCapabilities)) {
    assert.equal(value.qualityRequirementsSatisfiedFromDeclaredFacts, true);
    assert.equal(value.authorized, false);
    assert.equal(value.authorizationRequiresTargetSpecificEvidence, true);
  }
});

test("automatic-training prerequisites require verified privacy rather than a partial projection", () => {
  const d = dimensions(Object.fromEntries(QUALITY_DIMENSIONS.map((id) => (
    [id, verified(`VERIFIED_${id}`)]
  ))));
  d.privacyProjection = partial("PSEUDONYMOUS_LINKABLE_PROJECTION");
  const policy = evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED",
    dimensions: d,
  });
  assert.equal(policy.operationalCapabilities.AUTOMATIC_TRAINING
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert(policy.operationalCapabilities.AUTOMATIC_TRAINING.blockers
    .includes("privacyProjection"));
  assert.equal(policy.operationalCapabilities.AUTOMATIC_TRAINING.authorized, false);
});

test("re-sealed authority or policy changes fail exact verification", () => {
  const assessment = createRealCaseQualityAssessment({
    sourceId: "EXAMPLE_REAL_CASES",
    sourceRevision: "PINNED_REVISION",
    observationUnit: "CASE",
    realityStatus: "REAL_CASE_RECORDED",
    collectionRelationship: "REGULATOR_PUBLISHED",
    dimensions: caseDimensions(),
  });
  const forged = structuredClone(assessment);
  forged.policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized = true;
  assert.equal(verifyRealCaseQualityAssessment(forged).ok, false);
});

test("unknown quality fields and invented collection prestige fail closed", () => {
  assert.throws(() => createRealCaseQualityAssessment({
    sourceId: "EXAMPLE_REAL_CASES",
    sourceRevision: "PINNED_REVISION",
    observationUnit: "CASE",
    realityStatus: "REAL_CASE_RECORDED",
    collectionRelationship: "OUTSIDER_HIGH_PRESTIGE",
    dimensions: caseDimensions(),
  }), /REAL_CASE_QUALITY_COLLECTION_RELATIONSHIP_INVALID/u);
  const d = caseDimensions();
  d.byteIdentity.score = 100;
  assert.throws(() => evaluateRealCaseQualityPolicy({
    realityStatus: "REAL_CASE_RECORDED", dimensions: d,
  }), /REAL_CASE_QUALITY_DIMENSION_SCHEMA_INVALID/u);
  assert(COLLECTION_RELATIONSHIPS.includes("THIRD_PARTY_PUBLIC"));
});
