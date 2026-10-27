import assert from "node:assert/strict";
import test from "node:test";
import {
  EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA,
  EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
  EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA,
  buildEpisodeDataPublicSourceCatalog,
  buildEpisodeDataPublicSourceVerificationReceipt,
  episodeDataPublicSourceCatalogDigest,
  verifyEpisodeDataPublicSourceCatalog,
} from "../src/outsider-episode-data-public-source-catalog.js";

const hash = (label) => episodeDataPublicSourceCatalogDigest({ label }, "test/hash/v1");

function zeroSegment() {
  return {
    populationId: null,
    sourceNativeCount: 0,
    independentCount: 0,
    sourceNativeAttribution: "NONE",
    independentAttribution: "NONE",
    crossAttributionAdditionPermitted: false,
    additiveTotal: null,
  };
}

function segment(populationId, sourceNativeCount, independentCount,
  sourceNativeAttribution, independentAttribution) {
  return {
    populationId,
    sourceNativeCount,
    independentCount,
    sourceNativeAttribution,
    independentAttribution,
    crossAttributionAdditionPermitted: false,
    additiveTotal: null,
  };
}

function clearances(label, offlineResearchAllowed = true) {
  return {
    revision: { status: "PINNED_AND_REPLAYED", evidenceHash: hash(`${label}:revision`) },
    rights: {
      status: "FAIL_CLOSED_NO_LEGAL_ADJUDICATION",
      evidenceHash: hash(`${label}:rights`),
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      redistributionAuthorized: false,
    },
    privacy: {
      status: "NO_PII_GUARANTEE",
      evidenceHash: hash(`${label}:privacy`),
      rawContentProjected: false,
      noPiiGuaranteed: false,
    },
    use: {
      status: offlineResearchAllowed ? "OFFLINE_RESEARCH_ONLY" : "METADATA_ONLY",
      evidenceHash: hash(`${label}:use`),
      offlineResearchAllowed,
      authorizedTrainingAllowed: false,
      networkAdmissionAllowed: false,
      delegationAuthorityAllowed: false,
    },
  };
}

function artifact(label, reportSchema) {
  return {
    directoryBasename: `outsider-${label}-20260829-v1`,
    reportRelativePath: "report.json",
    reportSchema,
    reportFileSha256: hash(`${label}:reportFile`),
    artifactHash: hash(`${label}:artifact`),
    sourceBindingHash: hash(`${label}:sourceRoot`),
    sourceBindingKind: "SOURCE_ROOT",
  };
}

function lineage(label) {
  return {
    kind: "NO_EXACT_REPACK_RELATION_ESTABLISHED",
    duplicateOfSourceId: null,
    addsUniqueEpisodes: null,
    addsUniqueFrames: null,
    evidenceHash: hash(`${label}:lineage`),
  };
}

function receipt(label, verificationLevel = "FULL_SOURCE_REDERIVED") {
  const artifactHash = hash(`${label}:artifact`);
  const sourceRootHash = hash(`${label}:sourceRoot`);
  const replayClass = verificationLevel === "FULL_FIXED_REVISION_METADATA_REPLAYED"
    ? "METADATA_ONLY" : verificationLevel === "FULL_SELECTED_SOURCE_REDERIVED"
      ? "FULL_SELECTED_SOURCE" : "FULL_SOURCE";
  return buildEpisodeDataPublicSourceVerificationReceipt({
    verifierId: `verify-${label}`,
    verifierCodeHash: hash(`${label}:verifier`),
    verificationAttestation: {
      schema: EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA,
      ok: true,
      verifiedArtifactHash: artifactHash,
      verifiedSourceBindingHash: sourceRootHash,
      sourceBindingKind: "SOURCE_ROOT",
      replayClass,
      sourceSpecificVerificationLevel: `TEST_${replayClass}`,
      sourceSpecificResultHash: hash(`${label}:verificationResult`),
    },
  });
}

const discoveryScopes = [
  {
    scopeId: "so101-fixed-query",
    channel: "HUGGING_FACE_DATASET_SEARCH_API",
    queryOrDeclaration: "search=so101|SO-101",
    cutoff: "2026-08-29T08:10:25.000Z",
    evidenceHash: hash("so101-query-ledger"),
    candidateCount: 9_766,
    terminalCount: 9_766,
    declaredScopeExhausted: true,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
  },
  {
    scopeId: "declared-local-public-source-set",
    channel: "CODE_FIXED_DECLARATION",
    queryOrDeclaration: "two source fixtures",
    cutoff: "2026-08-29T08:11:00.000Z",
    evidenceHash: hash("declared-local-public-source-set"),
    candidateCount: 2,
    terminalCount: 2,
    declaredScopeExhausted: true,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
  },
];

