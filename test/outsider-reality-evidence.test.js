import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  REALITY_EVIDENCE_CLAIM_GATES,
  REALITY_EVIDENCE_CLAIM_TYPES,
  REALITY_EVIDENCE_DEFINITION_HASH,
  REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES,
  REALITY_EVIDENCE_ROLES,
  REALITY_EVIDENCE_ROLE_PROMOTION_RULES,
  createRealityEvidenceAssessment,
  createRealityEvidenceProfile,
  verifyRealityEvidenceAssessment,
  verifyRealityEvidenceProfile,
} from "../src/outsider-reality-evidence.js";

const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const assessmentDigest = (body) => h(
  `outsider:reality-evidence:assessment:v2\0${canonicalizeStrict(body)}`);
const claimHash = (claimType) => h(`claim-body:${claimType}`);
const assess = (profile, claimType, claimBodyHash = claimHash(claimType)) =>
  createRealityEvidenceAssessment({ profile, claimType, claimBodyHash });
const verifyAssessment = (assessment, profile,
  claimBodyHash = claimHash(assessment.claimType)) =>
  verifyRealityEvidenceAssessment(assessment, { profile, claimBodyHash });

function bindings(overrides = {}) {
  return {
    sourceArtifactHashes: [h("artifact:b"), h("artifact:a")],
    sourceVerificationHash: h("source-verification"),
    sourceDomainHash: h("source-domain"),
    targetDomainHash: null,
    cohortManifestHash: null,
    outcomeEvidenceHash: null,
    observerIdentityHash: h("publisher"),
    denominatorDefinitionHash: h("denominator"),
    transferValidationHash: null,
    causalDesignHash: null,
    judgeDefinitionHash: null,
    pricingDefinitionHash: null,
    authorityGrantHash: null,
    ...overrides,
  };
}

function liberoLikeProfile(overrides = {}) {
  return createRealityEvidenceProfile({
    sourceRefHash: h("libero-official-projection"),
    roles: ["TASK_UNIVERSE_REFERENCE", "TAXONOMY_EVIDENCE", "SCHEMA_REFERENCE"],
    coordinates: {
      environmentReality: "CONTROLLED_SIMULATION",
      empiricalStatus: "MANIFEST_DEFINITION",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
      temporalBinding: "NOT_APPLICABLE",
      targetAlignment: "SOURCE_DOMAIN_ONLY",
      denominatorClosure: "COMPLETE",
      causalIdentification: "NONE",
      priceGrounding: "NONE",
      authorityBasis: "NONE",
      ...overrides.coordinates,
    },
    bindings: bindings(overrides.bindings),
    ...Object.fromEntries(Object.entries(overrides)
      .filter(([key]) => !["coordinates", "bindings"].includes(key))),
  });
}

function empiricalPublicProfile(overrides = {}) {
  return createRealityEvidenceProfile({
    sourceRefHash: h("public-real-outcomes"),
    roles: ["SCHEMA_REFERENCE", "WORLD_PHENOMENON_EVIDENCE",
      "TAXONOMY_EVIDENCE", "SOURCE_DOMAIN_BACKTEST"],
    coordinates: {
      environmentReality: "REAL_PHYSICAL",
      empiricalStatus: "EMPIRICAL_RECORDED",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
      temporalBinding: "POST_OUTCOME",
      targetAlignment: "SOURCE_DOMAIN_ONLY",
      denominatorClosure: "COMPLETE",
      causalIdentification: "OBSERVATIONAL_ONLY",
      priceGrounding: "SOURCE_LOSS_AND_EXPOSURE_ONLY",
      authorityBasis: "NONE",
      ...overrides.coordinates,
    },
    bindings: bindings({ outcomeEvidenceHash: h("public-outcomes"),
      ...overrides.bindings }),
    ...Object.fromEntries(Object.entries(overrides)
      .filter(([key]) => !["coordinates", "bindings"].includes(key))),
  });
}

