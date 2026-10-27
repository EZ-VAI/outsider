/*
 * Source-reverified intake for explicitly contributed Stage 0.5 runs.
 *
 * The signed Evidence Registry remains the source of truth. This adapter
 * verifies its receipts, signature, retention state, D1 records, and D2 groups
 * under an explicit trust policy, then emits hash-only corpus artifact sets.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { createCorpusArtifactSet } from "./outsider-corpus-registry.js";
import {
  EVIDENCE_REGISTRY_SCHEMAS, evidenceRegistryDigest, verifyEvidenceRegistry,
} from "./outsider-evidence-registry.js";
import { CONTRIBUTION_SCHEMAS, verifyContributionRecord } from
  "./outsider-experience-contribution.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const PROFILE = Object.freeze({
  id: "stage05-contribution-registry-hash-only-intake",
  version: "1.1.0",
  sourceSchema: EVIDENCE_REGISTRY_SCHEMAS.registry,
  unit: {
    identity: "contributionRecord.source.supervisedExperienceHash",
    record: "contributionRecord.recordHash",
    datasetRoot: "sha256-domain(sourceRegistryId,sourceServerKeyId)",
    correlations: "source,controller,way,claim,world,authority,server,contributor roots",
  },
  d2: "exact original evidence group mapped into instrument and feature-schema hashes",
  causalCredit: "always-zero; VERIFIED_DELIVERY_UNATTRIBUTED is never Outsider success",
  rawContentIncluded: false,
});

function fail(code, detail = null) {
  throw new Error(detail == null ? `STAGE05_CORPUS_INTAKE_${code}`
    : `STAGE05_CORPUS_INTAKE_${code}:${detail}`);
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainDigest(domain, value) {
  return digest(`${domain}\0${typeof value === "string" ? value : canonicalizeStrict(value)}`);
}

function exactImplementationHash(files, profile) {
  return domainDigest("outsider/stage05-corpus-intake/implementation/v1", {
    files: files.map((file) => ({ name: path.basename(file), sha256: digest(readFileSync(file)) }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    profile,
  });
}

function canonicalTime(value, code) {
  const text = value instanceof Date ? value.toISOString() : value;
  const parsed = Date.parse(String(text ?? ""));
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) fail(`${code}_INVALID`);
  return text;
}

function trustedIds(values, code) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 256
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(`${code}_INVALID`);
  return [...new Set(values)].sort();
}

function publicBoundary() {
  return {
    authority: "none", causalExperienceUnits: 0, lossEvidenceUnits: 0,
    economicLossRows: 0, automaticTraining: false, pricingEligible: false,
    permitsPrice: false, permitsGuarantee: false, permitsSettle: false,
  };
}

function retention(retainUntil) {
  return {
    mode: "EXPIRES_AT_KEEP_HASH_ONLY_TOMBSTONE",
    retainUntil,
    storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
    sourcePayloadManaged: false,
    expiryDisposition: "BLOCK_USE_KEEP_HASH_ONLY_TOMBSTONE",
    liveRevocationChecked: false,
  };
}

function enforceUnattributedBoundary(record) {
  const labels = record.learningLabels;
  const verified = record.modelFeatures.verified;
  if (record.terminal.terminalClass === "VERIFIED_DELIVERY_UNATTRIBUTED"
    && (labels.outsiderCausalContribution !== false
      || labels.eligibleForCorrectionEffectLearning !== false
      || labels.causalAttributionClass !== "DELIVERY_UNATTRIBUTED"
      || verified.outsiderCausalContribution !== false
      || verified.eligibleForCorrectionEffectLearning !== false
      || verified.causalAttributionClass !== "DELIVERY_UNATTRIBUTED")) {
    fail("UNATTRIBUTED_DELIVERY_CAUSAL_CREDIT_REFUSED", record.recordHash);
  }
}

function selectedImports(evidenceRegistry, afterImportHash) {
  if (afterImportHash == null) return evidenceRegistry.imports;
  if (!HASH.test(String(afterImportHash ?? ""))) fail("AFTER_IMPORT_HASH_INVALID");
  const index = evidenceRegistry.imports.findIndex((entry) => entry.importHash === afterImportHash);
  if (index < 0) fail("AFTER_IMPORT_HASH_NOT_FOUND");
  return evidenceRegistry.imports.slice(index + 1);
}

function groupEntries(evidenceRegistry, imports) {
  const evidenceByGroup = new Map(evidenceRegistry.evidenceRecords
    .map((record) => [record.groupKeyHash, record]));
  const groups = new Map();
  for (const imported of imports) {
    for (const item of imported.quarantineExport.items) {
      const record = item.contributionRecord;
      const checked = verifyContributionRecord(record);
      if (!checked.ok) fail("CONTRIBUTION_RECORD_INVALID", checked.error);
      enforceUnattributedBoundary(record);
      const groupKeyHash = evidenceRegistryDigest(record.instrument);
      const evidenceRecord = evidenceByGroup.get(groupKeyHash);
      if (!evidenceRecord || canonicalizeStrict(evidenceRecord.groupKey)
        !== canonicalizeStrict(record.instrument)) fail("D2_EVIDENCE_GROUP_MISSING");
      const group = groups.get(groupKeyHash) ?? { groupKeyHash,
        groupKey: record.instrument, evidenceRecord, entries: [] };
      group.entries.push({ imported, item, record });
      groups.set(groupKeyHash, group);
    }
  }
  return [...groups.values()].sort((left, right) => left.groupKeyHash
    .localeCompare(right.groupKeyHash));
}

export function buildStage05ContributionCorpusArtifactSetsFromEvidenceRegistry({
  evidenceRegistry, privateKeyPem, trustedRegistrySignerKeyIds,
  trustedSourceServerKeyIds, now = new Date(), createdAt = null,
  afterImportHash = null, artifactSetIdPrefix = "stage05-live-contributions",
} = {}) {
  if (!privateKeyPem || !TOKEN.test(String(artifactSetIdPrefix ?? ""))
    || artifactSetIdPrefix.length > 64) {
    fail("ARGUMENT_INVALID");
  }
  const checkedAt = canonicalTime(now, "CHECKED_AT");
  const artifactTime = canonicalTime(createdAt ?? evidenceRegistry?.updatedAt, "CREATED_AT");
  if (Date.parse(artifactTime) > Date.parse(checkedAt)) fail("CREATED_AFTER_VERIFICATION");
  const registrySignerTrust = trustedIds(trustedRegistrySignerKeyIds,
    "REGISTRY_SIGNER_TRUST");
  const sourceServerTrust = trustedIds(trustedSourceServerKeyIds,
    "SOURCE_SERVER_TRUST");
  const verifiedRegistry = verifyEvidenceRegistry(evidenceRegistry, { now: checkedAt });
  if (!verifiedRegistry.ok || verifiedRegistry.signed !== true
    || verifiedRegistry.signatureCryptographicallyValid !== true
    || !registrySignerTrust.includes(evidenceRegistry?.signature?.keyId)) {
    fail("SIGNED_EVIDENCE_REGISTRY_UNTRUSTED", verifiedRegistry.error);
  }
  if (artifactTime !== evidenceRegistry.updatedAt) fail("CREATED_AT_NOT_SOURCE_UPDATE_TIME");
  const imports = selectedImports(evidenceRegistry, afterImportHash);
  const sourceServerKeyIds = [...new Set(imports
    .map((imported) => imported.sourceServerKeyId))].sort();
  if (sourceServerKeyIds.some((keyId) => !sourceServerTrust.includes(keyId))) {
    fail("SIGNED_RECEIPT_SERVER_UNTRUSTED");
  }
  if (evidenceRegistry.claimBoundary.revocationFreshness !== "AS_OF_SOURCE_EXPORT_ONLY"
    || evidenceRegistry.claimBoundary.verifiesLiveRevocationAfterImport !== false
    || evidenceRegistry.claimBoundary.retentionEnforcement !== "MANUAL_PRUNE_REQUIRED") {
    fail("SOURCE_FRESHNESS_BOUNDARY_INVALID");
  }
  const sourceVerifierFiles = [path.join(HERE, "outsider-evidence-registry.js"),
    path.join(HERE, "outsider-experience-contribution.js"),
    path.join(HERE, "outsider-supervised-experience.js")];
  const verifierImplementationHash = exactImplementationHash(sourceVerifierFiles, {
    purpose: "signed-stage05-contribution-registry-full-reverification", version: "1.0.0" });
  const intakeImplementationHash = exactImplementationHash([
    ...sourceVerifierFiles, fileURLToPath(import.meta.url),
  ], PROFILE);
  const signedRegistryObjectHash = digest(evidenceRegistry);
  const artifactSets = groupEntries(evidenceRegistry, imports).map((group) => {
    const entries = group.entries;
    const selectedImportHashes = [...new Set(entries.map(({ imported }) =>
      imported.importHash))].sort();
    const batchHash = domainDigest("outsider/stage05-corpus-intake/batch/v1", {
      sourceRegistryHash: evidenceRegistry.registryHash, selectedImportHashes,
      groupKeyHash: group.groupKeyHash,
    });
    const retainUntil = entries.map(({ item }) => item.receipt.retentionUntil).sort()[0];
    if (Date.parse(retainUntil) <= Date.parse(checkedAt)) fail("RETENTION_EXPIRED");
    const datasetIds = [...new Set(entries.map(({ imported }) =>
      imported.sourceRegistryId))].sort();
    const manifestHashes = [...new Set(entries.map(({ record }) =>
      record.source.manifestHash))].sort();
    const consentHashes = [...new Set(entries.map(({ item }) => item.receipt.consentHash))].sort();
    const receiptHashes = [...new Set(entries.map(({ item }) => item.receipt.receiptHash))].sort();
    const sourceArtifactHashes = [...new Set([
      evidenceRegistry.registryHash, signedRegistryObjectHash,
      group.evidenceRecord.evidenceRecordHash,
      ...entries.flatMap(({ imported, item, record }) => [imported.importHash,
        item.registry.entryHash, item.receipt.receiptHash, digest(item.receipt),
        record.recordHash]),
    ])].sort();
    const units = entries.map(({ imported, item, record }) => {
      const datasetRoot = domainDigest("outsider/stage05-contribution-source-registry/v1", {
        sourceRegistryId: imported.sourceRegistryId,
        sourceServerKeyId: imported.sourceServerKeyId,
      });
      const correlationRoots = [...new Set([datasetRoot, imported.sourceServerKeyId,
        item.registry.contributorKeyId, record.source.manifestHash, record.source.projectionHash,
        record.source.publicEvidenceHash, record.source.eventChainHash,
        group.groupKey.controllerImplementationHash, group.groupKey.wayHash,
        group.groupKey.claimRefHash, group.groupKey.worldRefHash,
        group.groupKey.authorityRefHash])].sort();
      return { identityHash: record.source.supervisedExperienceHash,
        recordHash: record.recordHash, datasetRoot, correlationRoots };
    });
    const unattributedDeliveries = entries.filter(({ record }) =>
      record.terminal.terminalClass === "VERIFIED_DELIVERY_UNATTRIBUTED").length;
    const sourceAssertedCausal = entries.filter(({ record }) =>
      record.learningLabels.outsiderCausalContribution === true).length;
    const featureSchemaHash = domainDigest("outsider/stage05-corpus-intake/feature-schema/v1", {
      profile: PROFILE,
      originalEvidenceGroupKeyHash: group.groupKeyHash,
      originalEvidenceGroupKey: group.groupKey,
    });
    return createCorpusArtifactSet({
      artifactSetId: `${artifactSetIdPrefix}-${group.groupKeyHash.slice(7, 19)}`
        + `-${batchHash.slice(7, 19)}`,
      stage: "ATTEST",
      stream: "FORWARD_ACTION_EVIDENCE",
      createdAt: artifactTime,
      instrument: {
        instrumentId: PROFILE.id,
        instrumentVersion: PROFILE.version,
        implementationHash: intakeImplementationHash,
        featureSchemaHash,
      },
      datasetIds,
      licenseIds: [],
      rightsBasis: { class: "EXPLICIT_USER_CONTRIBUTION_CONSENT",
        sourceCommitmentHashes: [...new Set([...consentHashes, ...receiptHashes])].sort(),
        registryGrantsRights: false },
      sourceProof: {
        sourceKind: "LIVE_STAGE05_CONTRIBUTION_REGISTRY",
        verificationLevel: "SIGNED_PRIVACY_PROJECTION_REVERIFIED",
        sourceCompleteness: "SIGNED_PRIVACY_PROJECTION_ONLY",
        verifierImplementationHash,
        verificationHash: domainDigest("outsider/stage05-corpus-intake/verification/v1", {
          registryHash: evidenceRegistry.registryHash,
          signedRegistryObjectHash,
          registrySignerKeyId: evidenceRegistry.signature.keyId,
          sourceServerKeyIds,
          groupEvidenceRecordHash: group.evidenceRecord.evidenceRecordHash,
          selectedImportHashes, candidates: entries.length, unattributedDeliveries,
          sourceAssertedCausal, registryAssignedCausalExperienceUnits: 0,
        }),
        manifestHashes,
        sourceArtifactHashes,
        migration: { method: "SIGNED_REGISTRY_AND_RECEIPT_REVERIFY",
          legacySchemas: [EVIDENCE_REGISTRY_SCHEMAS.registry,
            EVIDENCE_REGISTRY_SCHEMAS.evidenceRecord, CONTRIBUTION_SCHEMAS.record,
            "outsider/supervised-experience/v2"] },
      },
      units,
      retention: retention(retainUntil),
    }, { privateKeyPem });
  });
  return Object.freeze({
    schema: "outsider/stage05-contribution-corpus-intake-result/v1",
    ok: true,
    checkedAt,
    sourceRegistryHash: evidenceRegistry.registryHash,
    sourceSigned: true,
    contributionProjectionReverified: true,
    sealedRunArtifactsReverified: false,
    registrySignerTrustedByInputPolicy: true,
    receiptServersTrustedByInputPolicy: true,
    revocationFreshness: "AS_OF_SOURCE_EXPORT_ONLY",
    retentionCurrentAtIntake: true,
    selection: Object.freeze({ afterImportHash,
      selectedImports: imports.length,
      selectedImportHashes: Object.freeze(imports.map((entry) => entry.importHash)),
      completeThroughImportHash: imports.at(-1)?.importHash ?? afterImportHash,
      sourceImportsTotal: evidenceRegistry.imports.length }),
    artifactSets: Object.freeze(artifactSets),
    counts: { artifactSets: artifactSets.length,
      candidates: artifactSets.reduce((sum, set) => sum + set.counts.candidates, 0),
      causalExperienceUnits: 0, lossEvidenceUnits: 0, economicLossRows: 0,
      pricingEligibleRows: 0 },
    boundary: publicBoundary(),
  });
}
