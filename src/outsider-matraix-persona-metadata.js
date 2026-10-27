/*
 * Maintainer-reviewed MatrAIx Persona 1M metadata projection.
 *
 * This adapter deliberately does not ingest Persona rows or claim to replay
 * upstream files. It rebuilds a zero-authority SIMULATED/DERIVED artifact from
 * a small local review manifest so schema topology, missingness, composition,
 * and calibration boundaries can be used in coverage stress tests.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

export const MATRAIX_PERSONA_METADATA_SOURCE_SCHEMA
  = "outsider/matraix-persona-maintainer-reviewed-source/v1";
export const MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA
  = "outsider/matraix-persona-maintainer-reviewed-metadata-projection/v1";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function fail(code) {
  throw new Error(code);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exactObject(value, keys, code) {
  canonicalizeStrict(value);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) fail(code);
}

function exactArray(value, expected, code) {
  canonicalizeStrict(value);
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) fail(code);
}

function exact(value, expected, code) {
  if (value !== expected) fail(code);
}

function timestamp(value, code) {
  if (typeof value !== "string" || !UTC_MILLIS.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
}

function parseSourceBytes(sourceBytes) {
  let bytes;
  if (Buffer.isBuffer(sourceBytes)) bytes = Buffer.from(sourceBytes);
  else if (typeof sourceBytes === "string") bytes = Buffer.from(sourceBytes, "utf8");
  else fail("MATRAIX_SOURCE_BYTES_REQUIRED");
  if (bytes.length === 0 || bytes.length > 1_000_000) {
    fail("MATRAIX_SOURCE_BYTES_SIZE_INVALID");
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) fail("MATRAIX_SOURCE_UTF8_INVALID");
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    fail("MATRAIX_SOURCE_JSON_INVALID");
  }
  canonicalizeStrict(manifest);
  validateSourceManifest(manifest);
  return { manifest, bytesHash: bytesDigest(bytes),
    manifestHash: digest(MATRAIX_PERSONA_METADATA_SOURCE_SCHEMA, manifest) };
}

function validateSourceManifest(value) {
  exactObject(value, ["schema", "reviewedAt", "reviewScope", "sources",
    "publisherMetadata", "maintainerBoundary"], "MATRAIX_SOURCE_STRUCTURE_INVALID");
  exact(value.schema, MATRAIX_PERSONA_METADATA_SOURCE_SCHEMA,
    "MATRAIX_SOURCE_SCHEMA_INVALID");
  timestamp(value.reviewedAt, "MATRAIX_SOURCE_REVIEWED_AT_INVALID");
  exact(value.reviewScope, "PUBLISHER_METADATA_ONLY_NO_UPSTREAM_SOURCE_BYTES",
    "MATRAIX_SOURCE_SCOPE_INVALID");

  exactObject(value.sources, ["github", "huggingFace", "paper"],
    "MATRAIX_SOURCE_PINS_INVALID");
  const { github, huggingFace, paper } = value.sources;
  exactObject(github, ["repository", "url", "revision", "revisionKind",
    "reviewedPaths", "sourceBytesDownloaded", "rootCodeLicenseDeclared"],
  "MATRAIX_GITHUB_PIN_INVALID");
  exact(github.repository, "MatrAIx-ai/MatrAIx-Persona-8B",
    "MATRAIX_GITHUB_REPOSITORY_INVALID");
  exact(github.url, "https://github.com/MatrAIx-ai/MatrAIx-Persona-8B",
    "MATRAIX_GITHUB_URL_INVALID");
  if (!COMMIT.test(github.revision)
    || github.revision !== "39d850270917db25535dac3f7aa2561732050e82") {
    fail("MATRAIX_GITHUB_REVISION_INVALID");
  }
  exact(github.revisionKind, "REPOSITORY_HEAD_OBSERVED",
    "MATRAIX_GITHUB_REVISION_KIND_INVALID");
  exactArray(github.reviewedPaths, ["README.md", "docs/persona/README.md",
    "docs/persona/pipeline.md"], "MATRAIX_GITHUB_PATHS_INVALID");
  exact(github.sourceBytesDownloaded, false, "MATRAIX_GITHUB_BYTES_BOUNDARY_INVALID");
  exact(github.rootCodeLicenseDeclared, "MIT", "MATRAIX_CODE_LICENSE_INVALID");

  exactObject(huggingFace, ["dataset", "url", "revision", "revisionKind",
    "payloadTreeRevisionEstablished", "sourceBytesDownloaded",
    "parquetShardsDownloaded", "hubCardLicenseTagObserved",
    "datasetOverallLicenseDeclared", "sourceLicensesAndTermsContinueToApply"],
  "MATRAIX_HF_PIN_INVALID");
  exact(huggingFace.dataset, "MatrAIx2026/MatrAIx_Persona_1M",
    "MATRAIX_HF_DATASET_INVALID");
  exact(huggingFace.url,
    "https://huggingface.co/datasets/MatrAIx2026/MatrAIx_Persona_1M",
    "MATRAIX_HF_URL_INVALID");
  if (!COMMIT.test(huggingFace.revision)
    || huggingFace.revision !== "74f1edf9c9d024e6d3e412c3fda0efccfb2029c7") {
    fail("MATRAIX_HF_REVISION_INVALID");
  }
  exact(huggingFace.revisionKind, "DATASET_REPOSITORY_HEAD_OBSERVED",
    "MATRAIX_HF_REVISION_KIND_INVALID");
  exact(huggingFace.payloadTreeRevisionEstablished, false,
    "MATRAIX_HF_PAYLOAD_REVISION_BOUNDARY_INVALID");
  exact(huggingFace.sourceBytesDownloaded, false,
    "MATRAIX_HF_BYTES_BOUNDARY_INVALID");
  exact(huggingFace.parquetShardsDownloaded, 0,
    "MATRAIX_HF_PARQUET_BOUNDARY_INVALID");
  exact(huggingFace.hubCardLicenseTagObserved, null,
    "MATRAIX_HF_LICENSE_TAG_INVALID");
  exact(huggingFace.datasetOverallLicenseDeclared, null,
    "MATRAIX_DATASET_LICENSE_MUST_REMAIN_UNDECLARED");
  exact(huggingFace.sourceLicensesAndTermsContinueToApply, true,
    "MATRAIX_UPSTREAM_TERMS_BOUNDARY_INVALID");

  exactObject(paper, ["arxivId", "version", "url", "submittedAt",
    "sourceBytesDownloaded"], "MATRAIX_PAPER_PIN_INVALID");
  exact(paper.arxivId, "2608.04205", "MATRAIX_ARXIV_ID_INVALID");
  exact(paper.version, "v1", "MATRAIX_ARXIV_VERSION_INVALID");
  exact(paper.url, "https://arxiv.org/html/2608.04205v1",
    "MATRAIX_ARXIV_URL_INVALID");
  timestamp(paper.submittedAt, "MATRAIX_ARXIV_TIME_INVALID");
  exact(paper.sourceBytesDownloaded, false, "MATRAIX_ARXIV_BYTES_BOUNDARY_INVALID");

  exactObject(value.publisherMetadata, ["schemaTopology", "coreset", "missingness",
    "calibration", "privacy"], "MATRAIX_PUBLISHER_METADATA_INVALID");
  const { schemaTopology, coreset, missingness, calibration, privacy }
    = value.publisherMetadata;
  exactObject(schemaTopology, ["dimensionCount", "dimensionType",
    "dimensionIdentifiersReplayed", "categoricalValueDomainsReplayed", "groups"],
  "MATRAIX_SCHEMA_TOPOLOGY_INVALID");
  exact(schemaTopology.dimensionCount, 1290, "MATRAIX_DIMENSION_COUNT_INVALID");
  exact(schemaTopology.dimensionType, "CATEGORICAL", "MATRAIX_DIMENSION_TYPE_INVALID");
  exact(schemaTopology.dimensionIdentifiersReplayed, false,
    "MATRAIX_DIMENSION_IDS_BOUNDARY_INVALID");
  exact(schemaTopology.categoricalValueDomainsReplayed, false,
    "MATRAIX_VALUE_DOMAINS_BOUNDARY_INVALID");
  const expectedGroups = [
    { id: "BACKGROUND", dimensions: 238 },
    { id: "PSYCHOLOGY", dimensions: 210 },
    { id: "CAPABILITY", dimensions: 331 },
    { id: "BEHAVIOR_AND_INTERACTION", dimensions: 124 },
    { id: "LIFESTYLE", dimensions: 387 },
  ];
  exactArray(schemaTopology.groups, expectedGroups, "MATRAIX_GROUP_COUNTS_INVALID");
  if (schemaTopology.groups.reduce((sum, row) => sum + row.dimensions, 0) !== 1290) {
    fail("MATRAIX_GROUP_COUNT_SUM_INVALID");
  }

  exactObject(coreset, ["releasedRows", "humanGroundedRows", "syntheticRows",
    "parquetShardsClaimed", "publisherDisplayedApproximateCompressedSize",
    "sourceCounts"], "MATRAIX_CORESET_INVALID");
  exact(coreset.releasedRows, 999847, "MATRAIX_RELEASED_ROWS_INVALID");
  exact(coreset.humanGroundedRows, 599847, "MATRAIX_HUMAN_ROWS_INVALID");
  exact(coreset.syntheticRows, 400000, "MATRAIX_SYNTHETIC_ROWS_INVALID");
  exact(coreset.parquetShardsClaimed, 10, "MATRAIX_SHARD_CLAIM_INVALID");
  exact(coreset.publisherDisplayedApproximateCompressedSize, "4.17 GB",
    "MATRAIX_DISPLAYED_SIZE_INVALID");
  const expectedCounts = [
    { id: "WIKIPEDIA_EXTRACTION", rows: 323438 },
    { id: "AMAZON_REVIEW_EXTRACTION", rows: 97915 },
    { id: "STACK_OVERFLOW_SURVEY_EXTRACTION", rows: 113120 },
    { id: "PRISM_ALIGNMENT", rows: 1487 },
    { id: "GENERAL_SOCIAL_SURVEY", rows: 63532 },
    { id: "MATRAIX_VOLUNTEER_SURVEY", rows: 355 },
    { id: "FULL_DAG_SYNTHETIC", rows: 400000 },
  ];
  exactArray(coreset.sourceCounts, expectedCounts, "MATRAIX_SOURCE_COUNTS_INVALID");
  const human = coreset.sourceCounts.slice(0, 6).reduce((sum, row) => sum + row.rows, 0);
  const total = coreset.sourceCounts.reduce((sum, row) => sum + row.rows, 0);
  if (human !== coreset.humanGroundedRows || total !== coreset.releasedRows
    || coreset.humanGroundedRows + coreset.syntheticRows !== coreset.releasedRows) {
    fail("MATRAIX_SOURCE_COUNT_ACCOUNTING_INVALID");
  }

  exactObject(missingness, ["publisherClaimsNullBitmap",
    "publisherClaimsMissingValuesNeverImputed", "rowLevelMissingnessReplayed",
    "perDimensionMissingnessRatesReplayed", "missingMeansZero"],
  "MATRAIX_MISSINGNESS_INVALID");
  exact(missingness.publisherClaimsNullBitmap, true, "MATRAIX_NULL_BITMAP_CLAIM_INVALID");
  exact(missingness.publisherClaimsMissingValuesNeverImputed, true,
    "MATRAIX_IMPUTATION_CLAIM_INVALID");
  exact(missingness.rowLevelMissingnessReplayed, false,
    "MATRAIX_ROW_MISSINGNESS_BOUNDARY_INVALID");
  exact(missingness.perDimensionMissingnessRatesReplayed, false,
    "MATRAIX_DIM_MISSINGNESS_BOUNDARY_INVALID");
  exact(missingness.missingMeansZero, false, "MATRAIX_MISSING_ZERO_BOUNDARY_INVALID");

  exactObject(calibration, ["publisherClaimedMarginals", "bestEffortMarginalsOnly",
    "jointCoverageOver1290DimensionsRepresentative",
    "humanGroundedSourcesPopulationRepresentative",
    "releaseSplitIsRealWorldSourceRatioEstimate", "publisherClaimsAuditShipsWithRelease",
    "publisherClaimsManifestShipsWithRelease",
    "publisherClaimsPerFileHashesShipWithRelease", "auditBytesReplayed",
    "manifestBytesReplayed", "perFileHashesReplayed"],
  "MATRAIX_CALIBRATION_INVALID");
  exactArray(calibration.publisherClaimedMarginals, ["AGE_BRACKET", "REGION",
    "GENDER_IDENTITY", "URBANICITY"], "MATRAIX_CALIBRATION_MARGINALS_INVALID");
  for (const [key, expected] of Object.entries({
    bestEffortMarginalsOnly: true,
    jointCoverageOver1290DimensionsRepresentative: false,
    humanGroundedSourcesPopulationRepresentative: false,
    releaseSplitIsRealWorldSourceRatioEstimate: false,
    publisherClaimsAuditShipsWithRelease: true,
    publisherClaimsManifestShipsWithRelease: true,
    publisherClaimsPerFileHashesShipWithRelease: true,
    auditBytesReplayed: false,
    manifestBytesReplayed: false,
    perFileHashesReplayed: false,
  })) exact(calibration[key], expected, `MATRAIX_CALIBRATION_${key}_INVALID`);

  exactObject(privacy, ["publisherClaimsDirectIdentifiersRemoved",
    "publisherClaimsVolunteerInstrumentCollectedNoNameContactOrAccountId",
    "independentlyVerified", "rawRowsInspected",
    "reidentificationAssessmentComplete"], "MATRAIX_PRIVACY_INVALID");
  exact(privacy.publisherClaimsDirectIdentifiersRemoved, true,
    "MATRAIX_PUBLISHER_PII_CLAIM_INVALID");
  exact(privacy.publisherClaimsVolunteerInstrumentCollectedNoNameContactOrAccountId, true,
    "MATRAIX_VOLUNTEER_PII_CLAIM_INVALID");
  exact(privacy.independentlyVerified, false, "MATRAIX_PII_VERIFICATION_BOUNDARY_INVALID");
  exact(privacy.rawRowsInspected, 0, "MATRAIX_RAW_ROWS_BOUNDARY_INVALID");
  exact(privacy.reidentificationAssessmentComplete, false,
    "MATRAIX_REIDENTIFICATION_BOUNDARY_INVALID");

  exactObject(value.maintainerBoundary, ["realityClass", "trainingRows",
    "causalExperienceUnits", "realityCensusEligible", "affectedPartyRegisterEligible",
    "effectGroundTruthEligible", "actionAuthority", "delegationAuthority",
    "pricingAuthority", "guaranteeAuthority", "settlementAuthority"],
  "MATRAIX_MAINTAINER_BOUNDARY_INVALID");
  exact(value.maintainerBoundary.realityClass, "SIMULATED_DERIVED_METADATA",
    "MATRAIX_REALITY_CLASS_INVALID");
  for (const key of ["trainingRows", "causalExperienceUnits"]) {
    exact(value.maintainerBoundary[key], 0, `MATRAIX_BOUNDARY_${key}_INVALID`);
  }
  for (const key of ["realityCensusEligible", "affectedPartyRegisterEligible",
    "effectGroundTruthEligible", "actionAuthority", "delegationAuthority",
    "pricingAuthority", "guaranteeAuthority", "settlementAuthority"]) {
    exact(value.maintainerBoundary[key], false, `MATRAIX_BOUNDARY_${key}_INVALID`);
  }
}

function artifactBody(parsed) {
  const { manifest, bytesHash, manifestHash } = parsed;
  const { github, huggingFace, paper } = manifest.sources;
  const { schemaTopology, coreset, missingness, calibration, privacy }
    = manifest.publisherMetadata;
  return {
    schema: MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA,
    generatedAt: manifest.reviewedAt,
    realityClass: "SIMULATED_DERIVED_METADATA",
    source: {
      projectionKind: "MAINTAINER_REVIEWED_PUBLISHER_METADATA",
      localManifestSchema: manifest.schema,
      localManifestHash: manifestHash,
      localManifestBytesHash: bytesHash,
      reviewScope: manifest.reviewScope,
      githubRevision: github.revision,
      huggingFaceRepositoryRevision: huggingFace.revision,
      arxivVersion: `${paper.arxivId}${paper.version}`,
      upstreamSourceBytesReplayed: false,
      payloadTreeRevisionEstablished: false,
      parquetShardsReplayed: 0,
      personaRowsReplayed: 0,
    },
    schemaTopology: {
      dimensionCount: schemaTopology.dimensionCount,
      dimensionType: schemaTopology.dimensionType,
      groups: schemaTopology.groups,
      dimensionIdentifiersReplayed: false,
      categoricalValueDomainsReplayed: false,
      useClass: "SCHEMA_TOPOLOGY_COVERAGE_STRESS_TEST_ONLY",
    },
    composition: {
      releasedRowsClaimed: coreset.releasedRows,
      humanGroundedRowsClaimed: coreset.humanGroundedRows,
      syntheticRowsClaimed: coreset.syntheticRows,
      sourceCountsClaimed: coreset.sourceCounts,
      parquetShardsClaimed: coreset.parquetShardsClaimed,
      publisherDisplayedApproximateCompressedSize:
        coreset.publisherDisplayedApproximateCompressedSize,
      countClass: "PUBLISHER_METADATA_CLAIM",
      rowDenominatorReplayed: false,
      observedRows: 0,
    },
    missingness: {
      publisherClaimsNullBitmap: missingness.publisherClaimsNullBitmap,
      publisherClaimsMissingValuesNeverImputed:
        missingness.publisherClaimsMissingValuesNeverImputed,
      rowLevelMissingnessReplayed: false,
      perDimensionMissingnessRatesReplayed: false,
      missingMeansZero: false,
      zeroFillPermitted: false,
      stressMode: "INJECT_UNKNOWN_MISSINGNESS_HYPOTHESES_ONLY",
    },
    calibration: {
      publisherClaimedMarginals: calibration.publisherClaimedMarginals,
      bestEffortMarginalsOnly: true,
      publisherClaimsAuditShipsWithRelease: true,
      publisherClaimsManifestShipsWithRelease: true,
      publisherClaimsPerFileHashesShipWithRelease: true,
      auditBytesReplayed: false,
      manifestBytesReplayed: false,
      perFileHashesReplayed: false,
      calibrationEstablished: false,
      populationRepresentative: false,
      jointCoverageOver1290DimensionsRepresentative: false,
      humanGroundedSourcesPopulationRepresentative: false,
      releaseSplitIsRealWorldSourceRatioEstimate: false,
      targetTransfer: false,
    },
    privacyAndRights: {
      rootCodeLicenseDeclared: github.rootCodeLicenseDeclared,
      hubCardLicenseTagObserved: huggingFace.hubCardLicenseTagObserved,
      datasetOverallLicenseDeclared: null,
      sourceLicensesAndTermsContinueToApply: true,
      perSourceLicensesResolved: false,
      perRowRightsResolved: false,
      trainingRightsResolved: false,
      publisherClaimsDirectIdentifiersRemoved:
        privacy.publisherClaimsDirectIdentifiersRemoved,
      piiIndependentlyVerified: false,
      rawRowsInspected: 0,
      reidentificationAssessmentComplete: false,
      privacyReviewComplete: false,
      legalConclusion: false,
    },
    stressTestUse: {
      decision: "ADMIT_SCHEMA_MISSINGNESS_COVERAGE_STRESS_TEST_ONLY",
      schemaTopologyStressTest: true,
      missingnessStressTest: true,
      sourceCompositionStressTest: true,
      affectedPartyCoverageHypothesisStressTest: true,
      effectChannelCoverageHypothesisStressTest: true,
      realAffectedPartyRegister: false,
      realEffectGroundTruth: false,
      realityCensus: false,
      governedTraining: false,
      automaticTraining: false,
      productionModel: false,
      admissibleOutputs: [
        "SIMULATED_COVERAGE_GAP_HYPOTHESES",
        "SIMULATED_MISSINGNESS_FAILURE_CASES",
        "SIMULATED_SOURCE_COMPOSITION_SENSITIVITY",
      ],
    },
    authority: {
      trainingRows: 0,
      causalExperienceUnits: 0,
      authorityUnits: 0,
      evidenceAuthority: false,
      actionReady: false,
      actionAuthority: false,
      delegationAuthority: false,
      pricingAuthority: false,
      guaranteeAuthority: false,
      settlementAuthority: false,
      realityCensusEligible: false,
      affectedPartyRegisterEligible: false,
      effectGroundTruthEligible: false,
    },
  };
}

export function buildMatraixPersonaMetadataProjection(sourceManifestBytes) {
  const body = artifactBody(parseSourceBytes(sourceManifestBytes));
  return deepFreeze({ ...body,
    artifactHash: digest(MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA, body) });
}

function verifySemantics(value) {
  const failures = [];
  const check = (condition, code) => { if (!condition) failures.push(code); };
  try {
    canonicalizeStrict(value);
    exactObject(value, ["schema", "generatedAt", "realityClass", "source",
      "schemaTopology", "composition", "missingness", "calibration",
      "privacyAndRights", "stressTestUse", "authority", "artifactHash"],
    "ARTIFACT_STRUCTURE_INVALID");
    exactObject(value.source, ["projectionKind", "localManifestSchema",
      "localManifestHash", "localManifestBytesHash", "reviewScope", "githubRevision",
      "huggingFaceRepositoryRevision", "arxivVersion", "upstreamSourceBytesReplayed",
      "payloadTreeRevisionEstablished", "parquetShardsReplayed", "personaRowsReplayed"],
    "ARTIFACT_SOURCE_STRUCTURE_INVALID");
    exactObject(value.schemaTopology, ["dimensionCount", "dimensionType", "groups",
      "dimensionIdentifiersReplayed", "categoricalValueDomainsReplayed", "useClass"],
    "ARTIFACT_SCHEMA_TOPOLOGY_STRUCTURE_INVALID");
    exactObject(value.composition, ["releasedRowsClaimed", "humanGroundedRowsClaimed",
      "syntheticRowsClaimed", "sourceCountsClaimed", "parquetShardsClaimed",
      "publisherDisplayedApproximateCompressedSize", "countClass",
      "rowDenominatorReplayed", "observedRows"],
    "ARTIFACT_COMPOSITION_STRUCTURE_INVALID");
    exactObject(value.missingness, ["publisherClaimsNullBitmap",
      "publisherClaimsMissingValuesNeverImputed", "rowLevelMissingnessReplayed",
      "perDimensionMissingnessRatesReplayed", "missingMeansZero", "zeroFillPermitted",
      "stressMode"], "ARTIFACT_MISSINGNESS_STRUCTURE_INVALID");
    exactObject(value.calibration, ["publisherClaimedMarginals",
      "bestEffortMarginalsOnly", "publisherClaimsAuditShipsWithRelease",
      "publisherClaimsManifestShipsWithRelease",
      "publisherClaimsPerFileHashesShipWithRelease", "auditBytesReplayed",
      "manifestBytesReplayed", "perFileHashesReplayed", "calibrationEstablished",
      "populationRepresentative", "jointCoverageOver1290DimensionsRepresentative",
      "humanGroundedSourcesPopulationRepresentative",
      "releaseSplitIsRealWorldSourceRatioEstimate", "targetTransfer"],
    "ARTIFACT_CALIBRATION_STRUCTURE_INVALID");
    exactObject(value.privacyAndRights, ["rootCodeLicenseDeclared",
      "hubCardLicenseTagObserved", "datasetOverallLicenseDeclared",
      "sourceLicensesAndTermsContinueToApply", "perSourceLicensesResolved",
      "perRowRightsResolved", "trainingRightsResolved",
      "publisherClaimsDirectIdentifiersRemoved", "piiIndependentlyVerified",
      "rawRowsInspected", "reidentificationAssessmentComplete", "privacyReviewComplete",
      "legalConclusion"], "ARTIFACT_RIGHTS_STRUCTURE_INVALID");
    exactObject(value.stressTestUse, ["decision", "schemaTopologyStressTest",
      "missingnessStressTest", "sourceCompositionStressTest",
      "affectedPartyCoverageHypothesisStressTest",
      "effectChannelCoverageHypothesisStressTest", "realAffectedPartyRegister",
      "realEffectGroundTruth", "realityCensus", "governedTraining",
      "automaticTraining", "productionModel", "admissibleOutputs"],
    "ARTIFACT_STRESS_USE_STRUCTURE_INVALID");
    exactObject(value.authority, ["trainingRows", "causalExperienceUnits",
      "authorityUnits", "evidenceAuthority", "actionReady", "actionAuthority",
      "delegationAuthority", "pricingAuthority", "guaranteeAuthority",
      "settlementAuthority", "realityCensusEligible", "affectedPartyRegisterEligible",
      "effectGroundTruthEligible"], "ARTIFACT_AUTHORITY_STRUCTURE_INVALID");
    timestamp(value.generatedAt, "ARTIFACT_GENERATED_AT_INVALID");
    check(value.schema === MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA,
      "ARTIFACT_SCHEMA_INVALID");
    check(value.realityClass === "SIMULATED_DERIVED_METADATA",
      "ARTIFACT_REALITY_CLASS_INVALID");
    check(HASH.test(value.artifactHash), "ARTIFACT_HASH_INVALID");
    const body = { ...value };
    delete body.artifactHash;
    check(value.artifactHash === digest(MATRAIX_PERSONA_METADATA_PROJECTION_SCHEMA, body),
      "ARTIFACT_HASH_MISMATCH");

    check(value.source?.projectionKind === "MAINTAINER_REVIEWED_PUBLISHER_METADATA",
      "SOURCE_PROJECTION_KIND_INVALID");
    check(value.source?.localManifestSchema === MATRAIX_PERSONA_METADATA_SOURCE_SCHEMA
      && value.source?.reviewScope === "PUBLISHER_METADATA_ONLY_NO_UPSTREAM_SOURCE_BYTES"
      && value.source?.arxivVersion === "2608.04205v1",
    "SOURCE_REVIEW_SCOPE_INVALID");
    check(HASH.test(value.source?.localManifestHash), "SOURCE_MANIFEST_HASH_INVALID");
    check(HASH.test(value.source?.localManifestBytesHash),
      "SOURCE_MANIFEST_BYTES_HASH_INVALID");
    check(value.source?.githubRevision
      === "39d850270917db25535dac3f7aa2561732050e82", "SOURCE_GITHUB_PIN_INVALID");
    check(value.source?.huggingFaceRepositoryRevision
      === "74f1edf9c9d024e6d3e412c3fda0efccfb2029c7", "SOURCE_HF_PIN_INVALID");
    check(value.source?.upstreamSourceBytesReplayed === false
      && value.source?.payloadTreeRevisionEstablished === false
      && value.source?.parquetShardsReplayed === 0
      && value.source?.personaRowsReplayed === 0, "SOURCE_BYTES_BOUNDARY_INVALID");

    const groupTotal = value.schemaTopology?.groups?.reduce(
      (sum, row) => sum + row.dimensions, 0);
    exactArray(value.schemaTopology?.groups, [
      { id: "BACKGROUND", dimensions: 238 },
      { id: "PSYCHOLOGY", dimensions: 210 },
      { id: "CAPABILITY", dimensions: 331 },
      { id: "BEHAVIOR_AND_INTERACTION", dimensions: 124 },
      { id: "LIFESTYLE", dimensions: 387 },
    ], "SCHEMA_GROUPS_INVALID");
    check(value.schemaTopology?.dimensionCount === 1290 && groupTotal === 1290,
      "SCHEMA_DIMENSION_ACCOUNTING_INVALID");
    check(value.schemaTopology?.dimensionType === "CATEGORICAL"
      && value.schemaTopology?.useClass
        === "SCHEMA_TOPOLOGY_COVERAGE_STRESS_TEST_ONLY",
    "SCHEMA_USE_BOUNDARY_INVALID");
    check(value.schemaTopology?.dimensionIdentifiersReplayed === false
      && value.schemaTopology?.categoricalValueDomainsReplayed === false,
    "SCHEMA_REPLAY_BOUNDARY_INVALID");
    const sourceTotal = value.composition?.sourceCountsClaimed?.reduce(
      (sum, row) => sum + row.rows, 0);
    exactArray(value.composition?.sourceCountsClaimed, [
      { id: "WIKIPEDIA_EXTRACTION", rows: 323438 },
      { id: "AMAZON_REVIEW_EXTRACTION", rows: 97915 },
      { id: "STACK_OVERFLOW_SURVEY_EXTRACTION", rows: 113120 },
      { id: "PRISM_ALIGNMENT", rows: 1487 },
      { id: "GENERAL_SOCIAL_SURVEY", rows: 63532 },
      { id: "MATRAIX_VOLUNTEER_SURVEY", rows: 355 },
      { id: "FULL_DAG_SYNTHETIC", rows: 400000 },
    ], "COMPOSITION_SOURCE_COUNTS_INVALID");
    check(value.composition?.releasedRowsClaimed === 999847
      && value.composition?.humanGroundedRowsClaimed === 599847
      && value.composition?.syntheticRowsClaimed === 400000
      && value.composition?.parquetShardsClaimed === 10
      && value.composition?.publisherDisplayedApproximateCompressedSize === "4.17 GB"
      && value.composition?.countClass === "PUBLISHER_METADATA_CLAIM"
      && sourceTotal === 999847, "COMPOSITION_ACCOUNTING_INVALID");
    check(value.composition?.rowDenominatorReplayed === false
      && value.composition?.observedRows === 0, "COMPOSITION_REPLAY_BOUNDARY_INVALID");

    check(value.missingness?.rowLevelMissingnessReplayed === false
      && value.missingness?.publisherClaimsNullBitmap === true
      && value.missingness?.publisherClaimsMissingValuesNeverImputed === true
      && value.missingness?.perDimensionMissingnessRatesReplayed === false
      && value.missingness?.missingMeansZero === false
      && value.missingness?.zeroFillPermitted === false
      && value.missingness?.stressMode
        === "INJECT_UNKNOWN_MISSINGNESS_HYPOTHESES_ONLY",
    "MISSINGNESS_BOUNDARY_INVALID");
    check(value.calibration?.calibrationEstablished === false
      && value.calibration?.bestEffortMarginalsOnly === true
      && value.calibration?.publisherClaimsAuditShipsWithRelease === true
      && value.calibration?.publisherClaimsManifestShipsWithRelease === true
      && value.calibration?.publisherClaimsPerFileHashesShipWithRelease === true
      && value.calibration?.populationRepresentative === false
      && value.calibration?.jointCoverageOver1290DimensionsRepresentative === false
      && value.calibration?.humanGroundedSourcesPopulationRepresentative === false
      && value.calibration?.releaseSplitIsRealWorldSourceRatioEstimate === false
      && value.calibration?.targetTransfer === false
      && value.calibration?.auditBytesReplayed === false
      && value.calibration?.manifestBytesReplayed === false
      && value.calibration?.perFileHashesReplayed === false,
    "CALIBRATION_BOUNDARY_INVALID");
    exactArray(value.calibration?.publisherClaimedMarginals,
      ["AGE_BRACKET", "REGION", "GENDER_IDENTITY", "URBANICITY"],
      "CALIBRATION_MARGINALS_INVALID");

    check(value.privacyAndRights?.datasetOverallLicenseDeclared === null
      && value.privacyAndRights?.rootCodeLicenseDeclared === "MIT"
      && value.privacyAndRights?.hubCardLicenseTagObserved === null
      && value.privacyAndRights?.perSourceLicensesResolved === false
      && value.privacyAndRights?.perRowRightsResolved === false
      && value.privacyAndRights?.trainingRightsResolved === false
      && value.privacyAndRights?.sourceLicensesAndTermsContinueToApply === true
      && value.privacyAndRights?.publisherClaimsDirectIdentifiersRemoved === true
      && value.privacyAndRights?.piiIndependentlyVerified === false
      && value.privacyAndRights?.rawRowsInspected === 0
      && value.privacyAndRights?.reidentificationAssessmentComplete === false
      && value.privacyAndRights?.privacyReviewComplete === false
      && value.privacyAndRights?.legalConclusion === false,
    "RIGHTS_PRIVACY_BOUNDARY_INVALID");

    check(value.stressTestUse?.decision
      === "ADMIT_SCHEMA_MISSINGNESS_COVERAGE_STRESS_TEST_ONLY"
      && value.stressTestUse?.schemaTopologyStressTest === true
      && value.stressTestUse?.missingnessStressTest === true
      && value.stressTestUse?.sourceCompositionStressTest === true
      && value.stressTestUse?.affectedPartyCoverageHypothesisStressTest === true
      && value.stressTestUse?.effectChannelCoverageHypothesisStressTest === true
      && value.stressTestUse?.realAffectedPartyRegister === false
      && value.stressTestUse?.realEffectGroundTruth === false
      && value.stressTestUse?.realityCensus === false
      && value.stressTestUse?.governedTraining === false
      && value.stressTestUse?.automaticTraining === false
      && value.stressTestUse?.productionModel === false,
    "STRESS_TEST_USE_BOUNDARY_INVALID");
    exactArray(value.stressTestUse?.admissibleOutputs, [
      "SIMULATED_COVERAGE_GAP_HYPOTHESES",
      "SIMULATED_MISSINGNESS_FAILURE_CASES",
      "SIMULATED_SOURCE_COMPOSITION_SENSITIVITY",
    ], "STRESS_TEST_OUTPUTS_INVALID");
    check(value.authority?.trainingRows === 0
      && value.authority?.causalExperienceUnits === 0
      && value.authority?.authorityUnits === 0
      && Object.entries(value.authority).every(([key, item]) => (
        ["trainingRows", "causalExperienceUnits", "authorityUnits"].includes(key)
          ? item === 0 : item === false)), "AUTHORITY_BOUNDARY_INVALID");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "ARTIFACT_INVALID");
  }
  return [...new Set(failures)].sort();
}

function report(failures, localManifestReplayed) {
  return deepFreeze({
    ok: failures.length === 0,
    failures,
    sourceReplay: {
      localMaintainerManifestReplayed: failures.length === 0 && localManifestReplayed,
      upstreamSourceBytesReplayed: false,
      personaRowsReplayed: 0,
    },
    realityClass: "SIMULATED_DERIVED_METADATA",
    trainingRows: 0,
    causalExperienceUnits: 0,
    realityCensusEligible: false,
    actionAuthority: false,
    actionReady: false,
  });
}

export function verifyMatraixPersonaMetadataProjection(value) {
  return report(verifySemantics(value), false);
}

export function verifyMatraixPersonaMetadataProjectionWithSource(value,
  sourceManifestBytes) {
  const failures = verifySemantics(value);
  try {
    const expected = buildMatraixPersonaMetadataProjection(sourceManifestBytes);
    if (canonicalizeStrict(value) !== canonicalizeStrict(expected)) {
      failures.push("LOCAL_SOURCE_MANIFEST_REBUILD_MISMATCH");
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "LOCAL_SOURCE_MANIFEST_INVALID");
  }
  return report([...new Set(failures)].sort(), true);
}

export function isMatraixPersonaMetadataStressProjection(value) {
  return verifyMatraixPersonaMetadataProjection(value).ok
    && value?.stressTestUse?.decision
      === "ADMIT_SCHEMA_MISSINGNESS_COVERAGE_STRESS_TEST_ONLY"
    && value?.authority?.trainingRows === 0
    && value?.authority?.causalExperienceUnits === 0
    && value?.authority?.realityCensusEligible === false
    && value?.authority?.actionAuthority === false;
}