function ownOutcomeProfile(overrides = {}) {
  const domain = h("outsider-target-domain");
  return createRealityEvidenceProfile({
    sourceRefHash: h("prospective-own-outcome"),
    roles: ["TARGET_OUTCOME_EVIDENCE"],
    coordinates: {
      environmentReality: "REAL_PHYSICAL",
      empiricalStatus: "EMPIRICAL_RECORDED",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "INDEPENDENT_TRUST_DOMAIN",
      temporalBinding: "PROSPECTIVE_CENSUS",
      targetAlignment: "SAME_TARGET_DOMAIN",
      denominatorClosure: "COMPLETE",
      causalIdentification: "OBSERVATIONAL_ONLY",
      priceGrounding: "NONE",
      authorityBasis: "NONE",
      ...overrides.coordinates,
    },
    bindings: bindings({
      sourceDomainHash: domain,
      targetDomainHash: domain,
      cohortManifestHash: h("prospective-census"),
      outcomeEvidenceHash: h("external-outcome"),
      observerIdentityHash: h("independent-observer"),
      ...overrides.bindings,
    }),
    ...Object.fromEntries(Object.entries(overrides)
      .filter(([key]) => !["coordinates", "bindings"].includes(key))),
  });
}

test("a caller profile can only be structurally eligible for a source task universe", () => {
  const profile = liberoLikeProfile();
  assert.equal(verifyRealityEvidenceProfile(profile).ok, true);

  for (const claimType of ["SOURCE_FACT", "TAXONOMY",
    "SOURCE_DEFINED_TASK_UNIVERSE"]) {
    const assessment = assess(profile, claimType);
    assert.equal(assessment.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY");
    assert.equal(assessment.decision.claimWeight, "NONE");
    assert.equal(assessment.decision.structurallyEligible, true);
    assert.equal(assessment.decision.highWeightAuthorized, false);
    assert.equal(verifyAssessment(assessment, profile).ok, true);
  }

  const assessment = assess(profile, "SOURCE_DEFINED_TASK_UNIVERSE");
  assert.equal(assessment.coordinateWeights.environmentReality, "NONE");
  assert.equal(assessment.coordinateWeights.sourceIntegrity, "NONE");
  assert.equal(assessment.coordinateWeights.denominatorClosure, "NONE");
  assert.equal(assessment.coordinateWeights.empiricalStatus, "NONE");
  assert.equal(assessment.boundary.scalarScore, null);
  assert.equal(assessment.boundary.crossCoordinateCompensation, false);
  assert.equal(assessment.decision.claimScope,
    "SOURCE_DEFINED_TASK_UNIVERSE_NOT_EMPIRICAL_FREQUENCY_OR_TARGET_DISTRIBUTION");
  assert.ok(assessment.decision.doesNotEstablish.includes("EMPIRICAL_TASK_FREQUENCY"));
  assert.ok(assessment.decision.doesNotEstablish.includes("TARGET_TASK_DISTRIBUTION"));
  assert.ok(assessment.decision.doesNotEstablish.includes("TASK_OUTCOME"));
  assert.equal(assessment.verificationContext.sourceReplayPerformedByThisModule, false);
  assert.equal(assessment.verificationContext.sourceTruthEstablishedByThisModule, false);
  assert.equal(assessment.boundary.callerSuppliedEvidenceCanEstablishHighWeight, false);
  assert.deepEqual(assessment.boundary.permits, {
    EXECUTE: false, PRICE: false, GUARANTEE: false, SETTLE: false, CLOSE: false,
  });
});

test("real-looking caller assertions remain pending even when source-domain gates pass", () => {
  const profile = empiricalPublicProfile();
  for (const claimType of ["SOURCE_FACT", "WORLD_PHENOMENON", "TAXONOMY",
    "SOURCE_DOMAIN_RATE"]) {
    const assessment = assess(profile, claimType);
    assert.equal(assessment.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY",
      claimType);
    assert.equal(assessment.decision.claimWeight, "NONE", claimType);
    assert.equal(assessment.decision.promotionPermitted, false, claimType);
  }
  const rate = assess(profile, "SOURCE_DOMAIN_RATE");
  assert.equal(rate.coordinateWeights.environmentReality, "NONE");
  assert.equal(rate.coordinateWeights.observationExternality, "NONE");
  assert.equal(rate.coordinateWeights.targetAlignment, "NONE");
  assert.ok(rate.decision.doesNotEstablish.includes("OWN_OUTCOME"));
  assert.ok(rate.decision.doesNotEstablish.includes("TARGET_PRICE"));
  assert.ok(rate.decision.doesNotEstablish
    .includes("EXTERNAL_GRANT_DOCUMENT_EVIDENCE"));
});

test("HIGH reality coordinates and even declared strong roles cannot wash a public manifest into stronger claims", () => {
  const profile = liberoLikeProfile({
    roles: ["SCHEMA_REFERENCE", "WORLD_PHENOMENON_EVIDENCE",
      "TAXONOMY_EVIDENCE", "SOURCE_DOMAIN_BACKTEST",
      "TASK_UNIVERSE_REFERENCE", "TARGET_PRIOR_CANDIDATE",
      "TARGET_OUTCOME_EVIDENCE", "OUTSIDER_CAUSAL_EVIDENCE",
      "TARGET_PRICE_EVIDENCE", "EXTERNAL_GRANT_DOCUMENT_REFERENCE"],
  });

  for (const claimType of ["OWN_OUTCOME", "OUTSIDER_CAUSAL_EFFECT", "TARGET_PRICE",
    "EXTERNAL_GRANT_DOCUMENT_EVIDENCE"]) {
    const assessment = assess(profile, claimType);
    assert.equal(assessment.coordinateWeights.sourceIntegrity, "NONE");
    assert.equal(assessment.coordinateWeights.denominatorClosure, "NONE");
    assert.equal(assessment.decision.status, "DENIED", claimType);
    assert.equal(assessment.decision.claimWeight, "NONE", claimType);
    assert.equal(assessment.decision.promotionPermitted, false, claimType);
    assert.ok(assessment.decision.failedGates.length > 0, claimType);
  }
});

test("OWN_OUTCOME gates can be structurally complete but never self-promote", () => {
  const profile = ownOutcomeProfile();
  const own = assess(profile, "OWN_OUTCOME");
  assert.equal(own.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY");
  assert.equal(own.decision.claimWeight, "NONE");
  assert.equal(own.decision.failedGates.length, 0);
  assert.equal(own.decision.promotionPermitted, false);
  assert.equal(own.boundary.authority, "none");

  for (const claimType of ["OUTSIDER_CAUSAL_EFFECT", "TARGET_PRICE",
    "EXTERNAL_GRANT_DOCUMENT_EVIDENCE"]) {
    const assessment = assess(profile, claimType);
    assert.equal(assessment.decision.status, "DENIED", claimType);
    assert.ok(assessment.decision.missingRoles.length > 0, claimType);
  }
});

test("causal gates do not let caller-minted hashes establish high weight", () => {
  const profile = ownOutcomeProfile({
    roles: ["OUTSIDER_CAUSAL_EVIDENCE", "TARGET_OUTCOME_EVIDENCE"],
    coordinates: { causalIdentification: "VALID_INTERVENTION_CONTRAST" },
    bindings: { causalDesignHash: h("causal-design"),
      judgeDefinitionHash: h("pinned-judge") },
  });
  const assessment = assess(profile, "OUTSIDER_CAUSAL_EFFECT");
  assert.equal(assessment.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY");
  assert.equal(assessment.decision.claimWeight, "NONE");
  assert.equal(assessment.decision.highWeightAuthorized, false);
  assert.equal(assessment.boundary.permits.EXECUTE, false);
});

test("caller-declared target pricing remains conditional and grants no PRICE authority", () => {
  const sourceDomainHash = h("source-loss-domain");
  const targetDomainHash = h("target-loss-domain");
  const profile = empiricalPublicProfile({
    roles: ["TARGET_PRIOR_CANDIDATE", "TARGET_PRICE_EVIDENCE"],
    coordinates: {
      targetAlignment: "VALIDATED_TRANSFER_TO_TARGET",
      priceGrounding: "TARGET_LOSS_AND_EXPOSURE_BOUND",
    },
    bindings: {
      sourceDomainHash,
      targetDomainHash,
      transferValidationHash: h("transfer-validation"),
      pricingDefinitionHash: h("pricing-definition"),
    },
  });
  const assessment = assess(profile, "TARGET_PRICE");
  assert.equal(assessment.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY");
  assert.equal(assessment.decision.claimWeight, "NONE");
  assert.equal(assessment.coordinateWeights.targetAlignment, "NONE");
  assert.equal(assessment.coordinateWeights.priceGrounding, "NONE");
  assert.equal(assessment.boundary.authority, "none");
  assert.equal(assessment.boundary.permits.PRICE, false);
  assert.equal(verifyAssessment(assessment, profile).authority, "none");
});

test("external grant document assertions remain conditional and never become authority", () => {
  const domain = h("authority-scope-domain");
  const profile = createRealityEvidenceProfile({
    sourceRefHash: h("external-authority-grant"),
    roles: ["EXTERNAL_GRANT_DOCUMENT_REFERENCE"],
    coordinates: {
      environmentReality: "REAL_DIGITAL",
      empiricalStatus: "MANIFEST_DEFINITION",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
      temporalBinding: "PRECOMMITTED_NOT_CENSUSED",
      targetAlignment: "SAME_TARGET_DOMAIN",
      denominatorClosure: "NOT_APPLICABLE",
      causalIdentification: "NONE",
      priceGrounding: "NONE",
      authorityBasis: "EXTERNALLY_VERIFIED_GRANT",
    },
    bindings: bindings({ sourceDomainHash: domain, targetDomainHash: domain,
      authorityGrantHash: h("grant") }),
  });
  const assessment = assess(profile, "EXTERNAL_GRANT_DOCUMENT_EVIDENCE");
  assert.equal(assessment.decision.status, "ELIGIBLE_PENDING_SOURCE_REPLAY");
  assert.equal(assessment.decision.claimWeight, "NONE");
  assert.equal(assessment.boundary.authority, "none");
  assert.ok(Object.values(assessment.boundary.permits).every((value) => value === false));
});

test("schemas and coordinate vocabularies are closed and conditional bindings fail closed", () => {
  const base = {
    sourceRefHash: h("bad-profile"),
    roles: ["SCHEMA_REFERENCE"],
    coordinates: liberoLikeProfile().coordinates,
    bindings: bindings(),
  };
  assert.throws(() => createRealityEvidenceProfile({ ...base, surprise: true }),
    /PROFILE_INPUT_SHAPE_INVALID/);
  assert.throws(() => createRealityEvidenceProfile({ ...base,
    coordinates: { ...base.coordinates, environmentReality: "VERY_REAL" } }),
  /COORDINATE_ENVIRONMENTREALITY_INVALID/);
  assert.throws(() => createRealityEvidenceProfile({ ...base,
    roles: ["SCHEMA_REFERENCE", "SCHEMA_REFERENCE"] }), /ROLES_DUPLICATE/);
  assert.throws(() => createRealityEvidenceProfile({ ...base,
    bindings: bindings({ sourceVerificationHash: null }) }),
  /SOURCE_VERIFICATION_REQUIRED/);
  assert.throws(() => ownOutcomeProfile({ bindings: { cohortManifestHash: null } }),
    /PROSPECTIVE_CENSUS_BINDING_REQUIRED/);
});

test("canonical normalization makes profile hashes stable across unordered sets", () => {
  const first = liberoLikeProfile();
  const second = liberoLikeProfile({
    roles: ["SCHEMA_REFERENCE", "TAXONOMY_EVIDENCE", "TASK_UNIVERSE_REFERENCE"],
    bindings: { sourceArtifactHashes: [h("artifact:a"), h("artifact:b")] },
  });
  assert.equal(first.profileHash, second.profileHash);
  assert.deepEqual(first.roles, [...first.roles].sort());
  assert.deepEqual(first.bindings.sourceArtifactHashes,
    [...first.bindings.sourceArtifactHashes].sort());
});

test("profile, decision, definition, and no-authority boundary tampering are rejected", () => {
  const profile = empiricalPublicProfile();
  const assessment = assess(profile, "WORLD_PHENOMENON");
  assert.match(REALITY_EVIDENCE_DEFINITION_HASH, /^sha256:[a-f0-9]{64}$/);

  const changedProfile = structuredClone(profile);
  changedProfile.coordinates.environmentReality = "SYNTHETIC";
  assert.equal(verifyRealityEvidenceProfile(changedProfile).ok, false);

  for (const mutate of [
    (value) => { value.decision.claimWeight = "HIGH"; },
    (value) => { value.coordinateWeights.environmentReality = "HIGH"; },
    (value) => { value.definitionHash = h("different-definition"); },
    (value) => { value.boundary.crossCoordinateCompensation = true; },
    (value) => { value.assessmentHash = h("forged-assessment"); },
  ]) {
    const changed = structuredClone(assessment);
    mutate(changed);
    assert.equal(verifyAssessment(changed, profile).ok, false);
  }
  const rehashedDecisionTamper = structuredClone(assessment);
  rehashedDecisionTamper.decision.claimWeight = "HIGH";
  const { assessmentHash: ignored, ...tamperedBody } = rehashedDecisionTamper;
  rehashedDecisionTamper.assessmentHash = assessmentDigest(tamperedBody);
  assert.equal(verifyAssessment(rehashedDecisionTamper, profile).ok,
    false, "recomputing the public canonical hash cannot bypass derivation replay");

  const extended = structuredClone(assessment);
  extended.surprise = true;
  assert.equal(verifyAssessment(extended, profile).ok, false);
  const otherProfile = liberoLikeProfile();
  assert.equal(verifyAssessment(assessment, otherProfile).ok, false);
});

test("promotion policy itself forbids score aggregation and silent strong-role inference", () => {
  assert.equal(REALITY_EVIDENCE_ROLE_PROMOTION_RULES.lowerRoleCombinationCanPromote,
    false);
  assert.equal(REALITY_EVIDENCE_ROLE_PROMOTION_RULES.scalarWeightCanPromote, false);
  assert.equal(REALITY_EVIDENCE_ROLE_PROMOTION_RULES
    .promotions.TARGET_OUTCOME_EVIDENCE.automatic, false);
  assert.equal(REALITY_EVIDENCE_ROLE_PROMOTION_RULES
    .promotions.EXTERNAL_GRANT_DOCUMENT_REFERENCE
    .cannotBeInferredFromAnyEvidenceRole, true);
  assert.deepEqual(REALITY_EVIDENCE_CLAIM_GATES.OUTSIDER_CAUSAL_EFFECT.requiredRoles,
    ["TARGET_OUTCOME_EVIDENCE", "OUTSIDER_CAUSAL_EVIDENCE"]);
  assert.deepEqual(REALITY_EVIDENCE_CLAIM_GATES.TARGET_PRICE.requiredRoles,
    ["TARGET_PRIOR_CANDIDATE", "TARGET_PRICE_EVIDENCE"]);
});

test("caller-minted roles, coordinates, and all-zero commitments never establish HIGH", () => {
  const zero = `sha256:${"0".repeat(64)}`;
  const profile = createRealityEvidenceProfile({
    sourceRefHash: zero,
    roles: [...REALITY_EVIDENCE_ROLES],
    coordinates: {
      environmentReality: "REAL_PHYSICAL",
      empiricalStatus: "EMPIRICAL_RECORDED",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "INDEPENDENT_TRUST_DOMAIN",
      temporalBinding: "PROSPECTIVE_CENSUS",
      targetAlignment: "SAME_TARGET_DOMAIN",
      denominatorClosure: "COMPLETE",
      causalIdentification: "VALID_INTERVENTION_CONTRAST",
      priceGrounding: "TARGET_LOSS_AND_EXPOSURE_BOUND",
      authorityBasis: "EXTERNALLY_VERIFIED_GRANT",
    },
    bindings: Object.fromEntries(Object.keys(bindings()).map((key) => [key,
      key === "sourceArtifactHashes" ? [zero] : zero])),
  });
  for (const claimType of REALITY_EVIDENCE_CLAIM_TYPES) {
    const assessment = assess(profile, claimType);
    assert.equal(assessment.decision.claimWeight, "NONE", claimType);
    assert.equal(assessment.decision.promotionPermitted, false, claimType);
    assert.equal(assessment.decision.highWeightAuthorized, false, claimType);
  }
});

test("assessment replay is bound to an externally supplied exact claim body hash", () => {
  const profile = empiricalPublicProfile();
  const firstBody = h("rate:numerator=4;denominator=100;unit=attempt;window=v1");
  const secondBody = h("rate:numerator=5;denominator=100;unit=attempt;window=v1");
  const assessment = assess(profile, "SOURCE_DOMAIN_RATE", firstBody);
  assert.equal(verifyAssessment(assessment, profile, firstBody).ok, true);
  assert.equal(verifyAssessment(assessment, profile, secondBody).ok, false);
  const changed = assess(profile, "SOURCE_DOMAIN_RATE", secondBody);
  assert.notEqual(changed.assessmentHash, assessment.assessmentHash);
});

test("definition binds the exact core and canonicalizer source bytes", () => {
  assert.match(REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.realityEvidenceModule,
    /^sha256:[a-f0-9]{64}$/);
  assert.match(REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.canonicalizerModule,
    /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.realityEvidenceModule,
    REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.canonicalizerModule);
});
