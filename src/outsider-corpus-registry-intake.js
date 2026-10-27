/*
 * Full-source migration adapters for the durable Stage 1 / CURATE registry.
 *
 * These functions never trust a hand-authored report as evidence. They rerun
 * the frozen source-bound verifier, project only hashes/bounded metadata, and
 * preserve the descriptive-only CEU/loss/PRICE boundary.
 */

import { createHash, generateKeyPairSync } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "./canonical.js";
import { createCorpusArtifactSet, DurableStage1CurateCorpusRegistry } from
  "./outsider-corpus-registry.js";
import {
  PUBLIC_AGENT_ARTIFACT_SCHEMAS,
  verifyPublicAgentArtifactsAgainstSource,
} from "./outsider-public-agent-artifacts.js";
import { PUBLIC_AGENT_SCHEMAS } from "./outsider-public-agent-corpus.js";
import {
  PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT,
  PUBLIC_AGENT_WAVE2_SCHEMAS,
  verifyPublicAgentWave2Manifest,
  verifyPublicAgentWave2Record,
  verifyPublicAgentWave2RecordSet,
  verifyPublicAgentWave2Source,
} from "./outsider-public-agent-wave2.js";
import {
  PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT,
  PUBLIC_AGENT_WAVE3_SCHEMAS,
  CUAREWARDBENCH_WAVE3_PIN,
  verifyPublicAgentWave3Manifest,
  verifyPublicAgentWave3MetadataRecord,
  verifyPublicAgentWave3RecordSet,
  verifyPublicAgentWave3Source,
} from "./outsider-public-agent-wave3.js";
import {
  AGENTRX_TAU_WAVE4_PIN,
  PUBLIC_AGENT_WAVE4_CANONICAL_GENERATED_AT,
  PUBLIC_AGENT_WAVE4_SCHEMAS,
  verifyPublicAgentWave4Manifest,
  verifyPublicAgentWave4Record,
  verifyPublicAgentWave4RecordSet,
  verifyPublicAgentWave4Source,
} from "./outsider-public-agent-wave4.js";
import {
  PUBLIC_EVIDENCE_WAVE5_SCHEMAS,
  TRACE_COMMONS_WAVE5_PIN,
  ROBUST_ROS_WAVE5_PIN,
} from "./outsider-public-evidence-wave5.js";
import {
  PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER,
  WAVE5_INTAKE_SCHEMAS,
  buildWave5IntakeSnapshot,
  verifyWave5IntakeSnapshot,
} from "./outsider-wave5-intake-taxonomy-frontier.js";
import {
  PUBLIC_ROBOTICS_SCHEMAS,
  convertBotFailsPilot,
  convertUr5FailExecution,
  verifyPublicRoboticsRecord,
  verifyPublicRoboticsRecordSetAgainstSource,
  verifyPublicRoboticsSourceDirectory,
} from "./outsider-public-robotics-adapter.js";
import { verifyDroid100PilotArtifactDirectory } from
  "./outsider-droid100-pilot-artifacts.js";
import {
  NHTSA_SGO_CORPUS_SOURCE_KIND,
  buildNhtsaSgoIncidentCorpusArtifactSetFromSource,
} from "./outsider-nhtsa-corpus-registry-intake.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HASH = /^sha256:[a-f0-9]{64}$/;
const UNIT_SCHEMA = Object.freeze({
  schema: "outsider/stage1-curate-corpus-registry-unit/v1",
  fields: ["identityHash", "recordHash", "datasetRoot", "correlationRoots"],
  rawContentIncluded: false,
});

export const PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND =
  "PUBLIC_EVIDENCE_WAVE5_SOURCE_AWARE_TAXONOMY";

function fail(code, detail = null) {
  throw new Error(detail == null ? `CORPUS_INTAKE_${code}` : `CORPUS_INTAKE_${code}:${detail}`);
}

function digestBytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function domainDigest(domain, value) {
  return digestBytes(`${domain}\0${typeof value === "string" ? value
    : canonicalizeStrict(value)}`);
}

function implementationHash(paths, profile) {
  const files = paths.map((file) => ({ file: path.basename(file), sha256: digestBytes(
    readFileSync(file)) })).sort((left, right) => left.file.localeCompare(right.file));
  return domainDigest("outsider/corpus-registry/intake-implementation/v1", { files, profile });
}

function publicRetention() {
  return {
    mode: "NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE",
    retainUntil: null,
    storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
    sourcePayloadManaged: false,
    expiryDisposition: "NOT_APPLICABLE",
    liveRevocationChecked: false,
  };
}

function rootsWithDataset(datasetRoot, roots) {
  if (!HASH.test(datasetRoot) || !Array.isArray(roots)
    || roots.some((root) => !HASH.test(root))) fail("CORRELATION_ROOT_INVALID");
  return [...new Set([datasetRoot, ...roots])].sort();
}

function stableSourceRead(file, maximumBytes) {
  const pathStat = lstatSync(file);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) fail("SOURCE_FILE_INVALID", file);
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximumBytes)) {
      fail("SOURCE_FILE_SIZE_INVALID", file);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== before.size) fail("SOURCE_FILE_CHANGED_DURING_READ", file);
    return bytes;
  } finally { if (descriptor !== null) closeSync(descriptor); }
}

function assertPublicAgentBoundary(verified) {
  if (verified.status !== "FULL_SOURCE_REPRODUCED"
    || verified.attestation?.boundary?.economicLossRows !== 0
    || verified.attestation?.boundary?.pricingEligibleRows !== 0
    || verified.attestation?.boundary?.permitsPrice !== false
    || verified.attestation?.boundary?.permitsGuarantee !== false
    || verified.attestation?.boundary?.permitsSettle !== false
    || verified.records.some((record) => record.labels?.economicLossObserved !== false
      || record.useBoundary?.automaticTraining !== false
      || record.useBoundary?.permits?.PRICE !== false
      || record.useBoundary?.permits?.GUARANTEE !== false
      || record.useBoundary?.permits?.SETTLE !== false)) {
    fail("PUBLIC_AGENT_BOUNDARY_INVALID");
  }
}