const coffee = {
  sourceId: "so101-coffee-recovery-census",
  family: "REAL_ROBOT_RECOVERY_MORPHOLOGY",
  disposition: "ADMITTED_RESEARCH_ONLY",
  identity: {
    publisher: "nevertmr",
    datasetId: "nevertmr/so101_coffee_rollouts",
    revision: "eaf2d303f4958aa87fdd1ba81cca07bcf4d7296d",
    physicality: "REAL_ROBOT",
  },
  artifact: artifact("so101-coffee-recovery-census",
    "outsider/so101-coffee-recovery-census/v1"),
  lineage: lineage("so101-coffee-recovery-census"),
  verification: receipt("so101-coffee-recovery-census",
    "FULL_SELECTED_SOURCE_REDERIVED"),
  scope: {
    scopeId: "so101-fixed-query",
    scopeKind: "BOUNDED_SOURCE_NATIVE_SLICE",
    description: "complete declared coffee run census and kept no-video episodes",
    sourceNativeGroupComplete: true,
    declaredScopeExhausted: true,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
    selectionBias: "KNOWN_PUBLISHER_SELECTION",
  },
  populations: [
    {
      populationId: "kept-real-robot-episode",
      unit: "episode",
      count: 184,
      evidenceDomain: "REAL_ROBOT_EXECUTION",
      relationship: "PRIMARY_SOURCE_NATIVE",
      parentPopulationId: null,
      realityEligible: true,
      analyticAdmission: true,
    },
    {
      populationId: "attempt-census-record",
      unit: "attempt record",
      count: 200,
      evidenceDomain: "PUBLISHER_ANNOTATION",
      relationship: "PRIMARY_SOURCE_NATIVE",
      parentPopulationId: null,
      realityEligible: false,
      analyticAdmission: true,
    },
    {
      populationId: "frame-within-kept-episode",
      unit: "frame",
      count: 38_718,
      evidenceDomain: "REAL_ROBOT_EXECUTION",
      relationship: "NESTED_WITHIN_PARENT",
      parentPopulationId: "kept-real-robot-episode",
      realityEligible: false,
      analyticAdmission: false,
    },
  ],
  segments: {
    opportunityCensus: segment("attempt-census-record", 200, 0,
      "PUBLISHER_RUN_LEDGER", "NONE"),
    delegationAuthorization: zeroSegment(),
    actionTrace: segment("kept-real-robot-episode", 184, 0,
      "SOURCE_NATIVE_ROBOT_ACTION_STATE", "NONE"),
    intervention: zeroSegment(),
    effect: zeroSegment(),
    outcome: segment("kept-real-robot-episode", 184, 0,
      "OPERATOR_PUBLISHER_LABEL", "NONE"),
    recovery: segment("kept-real-robot-episode", 30, 0,
      "CROSS_EPISODE_FAILURE_TO_RETRY_MORPHOLOGY", "NONE"),
    longitudinal: zeroSegment(),
  },
  clearances: clearances("coffee"),
  completeEpisodeIntersection: { established: false, count: 0 },
};

const metadataOnly = {
  sourceId: "agentlens-metadata-disposition",
  family: "AGENT_DATASET_METADATA",
  disposition: "METADATA_ONLY",
  identity: {
    publisher: "Microsoft Research",
    datasetId: "AgentLens",
    revision: "arXiv:2605.12925v3",
    physicality: "METADATA_ONLY",
  },
  artifact: artifact("agentlens-metadata-disposition",
    "outsider/microsoft-agentlens-metadata-disposition/v1"),
  lineage: lineage("agentlens-metadata-disposition"),
  verification: receipt("agentlens-metadata-disposition",
    "FULL_FIXED_REVISION_METADATA_REPLAYED"),
  scope: {
    scopeId: "declared-local-public-source-set",
    scopeKind: "METADATA_ONLY_DISPOSITION",
    description: "official publication and public payload absence snapshots",
    sourceNativeGroupComplete: false,
    declaredScopeExhausted: true,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
    selectionBias: "METADATA_ONLY",
  },
  populations: [{
    populationId: "publisher-corpus-size-claim",
    unit: "claimed trajectory",
    count: 2_614,
    evidenceDomain: "METADATA_CLAIM",
    relationship: "METADATA_ONLY",
    parentPopulationId: null,
    realityEligible: false,
    analyticAdmission: false,
  }],
  segments: Object.fromEntries([
    "opportunityCensus", "delegationAuthorization", "actionTrace",
    "intervention", "effect", "outcome", "recovery", "longitudinal",
  ].map((name) => [name, zeroSegment()])),
  clearances: clearances("agentlens", false),
  completeEpisodeIntersection: { established: false, count: 0 },
};

