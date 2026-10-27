/*
 * Source-bound Stage 1 / CURATE intake for the frozen NHTSA SGO ADS crash
 * report snapshot. These are real-world reporting-entity submissions, but
 * they remain incident-taxonomy evidence only: a report is not an independent
 * event adjudication, an exposure denominator, a monetary loss row, a CEU, or
 * a grant of reuse/training rights.
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
import {
  createCorpusArtifactSet, DurableStage1CurateCorpusRegistry,
} from "./outsider-corpus-registry.js";
import {
  NHTSA_SGO_FROZEN_SOURCE_20260820,
  NHTSA_SGO_INCIDENT_QUARANTINE_SCHEMA,
  adaptNhtsaSgoAdsCsv,
  verifyNhtsaSgoIncidentQuarantine,
} from "./outsider-public-risk-source-adapters.js";
import {
  PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS,
  buildPublicEvidenceOntologyClassification,
  publicEvidenceOntologyReference,
  verifyPublicEvidenceOntologyClassification,
  verifyPublicEvidenceOntologyReference,
} from "./outsider-public-evidence-ontology.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HASH = /^sha256:[a-f0-9]{64}$/;
const NHTSA_SOURCE_ID = "NHTSA_SGO_ADS_CRASH_REPORTS";
const DICTIONARY_BYTES = 578_494;
const UNIT_SCHEMA = Object.freeze({
  schema: "outsider/stage1-curate-nhtsa-incident-taxonomy-unit/v1",
  fields: Object.freeze(["identityHash", "recordHash", "datasetRoot", "correlationRoots"]),
  identity: "stable-hash-of-native-report-id",
  record: "latest-version-privacy-projected-incident-taxonomy-hash",
  correlations: Object.freeze(["dataset-revision", "reporting-entity", "reporting-regime"]),
  independentEventUnit: false,
  rawContentIncluded: false,
});
const REPORT_PROJECTION_FIELDS = Object.freeze([
  "airbagsDeployed", "automationSystemEngaged", "crashWith", "disposition",
  "engagementStatus", "highestInjurySeverityAlleged", "incidentDateMarkedUnknown",
  "incidentDatePresent", "privacyProjection", "projectionHash", "reportIdHash",
  "reportMonth", "reportType", "reportVersion", "reportYear", "reportingEntityHash",
  "sourceRowHash", "vehicleTowed",
]);

export const NHTSA_SGO_CORPUS_SOURCE_KIND = "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE";
export const NHTSA_SGO_STAGE1_FROZEN_SCOPE = Object.freeze({
  sourceId: NHTSA_SOURCE_ID,
  sourceKind: NHTSA_SGO_CORPUS_SOURCE_KIND,
  csv: Object.freeze({
    sha256: NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectHash,
    bytes: NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectBytes,
  }),
  dataDictionary: Object.freeze({
    sha256: NHTSA_SGO_FROZEN_SOURCE_20260820.dataDictionaryHash,
    bytes: DICTIONARY_BYTES,
  }),
  counts: Object.freeze({
    rawReportVersions: 1_365,
    latestReportIdentities: 1_324,
    supersededOrDuplicateVersions: 41,
    reportingEntities: 16,
  }),
  allowedUse: "INCIDENT_TAXONOMY_AND_SOURCE_DISCOVERY_ONLY",
});

function fail(code, detail = null) {
  throw new Error(detail == null ? `NHTSA_CORPUS_INTAKE_${code}`
    : `NHTSA_CORPUS_INTAKE_${code}:${detail}`);
}

function digestBytes(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function domainDigest(domain, value) {
  return digestBytes(`${domain}\0${typeof value === "string" ? value
    : canonicalizeStrict(value)}`);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

/* The frozen NHTSA artifact-set body contains 1,324 bounded, hash-only
 * projections and legitimately exceeds the ordinary canonical member budget.
 * Keep the larger allowance local to this exact artifact comparison; generic
 * values and individual records continue to use canonicalizeStrict. */