export async function buildPublicAgentCorpusArtifactSetFromSource({ artifactDirectory,
  privateKeyPem, createdAt = new Date(), artifactSetId = "public-agent-full-source-20260820" } = {}) {
  if (typeof artifactDirectory !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(artifactDirectory);
  const verified = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: path.join(root, "source"), artifactDirectory: root,
  });
  if (!verified.ok) fail("PUBLIC_AGENT_FULL_SOURCE_INVALID", verified.error);
  assertPublicAgentBoundary(verified);
  const adapterFiles = [path.join(HERE, "outsider-public-agent-artifacts.js"),
    path.join(HERE, "outsider-public-agent-corpus.js")];
  const profile = { id: "public-agent-hash-only-stage1-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, fullSourceRequired: true,
    identity: "sha256-domain(datasetRevisionRoot,nativeIdHash)",
    record: "normalized-record.recordHash",
    datasetRoot: "normalized-record.roots.datasetRevisionRoot",
    correlations: "datasetRoot-union-normalized-record.roots.correlationRoots",
    boundary: "descriptive-only-zero-ceu-loss-price-authority" };
  const verifierImplementationHash = implementationHash(adapterFiles, {
    id: "public-agent-full-source-verifier", version: "2.0.0" });
  const instrumentImplementationHash = implementationHash(adapterFiles, profile);
  const units = verified.records.map((record) => ({
    identityHash: domainDigest("outsider/corpus-registry/public-agent-identity/v1", {
      datasetRevisionRoot: record.roots.datasetRevisionRoot,
      nativeIdHash: record.episode.nativeIdHash,
    }),
    recordHash: record.recordHash,
    datasetRoot: record.roots.datasetRevisionRoot,
    correlationRoots: rootsWithDataset(record.roots.datasetRevisionRoot,
      record.roots.correlationRoots),
  }));
  const sourceHashes = [...new Set(verified.attestation.verifiedSourceObjectHashes
    .map((object) => object.sha256))].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "ATTEST",
    stream: "FORWARD_ACTION_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "public-agent-full-source-intake",
      instrumentVersion: "2.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", UNIT_SCHEMA),
    },
    datasetIds: verified.manifest.sources.map((source) => source.id),
    licenseIds: [...new Set(verified.manifest.sources.map((source) =>
      source.license.identifier))],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [verified.manifest.manifestHash],
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: "PUBLIC_AGENT_CORPUS",
      verificationLevel: "FULL_SOURCE_REPRODUCED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash: verified.attestation.verificationHash,
      manifestHashes: [verified.manifest.manifestHash],
      sourceArtifactHashes: sourceHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [PUBLIC_AGENT_ARTIFACT_SCHEMAS.verification,
          PUBLIC_AGENT_SCHEMAS.manifest, PUBLIC_AGENT_SCHEMAS.record,
          PUBLIC_AGENT_SCHEMAS.summary],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

export function buildPublicAgentWave2CorpusArtifactSetFromSource({ sourceRoot,
  privateKeyPem, createdAt = new Date(),
  artifactSetId = "public-agent-wave2-full-source-20260821",
} = {}) {
  if (typeof sourceRoot !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(sourceRoot);
  const verified = verifyPublicAgentWave2Source(root,
    { generatedAt: PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT });
  const recordSetCheck = verifyPublicAgentWave2RecordSet(verified.records,
    { manifest: verified.manifest });
  if (verified.verification?.status !== "FULL_SELECTED_SOURCE_OBJECTS_REPRODUCED"
    || verified.records.length !== 1_474
    || !verifyPublicAgentWave2Manifest(verified.manifest).ok
    || !recordSetCheck.ok
    || recordSetCheck.recordSetHash !== verified.recordSet.recordSetHash
    || verified.summary?.interpretation?.economicLossRows !== 0
    || verified.summary?.interpretation?.causalExperienceUnits !== 0
    || verified.summary?.interpretation?.pricingEligibleRows !== 0
    || verified.summary?.interpretation?.automaticTraining !== false
    || verified.verification?.boundary?.causalExperienceUnits !== 0
    || verified.verification?.boundary?.economicLossRows !== 0
    || verified.verification?.boundary?.pricingEligibleRows !== 0
    || verified.verification?.boundary?.automaticTraining !== false
    || Object.values(verified.verification?.boundary?.permits ?? {})
      .some((value) => value !== false)
    || verified.records.some((record) => !verifyPublicAgentWave2Record(record).ok
      || record.labels?.economicLossObserved !== false
      || record.useBoundary?.automaticTraining !== false
      || record.useBoundary?.permits?.PRICE !== false
      || record.useBoundary?.permits?.GUARANTEE !== false
      || record.useBoundary?.permits?.SETTLE !== false)) {
    fail("PUBLIC_AGENT_WAVE2_FULL_SOURCE_INVALID");
  }
  const adapterFiles = [path.join(HERE, "outsider-public-agent-wave2.js"),
    path.join(HERE, "outsider-public-agent-artifacts.js"),
    path.join(HERE, "outsider-public-agent-corpus.js")];
  const profile = { id: "public-agent-wave2-hash-only-stage1-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, fullSelectedSourceObjectsRequired: true,
    identity: "sha256-domain(datasetRevisionRoot,nativeIdHash)",
    record: "normalized-record.recordHash",
    datasetRoot: "normalized-record.roots.datasetRevisionRoot",
    correlations: "datasetRoot-union-normalized-record.roots.correlationRoots",
    boundary: "descriptive-only-zero-ceu-loss-price-authority" };
  const verifierImplementationHash = implementationHash(adapterFiles, {
    id: "public-agent-wave2-full-selected-source-verifier", version: "1.0.0" });
  const instrumentImplementationHash = implementationHash(adapterFiles, profile);
  const units = verified.records.map((record) => ({
    identityHash: domainDigest("outsider/corpus-registry/public-agent-identity/v1", {
      datasetRevisionRoot: record.roots.datasetRevisionRoot,
      nativeIdHash: record.episode.nativeIdHash,
    }),
    recordHash: record.recordHash,
    datasetRoot: record.roots.datasetRevisionRoot,
    correlationRoots: rootsWithDataset(record.roots.datasetRevisionRoot,
      record.roots.correlationRoots),
  }));
  const sourceArtifactHashes = [...new Set(verified.manifest.sources
    .flatMap((source) => source.acquiredObjects.map((object) => object.sha256)))].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "ATTEST",
    stream: "FORWARD_ACTION_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "public-agent-wave2-full-source-intake",
      instrumentVersion: "1.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", UNIT_SCHEMA),
    },
    datasetIds: verified.manifest.sources.map((source) => source.id),
    licenseIds: [...new Set(verified.manifest.sources.map((source) =>
      source.license.identifier))],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [verified.manifest.manifestHash],
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: "PUBLIC_AGENT_WAVE2_CORPUS",
      verificationLevel: "FULL_SOURCE_REPRODUCED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash: verified.verification.verificationHash,
      manifestHashes: [verified.manifest.manifestHash],
      sourceArtifactHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [PUBLIC_AGENT_WAVE2_SCHEMAS.manifest,
          PUBLIC_AGENT_WAVE2_SCHEMAS.summary, PUBLIC_AGENT_WAVE2_SCHEMAS.verification,
          PUBLIC_AGENT_SCHEMAS.record, "outsider/public-agent-wave2-record-set/v1"],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