test("catalog preserves noncommensurate populations and zero authority", () => {
  const catalog = buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [metadataOnly, coffee],
  });
  assert.equal(catalog.schema, EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA);
  assert.equal(catalog.sourceSummary.sourceCount, 2);
  assert.equal(catalog.sourceSummary.nonDuplicateLedgerEntryCount, 2);
  assert.equal(catalog.sourceSummary.lineageDuplicateSourceCount, 0);
  assert.equal(catalog.sourceSummary.allArtifactAttestationsStructurallyBound, true);
  assert.equal(catalog.sourceSummary.sourceReplayTrustEstablishedByCatalogAlone,
    false);
  assert.equal(catalog.populationRegistry.entryCount, 4);
  assert.equal(catalog.populationRegistry.crossPopulationTotal, null);
  assert.equal(catalog.populationRegistry.crossPopulationAdditionProhibited, true);
  assert.equal(catalog.segmentCoverage.completeEpisodeIntersectionCount, 0);
  assert.deepEqual(catalog.segmentCoverage.segments.recovery.sourceNativeSourceIds,
    ["so101-coffee-recovery-census"]);
  assert.deepEqual(catalog.segmentCoverage.segments.intervention.sourceNativeSourceIds,
    []);
  assert.equal(catalog.discovery.allDeclaredScopesExhausted, true);
  assert.equal(catalog.discovery.globalExhaustion, false);
  assert.equal(catalog.useBoundary.productionTrainingRows, 0);
  assert.deepEqual(verifyEpisodeDataPublicSourceCatalog(catalog, {
    discoveryScopes,
    sources: [coffee, metadataOnly],
  }), {
    ok: true,
    sourceReplayEstablished: false,
    attestationTrustBoundary:
      EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
    catalogHash: catalog.catalogHash,
    sourceCount: 2,
    populationEntryCount: 4,
    completeEpisodeIntersectionCount: 0,
    globalExhaustion: false,
    productionTrainingRows: 0,
  });
});

test("catalog rejects cross-domain summation and unsupported global exhaustion", () => {
  const badScope = structuredClone(discoveryScopes[0]);
  badScope.globalExhaustion = true;
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes: [badScope, discoveryScopes[1]],
    sources: [coffee, metadataOnly],
  }), /DISCOVERY_SCOPE_EXHAUSTION_INVALID/u);

  const catalog = buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataOnly],
  });
  const forged = structuredClone(catalog);
  forged.populationRegistry.crossPopulationTotal = 41_516;
  forged.catalogHash = episodeDataPublicSourceCatalogDigest({ forged });
  assert.equal(verifyEpisodeDataPublicSourceCatalog(forged, {
    discoveryScopes,
    sources: [coffee, metadataOnly],
  }).ok, false);
});

test("catalog exposes its structural attestation boundary and rejects partial binding or authority promotion", () => {
  assert.throws(() => buildEpisodeDataPublicSourceVerificationReceipt({
    verifierId: "untrusted-verifier",
    verifierCodeHash: hash("untrusted-verifier"),
    verificationAttestation: { ok: false, error: "SOURCE_MISMATCH" },
  }), /SOURCE_SPECIFIC_VERIFIER_NOT_OK/u);

  assert.throws(() => buildEpisodeDataPublicSourceVerificationReceipt({
    verifierId: "malformed-attestation-verifier",
    verifierCodeHash: hash("malformed-attestation-verifier"),
    verificationAttestation: {
      schema: EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA,
      ok: true,
      verifiedArtifactHash: hash("unbound:artifact"),
      replayClass: "FULL_SOURCE",
      sourceSpecificVerificationLevel: "TEST_FULL_SOURCE",
      sourceSpecificResultHash: hash("unbound:result"),
    },
  }), /VERIFIER_ATTESTATION_INVALID/u);

  const mismatchedReceipt = structuredClone(coffee);
  mismatchedReceipt.verification.sourceBindingHash = hash("wrong-source-root");
  mismatchedReceipt.verification.attestation.verifiedSourceBindingHash =
    hash("wrong-source-root");
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [mismatchedReceipt, metadataOnly],
  }), /VERIFICATION_ARTIFACT_BINDING_INVALID/u);

  const promoted = structuredClone(coffee);
  promoted.clearances.use.authorizedTrainingAllowed = true;
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [promoted, metadataOnly],
  }), /CLEARANCE_BOUNDARY_INVALID/u);

  const coherentlyResealed = structuredClone(coffee);
  const replacementArtifactHash = hash("coherent-reseal:artifact");
  coherentlyResealed.artifact.artifactHash = replacementArtifactHash;
  coherentlyResealed.verification.artifactHash = replacementArtifactHash;
  coherentlyResealed.verification.attestation.verifiedArtifactHash =
    replacementArtifactHash;
  const structurallyValidOnly = buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coherentlyResealed, metadataOnly],
  });
  const structuralCheck = verifyEpisodeDataPublicSourceCatalog(
    structurallyValidOnly, {
      discoveryScopes,
      sources: [coherentlyResealed, metadataOnly],
    });
  assert.equal(structuralCheck.ok, true);
  assert.equal(structuralCheck.sourceReplayEstablished, false);
  assert.equal(structuralCheck.attestationTrustBoundary,
    EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY);
});

