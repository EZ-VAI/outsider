import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
  buildFrozenEpisodeDataPublicSourceProfile,
  verifyFrozenEpisodeDataPublicSourceProfile,
} from "../src/outsider-episode-data-public-source-profile.js";
import {
  EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
  EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA,
  buildEpisodeDataPublicSourceCatalog,
  verifyEpisodeDataPublicSourceCatalog,
} from "../src/outsider-episode-data-public-source-catalog.js";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_BINDINGS = Object.freeze({
  "agentlens-metadata-disposition": [
    "sha256:38991598f4166d1eabaf992b444a186cc3f35dcc2cbb78a05c7726b607f92c6f",
    "sha256:6667e70b30f1641c2c35573ae372ec5f9709d5f032ba3d14e20690767d946976",
    "SOURCE_ROOT", "METADATA_ONLY",
  ],
  "ajay-dagger-interventions-no-video": [
    "sha256:e6c9cbf571ffa686b2ce4f9a8291d88756521d22847be09c05fde26eb3d37335",
    "sha256:61fafd371073697836d34f9a4c41564e49f24929200402ef2e95f832d86ac988",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "andresg-recovery-name-family": [
    "sha256:1c752fcb974686ea159a82161dd06a8545da0821434009710733121c57ef16f9",
    "sha256:4bf428cd8978ba39f91ec343e1adb00a5ee0f86f8bea6335ebe29cb91bf2e71e",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "handover-linked-intervention-lineage": [
    "sha256:24b5771e0fb8ad10d23f9de2509713d211bb88e74224463bfb42cd769408877d",
    "sha256:2319b9119b0da1e6747e79ef4d3a97dc131218848ece02f5063d59b63167da33",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "hiesh-sequence-recovery-metadata-only": [
    "sha256:76b1a2a990f834af1620b0d2075555d02f4b82cae73e13c74d472cb62e6a9f6d",
    "sha256:43f2f979b345707c3c81a6b3c67480ffa8375e7e41a3cb4bb199a41f7ef3511f",
    "SOURCE_ROOT", "METADATA_ONLY",
  ],
  "kelin-kewang-intervention-exact-repack-lineage": [
    "sha256:c5ef0387a9282e2d848877dbcce2d3229fa443b569b7b9b76300fd37c50da877",
    "sha256:1b7c69d24fd70cde38cd9c2a1d6b6d2737d20066b74b9e3844cc415b401e5e35",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "peg-intervention": [
    "sha256:99b7a505aa26ca35407f9f1b22f9c391f041408be6fead2d7a500c0825a3bca5",
    "sha256:c619f78517b3d03fcf8f144b224b8f1647d50fb9f34d803ae22942f112e343e5",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "realrobot-plug93-recovery-numeric-slice": [
    "sha256:21003908b3797019d1d489367c98eedfadd1bc68f9d970e14b2725032f610333",
    "sha256:a22c8d054bcdaa837c9e667ad0dd12877a6684692cf6d51a6ed5f6c6303e068b",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "rmpd-robot-motion-sample": [
    "sha256:3111bdbac979c2e2bf8d0d92e51ac3d32f2dcaa2589661ebb9278da9e06235f8",
    "sha256:425c37215c0cb3ebbb455d256c01f7d822753e9a8b41ed7df28b7453708b06d7",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
  "so101-coffee-recovery-census": [
    "sha256:45c880df84ff2369d294fd7b72e6a7d5716bfbcab8c6f738154dd8cd4b0d1e2a",
    "sha256:b17525d514aa1764e7024d07e7347ab8e9330561259232ea4da9f6c6f124eb4d",
    "SOURCE_MANIFEST", "FULL_SELECTED_SOURCE",
  ],
  "so101-hil-rl-linked-lineage": [
    "sha256:25507b78c02777e50baca532364f37a722f69d1adcf1cd2ef3f148123d720806",
    "sha256:31bd0e7d069a94ad6cd481d21858e3cffae9a67fdb146905299e03ca82c7d367",
    "SOURCE_ROOT", "FULL_SELECTED_SOURCE",
  ],
});

test("frozen profile source-specifically replays typed public evidence and exact duplicate lineage", () => {
  const catalog = buildFrozenEpisodeDataPublicSourceProfile({ workspaceRoot });
  assert.equal(EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
    "outsider/episode-data-public-source-profile/2026-08-30-intervention-v4");
  assert.equal(catalog.schema, EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA);
  assert.equal(catalog.schemaVersion, "2.0.0");
  // Historical source bytes are unchanged. The HIESH verifier now imports
    // the separately bounded historical serializer, so its code receipt changes.
    assert.equal(catalog.catalogHash,
    "sha256:62fda2e058366c53c9adc6a21c27c94b0d5883f14ccd7a3fcee47486fd5a8af3");
  assert.equal(catalog.sourceSummary.sourceCount, 11);
  assert.equal(catalog.sourceSummary.nonDuplicateLedgerEntryCount, 10);
  assert.equal(catalog.sourceSummary.lineageDuplicateSourceCount, 1);
  assert.equal(catalog.sourceSummary.allArtifactAttestationsStructurallyBound, true);
  assert.equal(catalog.sourceSummary.sourceReplayTrustEstablishedByCatalogAlone,
    false);
  assert.equal(catalog.populationRegistry.entryCount, 40);
  assert.equal(catalog.discovery.scopeCount, 5);
  assert.equal(catalog.discovery.exhaustedDeclaredScopeCount, 5);
  assert.equal(catalog.discovery.allDeclaredScopesExhausted, true);
  assert.equal(catalog.discovery.sourceUniverseExhausted, false);
  assert.equal(catalog.discovery.undiscoveredSourcesRuledOut, false);
  assert.equal(catalog.discovery.globalExhaustion, false);
  assert.equal(catalog.populationRegistry.crossPopulationTotal, null);
  assert.equal(catalog.populationRegistry.crossPopulationAdditionProhibited, true);
  assert.equal(catalog.populationRegistry.crossSourceDisjointnessEstablished, false);
  assert.deepEqual(catalog.sourceSummary.ledgerEntryPhysicalityCounts, {
    CONSTRUCTED_DIGITAL: 0,
    METADATA_ONLY: 2,
    PUBLISHER_CLAIMED_REAL_ROBOT: 5,
    REAL_DIGITAL: 0,
    REAL_MECHANICAL: 1,
    REAL_ROBOT: 1,
    SIMULATED_ROBOT: 2,
  });
  assert.deepEqual(catalog.sourceSummary.nonDuplicateLedgerEntryPhysicalityCounts, {
    CONSTRUCTED_DIGITAL: 0,
    METADATA_ONLY: 2,
    PUBLISHER_CLAIMED_REAL_ROBOT: 5,
    REAL_DIGITAL: 0,
    REAL_MECHANICAL: 1,
    REAL_ROBOT: 1,
    SIMULATED_ROBOT: 1,
  });
  assert.deepEqual(catalog.sourceSummary.dispositionCounts, {
    ADMITTED_RESEARCH_ONLY: 2,
    LEDGER_DUPLICATE: 1,
    METADATA_ONLY: 2,
    QUARANTINE_EVALUATION_ONLY: 6,
    REJECTED: 0,
  });

  assert.deepEqual(Object.fromEntries(catalog.sources.map((source) =>
    [source.sourceId, [source.artifact.artifactHash,
      source.artifact.sourceBindingHash, source.artifact.sourceBindingKind,
      source.verification.attestation.replayClass]])), EXPECTED_BINDINGS);
  for (const source of catalog.sources) {
    assert.equal(source.verification.attestationStructurallyAccepted, true);
    assert.equal(source.verification.attestationTrustBoundary,
      EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY);
    assert.equal(source.verification.artifactHash, source.artifact.artifactHash);
    assert.equal(source.verification.sourceBindingHash,
      source.artifact.sourceBindingHash);
    assert.equal(source.verification.sourceBindingKind,
      source.artifact.sourceBindingKind);
    assert.equal(source.verification.attestation.verifiedArtifactHash,
      source.artifact.artifactHash);
    assert.equal(source.verification.attestation.verifiedSourceBindingHash,
      source.artifact.sourceBindingHash);
    assert.equal(source.verification.attestedPayloadReplay,
      !["agentlens-metadata-disposition",
        "hiesh-sequence-recovery-metadata-only"].includes(source.sourceId));
  }

  const source = (sourceId) => catalog.sources.find((item) => item.sourceId === sourceId);
  const ajay = source("ajay-dagger-interventions-no-video");
  const peg = source("peg-intervention");
  const handover = source("handover-linked-intervention-lineage");
  const plug = source("realrobot-plug93-recovery-numeric-slice");
  const hil = source("so101-hil-rl-linked-lineage");
  const kelin = source("kelin-kewang-intervention-exact-repack-lineage");
  const hiesh = source("hiesh-sequence-recovery-metadata-only");
  assert.ok(ajay && peg && handover && plug && hil && kelin && hiesh);

  assert.deepEqual(catalog.segmentCoverage.segments.recovery.sourceNativeSourceIds,
    ["so101-coffee-recovery-census"]);
  assert.deepEqual(catalog.segmentCoverage.segments.intervention.sourceNativeSourceIds,
    ["ajay-dagger-interventions-no-video",
      "handover-linked-intervention-lineage", "peg-intervention",
      "so101-hil-rl-linked-lineage"]);
  assert.deepEqual(catalog.segmentCoverage.segments.actionTrace.sourceNativeSourceIds,
    ["ajay-dagger-interventions-no-video", "andresg-recovery-name-family",
      "handover-linked-intervention-lineage", "peg-intervention",
      "realrobot-plug93-recovery-numeric-slice", "rmpd-robot-motion-sample",
      "so101-coffee-recovery-census", "so101-hil-rl-linked-lineage"]);
  assert.equal(ajay.segments.intervention.sourceNativeCount, 84);
  assert.equal(ajay.populations.find((item) => item.populationId
    === "derived-weighted-episode-occurrence").count, 713);
  assert.equal(ajay.populations.find((item) => item.populationId
    === "unique-native-dagger-intervention-frame").count, 13_920);
  assert.equal(ajay.populations.find((item) => item.populationId
    === "weighted-intervention-episode-exposure").count, 218);
  const ajayBase = ajay.populations.find((item) => item.populationId
    === "base-prefix-episode-logical-identity");
  assert.deepEqual(ajayBase, {
    populationId: "base-prefix-episode-logical-identity",
    unit: "base episode byte-identically duplicated in derived prefix",
    count: 495,
    evidenceDomain: "DERIVED_LINEAGE",
    relationship: "OVERLAPPING_VIEW",
    parentPopulationId: "derived-weighted-episode-occurrence",
    realityEligible: false,
    analyticAdmission: false,
  });
  assert.equal(peg.segments.intervention.sourceNativeCount, 134);
  assert.equal(handover.segments.intervention.sourceNativeCount, 389_629);
  assert.equal(hil.segments.intervention.sourceNativeCount, 78_986);
  assert.deepEqual(plug.segments.recovery, {
    populationId: null,
    sourceNativeCount: 0,
    independentCount: 0,
    sourceNativeAttribution: "NONE",
    independentAttribution: "NONE",
    crossAttributionAdditionPermitted: false,
    additiveTotal: null,
  });
  assert.equal(plug.populations.find((item) => item.populationId
    === "publisher-declared-recovery-cohort-membership").count, 17);
  assert.equal(hiesh.populations.find((item) => item.populationId
    === "published-hdf5-object-identity").count, 400);
  assert.equal(Object.values(hiesh.segments).every((item) =>
    item.sourceNativeCount === 0 && item.independentCount === 0), true);
  assert.equal(kelin.disposition, "LEDGER_DUPLICATE");
  assert.deepEqual(kelin.lineage, {
    kind: "EXACT_REPACK_DUPLICATE",
    duplicateOfSourceId: "peg-intervention",
    addsUniqueEpisodes: 0,
    addsUniqueFrames: 0,
    evidenceHash: "sha256:facd471169b999caf56c6d68095f5a9f6b34b5fc298fcbe30d8378bf0a78e338",
  });
  assert.equal(kelin.populations.find((item) => item.populationId
    === "additional-unique-episode").count, 0);
  assert.equal(Object.values(kelin.segments).every((item) =>
    item.sourceNativeCount === 0 && item.independentCount === 0), true);

  const interventionScope = catalog.discovery.scopes.find((scope) =>
    scope.scopeId === "hf-robot-intervention-three-query-ledger-20260830");
  assert.deepEqual(interventionScope, {
    scopeId: "hf-robot-intervention-three-query-ledger-20260830",
    channel: "HUGGING_FACE_OFFICIAL_DATASETS_SEARCH_API",
    queryOrDeclaration:
      "full=true&limit=1000 for intervention, corrective, and human-in-loop",
    cutoff: "2026-08-30T23:26:04.000Z",
    evidenceHash: "sha256:14aaff0402dfc7dc8edbfb0833ae42d9989f41f0f30b5417688f53766fa007df",
    candidateCount: 258,
    terminalCount: 258,
    declaredScopeExhausted: true,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
  });
  assert.equal(catalog.sources.some((item) => item.sourceId
    === "hf-robot-intervention-declared-scope-ledger"), false);
  assert.equal(catalog.segmentCoverage.completeEpisodeIntersectionCount, 0);
  assert.equal(catalog.useBoundary.productionTrainingRows, 0);
  assert.equal(catalog.useBoundary.networkAdmissionSources, 0);
  assert.equal(catalog.useBoundary.delegationAuthoritySources, 0);
  assert.equal(catalog.useBoundary.causalExperienceUnits, 0);

  const structural = verifyEpisodeDataPublicSourceCatalog(catalog, {
    discoveryScopes: catalog.discovery.scopes,
    sources: catalog.sources,
  });
  assert.equal(structural.ok, true);
  assert.equal(structural.sourceReplayEstablished, false);
  assert.equal(structural.attestationTrustBoundary,
    EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY);
  const trusted = verifyFrozenEpisodeDataPublicSourceProfile(catalog,
    { workspaceRoot });
  assert.deepEqual(trusted, {
    ok: true,
    fixedProfileWorkspaceRebuildEstablished: true,
    declaredVerificationRadiusReplayEstablished: true,
    allCatalogSourcesFullPayloadReplayEstablished: false,
    metadataOnlySourceIds: ["agentlens-metadata-disposition",
      "hiesh-sequence-recovery-metadata-only"],
    profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
    catalogHash: catalog.catalogHash,
    sourceCount: 11,
    populationEntryCount: 40,
    discoveryScopeCount: 5,
  });

  const resealedSources = JSON.parse(JSON.stringify(catalog.sources));
  resealedSources.find((item) => item.sourceId
    === "ajay-dagger-interventions-no-video").family += "_CALLER_RESEALED";
  const resealed = buildEpisodeDataPublicSourceCatalog({
    discoveryScopes: catalog.discovery.scopes,
    sources: resealedSources,
  });
  assert.equal(verifyEpisodeDataPublicSourceCatalog(resealed, {
    discoveryScopes: resealed.discovery.scopes,
    sources: resealed.sources,
  }).sourceReplayEstablished, false);
  assert.deepEqual(verifyFrozenEpisodeDataPublicSourceProfile(resealed,
    { workspaceRoot }), {
    ok: false,
    fixedProfileWorkspaceRebuildEstablished: false,
    declaredVerificationRadiusReplayEstablished: false,
    allCatalogSourcesFullPayloadReplayEstablished: false,
    error: "EPISODE_DATA_PUBLIC_SOURCE_PROFILE_REPRODUCTION_MISMATCH",
  });
});

test("profile refuses a workspace without the frozen artifact set", () => {
  assert.throws(() => buildFrozenEpisodeDataPublicSourceProfile({
    workspaceRoot: path.join(workspaceRoot, "test", "fixtures"),
  }), /EPISODE_DATA_PUBLIC_SOURCE_PROFILE_REPORT_FILE_INVALID/u);
});