export function buildPublicAgentWave3MetadataCorpusArtifactSetFromSource({ sourceRoot,
  privateKeyPem, createdAt = new Date(),
  artifactSetId = "cuarewardbench-wave3-metadata-only-20260821",
} = {}) {
  if (typeof sourceRoot !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(sourceRoot);
  const verified = verifyPublicAgentWave3Source(root,
    { generatedAt: PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT });
  const recordSetCheck = verifyPublicAgentWave3RecordSet(verified.records,
    { manifest: verified.manifest });
  if (verified.verification?.status !== "PINNED_METADATA_ONLY_REPRODUCED"
    || verified.verification?.sourceCompleteness !== "QUARANTINED_NO_TRACE_BYTES"
    || verified.records.length !== 272
    || verified.recordSet?.uniqueTaskCorrelationComponents !== 122
    || !verifyPublicAgentWave3Manifest(verified.manifest).ok
    || !recordSetCheck.ok
    || recordSetCheck.recordSetHash !== verified.recordSet.recordSetHash
    || verified.verification?.traceBytesAcquired !== 0
    || verified.verification?.trust?.traceObjectBytesVerified !== false
    || verified.verification?.trust?.upstreamTrajectoryRightsClaimed !== false
    || verified.summary?.counts?.trajectoryTruthUsableRows !== 0
    || verified.summary?.counts?.causalExperienceUnits !== 0
    || verified.summary?.counts?.economicLossRows !== 0
    || verified.summary?.counts?.pricingEligibleRows !== 0
    || verified.summary?.interpretation?.automaticTraining !== false
    || verified.records.some((record) => !verifyPublicAgentWave3MetadataRecord(record).ok
      || record.sourceBinding?.traceBytesAcquired !== 0
      || record.sourceBinding?.traceObjectHashesVerifiedAgainstBytes !== false
      || record.labels?.economicLossObserved !== false
      || record.labels?.recoveryEstablishedFromTrace !== false
      || record.useBoundary?.automaticTraining !== false
      || Object.values(record.useBoundary?.permits ?? {}).some((value) => value !== false))) {
    fail("PUBLIC_AGENT_WAVE3_METADATA_SOURCE_INVALID");
  }
  const adapterFiles = [path.join(HERE, "outsider-public-agent-wave3.js"),
    path.join(HERE, "outsider-public-agent-artifacts.js")];
  const profile = { id: "cuarewardbench-wave3-metadata-only-curate-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, pinnedMetadataScopeRequired: true, traceBytesRequired: false,
    identity: "metadata-label.identity.identityHash",
    record: "metadata-label.recordHash",
    datasetRoot: "metadata-label.identity.datasetRoot",
    correlations: "dataset-task-model-and-task-type-roots",
    taskCorrelationComponents: 122,
    boundary: "metadata-only-no-trace-zero-ceu-loss-price-training-authority" };
  const verifierImplementationHash = implementationHash(adapterFiles, {
    id: "cuarewardbench-wave3-pinned-metadata-verifier", version: "1.0.0" });
  const instrumentImplementationHash = implementationHash(adapterFiles, profile);
  const units = verified.records.map((record) => ({
    identityHash: record.identity.identityHash,
    recordHash: record.recordHash,
    datasetRoot: record.identity.datasetRoot,
    correlationRoots: rootsWithDataset(record.identity.datasetRoot,
      record.identity.correlationRoots),
  }));
  const sourceArtifactHashes = [...new Set(verified.manifest.acquiredScope.acquiredObjects
    .map((object) => object.sha256))].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "cuarewardbench-wave3-metadata-only-intake",
      instrumentVersion: "1.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", {
        ...UNIT_SCHEMA, sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
        taskCorrelationComponents: 122,
      }),
    },
    datasetIds: [CUAREWARDBENCH_WAVE3_PIN.id],
    licenseIds: [CUAREWARDBENCH_WAVE3_PIN.licenseId],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [verified.manifest.manifestHash],
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: CUAREWARDBENCH_WAVE3_PIN.sourceKind,
      verificationLevel: "PINNED_METADATA_ONLY_REPRODUCED",
      sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
      verifierImplementationHash,
      verificationHash: verified.verification.verificationHash,
      manifestHashes: [verified.manifest.manifestHash],
      sourceArtifactHashes,
      migration: {
        method: "PINNED_METADATA_REVERIFY_NOT_TRACE_REPLAY",
        legacySchemas: [PUBLIC_AGENT_WAVE3_SCHEMAS.manifest,
          PUBLIC_AGENT_WAVE3_SCHEMAS.record, PUBLIC_AGENT_WAVE3_SCHEMAS.recordSet,
          PUBLIC_AGENT_WAVE3_SCHEMAS.summary, PUBLIC_AGENT_WAVE3_SCHEMAS.verification],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

export function buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({ sourceRoot,
  privateKeyPem, createdAt = new Date(),
  artifactSetId = "agentrx-tau-wave4-failure-traces-20260821",
} = {}) {
  if (typeof sourceRoot !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(sourceRoot);
  const verified = verifyPublicAgentWave4Source(root,
    { generatedAt: PUBLIC_AGENT_WAVE4_CANONICAL_GENERATED_AT });
  const recordSetCheck = verifyPublicAgentWave4RecordSet(verified.records,
    { manifest: verified.manifest });
  if (verified.verification?.status
      !== "FULL_SELECTED_SOURCE_OBJECTS_AND_ROW_JOIN_REPRODUCED"
    || verified.verification?.sourceCompleteness
      !== "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION"
    || verified.records.length !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
    || !verifyPublicAgentWave4Manifest(verified.manifest).ok
    || !recordSetCheck.ok
    || recordSetCheck.recordSetHash !== verified.recordSet.recordSetHash
    || verified.verification?.traceContainerBytesAcquired
      !== AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes
    || verified.summary?.counts?.trajectoryEvidenceUsableRows
      !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
    || verified.summary?.interpretation?.failureRateEstimableFromSelectedScope !== false
    || verified.summary?.counts?.causalExperienceUnits !== 0
    || verified.summary?.counts?.economicLossRows !== 0
    || verified.summary?.counts?.pricingEligibleRows !== 0
    || verified.summary?.counts?.productionModelEligibleRows !== 0
    || verified.summary?.interpretation?.automaticTraining !== false
    || verified.records.some((record) => !verifyPublicAgentWave4Record(record).ok
      || record.labels?.economicLossObserved !== false
      || record.labels?.terminalRecoveryEstablished !== false
      || record.useBoundary?.automaticTraining !== false
      || Object.values(record.useBoundary?.permits ?? {}).some((value) => value !== false))) {
    fail("PUBLIC_AGENT_WAVE4_FAILURE_TRACE_SOURCE_INVALID");
  }
  const adapterFiles = [path.join(HERE, "outsider-public-agent-wave4.js"),
    path.join(HERE, "outsider-public-agent-artifacts.js")];
  const profile = { id: "agentrx-tau-wave4-failure-trace-curate-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, fullDeclaredSelectionRequired: true,
    declaredSelection: "complete-pinned-tau-failed-split",
    identity: "manual-failure-trace.identity.identityHash",
    record: "manual-failure-trace.recordHash",
    datasetRoot: "manual-failure-trace.identity.datasetRoot",
    correlations: "dataset-task-and-native-source-roots",
    boundary: "complete-selected-trace-descriptive-zero-ceu-loss-price-model-authority" };
  const verifierImplementationHash = implementationHash(adapterFiles, {
    id: "agentrx-tau-wave4-selected-source-verifier", version: "1.0.0" });
  const instrumentImplementationHash = implementationHash(adapterFiles, profile);
  const units = verified.records.map((record) => ({
    identityHash: record.identity.identityHash,
    recordHash: record.recordHash,
    datasetRoot: record.identity.datasetRoot,
    correlationRoots: rootsWithDataset(record.identity.datasetRoot,
      record.identity.correlationRoots),
  }));
  const sourceArtifactHashes = [...new Set(verified.manifest.acquiredScope.acquiredObjects
    .map((object) => object.sha256))].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "agentrx-tau-wave4-failure-trace-intake",
      instrumentVersion: "1.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", {
        ...UNIT_SCHEMA, declaredSelection: "complete-pinned-tau-failed-split",
        trajectoryRows: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
      }),
    },
    datasetIds: [AGENTRX_TAU_WAVE4_PIN.id],
    licenseIds: [AGENTRX_TAU_WAVE4_PIN.repositoryLicenseId],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [verified.manifest.manifestHash],
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: AGENTRX_TAU_WAVE4_PIN.sourceKind,
      verificationLevel: "FULL_SOURCE_REPRODUCED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash: verified.verification.verificationHash,
      manifestHashes: [verified.manifest.manifestHash],
      sourceArtifactHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [PUBLIC_AGENT_WAVE4_SCHEMAS.manifest,
          PUBLIC_AGENT_WAVE4_SCHEMAS.record, PUBLIC_AGENT_WAVE4_SCHEMAS.recordSet,
          PUBLIC_AGENT_WAVE4_SCHEMAS.summary, PUBLIC_AGENT_WAVE4_SCHEMAS.verification],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

/**
 * Admit the 49 Wave 5 source-aware taxonomy projections to the durable Stage 1
 * registry as hash-only CURATE candidates. The mixed rights posture is
 * intentionally represented by the stricter unresolved-rights class: the
 * Trace Commons compilation declaration cannot cure embedded-material rights,
 * and the ROBUST pinned tree has no detected root licence. No row is admitted
 * to a trainer, target predictor, loss model, PRICE, or any authority surface.
 */
export function buildPublicEvidenceWave5CorpusArtifactSetFromSource({ sourceRoot,
  privateKeyPem, createdAt = new Date(),
  artifactSetId = "public-evidence-wave5-source-aware-taxonomy-20260822",
} = {}) {
  if (typeof sourceRoot !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(sourceRoot);
  const snapshot = buildWave5IntakeSnapshot({ sourceDirectory: root });
  const checked = verifyWave5IntakeSnapshot(snapshot, { sourceDirectory: root });
  if (!checked.ok || checked.verificationLevel !== "FULL_SOURCE_REPLAY"
    || checked.sourceArtifactsReverified !== true
    || snapshot.provider.providerId
      !== PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.providerId
    || snapshot.summary.rows !== 49
    || snapshot.summary.organicAgentSessionShapeRows !== 3
    || snapshot.summary.rosBugFixMechanismTaxonomyRows !== 46
    || snapshot.summary.causalExperienceUnits !== 0
    || snapshot.summary.rowsMissingIndependentOutcome !== 49
    || snapshot.summary.rowsMissingExposureDenominator !== 49
    || snapshot.summary.rowsWithEconomicLoss !== 0
    || snapshot.summary.automaticTrainingRows !== 0
    || snapshot.summary.pricingEligibleRows !== 0
    || snapshot.rows.some((row) => row.boundary?.automaticTraining !== false
      || row.boundary?.productionModelEligible !== false
      || row.boundary?.pricingEligible !== false
      || row.permittedUse?.automaticTraining !== false
      || Object.values(row.boundary?.permits ?? {}).some((value) => value !== false))) {
    fail("PUBLIC_EVIDENCE_WAVE5_INTAKE_SOURCE_INVALID");
  }
  const adapterFiles = [path.join(HERE, "outsider-public-evidence-wave5.js"),
    path.join(HERE, "outsider-wave5-intake-taxonomy-frontier.js")];
  const profile = {
    id: "public-evidence-wave5-source-aware-taxonomy-curate-intake",
    version: "1.0.0", unitSchema: UNIT_SCHEMA, fullSourceRequired: true,
    identity: "wave5-intake-row.identity.d1IdentityRoot",
    record: "wave5-intake-row.rowHash",
    datasetRoot: "wave5-intake-row.source.sourceRoot",
    correlations: "source-root-and-conservative-d2-correlation-root",
    preActionBoundary:
      "WHOLE_SESSION_AND_BUG_FIX_PROJECTIONS_ARE_RETROSPECTIVE_NOT_PRE_ACTION_FEATURES",
    rightsBoundary:
      "MIXED_RIGHTS_STRICTEST_UNRESOLVED_CLASS_REGISTRY_GRANTS_NO_RIGHTS",
    boundary:
      "source-aware-taxonomy-only-zero-ceu-loss-training-target-price-authority",
  };
  const verifierImplementationHash = implementationHash(adapterFiles, {
    id: "public-evidence-wave5-full-source-intake-verifier", version: "1.0.0",
  });
  const instrumentImplementationHash = implementationHash(adapterFiles, profile);
  const units = snapshot.rows.map((row) => ({
    identityHash: row.identity.d1IdentityRoot,
    recordHash: row.rowHash,
    datasetRoot: row.source.sourceRoot,
    correlationRoots: rootsWithDataset(row.source.sourceRoot,
      [row.identity.d2CorrelationRoot]),
  }));
  const sourceArtifactHashes = [...new Set([
    snapshot.sourceVerification.wave5ManifestHash,
    snapshot.sourceVerification.wave5RecordSetHash,
    snapshot.sourceVerification.wave5SummaryHash,
    snapshot.sourceVerification.wave5VerificationHash,
    ...snapshot.rows.map((row) => row.source.sourceRecordSeal),
  ])].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "public-evidence-wave5-source-aware-taxonomy-intake",
      instrumentVersion: "1.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", {
        ...UNIT_SCHEMA,
        rowSchemas: [WAVE5_INTAKE_SCHEMAS.row],
        preActionAvailable: false,
        trainerRowsEnqueued: 0,
      }),
    },
    datasetIds: [TRACE_COMMONS_WAVE5_PIN.id, ROBUST_ROS_WAVE5_PIN.id],
    /* A mixed artifact set uses the registry's strict unresolved-rights class,
     * whose schema requires an empty top-level licence list. The two observed
     * source-specific statuses remain implementation-pinned above and in the
     * source-aware snapshot; they are not collapsed into a collection-wide
     * grant. */
    licenseIds: [],
    rightsBasis: {
      class: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
      sourceCommitmentHashes: [snapshot.snapshotHash,
        snapshot.sourceVerification.wave5VerificationHash].sort(),
      registryGrantsRights: false,
    },
    sourceProof: {
      sourceKind: PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
      verificationLevel: "FULL_SOURCE_REPRODUCED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash: snapshot.snapshotHash,
      manifestHashes: [snapshot.sourceVerification.wave5ManifestHash],
      sourceArtifactHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [PUBLIC_EVIDENCE_WAVE5_SCHEMAS.manifest,
          PUBLIC_EVIDENCE_WAVE5_SCHEMAS.record,
          PUBLIC_EVIDENCE_WAVE5_SCHEMAS.recordSet,
          PUBLIC_EVIDENCE_WAVE5_SCHEMAS.summary,
          PUBLIC_EVIDENCE_WAVE5_SCHEMAS.verification,
          WAVE5_INTAKE_SCHEMAS.snapshot, WAVE5_INTAKE_SCHEMAS.row],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

function robotBoundaryValid(record) {
  return record.evidenceBoundary?.causalExperienceUnits === 0
    && record.evidenceBoundary?.lossEvidenceUnits === 0
    && record.evidenceBoundary?.establishesLossOrLiability === false
    && record.evidenceBoundary?.automaticTraining === false
    && record.evidenceBoundary?.pricingEligible === false
    && record.evidenceBoundary?.authority === "none";
}

export function buildPublicRoboticsCorpusArtifactSetFromSource({ sourceRoot,
  privateKeyPem, createdAt = new Date(), artifactSetId = "public-robotics-full-source-20260820",
} = {}) {
  if (typeof sourceRoot !== "string" || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const root = path.resolve(sourceRoot);
  const sources = [
    { name: "botfails", directory: path.join(root, "botfails"),
      derived: convertBotFailsPilot(path.join(root, "botfails")) },
    { name: "ur5fail-execution", directory: path.join(root, "ur5fail-execution"),
      derived: convertUr5FailExecution(path.join(root, "ur5fail-execution")) },
  ];
  const sourceChecks = [];
  const recordChecks = [];
  for (const source of sources) {
    const sourceCheck = verifyPublicRoboticsSourceDirectory(source.derived.manifest,
      source.directory);
    const recordCheck = verifyPublicRoboticsRecordSetAgainstSource(source.derived.records, {
      manifest: source.derived.manifest, sourceDir: source.directory,
    });
    if (!sourceCheck.ok || !recordCheck.ok
      || sourceCheck.repositoryProvenanceVerified !== true
      || recordCheck.repositoryProvenanceVerified !== true
      || recordCheck.complete !== true
      || source.derived.records.some((record) => !verifyPublicRoboticsRecord(record).ok
        || !robotBoundaryValid(record))) {
      fail("PUBLIC_ROBOTICS_FULL_SOURCE_INVALID",
        sourceCheck.error ?? recordCheck.error ?? source.name);
    }
    sourceChecks.push(sourceCheck);
    recordChecks.push(recordCheck);
  }
  const adapterFile = path.join(HERE, "outsider-public-robotics-adapter.js");
  const profile = { id: "public-robotics-hash-only-curate-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, fullSourceRequired: true,
    identity: "public-robotics-record.recordIdHash",
    record: "public-robotics-record.recordHash",
    datasetRoot: "public-robotics-record.correlation.datasetRoot",
    correlations: "all-public-robotics-record.correlation-values",
    boundary: "descriptive-only-zero-ceu-loss-price-authority" };
  const verifierImplementationHash = implementationHash([adapterFile], {
    id: "public-robotics-full-source-verifier", adapterVersion: "1.1.0" });
  const instrumentImplementationHash = implementationHash([adapterFile], profile);
  const records = sources.flatMap((source) => source.derived.records);
  const units = records.map((record) => ({ identityHash: record.recordIdHash,
    recordHash: record.recordHash, datasetRoot: record.correlation.datasetRoot,
    correlationRoots: rootsWithDataset(record.correlation.datasetRoot,
      Object.values(record.correlation)) }));
  const verificationHash = domainDigest("outsider/public-robotics-registry-intake-verification/v1",
    { sourceChecks, recordChecks,
      manifests: sources.map((source) => source.derived.manifest.manifestHash),
      summaries: sources.map((source) => source.derived.summary.summaryHash),
      records: records.length });
  const sourceArtifactHashes = [...new Set(sources.flatMap((source) =>
    source.derived.manifest.objects.map((object) => object.sha256)))].sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "public-robotics-full-source-intake",
      instrumentVersion: "1.1.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/feature-schema/v1", UNIT_SCHEMA),
    },
    datasetIds: sources.map((source) => source.derived.manifest.dataset.id),
    licenseIds: [...new Set(sources.map((source) =>
      source.derived.manifest.dataset.licenseId))],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: sources.map((source) =>
        source.derived.manifest.manifestHash).sort(),
      registryGrantsRights: false },
    sourceProof: {
      sourceKind: "PUBLIC_ROBOTICS_CORPUS",
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash,
      manifestHashes: sources.map((source) => source.derived.manifest.manifestHash).sort(),
      sourceArtifactHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [PUBLIC_ROBOTICS_SCHEMAS.manifest, PUBLIC_ROBOTICS_SCHEMAS.record,
          PUBLIC_ROBOTICS_SCHEMAS.summary],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

export function buildDroid100CorpusArtifactSetFromSource({ artifactDirectory, sourceRoot,
  privateKeyPem, createdAt = new Date(), artifactSetId = "droid100-full-source-pilot-20260820",
} = {}) {
  if (typeof artifactDirectory !== "string" || typeof sourceRoot !== "string"
    || !privateKeyPem) fail("ARGUMENT_REQUIRED");
  const artifactRoot = path.resolve(artifactDirectory);
  const source = path.resolve(sourceRoot);
  const sourceFiles = {
    objectListBytes: path.join(source, "gcs-objects.json"),
    datasetInfoBytes: path.join(source, "dataset_info.json"),
    featureBytes: path.join(source, "features.json"),
    shardBytes: path.join(source, "r2d2_faceblur-train.tfrecord-00000-of-00031"),
  };
  const sourceLimits = { objectListBytes: 2 * 1024 * 1024,
    datasetInfoBytes: 2 * 1024 * 1024, featureBytes: 4 * 1024 * 1024,
    shardBytes: 128 * 1024 * 1024 };
  const sourceBytes = Object.fromEntries(Object.entries(sourceFiles)
    .map(([name, file]) => [name, stableSourceRead(file, sourceLimits[name])]));
  const verified = verifyDroid100PilotArtifactDirectory(artifactRoot, { source: sourceBytes });
  if (!verified.ok || verified.verificationLevel !== "FULL_SOURCE_REPRODUCED"
    || verified.recordsVerified !== true || verified.causalExperienceUnits !== 0
    || verified.automaticTraining !== false) {
    fail("DROID100_FULL_SOURCE_INVALID", verified.error ?? verified.verificationLevel);
  }
  const { manifest, episodes, clearances, checkpoint, report } = verified.artifacts ?? {};
  if (!Array.isArray(episodes) || episodes.length !== verified.episodeCount
    || !Array.isArray(clearances) || clearances.length !== episodes.length
    || checkpoint.causalExperienceUnits !== 0
    || report.authority?.authority !== "none"
    || report.authority?.automaticTraining !== false
    || report.authority?.pricing !== false
    || report.authority?.guarantee !== false
    || report.authority?.settlement !== false
    || episodes.some((episode) => episode.useBoundary?.authority !== "none"
      || episode.useBoundary?.automaticTraining !== false
      || episode.useBoundary?.permits?.PRICE !== false
      || episode.useBoundary?.permits?.GUARANTEE !== false
      || episode.useBoundary?.permits?.SETTLE !== false)
    || clearances.some((clearance) => clearance.causal?.causalExperienceUnits !== 0
      || clearance.useBoundary?.authority !== "none"
      || clearance.useBoundary?.automaticTraining !== false
      || clearance.useBoundary?.permits?.PRICE !== false)) {
    fail("DROID100_BOUNDARY_INVALID");
  }
  const implementationFiles = ["outsider-droid100-adapter.js", "outsider-droid100-rlds.js",
    "outsider-droid100-pilot-artifacts.js", "outsider-curate-core.js"]
    .map((name) => path.join(HERE, name));
  const profile = { id: "droid100-hash-only-curate-intake", version: "1.0.0",
    unitSchema: UNIT_SCHEMA, fullSourceRequired: true,
    identity: "curate-episode.episodeIdHash",
    record: "curate-episode.episodeHash",
    datasetRoot: "curate-episode.source.datasetManifestHash",
    correlations: "datasetManifestHash,sourceObjectHash,episodeIdHash",
    boundary: "descriptive-only-zero-ceu-loss-price-authority" };
  const verifierImplementationHash = implementationHash(implementationFiles, {
    id: "droid100-full-source-pilot-verifier", version: "1.0.0" });
  const instrumentImplementationHash = implementationHash(implementationFiles, profile);
  const units = episodes.map((episode) => ({ identityHash: episode.episodeIdHash,
    recordHash: episode.episodeHash, datasetRoot: episode.source.datasetManifestHash,
    correlationRoots: rootsWithDataset(episode.source.datasetManifestHash,
      [episode.source.sourceObjectHash, episode.episodeIdHash]) }));
  const sourceArtifactHashes = Object.values(sourceBytes).map(digestBytes).sort();
  return createCorpusArtifactSet({
    artifactSetId,
    stage: "CURATE",
    stream: "BACKWARD_EXPERIENCE_EVIDENCE",
    createdAt,
    instrument: {
      instrumentId: "droid100-full-source-curate-intake",
      instrumentVersion: "1.0.0",
      implementationHash: instrumentImplementationHash,
      featureSchemaHash: domainDigest("outsider/corpus-registry/droid100-feature-schema/v1", {
        unitSchema: UNIT_SCHEMA, sourceFeatureSchemaHash: episodes[0].instrument.featureSchemaHash,
      }),
    },
    datasetIds: [manifest.dataset.id],
    licenseIds: [manifest.license.identifier],
    rightsBasis: { class: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
      sourceCommitmentHashes: [manifest.license.attributionNotice.noticeHash,
        manifest.manifestHash].sort(), registryGrantsRights: false },
    sourceProof: {
      sourceKind: "DROID100_PUBLIC_ROBOTICS_PILOT",
      verificationLevel: "FULL_SOURCE_REPRODUCED",
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      verifierImplementationHash,
      verificationHash: domainDigest("outsider/droid100-registry-intake-verification/v1",
        verified),
      manifestHashes: [manifest.manifestHash],
      sourceArtifactHashes,
      migration: {
        method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
        legacySchemas: [manifest.schema, episodes[0].schema, clearances[0].schema,
          checkpoint.schema, report.schema],
      },
    },
    units,
    retention: publicRetention(),
  }, { privateKeyPem });
}

const REQUIRED_LEGACY_FULL_SOURCE_KINDS = Object.freeze([
  "PUBLIC_AGENT_CORPUS",
  "PUBLIC_AGENT_WAVE2_CORPUS",
  "PUBLIC_ROBOTICS_CORPUS",
  "DROID100_PUBLIC_ROBOTICS_PILOT",
]);
const OPTIONAL_FULL_SOURCE_KINDS = Object.freeze([
  AGENTRX_TAU_WAVE4_PIN.sourceKind,
  NHTSA_SGO_CORPUS_SOURCE_KIND,
  PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
]);
const KNOWN_FULL_SOURCE_KINDS = Object.freeze([
  ...REQUIRED_LEGACY_FULL_SOURCE_KINDS,
  ...OPTIONAL_FULL_SOURCE_KINDS,
]);

function replayBoundary() {
  return {
    authority: "none",
    causalExperienceUnits: 0,
    lossEvidenceUnits: 0,
    economicLossRows: 0,
    automaticTraining: false,
    pricingEligible: false,
    permitsPrice: false,
    permitsGuarantee: false,
    permitsSettle: false,
  };
}

function artifactBodyWithoutSignature(artifactSet) {
  const { signature: ignored, ...body } = artifactSet;
  return body;
}

export function verifyPublicAgentWave3MetadataCorpusRegistrySource({ directory,
  sourceRoot, now = new Date() } = {}) {
  try {
    if (typeof directory !== "string" || typeof sourceRoot !== "string") {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "wave3");
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory: path.resolve(directory) });
    const snapshot = registry.operatorSignedClaimSnapshot({ now });
    if (!snapshot.ok) fail("REGISTRY_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const claims = snapshot.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceKind === CUAREWARDBENCH_WAVE3_PIN.sourceKind);
    if (claims.length !== 1) fail("PUBLIC_AGENT_WAVE3_METADATA_CLAIM_COUNT", claims.length);
    const stored = claims[0].artifactSet;
    if (stored.sourceProof.verificationLevel !== "PINNED_METADATA_ONLY_REPRODUCED"
      || stored.sourceProof.sourceCompleteness !== "QUARANTINED_NO_TRACE_BYTES") {
      fail("PUBLIC_AGENT_WAVE3_METADATA_CLAIM_BOUNDARY_INVALID");
    }
    const ephemeralPrivateKeyPem = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const reproduced = buildPublicAgentWave3MetadataCorpusArtifactSetFromSource({
      sourceRoot: path.resolve(sourceRoot), privateKeyPem: ephemeralPrivateKeyPem,
      createdAt: stored.createdAt, artifactSetId: stored.artifactSetId });
    const canonicalBodyExact = canonicalizeStrictBoundedArtifact(
      artifactBodyWithoutSignature(stored))
      === canonicalizeStrictBoundedArtifact(artifactBodyWithoutSignature(reproduced));
    if (!canonicalBodyExact || reproduced.artifactSetHash !== stored.artifactSetHash) {
      fail("PUBLIC_AGENT_WAVE3_METADATA_REPLAY_MISMATCH");
    }
    const body = {
      schema: "outsider/stage1-curate-wave3-metadata-source-replay/v1",
      schemaVersion: "1.0.0", ok: true,
      checkedAt: snapshot.checkedAt, registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      sourceKind: CUAREWARDBENCH_WAVE3_PIN.sourceKind,
      artifactSetHash: stored.artifactSetHash,
      candidates: stored.counts.candidates,
      sourceArtifactsReverified: true,
      canonicalBodyExact: true,
      storedSignatureVerifiedByRegistry: true,
      sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
      boundary: { traceBytesAcquired: 0, trajectoryTruthUsableRows: 0,
        causalExperienceUnits: 0, economicLossRows: 0, pricingEligibleRows: 0,
        automaticTraining: false },
    };
    return Object.freeze({ ...body, verificationHash: domainDigest(body.schema, body) });
  } catch (error) {
    return Object.freeze({ schema: "outsider/stage1-curate-wave3-metadata-source-replay/v1",
      schemaVersion: "1.0.0", ok: false, sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: { traceBytesAcquired: 0, trajectoryTruthUsableRows: 0,
        causalExperienceUnits: 0, economicLossRows: 0, pricingEligibleRows: 0,
        automaticTraining: false } });
  }
}

export function verifyPublicAgentWave4FailureTraceCorpusRegistrySource({ directory,
  sourceRoot, now = new Date() } = {}) {
  try {
    if (typeof directory !== "string" || typeof sourceRoot !== "string") {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "wave4");
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory: path.resolve(directory) });
    const snapshot = registry.operatorSignedClaimSnapshot({ now });
    if (!snapshot.ok) fail("REGISTRY_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const claims = snapshot.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceKind === AGENTRX_TAU_WAVE4_PIN.sourceKind);
    if (claims.length !== 1) fail("PUBLIC_AGENT_WAVE4_FAILURE_TRACE_CLAIM_COUNT", claims.length);
    const stored = claims[0].artifactSet;
    if (stored.sourceProof.verificationLevel !== "FULL_SOURCE_REPRODUCED"
      || stored.sourceProof.sourceCompleteness !== "FULL_DECLARED_SOURCE_SCOPE") {
      fail("PUBLIC_AGENT_WAVE4_FAILURE_TRACE_CLAIM_BOUNDARY_INVALID");
    }
    const ephemeralPrivateKeyPem = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const reproduced = buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({
      sourceRoot: path.resolve(sourceRoot), privateKeyPem: ephemeralPrivateKeyPem,
      createdAt: stored.createdAt, artifactSetId: stored.artifactSetId });
    const canonicalBodyExact = canonicalizeStrictBoundedArtifact(
      artifactBodyWithoutSignature(stored))
      === canonicalizeStrictBoundedArtifact(artifactBodyWithoutSignature(reproduced));
    if (!canonicalBodyExact || reproduced.artifactSetHash !== stored.artifactSetHash) {
      fail("PUBLIC_AGENT_WAVE4_FAILURE_TRACE_REPLAY_MISMATCH");
    }
    const body = {
      schema: "outsider/stage1-curate-wave4-failure-trace-source-replay/v1",
      schemaVersion: "1.0.0", ok: true,
      checkedAt: snapshot.checkedAt, registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      sourceKind: AGENTRX_TAU_WAVE4_PIN.sourceKind,
      artifactSetHash: stored.artifactSetHash,
      candidates: stored.counts.candidates,
      sourceArtifactsReverified: true,
      canonicalBodyExact: true,
      storedSignatureVerifiedByRegistry: true,
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      declaredSelection: "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION",
      boundary: { traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
        trajectoryEvidenceUsableRows: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
        failureRateEstimableFromSelectedScope: false,
        causalExperienceUnits: 0, economicLossRows: 0, pricingEligibleRows: 0,
        productionModelEligibleRows: 0, automaticTraining: false },
    };
    return Object.freeze({ ...body, verificationHash: domainDigest(body.schema, body) });
  } catch (error) {
    return Object.freeze({
      schema: "outsider/stage1-curate-wave4-failure-trace-source-replay/v1",
      schemaVersion: "1.0.0", ok: false, sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: { traceContainerBytesAcquired: 0, trajectoryEvidenceUsableRows: 0,
        failureRateEstimableFromSelectedScope: false,
        causalExperienceUnits: 0, economicLossRows: 0, pricingEligibleRows: 0,
        productionModelEligibleRows: 0, automaticTraining: false },
    });
  }
}