test("catalog rejects duplicate-ledger promotion, duplicate chains, and physicality-domain conflicts", () => {
  const duplicate = structuredClone(coffee);
  duplicate.sourceId = "coffee-exact-repack-ledger";
  duplicate.family = "EXACT_REPACK_LEDGER";
  duplicate.disposition = "LEDGER_DUPLICATE";
  duplicate.artifact = artifact("coffee-exact-repack-ledger",
    "outsider/test-exact-repack/v1");
  duplicate.verification = receipt("coffee-exact-repack-ledger",
    "FULL_SELECTED_SOURCE_REDERIVED");
  duplicate.lineage = {
    kind: "EXACT_REPACK_DUPLICATE",
    duplicateOfSourceId: coffee.sourceId,
    addsUniqueEpisodes: 0,
    addsUniqueFrames: 0,
    evidenceHash: hash("coffee-exact-repack-ledger:lineage"),
  };
  duplicate.populations = [{
    populationId: "exact-repack-row",
    unit: "exact repack row",
    count: 184,
    evidenceDomain: "DERIVED_LINEAGE",
    relationship: "PRIMARY_SOURCE_NATIVE",
    parentPopulationId: null,
    realityEligible: false,
    analyticAdmission: false,
  }];
  duplicate.segments = Object.fromEntries([
    "opportunityCensus", "delegationAuthorization", "actionTrace",
    "intervention", "effect", "outcome", "recovery", "longitudinal",
  ].map((name) => [name, zeroSegment()]));
  duplicate.clearances = clearances("coffee-exact-repack-ledger", false);
  const accepted = buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataOnly, duplicate],
  });
  assert.equal(accepted.sourceSummary.lineageDuplicateSourceCount, 1);
  assert.equal(accepted.sourceSummary.nonDuplicateLedgerEntryCount, 2);

  const promotedDuplicate = structuredClone(duplicate);
  promotedDuplicate.populations[0].analyticAdmission = true;
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataOnly, promotedDuplicate],
  }), /DERIVED_LINEAGE_ADMISSION_FORBIDDEN/u);

  const duplicateChain = structuredClone(duplicate);
  duplicateChain.sourceId = "coffee-second-repack-ledger";
  duplicateChain.artifact = artifact("coffee-second-repack-ledger",
    "outsider/test-second-repack/v1");
  duplicateChain.verification = receipt("coffee-second-repack-ledger",
    "FULL_SELECTED_SOURCE_REDERIVED");
  duplicateChain.lineage.duplicateOfSourceId = duplicate.sourceId;
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataOnly, duplicate, duplicateChain],
  }), /DUPLICATE_TARGET_NOT_PRIMARY_LEDGER_ENTRY/u);

  const wrongDomain = structuredClone(coffee);
  wrongDomain.identity.physicality = "SIMULATED_ROBOT";
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [wrongDomain, metadataOnly],
  }), /PHYSICALITY_EVIDENCE_DOMAIN_MISMATCH/u);

  const publisherClaimedPromotion = structuredClone(coffee);
  publisherClaimedPromotion.identity.physicality =
    "PUBLISHER_CLAIMED_REAL_ROBOT";
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [publisherClaimedPromotion, metadataOnly],
  }), /PUBLISHER_CLAIMED_PHYSICALITY_PROMOTION_FORBIDDEN/u);

  const metadataSegmentPromotion = structuredClone(metadataOnly);
  metadataSegmentPromotion.segments.recovery = segment(
    "publisher-corpus-size-claim", 1, 0, "PUBLISHER_METADATA_PROMOTION", "NONE");
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataSegmentPromotion],
  }), /METADATA_SEGMENT_PROMOTION_FORBIDDEN/u);

  const metadataPhysicalityPromotion = structuredClone(metadataOnly);
  metadataPhysicalityPromotion.identity.physicality = "REAL_ROBOT";
  assert.throws(() => buildEpisodeDataPublicSourceCatalog({
    discoveryScopes,
    sources: [coffee, metadataPhysicalityPromotion],
  }), /METADATA_IDENTITY_SCOPE_BOUNDARY_INVALID/u);
});