function sameBoundedArtifact(left, right) {
  return canonicalizeStrictBoundedArtifact(left)
    === canonicalizeStrictBoundedArtifact(right);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...keys].sort());
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function openPinnedSource(file, { expectedHash, expectedBytes, label }) {
  if (typeof file !== "string" || file.length === 0 || !HASH.test(expectedHash)
    || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) fail("SOURCE_PATH_REQUIRED", label);
  const target = path.resolve(file);
  const pathStat = lstatSync(target);
  if (!pathStat.isFile() || pathStat.isSymbolicLink()) fail("SOURCE_FILE_INVALID", label);
  let descriptor = null;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(expectedBytes)) {
      fail("SOURCE_FILE_SIZE_INVALID", label);
    }
    const bytes = readFileSync(descriptor);
    const afterRead = fstatSync(descriptor, { bigint: true });
    if (!sameStat(before, afterRead) || bytes.length !== expectedBytes) {
      fail("SOURCE_FILE_CHANGED_DURING_READ", label);
    }
    if (digestBytes(bytes) !== expectedHash) fail("SOURCE_FILE_HASH_INVALID", label);
    return { target, descriptor, before, bytes, label };
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    throw error;
  }
}

function assertSnapshotUnchanged(snapshot) {
  const afterBuild = fstatSync(snapshot.descriptor, { bigint: true });
  if (!sameStat(snapshot.before, afterBuild)) {
    fail("SOURCE_FILE_CHANGED_DURING_BUILD", snapshot.label);
  }
}

function closeSnapshot(snapshot) {
  if (snapshot?.descriptor !== null && snapshot?.descriptor !== undefined) {
    closeSync(snapshot.descriptor);
    snapshot.descriptor = null;
  }
}