export function verifyPublicEvidenceWave5CorpusRegistrySource({ directory,
  sourceRoot, now = new Date() } = {}) {
  try {
    if (typeof directory !== "string" || typeof sourceRoot !== "string") {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "wave5");
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory: path.resolve(directory) });
    const snapshot = registry.operatorSignedClaimSnapshot({ now });
    if (!snapshot.ok) fail("REGISTRY_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const claims = snapshot.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceKind === PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND);
    if (claims.length !== 1) fail("PUBLIC_EVIDENCE_WAVE5_CLAIM_COUNT", claims.length);
    const stored = claims[0].artifactSet;
    if (stored.sourceProof.verificationLevel !== "FULL_SOURCE_REPRODUCED"
      || stored.sourceProof.sourceCompleteness !== "FULL_DECLARED_SOURCE_SCOPE"
      || stored.rightsBasis.class !== "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"
      || stored.rightsBasis.registryGrantsRights !== false
      || stored.counts.candidates !== 49
      || stored.boundary.automaticTraining !== false
      || stored.boundary.pricingEligible !== false) {
      fail("PUBLIC_EVIDENCE_WAVE5_CLAIM_BOUNDARY_INVALID");
    }
    const ephemeralPrivateKeyPem = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const reproduced = buildPublicEvidenceWave5CorpusArtifactSetFromSource({
      sourceRoot: path.resolve(sourceRoot), privateKeyPem: ephemeralPrivateKeyPem,
      createdAt: stored.createdAt, artifactSetId: stored.artifactSetId,
    });
    const canonicalBodyExact = canonicalizeStrictBoundedArtifact(
      artifactBodyWithoutSignature(stored))
      === canonicalizeStrictBoundedArtifact(artifactBodyWithoutSignature(reproduced));
    if (!canonicalBodyExact || reproduced.artifactSetHash !== stored.artifactSetHash) {
      fail("PUBLIC_EVIDENCE_WAVE5_REPLAY_MISMATCH");
    }
    const body = {
      schema: "outsider/stage1-curate-wave5-source-aware-taxonomy-replay/v1",
      schemaVersion: "1.0.0", ok: true,
      checkedAt: snapshot.checkedAt, registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      sourceKind: PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
      artifactSetHash: stored.artifactSetHash,
      candidates: stored.counts.candidates,
      sourceArtifactsReverified: true,
      canonicalBodyExact: true,
      storedSignatureVerifiedByRegistry: true,
      sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
      rightsStatus: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
      preActionAvailableRows: 0,
      trainerRowsEnqueued: 0,
      targetPredictorEligibleRows: 0,
      boundary: replayBoundary(),
    };
    return Object.freeze({ ...body, verificationHash: domainDigest(body.schema, body) });
  } catch (error) {
    return Object.freeze({
      schema: "outsider/stage1-curate-wave5-source-aware-taxonomy-replay/v1",
      schemaVersion: "1.0.0", ok: false, sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error),
      preActionAvailableRows: 0, trainerRowsEnqueued: 0,
      targetPredictorEligibleRows: 0, boundary: replayBoundary(),
    });
  }
}

