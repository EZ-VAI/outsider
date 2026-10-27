/*
 * Frozen-source profile for the Episode Data Engine public-source catalog.
 *
 * This module deliberately does not trust report.json by itself.  Every
 * normalized source is admitted only after the source-specific artifact
 * verifier has replayed the underlying private source directory and (where
 * provided by that source family) rebuilt its receipt.
 */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import {
  buildEpisodeDataPublicSourceCatalog,
  buildEpisodeDataPublicSourceVerificationReceipt,
  episodeDataPublicSourceCatalogDigest,
  EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA,
} from "./outsider-episode-data-public-source-catalog.js";
import {
  verifySo101CoffeeRecoveryCensusRunReceipt,
  verifySo101CoffeeRecoveryCensusWithSource,
} from "./outsider-so101-coffee-recovery-census.js";
import { verifyRmpdArtifactDirectory } from "./outsider-rmpd-robot-motion-sample.js";
import {
  verifyAgentLensMetadataDispositionArtifactDirectory,
} from "./outsider-agentlens-metadata-disposition.js";
import {
  verifyAjayDaggerArtifactDirectory,
} from "./outsider-ajay-dagger-interventions-no-video.js";
import {
  verifyAndresgRecoveryArtifactDirectory,
} from "./outsider-andresg-recovery-name-family.js";
import {
  verifyHandoverLinkedArtifactDirectory,
} from "./outsider-handover-linked-intervention-lineage.js";
import {
  verifyHfRobotInterventionArtifactDirectory,
} from "./outsider-hf-robot-intervention-declared-scope-ledger.js";
import {
  verifyHieshSequenceRecoveryArtifactDirectory,
} from "./outsider-hiesh-sequence-recovery-metadata-only.js";
import {
  verifyKelinKewangLineageArtifactWithSource,
} from "./outsider-kelin-kewang-intervention-lineage.js";
import {
  verifyPegInterventionArtifactWithSource,
} from "./outsider-peg-intervention.js";
import {
  verifyPlug93RecoveryArtifactDirectory,
} from "./outsider-realrobot-plug93-recovery-numeric-slice.js";
import {
  verifySo101HilRlLineageArtifactWithSource,
} from "./outsider-so101-hil-rl-lineage.js";

export const EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID =
  "outsider/episode-data-public-source-profile/2026-08-30-intervention-v4";
export const EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF =
  "2026-08-30T23:26:04.000Z";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const HASH = /^sha256:[a-f0-9]{64}$/u;

const FROZEN_SOURCE_CONTRACTS = Object.freeze({
  "ajay-dagger-interventions-no-video": Object.freeze({
    artifactHash: "sha256:e6c9cbf571ffa686b2ce4f9a8291d88756521d22847be09c05fde26eb3d37335",
    sourceBindingHash: "sha256:61fafd371073697836d34f9a4c41564e49f24929200402ef2e95f832d86ac988",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE_REDERIVED",
  }),
  "agentlens-metadata-disposition": Object.freeze({
    artifactHash: "sha256:38991598f4166d1eabaf992b444a186cc3f35dcc2cbb78a05c7726b607f92c6f",
    sourceBindingHash: "sha256:6667e70b30f1641c2c35573ae372ec5f9709d5f032ba3d14e20690767d946976",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "METADATA_ONLY",
    sourceSpecificVerificationLevel:
      "FULL_OFFICIAL_METADATA_AND_ABSENCE_REDERIVED",
  }),
  "andresg-recovery-name-family": Object.freeze({
    artifactHash: "sha256:1c752fcb974686ea159a82161dd06a8545da0821434009710733121c57ef16f9",
    sourceBindingHash: "sha256:4bf428cd8978ba39f91ec343e1adb00a5ee0f86f8bea6335ebe29cb91bf2e71e",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_DIRECTORY_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
  }),
  "handover-linked-intervention-lineage": Object.freeze({
    artifactHash: "sha256:24b5771e0fb8ad10d23f9de2509713d211bb88e74224463bfb42cd769408877d",
    sourceBindingHash: "sha256:2319b9119b0da1e6747e79ef4d3a97dc131218848ece02f5063d59b63167da33",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_DIRECTORY_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
  }),
  "hiesh-sequence-recovery-metadata-only": Object.freeze({
    artifactHash: "sha256:76b1a2a990f834af1620b0d2075555d02f4b82cae73e13c74d472cb62e6a9f6d",
    sourceBindingHash: "sha256:43f2f979b345707c3c81a6b3c67480ffa8375e7e41a3cb4bb199a41f7ef3511f",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "METADATA_ONLY",
    sourceSpecificVerificationLevel:
      "FIXED_TWO_REPOSITORY_METADATA_ONLY_TERMINAL_SOURCE_REDERIVED",
  }),
  "kelin-kewang-intervention-exact-repack-lineage": Object.freeze({
    artifactHash: "sha256:c5ef0387a9282e2d848877dbcce2d3229fa443b569b7b9b76300fd37c50da877",
    sourceBindingHash: "sha256:1b7c69d24fd70cde38cd9c2a1d6b6d2737d20066b74b9e3844cc415b401e5e35",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_TWO_PART_PARQUET_OFFSET_JOIN_PLUS_NESTED_KE_SELF_REPLAY",
  }),
  "peg-intervention": Object.freeze({
    artifactHash: "sha256:99b7a505aa26ca35407f9f1b22f9c391f041408be6fead2d7a500c0825a3bca5",
    sourceBindingHash: "sha256:c619f78517b3d03fcf8f144b224b8f1647d50fb9f34d803ae22942f112e343e5",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_PARQUET_EPISODE_INTERVENTION_SUCCESS_STATS_AND_HAND_MP4_SAMPLE_REPLAY",
  }),
  "realrobot-plug93-recovery-numeric-slice": Object.freeze({
    artifactHash: "sha256:21003908b3797019d1d489367c98eedfadd1bc68f9d970e14b2725032f610333",
    sourceBindingHash: "sha256:a22c8d054bcdaa837c9e667ad0dd12877a6684692cf6d51a6ed5f6c6303e068b",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_DIRECTORY_RANGE_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
  }),
  "rmpd-robot-motion-sample": Object.freeze({
    artifactHash: "sha256:3111bdbac979c2e2bf8d0d92e51ac3d32f2dcaa2589661ebb9278da9e06235f8",
    sourceBindingHash: "sha256:425c37215c0cb3ebbb455d256c01f7d822753e9a8b41ed7df28b7453708b06d7",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_SOURCE_DIRECTORY_REPORT_RECEIPT_AND_MECHANICAL_SAMPLE_REPLAY",
  }),
  "so101-coffee-recovery-census": Object.freeze({
    artifactHash: "sha256:45c880df84ff2369d294fd7b72e6a7d5716bfbcab8c6f738154dd8cd4b0d1e2a",
    sourceBindingHash: "sha256:b17525d514aa1764e7024d07e7347ab8e9330561259232ea4da9f6c6f124eb4d",
    sourceBindingKind: "SOURCE_MANIFEST",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_BYTE_AND_SOURCE_REPLAY+RUN_RECEIPT_REPLAY",
  }),
  "so101-hil-rl-linked-lineage": Object.freeze({
    artifactHash: "sha256:25507b78c02777e50baca532364f37a722f69d1adcf1cd2ef3f148123d720806",
    sourceBindingHash: "sha256:31bd0e7d069a94ad6cd481d21858e3cffae9a67fdb146905299e03ca82c7d367",
    sourceBindingKind: "SOURCE_ROOT",
    replayClass: "FULL_SELECTED_SOURCE",
    sourceSpecificVerificationLevel:
      "FULL_TWO_REPOSITORY_PINNED_BYTE_AND_PYARROW_REPLAY",
  }),
});