function implementationHash(files, profile) {
  const inputs = files.map((file) => ({ file: path.basename(file), sha256: digestBytes(
    readFileSync(file)) })).sort((left, right) => left.file.localeCompare(right.file));
  return domainDigest("outsider/nhtsa-corpus-registry/intake-implementation/v1",
    { files: inputs, profile });
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

function replayBoundary() {
  return {
    authority: "none",
    independentIncidentEventsEstablished: false,
    completeExposureDenominatorObserved: false,
    admittedExposureRows: 0,
    admittedLossRows: 0,
    economicLossRows: 0,
    causalExperienceUnits: 0,
    modelRows: 0,
    automaticTraining: false,
    productionModelUpdate: false,
    pricingEligible: false,
    permitsPrice: false,
    permitsCoverage: false,
    permitsGuarantee: false,
    permitsSettle: false,
    rightsEstablished: false,
  };
}

function assertNhtsaQuarantine(artifact, csvBytes) {
  const checked = verifyNhtsaSgoIncidentQuarantine(artifact, csvBytes);
  const counts = NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts;
  const ontology = buildPublicEvidenceOntologyClassification(NHTSA_SOURCE_ID);
  const ontologyReference = publicEvidenceOntologyReference(NHTSA_SOURCE_ID);
  if (!checked.ok || checked.sourceReproduced !== true
    || !verifyPublicEvidenceOntologyClassification(ontology).ok
    || !verifyPublicEvidenceOntologyReference(ontologyReference).ok
    || !same(ontology.permittedUse.allowed, ["DESCRIPTIVE"])
    || ontology.permittedUse.descriptiveScope !== "INCIDENT_TAXONOMY_AND_SOURCE_DISCOVERY_ONLY"
    || ontology.rightsBoundary.adapterGrantsRights !== false
    || !ontology.rightsBoundary.reuseOrTrainingRights.includes("NOT_ESTABLISHED")
    || artifact.source.sourceId !== NHTSA_SOURCE_ID
    || artifact.source.independentAdjudication !== false
    || artifact.source.reuseRightsVerifiedForTraining !== false
    || artifact.counts.rawReportRows !== counts.rawReportVersions
    || artifact.counts.uniqueReportIds !== counts.latestReportIdentities
    || artifact.counts.historicalOrDuplicateVersions !== counts.supersededOrDuplicateVersions
    || artifact.counts.reportingEntities !== counts.reportingEntities
    || artifact.counts.projectedIncidentRows !== counts.latestReportIdentities
    || artifact.counts.admittedExposureRows !== 0 || artifact.counts.admittedLossRows !== 0
    || artifact.counts.externallyAdjudicatedRows !== 0
    || artifact.disposition.allowedUse !== "TAXONOMY_AND_SOURCE_DISCOVERY"
    || artifact.disposition.individualReportFactsIndependentlyAdjudicated !== false
    || artifact.disposition.completeExposureDenominatorObserved !== false
    || artifact.disposition.observedEconomicLossAndCurrencyPresent !== false
    || artifact.modelEntrance.automaticTraining !== false
    || artifact.modelEntrance.frequencyEligible !== false
    || artifact.modelEntrance.severityEligible !== false
    || artifact.modelEntrance.price !== null
    || artifact.authority.mode !== "none"
    || artifact.reports.length !== counts.latestReportIdentities
    || new Set(artifact.reports.map((report) => report.reportIdHash)).size
      !== counts.latestReportIdentities
    || new Set(artifact.reports.map((report) => report.projectionHash)).size
      !== counts.latestReportIdentities
    || artifact.reports.some((report) => !exactKeys(report, REPORT_PROJECTION_FIELDS))) {
    fail("INCIDENT_QUARANTINE_BOUNDARY_INVALID", checked.failures?.join(",") ?? null);
  }
  return { ontology, ontologyReference };
}

function artifactBodyWithoutSignature(artifactSet) {
  const { signature: ignored, ...body } = artifactSet;
  return body;
}

/**
 * Rebuild a hash-only CURATE artifact set from the exact official CSV and the
 * exact pinned data-dictionary PDF. Both descriptors stay open through the
 * derivation and are re-statted before the signed set is returned.
 */
export function buildNhtsaSgoIncidentCorpusArtifactSetFromSource({ csvPath,
  dataDictionaryPath, privateKeyPem, createdAt = new Date(),
  artifactSetId = "nhtsa-sgo-incident-taxonomy-20260820",
} = {}) {
  if (!privateKeyPem) fail("SIGNING_KEY_REQUIRED");
  let csv = null;
  let dictionary = null;
  try {
    csv = openPinnedSource(csvPath, {
      expectedHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
      expectedBytes: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.bytes,
      label: "csv",
    });
    dictionary = openPinnedSource(dataDictionaryPath, {
      expectedHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
      expectedBytes: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.bytes,
      label: "data-dictionary",
    });
    if (csv.before.dev === dictionary.before.dev && csv.before.ino === dictionary.before.ino) {
      fail("SOURCE_FILES_ALIAS");
    }
    const generatedAt = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
    const quarantine = adaptNhtsaSgoAdsCsv(csv.bytes, {
      sourceObjectHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
      dataDictionaryHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
      generatedAt,
      sourceUrl: NHTSA_SGO_FROZEN_SOURCE_20260820.csvUrl,
    });
    const { ontology, ontologyReference } = assertNhtsaQuarantine(quarantine, csv.bytes);
    const datasetRoot = domainDigest("outsider/nhtsa-sgo-corpus/dataset-revision/v1", {
      csvHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
      dataDictionaryHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
      sourceCommitmentHash: quarantine.sourceCommitmentHash,
    });
    const reportingRegimeRoot = domainDigest("outsider/nhtsa-sgo-corpus/reporting-regime/v1", {
      sourceId: NHTSA_SOURCE_ID,
      reportingBasis: quarantine.source.reportingBasis,
      sourceUrl: quarantine.source.sourceUrl,
    });
    const units = quarantine.reports.map((report) => ({
      identityHash: report.reportIdHash,
      recordHash: report.projectionHash,
      datasetRoot,
      correlationRoots: [datasetRoot, report.reportingEntityHash, reportingRegimeRoot].sort(),
    }));
    const implementationFiles = [
      path.join(HERE, "outsider-nhtsa-corpus-registry-intake.js"),
      path.join(HERE, "outsider-public-risk-source-adapters.js"),
      path.join(HERE, "outsider-public-evidence-ontology.js"),
    ];
    const profile = {
      id: "nhtsa-sgo-incident-taxonomy-hash-only-curate-intake",
      version: "1.0.0",
      unitSchema: UNIT_SCHEMA,
      projectionFields: REPORT_PROJECTION_FIELDS,
      sourceScope: NHTSA_SGO_STAGE1_FROZEN_SCOPE,
      ontologyReference,
      latestVersionRule: "highest-numeric-report-version-per-native-report-id",
      taxonomyOnly: true,
      independentEventUnit: false,
      boundary: "descriptive-only-zero-rights-ceu-loss-exposure-model-price-authority",
    };
    const verifierImplementationHash = implementationHash(implementationFiles, {
      id: "nhtsa-sgo-incident-quarantine-full-source-verifier", version: "1.0.0",
    });
    const instrumentImplementationHash = implementationHash(implementationFiles, profile);
    const artifactSet = createCorpusArtifactSet({
      artifactSetId,
      stage: "CURATE",
      stream: "BACKWARD_EXPERIENCE_EVIDENCE",
      createdAt,
      instrument: {
        instrumentId: "nhtsa-sgo-incident-taxonomy-curate-intake",
        instrumentVersion: "1.0.0",
        implementationHash: instrumentImplementationHash,
        featureSchemaHash: domainDigest("outsider/nhtsa-sgo-corpus/feature-schema/v1", profile),
      },
      datasetIds: [NHTSA_SOURCE_ID],
      licenseIds: [],
      rightsBasis: {
        class: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
        sourceCommitmentHashes: [ontologyReference.rightsBoundaryHash,
          NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256].sort(),
        registryGrantsRights: false,
      },
      sourceProof: {
        sourceKind: NHTSA_SGO_CORPUS_SOURCE_KIND,
        verificationLevel: "FULL_SOURCE_REPRODUCED",
        sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
        verifierImplementationHash,
        verificationHash: quarantine.artifactHash,
        manifestHashes: [quarantine.sourceCommitmentHash,
          ontologyReference.referenceHash].sort(),
        sourceArtifactHashes: [NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
          NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256].sort(),
        migration: {
          method: "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
          legacySchemas: [NHTSA_SGO_INCIDENT_QUARANTINE_SCHEMA,
            PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.reference],
        },
      },
      units,
      retention: publicRetention(),
    }, { privateKeyPem });
    assertSnapshotUnchanged(csv);
    assertSnapshotUnchanged(dictionary);
    if (artifactSet.counts.candidates !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities
      || artifactSet.counts.uniqueIdentities
        !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities
      || artifactSet.counts.exactDuplicates !== 0
      || artifactSet.rightsBasis.registryGrantsRights !== false
      || artifactSet.boundary.causalExperienceUnits !== 0
      || artifactSet.boundary.lossEvidenceUnits !== 0
      || artifactSet.boundary.automaticTraining !== false
      || artifactSet.boundary.pricingEligible !== false
      || !same(ontology.permittedUse.allowed, ["DESCRIPTIVE"])) {
      fail("ARTIFACT_SET_BOUNDARY_INVALID");
    }
    return artifactSet;
  } finally {
    closeSnapshot(dictionary);
    closeSnapshot(csv);
  }
}

/**
 * Dedicated source replay. Ordinary registry verification intentionally does
 * not call this function and therefore never authenticates a source claim.
 */
export function verifyNhtsaSgoIncidentCorpusRegistrySource({ directory, csvPath,
  dataDictionaryPath, now = new Date() } = {}) {
  try {
    if (typeof directory !== "string" || typeof csvPath !== "string"
      || typeof dataDictionaryPath !== "string") fail("VERIFY_SOURCE_PATH_REQUIRED");
    const registry = new DurableStage1CurateCorpusRegistry({ directory: path.resolve(directory) });
    const snapshot = registry.operatorSignedClaimSnapshot({ now });
    if (!snapshot.ok) fail("REGISTRY_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const claims = snapshot.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceKind === NHTSA_SGO_CORPUS_SOURCE_KIND);
    if (claims.length !== 1) fail("CLAIM_COUNT", claims.length);
    const stored = claims[0].artifactSet;
    if (stored.stage !== "CURATE" || stored.stream !== "BACKWARD_EXPERIENCE_EVIDENCE"
      || !same(stored.datasetIds, [NHTSA_SOURCE_ID]) || stored.licenseIds.length !== 0
      || stored.rightsBasis.class !== "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"
      || stored.rightsBasis.registryGrantsRights !== false
      || stored.sourceProof.verificationLevel !== "FULL_SOURCE_REPRODUCED"
      || stored.sourceProof.sourceCompleteness !== "FULL_DECLARED_SOURCE_SCOPE"
      || stored.counts.candidates !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities
      || stored.counts.uniqueIdentities !== stored.counts.candidates
      || stored.counts.exactDuplicates !== 0
      || !same(stored.boundary, {
        authority: "none", causalExperienceUnits: 0, lossEvidenceUnits: 0,
        economicLossRows: 0, automaticTraining: false, pricingEligible: false,
        permitsPrice: false, permitsGuarantee: false, permitsSettle: false,
      })) {
      fail("CLAIM_BOUNDARY_INVALID");
    }
    const ephemeralPrivateKeyPem = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    }).privateKey;
    const reproduced = buildNhtsaSgoIncidentCorpusArtifactSetFromSource({
      csvPath: path.resolve(csvPath), dataDictionaryPath: path.resolve(dataDictionaryPath),
      privateKeyPem: ephemeralPrivateKeyPem, createdAt: stored.createdAt,
      artifactSetId: stored.artifactSetId,
    });
    const canonicalBodyExact = sameBoundedArtifact(artifactBodyWithoutSignature(stored),
      artifactBodyWithoutSignature(reproduced));
    if (!canonicalBodyExact || reproduced.artifactSetHash !== stored.artifactSetHash) {
      fail("SOURCE_REPLAY_MISMATCH");
    }
    const ontologyReference = publicEvidenceOntologyReference(NHTSA_SOURCE_ID);
    const body = {
      schema: "outsider/stage1-curate-nhtsa-sgo-source-replay/v1",
      schemaVersion: "1.0.0",
      ok: true,
      checkedAt: snapshot.checkedAt,
      registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      sourceKind: NHTSA_SGO_CORPUS_SOURCE_KIND,
      artifactSetHash: stored.artifactSetHash,
      sourceArtifactsReverified: true,
      canonicalBodyExact: true,
      storedSignatureVerifiedByRegistry: true,
      sourceObjects: {
        csv: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv,
        dataDictionary: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary,
      },
      counts: {
        ...NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts,
        incidentTaxonomyRows: stored.counts.candidates,
        independentIncidentEvents: 0,
        exposureDenominatorRows: 0,
        monetaryLossRows: 0,
        modelRows: 0,
      },
      correlations: {
        datasetRevisionRoots: 1,
        reportingEntityRoots: NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.reportingEntities,
        reportingRegimeRoots: 1,
        reportsTreatedAsIndependentEvents: false,
      },
      ontologyReference,
      allowedUse: NHTSA_SGO_STAGE1_FROZEN_SCOPE.allowedUse,
      rightsStatus: "NOT_ESTABLISHED_PUBLIC_ACCESS_ONLY",
      boundary: replayBoundary(),
    };
    return Object.freeze({ ...body,
      verificationHash: domainDigest(body.schema, body) });
  } catch (error) {
    return Object.freeze({
      schema: "outsider/stage1-curate-nhtsa-sgo-source-replay/v1",
      schemaVersion: "1.0.0",
      ok: false,
      sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: replayBoundary(),
    });
  }
}