export async function verifyKnownPublicCorpusRegistrySources({ directory,
  agentArtifactDirectory, wave2SourceRoot, roboticsSourceRoot,
  droidArtifactDirectory, droidSourceRoot, wave4SourceRoot,
  nhtsaCsvPath, nhtsaDataDictionaryPath, wave5SourceRoot, now = new Date(),
} = {}) {
  try {
    const requiredPaths = { directory, agentArtifactDirectory, wave2SourceRoot,
      roboticsSourceRoot, droidArtifactDirectory, droidSourceRoot };
    for (const [name, value] of Object.entries(requiredPaths)) {
      if (typeof value !== "string" || value.length === 0) fail("VERIFY_SOURCE_PATH_REQUIRED", name);
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory: path.resolve(directory) });
    const snapshot = registry.operatorSignedClaimSnapshot({ now });
    if (!snapshot.ok) fail("REGISTRY_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const fullSourceClaims = snapshot.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceCompleteness === "FULL_DECLARED_SOURCE_SCOPE");
    const byKind = new Map();
    for (const claim of fullSourceClaims) {
      const kind = claim.artifactSet.sourceProof.sourceKind;
      if (!KNOWN_FULL_SOURCE_KINDS.includes(kind)) fail("UNKNOWN_FULL_SOURCE_KIND", kind);
      if (byKind.has(kind)) fail("DUPLICATE_FULL_SOURCE_KIND", kind);
      byKind.set(kind, claim);
    }
    for (const kind of REQUIRED_LEGACY_FULL_SOURCE_KINDS) {
      if (!byKind.has(kind)) fail("KNOWN_FULL_SOURCE_KIND_MISSING", kind);
    }
    const wave4Present = byKind.has(AGENTRX_TAU_WAVE4_PIN.sourceKind);
    if (wave4Present && (typeof wave4SourceRoot !== "string" || wave4SourceRoot.length === 0)) {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "wave4SourceRoot");
    }
    const nhtsaPresent = byKind.has(NHTSA_SGO_CORPUS_SOURCE_KIND);
    if (nhtsaPresent && (typeof nhtsaCsvPath !== "string" || nhtsaCsvPath.length === 0
      || typeof nhtsaDataDictionaryPath !== "string"
      || nhtsaDataDictionaryPath.length === 0)) {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "nhtsaCsvPath+nhtsaDataDictionaryPath");
    }
    const wave5Present = byKind.has(PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND);
    if (wave5Present && (typeof wave5SourceRoot !== "string"
      || wave5SourceRoot.length === 0)) {
      fail("VERIFY_SOURCE_PATH_REQUIRED", "wave5SourceRoot");
    }
    const expectedFullSourceClaims = REQUIRED_LEGACY_FULL_SOURCE_KINDS.length
      + (wave4Present ? 1 : 0) + (nhtsaPresent ? 1 : 0)
      + (wave5Present ? 1 : 0);
    if (fullSourceClaims.length !== expectedFullSourceClaims) {
      fail("UNKNOWN_OR_MISSING_FULL_SOURCE_CLAIM_COUNT", fullSourceClaims.length);
    }

    const ephemeralPrivateKeyPem = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const rebuild = async (kind) => {
      const stored = byKind.get(kind).artifactSet;
      const shared = { privateKeyPem: ephemeralPrivateKeyPem, createdAt: stored.createdAt,
        artifactSetId: stored.artifactSetId };
      if (kind === "PUBLIC_AGENT_CORPUS") {
        return buildPublicAgentCorpusArtifactSetFromSource({
          artifactDirectory: path.resolve(agentArtifactDirectory), ...shared });
      }
      if (kind === "PUBLIC_AGENT_WAVE2_CORPUS") {
        return buildPublicAgentWave2CorpusArtifactSetFromSource({
          sourceRoot: path.resolve(wave2SourceRoot), ...shared });
      }
      if (kind === "PUBLIC_ROBOTICS_CORPUS") {
        return buildPublicRoboticsCorpusArtifactSetFromSource({
          sourceRoot: path.resolve(roboticsSourceRoot), ...shared });
      }
      if (kind === AGENTRX_TAU_WAVE4_PIN.sourceKind) {
        return buildPublicAgentWave4FailureTraceCorpusArtifactSetFromSource({
          sourceRoot: path.resolve(wave4SourceRoot), ...shared });
      }
      if (kind === NHTSA_SGO_CORPUS_SOURCE_KIND) {
        return buildNhtsaSgoIncidentCorpusArtifactSetFromSource({
          csvPath: path.resolve(nhtsaCsvPath),
          dataDictionaryPath: path.resolve(nhtsaDataDictionaryPath), ...shared });
      }
      if (kind === PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND) {
        return buildPublicEvidenceWave5CorpusArtifactSetFromSource({
          sourceRoot: path.resolve(wave5SourceRoot), ...shared });
      }
      return buildDroid100CorpusArtifactSetFromSource({
        artifactDirectory: path.resolve(droidArtifactDirectory),
        sourceRoot: path.resolve(droidSourceRoot), ...shared });
    };

    const verifiedArtifacts = [];
    const replayKinds = [...REQUIRED_LEGACY_FULL_SOURCE_KINDS,
      ...(wave4Present ? [AGENTRX_TAU_WAVE4_PIN.sourceKind] : []),
      ...(nhtsaPresent ? [NHTSA_SGO_CORPUS_SOURCE_KIND] : []),
      ...(wave5Present ? [PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND] : [])];
    for (const kind of replayKinds) {
      const stored = byKind.get(kind).artifactSet;
      const reproduced = await rebuild(kind);
      const canonicalBodyExact = canonicalizeStrictBoundedArtifact(
        artifactBodyWithoutSignature(stored))
        === canonicalizeStrictBoundedArtifact(artifactBodyWithoutSignature(reproduced));
      if (!canonicalBodyExact || reproduced.artifactSetHash !== stored.artifactSetHash) {
        fail("KNOWN_SOURCE_REPLAY_MISMATCH", kind);
      }
      verifiedArtifacts.push({ sourceKind: kind, artifactSetHash: stored.artifactSetHash,
        candidates: stored.counts.candidates, canonicalBodyExact: true,
        storedSignatureVerifiedByRegistry: true, sourceArtifactsReverified: true });
    }
    const fullSourceCandidatesReverified = verifiedArtifacts.reduce((total, artifact) =>
      total + artifact.candidates, 0);
    const body = {
      schema: "outsider/stage1-curate-known-public-source-replay/v1",
      schemaVersion: "1.0.0",
      ok: true,
      checkedAt: snapshot.checkedAt,
      registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      sourceArtifactsReverified: true,
      allOperatorSignedFullSourceClaimsReverified: true,
      fullSourceArtifactSetsReverified: verifiedArtifacts.length,
      fullSourceCandidatesReverified,
      operatorSignedFullSourceClaims: snapshot.counts.operatorSignedFullSourceClaims,
      operatorSignedPrivacyProjectionClaims:
        snapshot.counts.operatorSignedPrivacyProjectionClaims,
      signedPrivacyProjectionSourceArtifactsReverified: false,
      artifacts: verifiedArtifacts,
      boundary: replayBoundary(),
    };
    return Object.freeze({ ...body,
      verificationHash: domainDigest(body.schema, body) });
  } catch (error) {
    return Object.freeze({
      schema: "outsider/stage1-curate-known-public-source-replay/v1",
      schemaVersion: "1.0.0",
      ok: false,
      sourceArtifactsReverified: false,
      allOperatorSignedFullSourceClaimsReverified: false,
      fullSourceArtifactSetsReverified: 0,
      fullSourceCandidatesReverified: 0,
      error: error instanceof Error ? error.message : String(error),
      boundary: replayBoundary(),
    });
  }
}