function fail(code, detail = null) {
  throw new Error(`EPISODE_DATA_PUBLIC_SOURCE_PROFILE_${code}${
    detail === null ? "" : `:${detail}`}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function readCanonicalJson(file, expectedSchema) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    fail("REPORT_FILE_INVALID", file);
  }
  if (!stat.isFile()) fail("REPORT_FILE_INVALID", file);
  const bytes = readFileSync(file);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("REPORT_JSON_INVALID", file);
  }
  if (value?.schema !== expectedSchema) fail("REPORT_SCHEMA_INVALID", file);
  if (!bytes.equals(Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"))) {
    fail("REPORT_NOT_CANONICAL", file);
  }
  return { bytes, value, fileSha256: sha256(bytes) };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail("JSON_INVALID", file);
  }
}

function verifierCodeHash(moduleBasename) {
  const file = path.join(MODULE_DIRECTORY, moduleBasename);
  return episodeDataPublicSourceCatalogDigest({
    sourceVerifierModuleHash: sha256(readFileSync(file)),
    attestationAdapterModuleHash: sha256(readFileSync(fileURLToPath(import.meta.url))),
  }, "outsider/episode-data-public-source-composite-verifier-code/v1");
}

function requireOk(result, sourceId) {
  if (!result || result.ok !== true) {
    fail("SOURCE_SPECIFIC_VERIFICATION_FAILED",
      `${sourceId}:${canonicalizeStrict(result ?? null)}`);
  }
  return result;
}

function buildBoundVerificationReceipt({ sourceId, verifierId, moduleBasename,
  verificationResult, expectedArtifactHash, expectedSourceBindingHash,
  verifiedArtifactHash, verifiedSourceBindingHash, sourceBindingKind = "SOURCE_ROOT",
  replayClass, sourceSpecificVerificationLevel }) {
  requireOk(verificationResult, sourceId);
  const contract = Object.hasOwn(FROZEN_SOURCE_CONTRACTS, sourceId)
    ? FROZEN_SOURCE_CONTRACTS[sourceId] : null;
  if (contract === null
    || expectedArtifactHash !== contract.artifactHash
    || expectedSourceBindingHash !== contract.sourceBindingHash
    || sourceBindingKind !== contract.sourceBindingKind
    || replayClass !== contract.replayClass
    || sourceSpecificVerificationLevel
      !== contract.sourceSpecificVerificationLevel) {
    fail("FROZEN_SOURCE_CONTRACT_INVALID", sourceId);
  }
  if (verifiedArtifactHash !== expectedArtifactHash
    || verifiedSourceBindingHash !== expectedSourceBindingHash) {
    fail("SOURCE_SPECIFIC_ATTESTATION_BINDING_INVALID", sourceId);
  }
  const verificationAttestation = {
    schema: EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA,
    ok: true,
    verifiedArtifactHash,
    verifiedSourceBindingHash,
    sourceBindingKind,
    replayClass,
    sourceSpecificVerificationLevel,
    sourceSpecificResultHash: episodeDataPublicSourceCatalogDigest(
      verificationResult,
      "outsider/episode-data-public-source-specific-verifier-result/v1"),
  };
  return buildEpisodeDataPublicSourceVerificationReceipt({
    verifierId,
    verifierCodeHash: verifierCodeHash(moduleBasename),
    verificationAttestation,
  });
}

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
  sourceNativeAttribution, independentAttribution = "NONE") {
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

function segments(overrides = {}) {
  return Object.fromEntries([
    "opportunityCensus", "delegationAuthorization", "actionTrace",
    "intervention", "effect", "outcome", "recovery", "longitudinal",
  ].map((name) => [name, overrides[name] ?? zeroSegment()]));
}

function clearanceEvidence(sourceId, artifactHash, sourceBindingHash,
  sourceBindingKind, kind) {
  return episodeDataPublicSourceCatalogDigest({
    sourceId, artifactHash, sourceBindingHash, sourceBindingKind, kind,
  }, "outsider/episode-data-public-source-clearance-evidence/v2");
}

function clearances({ sourceId, artifactHash, sourceBindingHash,
  sourceBindingKind = "SOURCE_ROOT", offlineResearchAllowed }) {
  return {
    revision: {
      status: "PINNED_AND_SOURCE_SPECIFICALLY_REPLAYED",
      evidenceHash: clearanceEvidence(sourceId, artifactHash, sourceBindingHash,
        sourceBindingKind, "REVISION"),
    },
    rights: {
      status: "FAIL_CLOSED_NO_LEGAL_ADJUDICATION",
      evidenceHash: clearanceEvidence(sourceId, artifactHash, sourceBindingHash,
        sourceBindingKind, "RIGHTS"),
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      redistributionAuthorized: false,
    },
    privacy: {
      status: "NO_PII_GUARANTEE_RAW_NOT_PROJECTED",
      evidenceHash: clearanceEvidence(sourceId, artifactHash, sourceBindingHash,
        sourceBindingKind, "PRIVACY"),
      rawContentProjected: false,
      noPiiGuaranteed: false,
    },
    use: {
      status: offlineResearchAllowed ? "OFFLINE_RESEARCH_ONLY" : "METADATA_ONLY",
      evidenceHash: clearanceEvidence(sourceId, artifactHash, sourceBindingHash,
        sourceBindingKind, "USE"),
      offlineResearchAllowed,
      authorizedTrainingAllowed: false,
      networkAdmissionAllowed: false,
      delegationAuthorityAllowed: false,
    },
  };
}

function artifactDescriptor({ directoryBasename, reportRelativePath, report,
  reportFileSha256, sourceBindingHash, sourceBindingKind = "SOURCE_ROOT" }) {
  if (!HASH.test(report.artifactHash ?? "") || !HASH.test(sourceBindingHash ?? "")
    || !["SOURCE_ROOT", "SOURCE_MANIFEST"].includes(sourceBindingKind)) {
    fail("ARTIFACT_BINDING_HASH_INVALID", directoryBasename);
  }
  return {
    directoryBasename,
    reportRelativePath,
    reportSchema: report.schema,
    reportFileSha256,
    artifactHash: report.artifactHash,
    sourceBindingHash,
    sourceBindingKind,
  };
}

function noExactRepackLineage(evidenceHash) {
  return {
    kind: "NO_EXACT_REPACK_RELATION_ESTABLISHED",
    duplicateOfSourceId: null,
    addsUniqueEpisodes: null,
    addsUniqueFrames: null,
    evidenceHash,
  };
}

function coffeeSource(workspaceRoot, scopeId) {
  const sourceId = "so101-coffee-recovery-census";
  const directoryBasename = "outsider-so101-coffee-recovery-census-20260829-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "so101-coffee-recovery-census.json";
  const { bytes: reportBytes, value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/so101-coffee-recovery-census/v1");
  const sourceDirectory = path.join(directory, "source");
  const sourceVerification = requireOk(
    verifySo101CoffeeRecoveryCensusWithSource(report, sourceDirectory), sourceId);
  const receiptVerification = requireOk(
    verifySo101CoffeeRecoveryCensusRunReceipt(
      readJson(path.join(directory, "run-receipt.json")), reportBytes), sourceId);
  const manifest = readJson(path.join(sourceDirectory, "acquisition-manifest.json"));
  if (manifest.manifestHash !== report.dataset.sourceManifestHash) {
    fail("COFFEE_MANIFEST_BINDING_MISMATCH");
  }
  const verificationResult = {
    ok: true,
    reportFileSha256: fileSha256,
    sourceVerification,
    receiptVerification,
  };
  return {
    sourceId,
    family: "REAL_ROBOT_RETRY_AND_RECOVERY_MORPHOLOGY",
    disposition: "ADMITTED_RESEARCH_ONLY",
    identity: {
      publisher: "nevertmr",
      datasetId: report.dataset.datasetId,
      revision: report.dataset.pinnedRevision,
      physicality: "REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: manifest.manifestHash,
      sourceBindingKind: "SOURCE_MANIFEST" }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifySo101CoffeeRecoveryCensusWithSource+receipt",
      moduleBasename: "outsider-so101-coffee-recovery-census.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: manifest.manifestHash,
      verifiedArtifactHash: sourceVerification.reportHash,
      verifiedSourceBindingHash: sourceVerification.sourceManifestHash,
      sourceBindingKind: "SOURCE_MANIFEST",
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel:
        `${sourceVerification.verificationLevel}+RUN_RECEIPT_REPLAY`,
    }),
    scope: {
      scopeId,
      scopeKind: "BOUNDED_SOURCE_NATIVE_SLICE",
      description: "complete fifteen-run attempt ledger and kept no-video episode closure",
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
        count: report.census.keptRealRobotEpisodes,
        evidenceDomain: "REAL_ROBOT_EXECUTION",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: true,
        analyticAdmission: true,
      },
      {
        populationId: "attempt-census-record",
        unit: "attempt record",
        count: report.census.attemptCensusRecords,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "frame-within-kept-episode",
        unit: "frame",
        count: report.census.actionTraceFrames,
        evidenceDomain: "REAL_ROBOT_EXECUTION",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "kept-real-robot-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      opportunityCensus: segment("attempt-census-record",
        report.census.attemptCensusRecords, 0, "PROSPECTIVE_PUBLISHER_RUN_LEDGER"),
      actionTrace: segment("kept-real-robot-episode",
        report.census.actionTraceEpisodes, 0, "SOURCE_NATIVE_ROBOT_ACTION_STATE"),
      outcome: segment("kept-real-robot-episode",
        report.publisherOutcomeClaims.keptEpisodeClaims, 0,
        "OPERATOR_PUBLISHER_LABEL"),
      recovery: segment("attempt-census-record",
        report.retryAndRecovery.counts.recoveredPublisherFailAttempts, 0,
        "CROSS_EPISODE_PUBLISHER_FAIL_TO_RETRY_MORPHOLOGY"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: manifest.manifestHash,
      sourceBindingKind: "SOURCE_MANIFEST", offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function rmpdSource(workspaceRoot, scopeId) {
  const sourceId = "rmpd-robot-motion-sample";
  const directoryBasename = "outsider-rmpd-robot-motion-sample-20260829-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath), "outsider/rmpd-robot-motion-sample/v1");
  const verificationResult = requireOk(verifyRmpdArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "REAL_MECHANICAL_COMMAND_MEASUREMENT_TELEMETRY",
    disposition: "ADMITTED_RESEARCH_ONLY",
    identity: {
      publisher: "RMPD authors via Zenodo",
      datasetId: "Zenodo:18549433",
      revision: `record-${report.source.recordId}-revision-${report.source.revision}`,
      physicality: "REAL_MECHANICAL",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyRmpdArtifactDirectory",
      moduleBasename: "outsider-rmpd-robot-motion-sample.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.artifactHash,
      verifiedSourceBindingHash: verificationResult.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel:
        "FULL_SOURCE_DIRECTORY_REPORT_RECEIPT_AND_MECHANICAL_SAMPLE_REPLAY",
    }),
    scope: {
      scopeId,
      scopeKind: "FULL_SOURCE_NATIVE_GROUP",
      description: "complete publisher-provided sample archive and schema",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "KNOWN_PUBLISHER_SELECTION",
    },
    populations: [
      {
        populationId: "sample-mechanical-trajectory",
        unit: "sample trajectory",
        count: 6,
        evidenceDomain: "REAL_MECHANICAL_TELEMETRY",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: true,
        analyticAdmission: true,
      },
      {
        populationId: "primitive-motion-segment",
        unit: "primitive segment",
        count: 18,
        evidenceDomain: "REAL_MECHANICAL_TELEMETRY",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "sample-mechanical-trajectory",
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "metadata-segment-record",
        unit: "metadata segment record",
        count: 24,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "sample-mechanical-trajectory",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "measured-pose-record",
        unit: "measured pose row",
        count: 12_816,
        evidenceDomain: "REAL_MECHANICAL_TELEMETRY",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "sample-mechanical-trajectory",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "commanded-position-record",
        unit: "commanded position row",
        count: 6_105,
        evidenceDomain: "REAL_MECHANICAL_TELEMETRY",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "sample-mechanical-trajectory",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      actionTrace: segment("sample-mechanical-trajectory", 6, 0,
        "SOURCE_NATIVE_COMMAND_AND_MEASURED_PATH"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function agentLensSource(workspaceRoot, scopeId) {
  const sourceId = "agentlens-metadata-disposition";
  const directoryBasename = "outsider-agentlens-metadata-disposition-20260829-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "agentlens-metadata-disposition.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/microsoft-agentlens-metadata-disposition/v1");
  const verificationResult = requireOk(
    verifyAgentLensMetadataDispositionArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "AGENT_DATASET_METADATA_ABSENCE_DISPOSITION",
    disposition: "METADATA_ONLY",
    identity: {
      publisher: "Microsoft Research",
      datasetId: "AgentLens",
      revision: "arXiv:2605.12925v3",
      physicality: "METADATA_ONLY",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyAgentLensMetadataDispositionArtifactDirectory",
      moduleBasename: "outsider-agentlens-metadata-disposition.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "METADATA_ONLY",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "METADATA_ONLY_DISPOSITION",
      description: "official publication plus declared GitHub and Hugging Face absence snapshots",
      sourceNativeGroupComplete: false,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "METADATA_ONLY",
    },
    populations: [{
      populationId: "publisher-corpus-size-claim",
      unit: "claimed trajectory",
      count: report.publisherClaims.corpus.trajectories,
      evidenceDomain: "METADATA_CLAIM",
      relationship: "METADATA_ONLY",
      parentPopulationId: null,
      realityEligible: false,
      analyticAdmission: false,
    }],
    segments: segments(),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: false }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function hieshMetadataOnlySource(workspaceRoot, scopeId) {
  const sourceId = "hiesh-sequence-recovery-metadata-only";
  const directoryBasename =
    "outsider-hiesh-sequence-recovery-metadata-only-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/hiesh-sequence-recovery-metadata-only/v1");
  const verificationResult = requireOk(
    verifyHieshSequenceRecoveryArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  if (report.disposition !== "METADATA_ONLY_TERMINAL_DISPOSITION"
    || report.terminalPreflight.metadataOnlyTerminalDisposition !== true
    || report.terminalPreflight.closureCompleted !== false
    || report.terminalPreflight.failureCode
      !== "IMAGE_PAYLOAD_READ_DURING_LAYOUT"
    || report.terminalPreflight.rawRangePayloadsProjected !== false
    || report.terminalPreflight.wholeFileFallbackUsed !== false
    || report.zeroClaimBoundary.nativeOutcomeRows !== 0
    || report.zeroClaimBoundary.recoveryEffectRows !== 0) {
    fail("HIESH_METADATA_ONLY_BOUNDARY_INVALID");
  }
  const publishedHdf5Objects = report.source.repositories.reduce(
    (sum, repository) => sum + repository.inventory.hdf5Files, 0);
  return {
    sourceId,
    family: "SEQUENCE_RECOVERY_METADATA_ONLY_ZERO_IMAGE_GATE",
    disposition: "METADATA_ONLY",
    identity: {
      publisher: "Hiesh",
      datasetId: report.source.repositories.map((item) => item.datasetId)
        .join(" + "),
      revision: report.source.repositories.map((item) => item.revision).join("+"),
      physicality: "METADATA_ONLY",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.terminalPreflight.evidenceHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyHieshSequenceRecoveryArtifactDirectory",
      moduleBasename: "outsider-hiesh-sequence-recovery-metadata-only.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.report.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "METADATA_ONLY",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "METADATA_ONLY_DISPOSITION",
      description:
        "two fixed 200-object repositories with selected same-ordinal pair stopped at the zero-image Range gate",
      sourceNativeGroupComplete: false,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "METADATA_ONLY",
    },
    populations: [{
      populationId: "published-hdf5-object-identity",
      unit: "fixed-revision HDF5 object identity",
      count: publishedHdf5Objects,
      evidenceDomain: "METADATA_CLAIM",
      relationship: "METADATA_ONLY",
      parentPopulationId: null,
      realityEligible: false,
      analyticAdmission: false,
    }],
    segments: segments(),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: false }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function ajayDaggerInterventionSource(workspaceRoot, scopeId) {
  const sourceId = "ajay-dagger-interventions-no-video";
  const directoryBasename =
    "outsider-ajay-dagger-interventions-no-video-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/ajay-dagger-interventions-no-video/v1");
  const verificationResult = requireOk(
    verifyAjayDaggerArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  const derived = report.typedDenominators.derivedPopulation;
  const base = report.typedDenominators.basePublisherPopulation;
  const nativeIntervention =
    report.typedDenominators.publisherNativeInterventionFamily;
  const weightedExposure =
    report.typedDenominators.weightedInterventionExposure;
  if (report.disposition !== "QUARANTINE_EVALUATION_ONLY"
    || report.source.completeDerivedNoVideo !== true
    || report.source.completeFixedBaseNoVideo !== true
    || report.source.videoPayloadFilesAcquired !== 0
    || base.addToDerivedPopulation !== false
    || base.byteIdenticalDerivedPrefixParquets !== base.episodes
    || report.typedDenominators.crossTotal !== null
    || report.semanticBoundary.weightedCopiesCollapsedByNativeProvenanceAndSemanticContent
      !== true
    || report.semanticBoundary.daggerInterventionDoesNotEstablishRecovery !== true
    || report.semanticBoundary.independentOutcomeRows !== 0
    || report.semanticBoundary.recoveryEffectRows !== 0
    || report.zeroClaimBoundary.authorizedTrainingRows !== 0
    || report.zeroClaimBoundary.authorityRows !== 0) {
    fail("AJAY_DAGGER_BOUNDARY_INVALID");
  }
  return {
    sourceId,
    family:
      "PUBLISHER_CLAIMED_REAL_ROBOT_DAGGER_WEIGHTED_INTERVENTION_TELEMETRY",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "ajaysri",
      datasetId: report.source.repositories.map((item) => item.datasetId)
        .join(" + "),
      revision: report.source.repositories.map((item) => item.revision).join("+"),
      physicality: "PUBLISHER_CLAIMED_REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyAjayDaggerArtifactDirectory",
      moduleBasename: "outsider-ajay-dagger-interventions-no-video.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.report.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "FULL_SOURCE_NATIVE_GROUP",
      description:
        "complete fixed derived and base no-video groups with publisher-native DAgger provenance",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "KNOWN_PUBLISHER_SELECTION",
    },
    populations: [
      {
        populationId: "derived-weighted-episode-occurrence",
        unit: "derived weighted episode occurrence",
        count: derived.episodes,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "derived-frame-occurrence",
        unit: "frame within derived weighted episode occurrence",
        count: derived.frames,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "derived-weighted-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "base-prefix-episode-logical-identity",
        unit: "base episode byte-identically duplicated in derived prefix",
        count: base.episodes,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "derived-weighted-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "unique-native-dagger-intervention-segment",
        unit: "unique publisher-native DAgger provenance segment",
        count: nativeIntervention.segments,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "derived-weighted-episode-occurrence",
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "unique-native-dagger-intervention-frame",
        unit: "frame within unique publisher-native DAgger segment",
        count: nativeIntervention.frames,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "unique-native-dagger-intervention-segment",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "weighted-intervention-episode-exposure",
        unit: "weighted copied episode exposure to DAgger intervention",
        count: weightedExposure.episodeInstances,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "derived-weighted-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      actionTrace: segment("derived-weighted-episode-occurrence",
        derived.episodes, 0,
        "SOURCE_NATIVE_WEIGHTED_ROBOT_TELEMETRY_OCCURRENCE_NOT_UNIQUE_EXECUTION"),
      intervention: segment("unique-native-dagger-intervention-segment",
        nativeIntervention.segments, 0,
        "SOURCE_NATIVE_DAGGER_PROVENANCE_SEGMENT_NOT_HUMAN_AUTHORIZATION"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: false }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function pegInterventionSource(workspaceRoot, scopeId) {
  const sourceId = "peg-intervention";
  const directoryBasename = "outsider-peg-intervention-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "peg-intervention.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath), "outsider/peg-intervention/v1");
  const verificationResult = requireOk(verifyPegInterventionArtifactWithSource(
    report, path.join(directory, "source")), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "SIMULATED_ROBOT_NATIVE_INTERVENTION_AND_PUBLISHER_OUTCOME",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "KeWangRobotics",
      datasetId: report.source.id,
      revision: report.source.revision,
      physicality: "SIMULATED_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyPegInterventionArtifactWithSource",
      moduleBasename: "outsider-peg-intervention.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.artifactHash,
      verifiedSourceBindingHash: verificationResult.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "BOUNDED_SOURCE_NATIVE_SLICE",
      description: "all published episodes, complete no-video telemetry and complete hand camera modality",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "UNKNOWN_ATTEMPT_CENSUS",
    },
    populations: [
      {
        populationId: "simulated-source-native-episode",
        unit: "episode",
        count: report.typedDenominators.SOURCE_NATIVE_EPISODE,
        evidenceDomain: "SIMULATED_ROBOT_EXECUTION",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "action-state-qvel-frame",
        unit: "frame",
        count: report.typedDenominators.ACTION_STATE_QVEL_FRAME,
        evidenceDomain: "SIMULATED_ROBOT_EXECUTION",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "simulated-source-native-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "native-intervention-segment",
        unit: "intervention segment",
        count: report.typedDenominators.INTERVENTION_SEGMENT,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "simulated-source-native-episode",
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "publisher-outcome-episode",
        unit: "publisher outcome episode",
        count: report.outcomeDenominatorBoundary.publisherEpisodeOutcomeDenominator,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "simulated-source-native-episode",
        realityEligible: false,
        analyticAdmission: true,
      },
    ],
    segments: segments({
      actionTrace: segment("simulated-source-native-episode",
        report.typedDenominators.SOURCE_NATIVE_EPISODE, 0,
        "SOURCE_NATIVE_SIMULATED_ROBOT_ACTION_STATE_QVEL"),
      intervention: segment("native-intervention-segment",
        report.typedDenominators.INTERVENTION_SEGMENT, 0,
        "SOURCE_NATIVE_INTERVENTION_SEGMENT_NOT_HUMAN_AUTHORIZATION"),
      outcome: segment("publisher-outcome-episode",
        report.outcomeDenominatorBoundary.publisherEpisodeOutcomeDenominator, 0,
        "PUBLISHER_CONSTANT_BROADCAST_EPISODE_OUTCOME_NOT_INDEPENDENT"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function handoverLinkedSource(workspaceRoot, scopeId) {
  const sourceId = "handover-linked-intervention-lineage";
  const directoryBasename =
    "outsider-handover-linked-intervention-lineage-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/handover-linked-intervention-lineage/v1");
  const verificationResult = requireOk(
    verifyHandoverLinkedArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "ROBOT_INTERVENTION_ABSOLUTE_DELTA_AND_NEGATIVE_CONTROL_LINEAGE",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "Jiacheng0603",
      datasetId: report.source.sources.map((item) => item.id).join(" + "),
      revision: report.source.sources.map((item) => item.revision).join("+"),
      physicality: "PUBLISHER_CLAIMED_REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyHandoverLinkedArtifactDirectory",
      moduleBasename: "outsider-handover-linked-intervention-lineage.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.report.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel:
        "FULL_DIRECTORY_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
    }),
    scope: {
      scopeId,
      scopeKind: "FULL_SOURCE_NATIVE_GROUP",
      description: "complete pinned three-repository no-video linked family",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "UNKNOWN_ATTEMPT_CENSUS",
    },
    populations: [
      {
        populationId: "repository-episode-occurrence",
        unit: "repository episode occurrence",
        count: report.denominators.REPOSITORY_EPISODE_OCCURRENCE,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "native-positive-intervention-frame-occurrence",
        unit: "repository positive intervention frame occurrence",
        count: report.replay.repositories.intervention.intervention.positiveRows
          + report.replay.repositories.intervention_delta.intervention.positiveRows,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "repository-frame-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "repository-frame-occurrence",
        unit: "repository frame occurrence",
        count: report.denominators.REPOSITORY_FRAME_OCCURRENCE,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "repository-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "byte-linked-episode-key",
        unit: "byte-linked episode key",
        count: report.denominators.BYTE_LINKED_EPISODE_KEY,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "repository-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "publisher-success-occurrence",
        unit: "publisher episode success occurrence",
        count: report.denominators.PUBLISHER_EPISODE_SUCCESS_TRUE_OCCURRENCE,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "repository-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      actionTrace: segment("repository-episode-occurrence",
        report.denominators.REPOSITORY_EPISODE_OCCURRENCE, 0,
        "SOURCE_NATIVE_ROBOT_TELEMETRY_OCCURRENCE_PHYSICALITY_UNRESOLVED"),
      intervention: segment("native-positive-intervention-frame-occurrence",
        report.replay.repositories.intervention.intervention.positiveRows
          + report.replay.repositories.intervention_delta.intervention.positiveRows,
        0,
        "SOURCE_NATIVE_REPOSITORY_INTERVENTION_OCCURRENCE_DUPLICATES_ALLOWED_NOT_AUTHORITY"),
      outcome: segment("publisher-success-occurrence",
        report.denominators.PUBLISHER_EPISODE_SUCCESS_TRUE_OCCURRENCE, 0,
        "PUBLISHER_EPISODE_SIDECAR_SUCCESS_NOT_INDEPENDENT"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function plug93Source(workspaceRoot, scopeId) {
  const sourceId = "realrobot-plug93-recovery-numeric-slice";
  const directoryBasename =
    "outsider-realrobot-plug93-recovery-numeric-slice-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/realrobot-plug93-recovery-numeric-slice/v1");
  const verificationResult = requireOk(
    verifyPlug93RecoveryArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "PUBLISHER_CLAIMED_REAL_ROBOT_RECOVERY_GROUP_NUMERIC_TELEMETRY_LINEAGE",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "tliangucl",
      datasetId: report.scope.datasetId,
      revision: report.scope.revision,
      physicality: "PUBLISHER_CLAIMED_REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyPlug93RecoveryArtifactDirectory",
      moduleBasename: "outsider-realrobot-plug93-recovery-numeric-slice.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.report.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel:
        "FULL_DIRECTORY_RANGE_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
    }),
    scope: {
      scopeId,
      scopeKind: "BOUNDED_SOURCE_NATIVE_SLICE",
      description: "complete non-image columns for the publisher-declared recovery group",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "KNOWN_PUBLISHER_SELECTION",
    },
    populations: [
      {
        populationId: "selected-telemetry-episode",
        unit: "selected telemetry episode",
        count: report.denominators.PUBLISHER_DECLARED_RECOVERY_LINEAGE_EPISODE,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "selected-non-image-telemetry-row",
        unit: "selected non-image telemetry row",
        count: report.denominators.COMPLETE_SELECTED_NON_IMAGE_TELEMETRY_ROW,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "selected-telemetry-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "publisher-declared-recovery-cohort-membership",
        unit: "publisher-declared recovery cohort membership",
        count: report.denominators.PUBLISHER_DECLARED_RECOVERY_LINEAGE_EPISODE,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "selected-telemetry-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      actionTrace: segment("selected-telemetry-episode",
        report.denominators.PUBLISHER_DECLARED_RECOVERY_LINEAGE_EPISODE, 0,
        "SOURCE_NATIVE_STATE_ACTION_TACTILE_TELEMETRY_PHYSICALITY_UNRESOLVED"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function so101HilRlSource(workspaceRoot, scopeId) {
  const sourceId = "so101-hil-rl-linked-lineage";
  const directoryBasename = "outsider-so101-hil-rl-linked-lineage-20260829-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "so101-hil-rl-linked-lineage.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/so101-hil-rl-linked-lineage/v1");
  const verificationResult = requireOk(
    verifySo101HilRlLineageArtifactWithSource(report, path.join(directory, "source")),
    sourceId);
  const sourceRootHash = report.sourceRoot;
  return {
    sourceId,
    family: "PUBLISHER_CLAIMED_REAL_ROBOT_HIL_TO_RL_SAVED_EPISODE_LINEAGE",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "TakuyaHiraoka",
      datasetId: Object.values(report.repositories)
        .map((item) => item.datasetId).join(" + "),
      revision: Object.values(report.repositories)
        .map((item) => item.revision).join("+"),
      physicality: "PUBLISHER_CLAIMED_REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifySo101HilRlLineageArtifactWithSource",
      moduleBasename: "outsider-so101-hil-rl-lineage.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.artifactHash,
      verifiedSourceBindingHash: verificationResult.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "FULL_SOURCE_NATIVE_GROUP",
      description: "complete pinned HIL and RL no-video saved-episode lineage",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "KNOWN_PUBLISHER_SELECTION",
    },
    populations: [
      {
        populationId: "saved-robot-telemetry-episode",
        unit: "saved episode",
        count: report.replay.combined.episodesReplayed,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "frame-within-saved-episode",
        unit: "frame",
        count: report.replay.combined.framesReplayed,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "saved-robot-telemetry-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "hil-saved-episode",
        unit: "HIL saved episode",
        count: report.replay.repositories.hil.episodesReplayed,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "saved-robot-telemetry-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "rl-saved-episode",
        unit: "RL saved episode",
        count: report.replay.repositories.rl.episodesReplayed,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "saved-robot-telemetry-episode",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "native-intervention-frame",
        unit: "native intervention frame",
        count: report.replay.combined.interventionFrames,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "frame-within-saved-episode",
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "rl-publisher-outcome-episode",
        unit: "RL publisher outcome episode",
        count: report.outcome.rlSuccessfulEpisodes + report.outcome.rlFailedEpisodes,
        evidenceDomain: "PUBLISHER_ANNOTATION",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "rl-saved-episode",
        realityEligible: false,
        analyticAdmission: true,
      },
    ],
    segments: segments({
      actionTrace: segment("saved-robot-telemetry-episode",
        report.replay.combined.episodesReplayed, 0,
        "SOURCE_NATIVE_SAVED_ROBOT_TELEMETRY_EPISODE_PHYSICALITY_UNRESOLVED"),
      intervention: segment("native-intervention-frame",
        report.replay.combined.interventionFrames, 0,
        "SOURCE_NATIVE_INTERVENTION_FRAME_NOT_HUMAN_AUTHORIZATION"),
      outcome: segment("rl-publisher-outcome-episode",
        report.outcome.rlSuccessfulEpisodes + report.outcome.rlFailedEpisodes, 0,
        "RL_OPERATOR_OUTCOME_NOT_INDEPENDENT"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function andresgRecoverySource(workspaceRoot, scopeId) {
  const sourceId = "andresg-recovery-name-family";
  const directoryBasename = "outsider-andresg-recovery-name-family-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "report.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/andresg-recovery-name-family/v1");
  const verificationResult = requireOk(
    verifyAndresgRecoveryArtifactDirectory(directory), sourceId);
  const sourceRootHash = report.source.sourceRoot;
  return {
    sourceId,
    family: "PUBLISHER_CLAIMED_ROBOT_RECOVERY_NAMED_MULTI_REPOSITORY_TELEMETRY_FAMILY",
    disposition: "QUARANTINE_EVALUATION_ONLY",
    identity: {
      publisher: "Andresg324",
      datasetId: "Andresg324 literal-recovery-id family",
      revision: report.source.sources.map((item) => item.revision).join("+"),
      physicality: "PUBLISHER_CLAIMED_REAL_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: noExactRepackLineage(report.artifactHash),
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyAndresgRecoveryArtifactDirectory",
      moduleBasename: "outsider-andresg-recovery-name-family.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.report.artifactHash,
      verifiedSourceBindingHash: verificationResult.report.source.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel:
        "FULL_DIRECTORY_SOURCE_REPORT_AND_RECEIPT_EXACT_REPLAY",
    }),
    scope: {
      scopeId,
      scopeKind: "BOUNDED_SOURCE_NATIVE_SLICE",
      description: "complete fixed author-list literal-recovery-id family no-video closure",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "UNKNOWN_ATTEMPT_CENSUS",
    },
    populations: [
      {
        populationId: "repository-episode-occurrence",
        unit: "repository episode occurrence",
        count: report.denominators.REPOSITORY_EPISODE_OCCURRENCE,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: true,
      },
      {
        populationId: "repository-frame-occurrence",
        unit: "repository frame occurrence",
        count: report.denominators.REPOSITORY_FRAME_OCCURRENCE,
        evidenceDomain: "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "repository-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "exact-trajectory-record-hash",
        unit: "exact trajectory record hash",
        count: report.denominators.EXACT_TRAJECTORY_RECORD_HASH,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "repository-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments({
      actionTrace: segment("repository-episode-occurrence",
        report.denominators.REPOSITORY_EPISODE_OCCURRENCE, 0,
        "SOURCE_NATIVE_ROBOT_TELEMETRY_OCCURRENCE_PHYSICALITY_UNRESOLVED"),
    }),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: true }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function kelinKewangExactRepackSource(workspaceRoot, scopeId) {
  const sourceId = "kelin-kewang-intervention-exact-repack-lineage";
  const directoryBasename =
    "outsider-kelin-kewang-intervention-lineage-20260830-v1";
  const directory = path.join(workspaceRoot, "artifacts", directoryBasename);
  const reportRelativePath = "kelin-kewang-intervention-lineage.json";
  const { value: report, fileSha256 } = readCanonicalJson(
    path.join(directory, reportRelativePath),
    "outsider/kelin-kewang-intervention-lineage/v1");
  const sourceRootHash = report.source.sourceRoot;
  const verificationResult = requireOk(
    verifyKelinKewangLineageArtifactWithSource(report,
      path.join(directory, "source"), {
        keArtifactDirectory: path.join(workspaceRoot, "artifacts",
          "outsider-peg-intervention-20260830-v1"),
      }), sourceId);
  return {
    sourceId,
    family: "SIMULATED_ROBOT_EXACT_REPACK_LINEAGE_ADDS_ZERO_UNIQUE_EXECUTIONS",
    disposition: "LEDGER_DUPLICATE",
    identity: {
      publisher: "KelinLiIC linked to KeWangRobotics",
      datasetId: report.source.sources.map((item) => item.id).join(" + "),
      revision: report.source.sources.map((item) => item.revision).join("+"),
      physicality: "SIMULATED_ROBOT",
    },
    artifact: artifactDescriptor({ directoryBasename, reportRelativePath, report,
      reportFileSha256: fileSha256, sourceBindingHash: sourceRootHash }),
    lineage: {
      kind: "EXACT_REPACK_DUPLICATE",
      duplicateOfSourceId: "peg-intervention",
      addsUniqueEpisodes:
        report.denominatorBoundary.nestedKeRepackAddsUniqueEpisodes,
      addsUniqueFrames: report.denominatorBoundary.nestedKeRepackAddsUniqueFrames,
      evidenceHash: report.replay.lineage.mergedNumericRoot,
    },
    verification: buildBoundVerificationReceipt({
      sourceId,
      verifierId: "verifyKelinKewangLineageArtifactWithSource",
      moduleBasename: "outsider-kelin-kewang-intervention-lineage.js",
      verificationResult,
      expectedArtifactHash: report.artifactHash,
      expectedSourceBindingHash: sourceRootHash,
      verifiedArtifactHash: verificationResult.artifactHash,
      verifiedSourceBindingHash: verificationResult.sourceRoot,
      replayClass: "FULL_SELECTED_SOURCE",
      sourceSpecificVerificationLevel: verificationResult.verificationLevel,
    }),
    scope: {
      scopeId,
      scopeKind: "FULL_SOURCE_NATIVE_GROUP",
      description:
        "complete two-repository no-video repack lineage cross-bound to the verified KeWang source",
      sourceNativeGroupComplete: true,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
      selectionBias: "UNKNOWN_ATTEMPT_CENSUS",
    },
    populations: [
      {
        populationId: "exact-repack-source-episode-occurrence",
        unit: "exact repack source episode occurrence",
        count: report.replay.lineage.sourceEpisodeOccurrences,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "PRIMARY_SOURCE_NATIVE",
        parentPopulationId: null,
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "exact-repack-source-frame-occurrence",
        unit: "exact repack source frame occurrence",
        count: report.replay.lineage.sourceFrameOccurrences,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "NESTED_WITHIN_PARENT",
        parentPopulationId: "exact-repack-source-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
      {
        populationId: "additional-unique-episode",
        unit: "additional unique episode beyond linked KeWang source",
        count: report.denominatorBoundary.nestedKeRepackAddsUniqueEpisodes,
        evidenceDomain: "DERIVED_LINEAGE",
        relationship: "OVERLAPPING_VIEW",
        parentPopulationId: "exact-repack-source-episode-occurrence",
        realityEligible: false,
        analyticAdmission: false,
      },
    ],
    segments: segments(),
    clearances: clearances({ sourceId, artifactHash: report.artifactHash,
      sourceBindingHash: sourceRootHash, offlineResearchAllowed: false }),
    completeEpisodeIntersection: { established: false, count: 0 },
  };
}

function hfRobotInterventionDiscoveryScope(workspaceRoot) {
  const directory = path.join(workspaceRoot, "artifacts",
    "outsider-hf-robot-intervention-declared-scope-ledger-20260830-v1");
  const { value: report } = readCanonicalJson(path.join(directory, "report.json"),
    "outsider/hf-robot-intervention-declared-scope-ledger/v1");
  requireOk(verifyHfRobotInterventionArtifactDirectory(directory),
    "hf-robot-intervention-declared-scope-ledger");
  if (report.discovery.unionDatasetRecords !== 258
    || report.discovery.terminalDatasetRecords !== 258
    || report.candidateLedger.entries.length !== 258
    || report.discovery.declaredScopeExhausted !== true
    || report.discovery.sourceUniverseExhausted !== false
    || report.discovery.globalExhaustion !== false
    || report.scope.incompleteDaggerThousandResultReconnaissanceIncluded !== false) {
    fail("HF_ROBOT_INTERVENTION_DISCOVERY_BOUNDARY_INVALID");
  }
  return {
    scopeId: "hf-robot-intervention-three-query-ledger-20260830",
    channel: "HUGGING_FACE_OFFICIAL_DATASETS_SEARCH_API",
    queryOrDeclaration:
      "full=true&limit=1000 for intervention, corrective, and human-in-loop",
    cutoff: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF,
    evidenceHash: report.source.sourceRoot,
    candidateCount: report.discovery.unionDatasetRecords,
    terminalCount: report.discovery.terminalDatasetRecords,
    declaredScopeExhausted: report.discovery.declaredScopeExhausted,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
  };
}

export function buildFrozenEpisodeDataPublicSourceProfile({ workspaceRoot } = {}) {
  if (typeof workspaceRoot !== "string" || workspaceRoot.length === 0
    || !statSync(workspaceRoot).isDirectory()) {
    fail("WORKSPACE_ROOT_INVALID");
  }
  const seedScopeId = "frozen-public-source-profile-seed-20260829";
  const agentLensScopeId = "agentlens-official-public-payload-discovery-20260829";
  const hieshScopeId =
    "hiesh-two-repository-zero-image-range-gate-20260830";
  const interventionScopeId =
    "verified-robot-intervention-and-recovery-family-20260830";
  const sources = [
    coffeeSource(workspaceRoot, seedScopeId),
    rmpdSource(workspaceRoot, seedScopeId),
    agentLensSource(workspaceRoot, agentLensScopeId),
    hieshMetadataOnlySource(workspaceRoot, hieshScopeId),
    ajayDaggerInterventionSource(workspaceRoot, interventionScopeId),
    pegInterventionSource(workspaceRoot, interventionScopeId),
    handoverLinkedSource(workspaceRoot, interventionScopeId),
    plug93Source(workspaceRoot, interventionScopeId),
    so101HilRlSource(workspaceRoot, interventionScopeId),
    andresgRecoverySource(workspaceRoot, interventionScopeId),
    kelinKewangExactRepackSource(workspaceRoot, interventionScopeId),
  ];
  const frozenContractIds = Object.keys(FROZEN_SOURCE_CONTRACTS).sort();
  const sourceIds = sources.map((source) => source.sourceId).sort();
  if (canonicalizeStrict(frozenContractIds) !== canonicalizeStrict(sourceIds)) {
    fail("FROZEN_SOURCE_CONTRACT_SET_MISMATCH");
  }
  const discoveryScopes = [
    {
      scopeId: seedScopeId,
      channel: "CODE_FIXED_FROZEN_ARTIFACT_DECLARATION",
      queryOrDeclaration: "Coffee recovery census and RMPD sample mechanical trajectory",
      cutoff: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF,
      evidenceHash: episodeDataPublicSourceCatalogDigest({
        profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
        sources: sources.filter((source) => source.scope.scopeId === seedScopeId)
          .map((source) => ({ sourceId: source.sourceId,
            artifactHash: source.artifact.artifactHash,
            sourceBindingHash: source.artifact.sourceBindingHash,
            sourceBindingKind: source.artifact.sourceBindingKind })),
      }, "outsider/episode-data-public-source-profile-declaration/v1"),
      candidateCount: 2,
      terminalCount: 2,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    {
      scopeId: agentLensScopeId,
      channel: "OFFICIAL_PUBLICATION_GITHUB_AND_HUGGING_FACE_DISCOVERY",
      queryOrDeclaration: "AgentLens declared repository plus official GitHub/Hugging Face searches",
      cutoff: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF,
      evidenceHash: sources.find((source) => source.sourceId
        === "agentlens-metadata-disposition").artifact.sourceBindingHash,
      candidateCount: 1,
      terminalCount: 1,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    {
      scopeId: interventionScopeId,
      channel: "CODE_FIXED_VERIFIED_ARTIFACT_DECLARATION",
      queryOrDeclaration:
        "six execution/telemetry families plus one source-specifically replayed exact-repack duplicate ledger",
      cutoff: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF,
      evidenceHash: episodeDataPublicSourceCatalogDigest({
        profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
        sources: sources.filter((source) =>
          source.scope.scopeId === interventionScopeId).map((source) => ({
          sourceId: source.sourceId,
          artifactHash: source.artifact.artifactHash,
          sourceBindingHash: source.artifact.sourceBindingHash,
          sourceBindingKind: source.artifact.sourceBindingKind,
        })),
      }, "outsider/episode-data-public-source-profile-declaration/v2"),
      candidateCount: 7,
      terminalCount: 7,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    {
      scopeId: hieshScopeId,
      channel: "FIXED_HUGGING_FACE_REPOSITORY_PAIR_AND_STRICT_RANGE_GATE",
      queryOrDeclaration:
        "horizontal and vertical SequenceRecovery repositories, same test ordinal 21, zero-image non-image closure attempt",
      cutoff: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_CUTOFF,
      evidenceHash: sources.find((source) => source.sourceId
        === "hiesh-sequence-recovery-metadata-only").artifact.sourceBindingHash,
      candidateCount: 2,
      terminalCount: 2,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    hfRobotInterventionDiscoveryScope(workspaceRoot),
  ];
  return buildEpisodeDataPublicSourceCatalog({ discoveryScopes, sources });
}

export function verifyFrozenEpisodeDataPublicSourceProfile(catalog,
  { workspaceRoot } = {}) {
  try {
    const rebuilt = buildFrozenEpisodeDataPublicSourceProfile({ workspaceRoot });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(catalog)) {
      return Object.freeze({
        ok: false,
        fixedProfileWorkspaceRebuildEstablished: false,
        declaredVerificationRadiusReplayEstablished: false,
        allCatalogSourcesFullPayloadReplayEstablished: false,
        error: "EPISODE_DATA_PUBLIC_SOURCE_PROFILE_REPRODUCTION_MISMATCH",
      });
    }
    const metadataOnlySourceIds = rebuilt.sources.filter((source) =>
      source.disposition === "METADATA_ONLY").map((source) => source.sourceId);
    return Object.freeze({
      ok: true,
      fixedProfileWorkspaceRebuildEstablished: true,
      declaredVerificationRadiusReplayEstablished: true,
      allCatalogSourcesFullPayloadReplayEstablished:
        metadataOnlySourceIds.length === 0,
      metadataOnlySourceIds,
      profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
      catalogHash: rebuilt.catalogHash,
      sourceCount: rebuilt.sourceSummary.sourceCount,
      populationEntryCount: rebuilt.populationRegistry.entryCount,
      discoveryScopeCount: rebuilt.discovery.scopeCount,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      fixedProfileWorkspaceRebuildEstablished: false,
      declaredVerificationRadiusReplayEstablished: false,
      allCatalogSourcesFullPayloadReplayEstablished: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
