/*
 * Stage 1 Evidence Registry v1.
 *
 * This is deliberately an offline, service-independent promotion boundary:
 * it admits only privacy-minimized QUARANTINED exports, verifies their signed
 * receipts and self-addressed ingress entries, applies D1/D2, and emits
 * hash-bound EvidenceRecords. It does not CURATE, PRICE, guarantee, or settle.
 */

import {
  createHash, createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  contributionDigest, contributionKeyId, verifyContributionReceipt,
  verifyContributionRecord,
} from "./outsider-experience-contribution.js";

export const EVIDENCE_REGISTRY_SCHEMAS = Object.freeze({
  registry: "outsider/evidence-registry/v1",
  registryImport: "outsider/evidence-registry-import/v1",
  retentionTombstone: "outsider/evidence-registry-retention-tombstone/v1",
  evidenceRecord: "outsider/evidence-record/v1",
  report: "outsider/evidence-registry-report/v1",
  quarantineExport: "outsider/quarantine-export/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const TERMINALS = ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
  "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"];
const EVIDENCE_LEVELS = new Set(["L1_UNRECOGNIZED_INSTRUMENT_SELF_ATTESTED",
  "L2_RECOGNIZED_INSTRUMENT_SELF_ATTESTED"]);
const QUARANTINE_REASONS = new Set(["PENDING_CURATE_REVIEW",
  "CORRELATION_NOT_YET_DISCOUNTED", "OWNER_CONFIRMATION_ABSENT",
  "EXTERNAL_ADJUDICATION_ABSENT", "INSTRUMENT_NOT_IN_SERVER_ALLOWLIST"]);
const GENESIS = contributionDigest("outsider/contribution-registry/genesis/v1");
const GROUP_FIELDS = ["extractorId", "productVersion", "controllerImplementationHash",
  "hostProtocol", "wayHash", "claimRefHash", "worldRefHash", "authorityRefHash"];

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonicalTime(value, code) {
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40) {
    throw new Error(`EVIDENCE_REGISTRY_${code}_INVALID`);
  }
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed)) throw new Error(`EVIDENCE_REGISTRY_${code}_INVALID`);
  const normalized = new Date(parsed).toISOString();
  if (input !== normalized) throw new Error(`EVIDENCE_REGISTRY_${code}_NON_CANONICAL`);
  return normalized;
}

function publicKeyId(publicKeyPem) {
  try {
    if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512) {
      throw new Error("bounded key required");
    }
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 key required");
    return contributionKeyId(publicKeyPem);
  }
  catch { throw new Error("EVIDENCE_REGISTRY_SERVER_KEY_INVALID"); }
}

function registrySignature(hash, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_NOT_ED25519");
  }
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({ algorithm: "Ed25519", keyId: publicKeyId(publicKeyPem), publicKeyPem,
    value: cryptoSign(null, Buffer.from(hash), privateKey).toString("base64") });
}

function verifyRegistrySignature(hash, signature) {
  try {
    if (!exactKeys(signature, ["algorithm", "keyId", "publicKeyPem", "value"])
      || signature.algorithm !== "Ed25519"
      || typeof signature.value !== "string"
      || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value)
      || Buffer.from(signature.value, "base64").length !== 64
      || signature.keyId !== publicKeyId(signature.publicKeyPem)) return false;
    return cryptoVerify(null, Buffer.from(hash), createPublicKey(signature.publicKeyPem),
      Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function sealedRegistry(body, privateKeyPem = null) {
  const unsigned = { ...body, signature: null };
  const registryHash = digest(unsigned);
  return Object.freeze({ ...body,
    signature: privateKeyPem ? registrySignature(registryHash, privateKeyPem) : null,
    registryHash });
}

function groupKey(record) {
  const value = record?.instrument;
  if (!exactKeys(value, GROUP_FIELDS)
    || !TOKEN.test(String(value.extractorId ?? ""))
    || !TOKEN.test(String(value.productVersion ?? ""))
    || !TOKEN.test(String(value.hostProtocol ?? ""))
    || GROUP_FIELDS.filter((field) => field.endsWith("Hash"))
      .some((field) => !HASH.test(String(value[field] ?? "")))) {
    throw new Error("EVIDENCE_REGISTRY_D2_GROUP_INVALID");
  }
  return Object.fromEntries(GROUP_FIELDS.map((field) => [field, value[field]]));
}

function revokedMarker(value) {
  if (!value || typeof value !== "object") return false;
  if (value.revoked === true || value.revokedAt != null || value.revocationHash != null
    || value.purgedAt != null || value.disposition === "REVOKED"
    || value.status === "REVOKED") return true;
  return Array.isArray(value.revokedRecordHashes) && value.revokedRecordHashes.length > 0;
}

function entryBody(entry) {
  return Object.fromEntries(["ordinal", "recordHash", "envelopeHash", "receiptHash",
    "contributorKeyId", "consentHash", "receivedAt", "evidenceLevel", "disposition",
    "previousEntryHash"].map((field) => [field, entry[field]]));
}

function validateRegistryEntry(entry) {
  if (!exactKeys(entry, ["ordinal", "entryHash", "previousEntryHash", "recordHash",
    "envelopeHash", "receiptHash", "contributorKeyId", "consentHash", "receivedAt",
    "evidenceLevel", "disposition"])
    || !Number.isSafeInteger(entry.ordinal) || entry.ordinal < 1
    || ["entryHash", "previousEntryHash", "recordHash", "envelopeHash", "receiptHash",
      "contributorKeyId", "consentHash"].some((field) => !HASH.test(entry[field] ?? ""))
    || entry.disposition !== "QUARANTINED"
    || entry.entryHash !== contributionDigest(entryBody(entry))) {
    throw new Error("EVIDENCE_REGISTRY_ENTRY_INVALID_OR_NON_QUARANTINE");
  }
  canonicalTime(entry.receivedAt, "ENTRY_TIME");
}

function validateExport(quarantineExport, serverPublicKeyPem, at) {
  const importedAt = canonicalTime(at, "IMPORT_TIME");
  if (revokedMarker(quarantineExport)) throw new Error("EVIDENCE_REGISTRY_REVOKED_REFUSED");
  if (!exactKeys(quarantineExport, ["schema", "registryId", "generatedAt", "count", "items",
    "nextCursor", "useBoundary"])
    || quarantineExport.schema !== EVIDENCE_REGISTRY_SCHEMAS.quarantineExport
    || !TOKEN.test(String(quarantineExport.registryId ?? ""))
    || !Number.isSafeInteger(quarantineExport.count) || quarantineExport.count < 1
    || quarantineExport.count > 100
    || !Array.isArray(quarantineExport.items)
    || quarantineExport.count !== quarantineExport.items.length
    || quarantineExport.nextCursor != null
      && (typeof quarantineExport.nextCursor !== "string"
        || !/^[A-Za-z0-9_-]{8,256}$/.test(quarantineExport.nextCursor))
    || !exactKeys(quarantineExport.useBoundary, ["disposition", "automaticTraining",
      "permitsCuratePromotion", "permitsPricing", "permitsGuarantee", "permitsSettlement"])
    || quarantineExport.useBoundary.disposition !== "QUARANTINED"
    || Object.entries(quarantineExport.useBoundary)
      .some(([key, value]) => key !== "disposition" && value !== false)) {
    throw new Error("EVIDENCE_REGISTRY_EXPORT_INVALID_OR_NON_QUARANTINE");
  }
  const generatedAt = canonicalTime(quarantineExport.generatedAt, "EXPORT_TIME");
  if (Date.parse(importedAt) < Date.parse(generatedAt)) {
    throw new Error("EVIDENCE_REGISTRY_IMPORT_PRECEDES_EXPORT");
  }
  const serverKeyId = publicKeyId(serverPublicKeyPem);
  let previous = null;
  const gaps = [];
  const ordinals = new Set();
  const entryHashes = new Set();
  for (const item of quarantineExport.items) {
    if (revokedMarker(item)) throw new Error("EVIDENCE_REGISTRY_REVOKED_REFUSED");
    if (!exactKeys(item, ["contributionRecord", "receipt", "registry"])) {
      throw new Error("EVIDENCE_REGISTRY_EXPORT_ITEM_INVALID");
    }
    const recordCheck = verifyContributionRecord(item.contributionRecord);
    if (!recordCheck.ok) throw new Error(`EVIDENCE_REGISTRY_RECORD_INVALID:${recordCheck.error}`);
    const receiptCheck = verifyContributionReceipt(item.receipt, { serverPublicKeyPem });
    if (!receiptCheck.ok) throw new Error(`EVIDENCE_REGISTRY_RECEIPT_INVALID:${receiptCheck.error}`);
    validateRegistryEntry(item.registry);
    const { contributionRecord: record, receipt, registry: entry } = item;
    if (receipt.disposition !== "QUARANTINED" || entry.disposition !== "QUARANTINED") {
      throw new Error("EVIDENCE_REGISTRY_NON_QUARANTINE_REFUSED");
    }
    if (Date.parse(receipt.retentionUntil) <= Date.parse(importedAt)) {
      throw new Error("EVIDENCE_REGISTRY_EXPIRED_REFUSED");
    }
    if (Date.parse(receipt.receivedAt) > Date.parse(generatedAt)
      || receipt.registryId !== quarantineExport.registryId
      || receipt.contributionRecordHash !== record.recordHash
      || receipt.receiptHash !== entry.receiptHash
      || receipt.envelopeHash !== entry.envelopeHash
      || receipt.contributorKeyId !== entry.contributorKeyId
      || receipt.consentHash !== entry.consentHash
      || receipt.receivedAt !== entry.receivedAt
      || receipt.evidenceLevel !== entry.evidenceLevel
      || record.recordHash !== entry.recordHash) {
      throw new Error("EVIDENCE_REGISTRY_ARTIFACT_BINDING_INVALID");
    }
    if (ordinals.has(entry.ordinal) || entryHashes.has(entry.entryHash)) {
      throw new Error("EVIDENCE_REGISTRY_EXPORT_CHAIN_DUPLICATE");
    }
    ordinals.add(entry.ordinal);
    entryHashes.add(entry.entryHash);
    if (previous && entry.ordinal <= previous.ordinal) {
      throw new Error("EVIDENCE_REGISTRY_EXPORT_CHAIN_ORDER_INVALID");
    }
    if (entry.ordinal === 1 && entry.previousEntryHash !== GENESIS) {
      throw new Error("EVIDENCE_REGISTRY_EXPORT_CHAIN_GENESIS_INVALID");
    }
    if (previous && entry.ordinal === previous.ordinal + 1
      && entry.previousEntryHash !== previous.entryHash) {
      throw new Error("EVIDENCE_REGISTRY_EXPORT_CHAIN_BROKEN");
    }
    if (previous && entry.ordinal > previous.ordinal + 1) {
      gaps.push({ afterOrdinal: previous.ordinal, beforeOrdinal: entry.ordinal,
        claimedPreviousEntryHash: entry.previousEntryHash });
    }
    previous = entry;
  }
  return { importedAt, generatedAt, serverKeyId, gaps };
}

function importRecord(quarantineExport, serverPublicKeyPem, importedAt, validation) {
  const body = {
    schema: EVIDENCE_REGISTRY_SCHEMAS.registryImport,
    sourceRegistryId: quarantineExport.registryId,
    sourceServerKeyId: validation.serverKeyId,
    sourceServerPublicKeyPem: String(serverPublicKeyPem),
    exportHash: digest(quarantineExport),
    generatedAt: validation.generatedAt,
    importedAt: validation.importedAt,
    chain: {
      entriesVerified: quarantineExport.items.length,
      contiguousLinksVerified: quarantineExport.items.slice(1)
        .filter((item, index) => item.registry.ordinal
          === quarantineExport.items[index].registry.ordinal + 1).length,
      gaps: validation.gaps,
      completeRegistryClaimed: false,
    },
    quarantineExport: structuredClone(quarantineExport),
  };
  return Object.freeze({ ...body, importHash: digest(body) });
}

function occurrence(item, imported) {
  return {
    contributionRecordHash: item.contributionRecord.recordHash,
    receiptHash: item.receipt.receiptHash,
    registryEntryHash: item.registry.entryHash,
    sourceRegistryId: imported.sourceRegistryId,
    sourceServerKeyId: imported.sourceServerKeyId,
    contributorKeyId: item.registry.contributorKeyId,
    receivedAt: item.receipt.receivedAt,
    retentionUntil: item.receipt.retentionUntil,
    evidenceLevel: item.receipt.evidenceLevel,
    quarantineReasonCodes: [...item.receipt.reasonCodes].sort(),
    observedAt: item.contributionRecord.source.observedAt,
    terminalClass: item.contributionRecord.terminal.terminalClass,
    proofComplete: item.contributionRecord.terminal.proofComplete,
    deliveryComplete: item.contributionRecord.terminal.deliveryComplete,
    interventionRequired: item.contributionRecord.terminal.interventionRequired,
    interventionComplete: item.contributionRecord.terminal.interventionComplete,
  };
}

function occurrenceSort(left, right) {
  return left.contributionRecordHash.localeCompare(right.contributionRecordHash)
    || left.registryEntryHash.localeCompare(right.registryEntryHash)
    || left.receiptHash.localeCompare(right.receiptHash);
}

const OCCURRENCE_FIELDS = ["contributionRecordHash", "receiptHash", "registryEntryHash",
  "sourceRegistryId", "sourceServerKeyId", "contributorKeyId", "receivedAt",
  "retentionUntil", "evidenceLevel", "quarantineReasonCodes", "observedAt", "terminalClass",
  "proofComplete", "deliveryComplete", "interventionRequired", "interventionComplete"];

function validateOccurrence(value) {
  if (!exactKeys(value, OCCURRENCE_FIELDS)
    || !TOKEN.test(String(value.sourceRegistryId ?? ""))
    || ["contributionRecordHash", "receiptHash", "registryEntryHash", "sourceServerKeyId",
      "contributorKeyId"].some((field) => !HASH.test(String(value[field] ?? "")))
    || !EVIDENCE_LEVELS.has(value.evidenceLevel)
    || !Array.isArray(value.quarantineReasonCodes)
    || value.quarantineReasonCodes.length < 4 || value.quarantineReasonCodes.length > 5
    || value.quarantineReasonCodes.some((reason) => !QUARANTINE_REASONS.has(reason))
    || new Set(value.quarantineReasonCodes).size !== value.quarantineReasonCodes.length
    || canonicalizeStrict(value.quarantineReasonCodes)
      !== canonicalizeStrict([...value.quarantineReasonCodes].sort())
    || !TERMINALS.includes(value.terminalClass)
    || ["proofComplete", "deliveryComplete", "interventionRequired", "interventionComplete"]
      .some((field) => typeof value[field] !== "boolean")) {
    throw new Error("EVIDENCE_RECORD_OCCURRENCE_INVALID");
  }
  const receivedAt = canonicalTime(value.receivedAt, "OCCURRENCE_RECEIVED_AT");
  const retentionUntil = canonicalTime(value.retentionUntil, "OCCURRENCE_RETENTION_UNTIL");
  if (Date.parse(retentionUntil) <= Date.parse(receivedAt)) {
    throw new Error("EVIDENCE_RECORD_OCCURRENCE_TIME_ORDER_INVALID");
  }
  if (value.observedAt != null) {
    const observedAt = canonicalTime(value.observedAt, "OCCURRENCE_OBSERVED_AT");
    if (Date.parse(observedAt) > Date.parse(receivedAt)) {
      throw new Error("EVIDENCE_RECORD_OCCURRENCE_TIME_ORDER_INVALID");
    }
  }
}

function evidenceRecordFor(group, occurrences) {
  const seen = new Set();
  const included = [], duplicates = [];
  for (const value of [...occurrences].sort(occurrenceSort)) {
    if (seen.has(value.contributionRecordHash)) duplicates.push(value);
    else { seen.add(value.contributionRecordHash); included.push(value); }
  }
  const outcomes = Object.fromEntries(TERMINALS.map((terminal) => [terminal,
    included.filter((item) => item.terminalClass === terminal).length]));
  const correlationRoots = [...new Set([
    group.controllerImplementationHash, group.wayHash, group.claimRefHash,
    group.worldRefHash, group.authorityRefHash,
    ...occurrences.map((item) => item.sourceServerKeyId),
    ...occurrences.map((item) => item.contributorKeyId),
  ])].sort();
  const body = {
    artifactType: EVIDENCE_REGISTRY_SCHEMAS.evidenceRecord,
    recordVersion: "1.0.0",
    authority: "none",
    groupKey: group,
    groupKeyHash: digest(group),
    included,
    duplicates,
    nCandidates: included.length + duplicates.length,
    nUnique: included.length,
    outcomes,
    correlation: { independenceClaimed: false, correlationRoots },
    validityDomain: {
      sourceDisposition: "QUARANTINED",
      generalizesBeyondIncludedEvidence: false,
      revocationFreshness: "AS_OF_SOURCE_EXPORT_ONLY",
      retentionFreshness: "REQUIRES_PARENT_REGISTRY_VERIFY_AT_USE_TIME",
      standaloneAuthenticity: false,
      admissibleForPricing: false,
    },
    commitment: digest({ groupKey: group, included, duplicates, outcomes,
      correlation: { independenceClaimed: false, correlationRoots } }),
  };
  return Object.freeze({ ...body, evidenceRecordHash: digest(body) });
}

function verifyCrossImportChains(imports) {
  const sources = new Map();
  for (const imported of imports) {
    const sourceKey = `${imported.sourceRegistryId}\0${imported.sourceServerKeyId}`;
    const state = sources.get(sourceKey) ?? { byOrdinal: new Map(), byHash: new Map() };
    for (const item of imported.quarantineExport.items) {
      const entry = item.registry;
      const priorOrdinal = state.byOrdinal.get(entry.ordinal);
      if (priorOrdinal && priorOrdinal.entryHash !== entry.entryHash) {
        throw new Error("EVIDENCE_REGISTRY_SOURCE_ORDINAL_CONFLICT");
      }
      const priorHash = state.byHash.get(entry.entryHash);
      if (priorHash != null && priorHash !== entry.ordinal) {
        throw new Error("EVIDENCE_REGISTRY_SOURCE_ENTRY_HASH_CONFLICT");
      }
      state.byOrdinal.set(entry.ordinal, entry);
      state.byHash.set(entry.entryHash, entry.ordinal);
    }
    sources.set(sourceKey, state);
  }
  for (const { byOrdinal } of sources.values()) {
    for (const [ordinal, entry] of byOrdinal) {
      if (ordinal === 1 && entry.previousEntryHash !== GENESIS) {
        throw new Error("EVIDENCE_REGISTRY_SOURCE_CHAIN_GENESIS_INVALID");
      }
      const parent = byOrdinal.get(ordinal - 1);
      if (parent && entry.previousEntryHash !== parent.entryHash) {
        throw new Error("EVIDENCE_REGISTRY_SOURCE_CHAIN_BROKEN");
      }
    }
  }
}

function derive(imports) {
  verifyCrossImportChains(imports);
  const grouped = new Map();
  const firstByRecord = new Map();
  const duplicateDisclosure = [];
  let candidates = 0;
  for (const imported of imports) {
    for (const item of imported.quarantineExport.items) {
      candidates += 1;
      const group = groupKey(item.contributionRecord);
      const hash = digest(group);
      const value = occurrence(item, imported);
      const bucket = grouped.get(hash) ?? { group, values: [] };
      bucket.values.push(value);
      grouped.set(hash, bucket);
      const first = firstByRecord.get(value.contributionRecordHash);
      if (first) duplicateDisclosure.push({ recordHash: value.contributionRecordHash,
        firstRegistryEntryHash: first.registryEntryHash,
        duplicateRegistryEntryHash: value.registryEntryHash,
        sourceRegistryId: value.sourceRegistryId });
      else firstByRecord.set(value.contributionRecordHash, value);
    }
  }
  const evidenceRecords = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => evidenceRecordFor(bucket.group, bucket.values));
  duplicateDisclosure.sort((left, right) => left.recordHash.localeCompare(right.recordHash)
    || left.duplicateRegistryEntryHash.localeCompare(right.duplicateRegistryEntryHash));
  return { evidenceRecords, duplicateDisclosure,
    counts: { imports: imports.length, candidates, nUnique: firstByRecord.size,
      duplicates: candidates - firstByRecord.size, groups: evidenceRecords.length } };
}

function registryBody({ registryId, createdAt, updatedAt, imports, retentionTombstones = [] }) {
  const derived = derive(imports);
  const authority = {
    mode: "none",
    permitsCuratePromotion: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    establishesLossOrLiability: false,
  };
  const claimBoundary = {
    sourceEvidence: "QUARANTINED_PRIVACY_PROJECTION",
    sourceRegistryMembershipAuthenticated: false,
    verifiesLiveRevocationAfterImport: false,
    revocationFreshness: "AS_OF_SOURCE_EXPORT_ONLY",
    retentionEnforcement: "MANUAL_PRUNE_REQUIRED",
    expiredPayloadUseRejected: true,
    generalizesBeyondIncludedEvidence: false,
  };
  const commitment = digest({ importHashes: imports.map((item) => item.importHash),
    retentionTombstoneHashes: retentionTombstones.map((item) => item.tombstoneHash),
    evidenceRecordHashes: derived.evidenceRecords.map((item) => item.evidenceRecordHash),
    duplicateDisclosure: derived.duplicateDisclosure, counts: derived.counts });
  return {
    schema: EVIDENCE_REGISTRY_SCHEMAS.registry,
    registryVersion: "1.0.0", registryId, createdAt, updatedAt,
    authority, claimBoundary, imports, retentionTombstones,
    evidenceRecords: derived.evidenceRecords,
    duplicateDisclosure: derived.duplicateDisclosure,
    counts: derived.counts, commitment,
  };
}

export function createEvidenceRegistry({ registryId = "outsider-stage1", createdAt = new Date(),
  privateKeyPem = null } = {}) {
  if (!TOKEN.test(String(registryId))) throw new Error("EVIDENCE_REGISTRY_ID_INVALID");
  const time = canonicalTime(createdAt, "CREATED_AT");
  return sealedRegistry(registryBody({ registryId, createdAt: time, updatedAt: time, imports: [],
    retentionTombstones: [] }),
    privateKeyPem);
}

function sortedUniqueHashes(values) {
  return [...new Set(values)].sort();
}

function retentionTombstone(imported, { prunedAt, supersedesRegistryHash }) {
  const items = imported.quarantineExport.items;
  const expired = items.filter((item) => Date.parse(item.receipt.retentionUntil)
    <= Date.parse(prunedAt));
  const body = {
    schema: EVIDENCE_REGISTRY_SCHEMAS.retentionTombstone,
    reason: "RETENTION_EXPIRED_PAGE_CONSERVATIVE_PURGE",
    prunedAt,
    sourceRegistryId: imported.sourceRegistryId,
    sourceServerKeyId: imported.sourceServerKeyId,
    priorExportHash: imported.exportHash,
    priorImportHash: imported.importHash,
    supersedesRegistryHash,
    recordHashes: sortedUniqueHashes(items.map((item) => item.contributionRecord.recordHash)),
    receiptHashes: sortedUniqueHashes(items.map((item) => item.receipt.receiptHash)),
    registryEntryHashes: sortedUniqueHashes(items.map((item) => item.registry.entryHash)),
    expiredRecordHashes: sortedUniqueHashes(expired
      .map((item) => item.contributionRecord.recordHash)),
  };
  return Object.freeze({ ...body, tombstoneHash: digest(body) });
}

function validateRetentionTombstone(value, { createdAt, updatedAt }) {
  const fields = ["schema", "reason", "prunedAt", "sourceRegistryId", "sourceServerKeyId",
    "priorExportHash", "priorImportHash", "supersedesRegistryHash", "recordHashes", "receiptHashes",
    "registryEntryHashes", "expiredRecordHashes", "tombstoneHash"];
  const arrays = [value?.recordHashes, value?.receiptHashes, value?.registryEntryHashes,
    value?.expiredRecordHashes];
  if (!exactKeys(value, fields)
    || value.schema !== EVIDENCE_REGISTRY_SCHEMAS.retentionTombstone
    || value.reason !== "RETENTION_EXPIRED_PAGE_CONSERVATIVE_PURGE"
    || !TOKEN.test(String(value.sourceRegistryId ?? ""))
    || ["sourceServerKeyId", "priorExportHash", "priorImportHash", "supersedesRegistryHash",
      "tombstoneHash"]
      .some((field) => !HASH.test(String(value[field] ?? "")))
    || arrays.some((array) => !Array.isArray(array) || array.length < 1
      || array.some((hash) => !HASH.test(String(hash ?? "")))
      || canonicalizeStrict(array) !== canonicalizeStrict(sortedUniqueHashes(array)))
    || value.expiredRecordHashes.some((hash) => !value.recordHashes.includes(hash))) {
    throw new Error("EVIDENCE_REGISTRY_RETENTION_TOMBSTONE_INVALID");
  }
  const prunedAt = canonicalTime(value.prunedAt, "RETENTION_PRUNED_AT");
  if (Date.parse(prunedAt) < Date.parse(createdAt)
    || Date.parse(prunedAt) > Date.parse(updatedAt)) {
    throw new Error("EVIDENCE_REGISTRY_RETENTION_TOMBSTONE_TIME_INVALID");
  }
  const { tombstoneHash, ...body } = value;
  if (tombstoneHash !== digest(body)) {
    throw new Error("EVIDENCE_REGISTRY_RETENTION_TOMBSTONE_HASH_BROKEN");
  }
}

export function verifyEvidenceRecord(record) {
  try {
    if (!exactKeys(record, ["artifactType", "recordVersion", "authority", "groupKey",
      "groupKeyHash", "included", "duplicates", "nCandidates", "nUnique", "outcomes",
      "correlation", "validityDomain", "commitment", "evidenceRecordHash"])
      || record.artifactType !== EVIDENCE_REGISTRY_SCHEMAS.evidenceRecord
      || record.recordVersion !== "1.0.0" || record.authority !== "none"
      || record.groupKeyHash !== digest(record.groupKey)
      || !Array.isArray(record.included) || !Array.isArray(record.duplicates)
      || record.nUnique !== record.included.length
      || record.nCandidates !== record.included.length + record.duplicates.length
      || record.correlation?.independenceClaimed !== false
      || !Array.isArray(record.correlation?.correlationRoots)
      || record.validityDomain?.sourceDisposition !== "QUARANTINED"
      || record.validityDomain?.generalizesBeyondIncludedEvidence !== false
      || record.validityDomain?.revocationFreshness !== "AS_OF_SOURCE_EXPORT_ONLY"
      || record.validityDomain?.retentionFreshness
        !== "REQUIRES_PARENT_REGISTRY_VERIFY_AT_USE_TIME"
      || record.validityDomain?.standaloneAuthenticity !== false
      || record.validityDomain?.admissibleForPricing !== false) {
      throw new Error("EVIDENCE_RECORD_INVALID");
    }
    groupKey({ instrument: record.groupKey });
    for (const value of [...record.included, ...record.duplicates]) validateOccurrence(value);
    const { evidenceRecordHash, ...body } = record;
    if (evidenceRecordHash !== digest(body)) throw new Error("EVIDENCE_RECORD_HASH_BROKEN");
    const expected = evidenceRecordFor(groupKey({ instrument: record.groupKey }),
      [...record.included, ...record.duplicates]);
    if (canonicalizeStrict(expected) !== canonicalizeStrict(record)) {
      throw new Error("EVIDENCE_RECORD_DERIVATION_BROKEN");
    }
    return Object.freeze({ ok: true, evidenceRecordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

export function verifyEvidenceRegistry(registry, { now = new Date() } = {}) {
  try {
    const checkedAt = canonicalTime(now, "VERIFY_TIME");
    if (!exactKeys(registry, ["schema", "registryVersion", "registryId", "createdAt",
      "updatedAt", "authority", "claimBoundary", "imports", "retentionTombstones",
      "evidenceRecords", "duplicateDisclosure", "counts", "commitment", "signature",
      "registryHash"])
      || registry.schema !== EVIDENCE_REGISTRY_SCHEMAS.registry
      || registry.registryVersion !== "1.0.0" || !TOKEN.test(registry.registryId ?? "")
      || !Array.isArray(registry.imports) || !Array.isArray(registry.evidenceRecords)
      || !Array.isArray(registry.retentionTombstones)
      || !Array.isArray(registry.duplicateDisclosure)
      || !exactKeys(registry.authority, ["mode", "permitsCuratePromotion", "permitsPricing",
        "permitsGuarantee", "permitsSettlement", "establishesLossOrLiability"])
      || !exactKeys(registry.claimBoundary, ["sourceEvidence",
        "sourceRegistryMembershipAuthenticated", "verifiesLiveRevocationAfterImport",
        "revocationFreshness", "retentionEnforcement", "expiredPayloadUseRejected",
        "generalizesBeyondIncludedEvidence"])
      || !exactKeys(registry.counts,
        ["imports", "candidates", "nUnique", "duplicates", "groups"])
      || registry.authority?.mode !== "none"
      || Object.entries(registry.authority ?? {})
        .some(([field, value]) => field !== "mode" && value !== false)
      || registry.claimBoundary?.sourceEvidence !== "QUARANTINED_PRIVACY_PROJECTION"
      || registry.claimBoundary?.sourceRegistryMembershipAuthenticated !== false
      || registry.claimBoundary?.verifiesLiveRevocationAfterImport !== false
      || registry.claimBoundary?.revocationFreshness !== "AS_OF_SOURCE_EXPORT_ONLY"
      || registry.claimBoundary?.retentionEnforcement !== "MANUAL_PRUNE_REQUIRED"
      || registry.claimBoundary?.expiredPayloadUseRejected !== true
      || registry.claimBoundary?.generalizesBeyondIncludedEvidence !== false) {
      throw new Error("EVIDENCE_REGISTRY_INVALID");
    }
    const createdAt = canonicalTime(registry.createdAt, "CREATED_AT");
    const updatedAt = canonicalTime(registry.updatedAt, "UPDATED_AT");
    if (Date.parse(updatedAt) < Date.parse(createdAt)
      || Date.parse(checkedAt) < Date.parse(updatedAt)) {
      throw new Error("EVIDENCE_REGISTRY_TIME_ORDER_INVALID");
    }
    const seenExports = new Set();
    const purgedExports = new Set();
    for (const tombstone of registry.retentionTombstones) {
      validateRetentionTombstone(tombstone, { createdAt, updatedAt });
      if (purgedExports.has(tombstone.priorExportHash)) {
        throw new Error("EVIDENCE_REGISTRY_RETENTION_TOMBSTONE_DUPLICATE");
      }
      purgedExports.add(tombstone.priorExportHash);
    }
    let previousImportedAt = null;
    for (const imported of registry.imports) {
      if (!exactKeys(imported, ["schema", "sourceRegistryId", "sourceServerKeyId",
        "sourceServerPublicKeyPem", "exportHash", "generatedAt", "importedAt", "chain",
        "quarantineExport", "importHash"]) || imported.schema !== EVIDENCE_REGISTRY_SCHEMAS.registryImport
        || !exactKeys(imported.chain, ["entriesVerified", "contiguousLinksVerified", "gaps",
          "completeRegistryClaimed"])
        || imported.sourceServerKeyId !== publicKeyId(imported.sourceServerPublicKeyPem)
        || imported.exportHash !== digest(imported.quarantineExport)
        || seenExports.has(imported.exportHash) || purgedExports.has(imported.exportHash)) {
        throw new Error("EVIDENCE_REGISTRY_IMPORT_INVALID");
      }
      seenExports.add(imported.exportHash);
      const { importHash, ...importBody } = imported;
      if (importHash !== digest(importBody)) throw new Error("EVIDENCE_REGISTRY_IMPORT_HASH_BROKEN");
      const importTime = canonicalTime(imported.importedAt, "IMPORT_TIME");
      if (previousImportedAt && Date.parse(importTime) < Date.parse(previousImportedAt)) {
        throw new Error("EVIDENCE_REGISTRY_IMPORT_ORDER_INVALID");
      }
      if (Date.parse(importTime) < Date.parse(createdAt)
        || Date.parse(importTime) > Date.parse(updatedAt)) {
        throw new Error("EVIDENCE_REGISTRY_IMPORT_TIME_OUTSIDE_REGISTRY");
      }
      previousImportedAt = importTime;
      const validation = validateExport(imported.quarantineExport,
        imported.sourceServerPublicKeyPem, importTime);
      /* Admission is historical; eligibility is live. A once-valid record must
         stop verifying after its consent retention window expires. */
      validateExport(imported.quarantineExport, imported.sourceServerPublicKeyPem, checkedAt);
      const expectedChain = {
        entriesVerified: imported.quarantineExport.items.length,
        contiguousLinksVerified: imported.quarantineExport.items.slice(1)
          .filter((item, index) => item.registry.ordinal
            === imported.quarantineExport.items[index].registry.ordinal + 1).length,
        gaps: validation.gaps,
        completeRegistryClaimed: false,
      };
      if (validation.serverKeyId !== imported.sourceServerKeyId
        || validation.generatedAt !== imported.generatedAt
        || imported.sourceRegistryId !== imported.quarantineExport.registryId
        || canonicalizeStrict(imported.chain) !== canonicalizeStrict(expectedChain)) {
        throw new Error("EVIDENCE_REGISTRY_IMPORT_BINDING_INVALID");
      }
    }
    const expectedBody = registryBody({ registryId: registry.registryId,
      createdAt: registry.createdAt, updatedAt: registry.updatedAt, imports: registry.imports,
      retentionTombstones: registry.retentionTombstones });
    for (const record of registry.evidenceRecords) {
      const checked = verifyEvidenceRecord(record);
      if (!checked.ok) throw new Error(checked.error);
    }
    for (const field of ["authority", "claimBoundary", "retentionTombstones", "evidenceRecords",
      "duplicateDisclosure", "counts", "commitment"]) {
      if (canonicalizeStrict(registry[field]) !== canonicalizeStrict(expectedBody[field])) {
        throw new Error(`EVIDENCE_REGISTRY_DERIVATION_BROKEN:${field}`);
      }
    }
    const { registryHash, signature, ...body } = registry;
    if (registryHash !== digest({ ...body, signature: null })) {
      throw new Error("EVIDENCE_REGISTRY_HASH_BROKEN");
    }
    if (signature !== null && !verifyRegistrySignature(registryHash, signature)) {
      throw new Error("EVIDENCE_REGISTRY_SIGNATURE_INVALID");
    }
    return Object.freeze({ ok: true, signed: Boolean(signature),
      signatureCryptographicallyValid: Boolean(signature),
      signatureTrustedByPolicy: false,
      registryHash, checkedAt, counts: registry.counts });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

export function importQuarantineExport({ registry, quarantineExport, serverPublicKeyPem,
  importedAt = new Date(), privateKeyPem = null } = {}) {
  const time = canonicalTime(importedAt, "IMPORT_TIME");
  const existing = verifyEvidenceRegistry(registry, { now: time });
  if (!existing.ok) throw new Error(`EVIDENCE_REGISTRY_STATE_INVALID:${existing.error}`);
  if (registry.signature) {
    if (!privateKeyPem) throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_REQUIRED");
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_NOT_ED25519");
    }
    const candidateKey = publicKeyId(createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString());
    if (candidateKey !== registry.signature.keyId) {
      throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_MISMATCH");
    }
  }
  const validation = validateExport(quarantineExport, serverPublicKeyPem, time);
  const imported = importRecord(quarantineExport, serverPublicKeyPem, time, validation);
  if (registry.retentionTombstones.some((value) => value.priorExportHash === imported.exportHash)) {
    throw new Error("EVIDENCE_REGISTRY_EXPORT_PREVIOUSLY_PURGED");
  }
  if (registry.imports.some((value) => value.exportHash === imported.exportHash)) {
    return Object.freeze({ registry, duplicateExport: true, importHash: imported.importHash,
      counts: registry.counts });
  }
  const imports = [...registry.imports, imported];
  const next = sealedRegistry(registryBody({ registryId: registry.registryId,
    createdAt: registry.createdAt, updatedAt: time, imports,
    retentionTombstones: registry.retentionTombstones }), privateKeyPem);
  const checked = verifyEvidenceRegistry(next, { now: time });
  if (!checked.ok) throw new Error(`EVIDENCE_REGISTRY_BUILD_INVALID:${checked.error}`);
  return Object.freeze({ registry: next, duplicateExport: false,
    importHash: imported.importHash, counts: next.counts });
}

/** Delete copied quarantine payloads once any receipt in their immutable source
 * page expires. The whole page is dropped conservatively so the registry never
 * rewrites a source export and pretends the rewritten bytes came from ingress.
 * Hash-only tombstones are retained under the public privacy policy. */
export function pruneExpiredEvidenceRegistry({ registry, prunedAt = new Date(),
  privateKeyPem = null } = {}) {
  const time = canonicalTime(prunedAt, "RETENTION_PRUNED_AT");
  const historical = verifyEvidenceRegistry(registry, { now: registry?.updatedAt });
  if (!historical.ok) {
    throw new Error(`EVIDENCE_REGISTRY_STATE_INVALID:${historical.error}`);
  }
  if (Date.parse(time) < Date.parse(registry.updatedAt)) {
    throw new Error("EVIDENCE_REGISTRY_RETENTION_TIME_ROLLBACK");
  }
  if (registry.signature) {
    if (!privateKeyPem) throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_REQUIRED");
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_NOT_ED25519");
    }
    const candidateKey = publicKeyId(createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString());
    if (candidateKey !== registry.signature.keyId) {
      throw new Error("EVIDENCE_REGISTRY_SIGNING_KEY_MISMATCH");
    }
  }
  const expired = registry.imports.filter((imported) => imported.quarantineExport.items
    .some((item) => Date.parse(item.receipt.retentionUntil) <= Date.parse(time)));
  if (expired.length === 0) {
    const current = verifyEvidenceRegistry(registry, { now: time });
    if (!current.ok) throw new Error(`EVIDENCE_REGISTRY_STATE_INVALID:${current.error}`);
    return Object.freeze({ registry, pruned: false, pagesPurged: 0, payloadsPurged: 0,
      tombstoneHashes: [] });
  }
  const expiredImportHashes = new Set(expired.map((item) => item.importHash));
  const tombstones = expired.map((imported) => retentionTombstone(imported, {
    prunedAt: time, supersedesRegistryHash: registry.registryHash,
  }));
  const imports = registry.imports.filter((item) => !expiredImportHashes.has(item.importHash));
  const next = sealedRegistry(registryBody({ registryId: registry.registryId,
    createdAt: registry.createdAt, updatedAt: time, imports,
    retentionTombstones: [...registry.retentionTombstones, ...tombstones] }), privateKeyPem);
  const checked = verifyEvidenceRegistry(next, { now: time });
  if (!checked.ok) throw new Error(`EVIDENCE_REGISTRY_PRUNE_INVALID:${checked.error}`);
  return Object.freeze({ registry: next, pruned: true, pagesPurged: expired.length,
    payloadsPurged: expired.reduce((sum, item) => sum + item.quarantineExport.items.length, 0),
    tombstoneHashes: tombstones.map((item) => item.tombstoneHash) });
}

export function evidenceRegistryReport(registry, { now = new Date() } = {}) {
  const checked = verifyEvidenceRegistry(registry, { now });
  if (!checked.ok) throw new Error(`EVIDENCE_REGISTRY_REPORT_INVALID:${checked.error}`);
  return Object.freeze({ ok: true, schema: EVIDENCE_REGISTRY_SCHEMAS.report,
    registryId: registry.registryId, registryHash: registry.registryHash,
    checkedAt: checked.checkedAt, signed: checked.signed,
    signatureCryptographicallyValid: checked.signatureCryptographicallyValid,
    signatureTrustedByPolicy: checked.signatureTrustedByPolicy,
    counts: registry.counts,
    groups: registry.evidenceRecords.map((record) => ({
      groupKeyHash: record.groupKeyHash, groupKey: record.groupKey,
      nCandidates: record.nCandidates, nUnique: record.nUnique,
      duplicates: record.duplicates.length, outcomes: record.outcomes,
      correlation: record.correlation,
      evidenceRecordHash: record.evidenceRecordHash,
    })),
    duplicateDisclosure: registry.duplicateDisclosure,
    retentionTombstones: registry.retentionTombstones,
    claimBoundary: registry.claimBoundary,
    authority: registry.authority,
  });
}

export { digest as evidenceRegistryDigest };
