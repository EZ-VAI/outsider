/*
 * Durable Stage 1 / Stage 1.5 corpus registry.
 *
 * The event log is authoritative and append-only. The signed index is a
 * rebuildable materialized view. Registered artifact sets contain hashes and
 * bounded metadata only: they do not contain prompts, trajectories, images,
 * source rows, economic-loss observations, or deployment authority.
 */

import {
  closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, linkSync, unlinkSync,
  writeFileSync, writeSync,
} from "node:fs";
import {
  createHash, createPrivateKey, createPublicKey, randomBytes,
  sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import path from "node:path";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "./canonical.js";

export const CORPUS_REGISTRY_SCHEMAS = Object.freeze({
  config: "outsider/stage1-curate-corpus-registry-config/v1",
  event: "outsider/stage1-curate-corpus-registry-event/v1",
  artifactSet: "outsider/stage1-curate-corpus-artifact-set/v2",
  index: "outsider/stage1-curate-corpus-registry-index/v1",
  timestampRequest: "outsider/external-timestamp-request/v1",
  timestampReceipt: "outsider/external-timestamp-receipt/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const STAGES = new Set(["ATTEST", "CURATE"]);
const STREAMS = new Set(["FORWARD_ACTION_EVIDENCE", "BACKWARD_EXPERIENCE_EVIDENCE"]);
const EVENT_TYPES = new Set(["REGISTER_ARTIFACT_SET", "REVOKE_ARTIFACT_SET",
  "REQUEST_EXTERNAL_TIMESTAMP", "ATTACH_EXTERNAL_TIMESTAMP", "EXPIRE_ARTIFACT_SET"]);
const REVOCATION_REASONS = new Set(["SOURCE_REVOKED", "LICENSE_WITHDRAWN",
  "OPERATOR_WITHDRAWN", "INTEGRITY_CONCERN", "USER_ERASURE_REQUEST"]);
const RETENTION_MODES = new Set(["NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE",
  "EXPIRES_AT_KEEP_HASH_ONLY_TOMBSTONE"]);
const SOURCE_VERIFICATION_LEVELS = new Set(["FULL_SOURCE_REPRODUCED",
  "FULL_SOURCE_REDERIVED", "SIGNED_PRIVACY_PROJECTION_REVERIFIED",
  "PINNED_METADATA_ONLY_REPRODUCED"]);
const SOURCE_COMPLETENESS = new Set(["FULL_DECLARED_SOURCE_SCOPE",
  "SIGNED_PRIVACY_PROJECTION_ONLY", "QUARANTINED_NO_TRACE_BYTES"]);
const RIGHTS_BASIS_CLASSES = new Set(["PUBLIC_DATASET_LICENSE_DECLARATIONS",
  "EXPLICIT_USER_CONTRIBUTION_CONSENT", "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"]);
const MAX_UNITS = 250_000;
const MAX_CORRELATION_ROOTS = 64;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_INDEX_BYTES = 64 * 1024 * 1024;
const MAX_EVENT_LOG_BYTES = 128 * 1024 * 1024;
const BASE64_ED25519_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const GENESIS = domainDigest("outsider/stage1-curate-corpus-registry/genesis/v1", "genesis");

function fail(code, detail = null) {
  throw new Error(detail == null ? `CORPUS_REGISTRY_${code}`
    : `CORPUS_REGISTRY_${code}:${detail}`);
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainDigest(domain, value) {
  return digest(`${domain}\0${typeof value === "string" ? value : canonicalizeStrict(value)}`);
}

function artifactSetCanonical(value) {
  return canonicalizeStrictBoundedArtifact(value);
}

function artifactSetDomainDigest(domain, value) {
  return digest(`${domain}\0${typeof value === "string" ? value
    : artifactSetCanonical(value)}`);
}

function sameArtifactSet(left, right) {
  return artifactSetCanonical(left) === artifactSetCanonical(right);
}

function storageCanonical(value) {
  return value?.schema === CORPUS_REGISTRY_SCHEMAS.artifactSet
    ? artifactSetCanonical(value) : canonicalizeStrict(value);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalTime(value, code) {
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40) fail(`${code}_INVALID`);
  const parsed = Date.parse(input);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== input) {
    fail(`${code}_NON_CANONICAL`);
  }
  return input;
}

function sortedUniqueHashes(values, code, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || values.length > MAX_UNITS
    || !allowEmpty && values.length === 0
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(`${code}_INVALID`);
  const output = [...new Set(values)].sort();
  if (output.length !== values.length) fail(`${code}_DUPLICATED`);
  return output;
}

function normalizedPublicKey(publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CORPUS_REGISTRY_")) throw error;
    fail("PUBLIC_KEY_INVALID");
  }
}

export function corpusRegistryKeyId(publicKeyPem) {
  const key = createPublicKey(normalizedPublicKey(publicKeyPem));
  const der = key.export({ type: "spki", format: "der" });
  return `ed25519:${digest(der)}`;
}

function privateKeyIdentity(privateKeyPem) {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    const publicKeyPem = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: corpusRegistryKeyId(publicKeyPem) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CORPUS_REGISTRY_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

function signatureFor(hash, privateKeyPem) {
  const identity = privateKeyIdentity(privateKeyPem);
  return Object.freeze({ algorithm: "Ed25519", keyId: identity.keyId,
    publicKeyPem: identity.publicKeyPem,
    value: cryptoSign(null, Buffer.from(hash), identity.privateKey).toString("base64") });
}

function verifySignature(hash, signature, expectedKeyId = null) {
  try {
    if (!exactKeys(signature, ["algorithm", "keyId", "publicKeyPem", "value"])
      || signature.algorithm !== "Ed25519" || !KEY_ID.test(signature.keyId ?? "")
      || expectedKeyId !== null && signature.keyId !== expectedKeyId
      || signature.keyId !== corpusRegistryKeyId(signature.publicKeyPem)
      || typeof signature.value !== "string" || !BASE64_ED25519_SIGNATURE.test(signature.value)
      || Buffer.from(signature.value, "base64").length !== 64) return false;
    return cryptoVerify(null, Buffer.from(hash), createPublicKey(signature.publicKeyPem),
      Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function localTimeEvidence() {
  return { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false };
}

function fixedBoundary() {
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

function causalCreditPolicy() {
  return {
    sourceLabelsAreDescriptiveOnly: true,
    registryAssignedCausalExperienceUnits: 0,
    verifiedDeliveryUnattributedCreditedAsOutsiderSuccess: false,
  };
}

function intakeCapabilities() {
  return {
    operatorSignedSourceClaimArtifactSetsSupported: true,
    genericArtifactSetSourceClaimsTrustedAsSourceReplay: false,
    knownFullSourceReplayAdaptersAvailable: true,
    signedStage05ContributionProjectionSupported: true,
    sealedStage05RunArtifactReverificationAtIntake: false,
    liveSourceRevocationPolling: false,
    stage05RevocationFreshness: "AS_OF_SOURCE_EXPORT_ONLY",
  };
}

function sourceVerificationBoundary() {
  return {
    artifactSetSignaturesVerified: true,
    sourceArtifactsReverifiedByOrdinaryRegistryVerify: false,
    operatorSignedSourceClaimsTrustedAsSourceReplay: false,
    knownSourceReplayRequiredForReverifiedCount: true,
  };
}

function validBoundary(value) {
  return same(value, fixedBoundary());
}

function normalizeAuthorities(authorities = []) {
  if (!Array.isArray(authorities) || authorities.length > 32) fail("TIMESTAMP_AUTHORITIES_INVALID");
  const seen = new Set();
  const output = authorities.map((authority) => {
    if (!exactKeys(authority, ["providerId", "keyId", "publicKeyPem"])
      || !TOKEN.test(String(authority.providerId ?? ""))) {
      fail("TIMESTAMP_AUTHORITY_INVALID");
    }
    const publicKeyPem = normalizedPublicKey(authority.publicKeyPem);
    const keyId = corpusRegistryKeyId(publicKeyPem);
    if (authority.keyId !== keyId) fail("TIMESTAMP_AUTHORITY_KEY_ID_MISMATCH");
    const identity = `${authority.providerId}\0${keyId}`;
    if (seen.has(identity)) fail("TIMESTAMP_AUTHORITY_DUPLICATED");
    seen.add(identity);
    return { providerId: authority.providerId, keyId, publicKeyPem };
  });
  return output.sort((left, right) => left.providerId.localeCompare(right.providerId)
    || left.keyId.localeCompare(right.keyId));
}

function configBody({ registryId, createdAt, signer, timestampAuthorities }) {
  return {
    schema: CORPUS_REGISTRY_SCHEMAS.config,
    schemaVersion: "1.0.0",
    registryId,
    createdAt,
    createdAtEvidence: localTimeEvidence(),
    signer,
    timestampAuthorities,
    admissionPolicy: {
      signedArtifactSetsRequired: true,
      registrySignerMustSignArtifactSet: true,
      sourceVerificationRequired: "FULL_SOURCE_OR_SIGNED_PRIVACY_PROJECTION",
      rawContentAccepted: false,
      d1Scope: "CROSS_BATCH_RETAINED_HASH_IDENTITIES",
      d2Rule: "EXACT_INSTRUMENT_ID_VERSION_IMPLEMENTATION_AND_FEATURE_SCHEMA",
    },
    boundary: fixedBoundary(),
  };
}

export function createCorpusRegistryConfig({ registryId = "outsider-stage1-curate",
  createdAt = new Date(), privateKeyPem, timestampAuthorities = [] } = {}) {
  if (!TOKEN.test(String(registryId ?? ""))) fail("ID_INVALID");
  if (!privateKeyPem) fail("SIGNING_KEY_REQUIRED");
  const identity = privateKeyIdentity(privateKeyPem);
  const body = configBody({ registryId, createdAt: canonicalTime(createdAt, "CREATED_AT"),
    signer: { keyId: identity.keyId, publicKeyPem: identity.publicKeyPem },
    timestampAuthorities: normalizeAuthorities(timestampAuthorities) });
  const configHash = domainDigest(CORPUS_REGISTRY_SCHEMAS.config, body);
  return Object.freeze({ ...body, configHash, signature: signatureFor(configHash, privateKeyPem) });
}

export function verifyCorpusRegistryConfig(config) {
  try {
    if (!exactKeys(config, ["schema", "schemaVersion", "registryId", "createdAt",
      "createdAtEvidence", "signer", "timestampAuthorities", "admissionPolicy", "boundary",
      "configHash", "signature"])
      || config.schema !== CORPUS_REGISTRY_SCHEMAS.config
      || config.schemaVersion !== "1.0.0" || !TOKEN.test(String(config.registryId ?? ""))
      || !exactKeys(config.signer, ["keyId", "publicKeyPem"])
      || config.signer.keyId !== corpusRegistryKeyId(config.signer.publicKeyPem)
      || !same(config.createdAtEvidence, localTimeEvidence())
      || !same(config.timestampAuthorities, normalizeAuthorities(config.timestampAuthorities))
      || !same(config.admissionPolicy, {
        signedArtifactSetsRequired: true,
        registrySignerMustSignArtifactSet: true,
        sourceVerificationRequired: "FULL_SOURCE_OR_SIGNED_PRIVACY_PROJECTION",
        rawContentAccepted: false,
        d1Scope: "CROSS_BATCH_RETAINED_HASH_IDENTITIES",
        d2Rule: "EXACT_INSTRUMENT_ID_VERSION_IMPLEMENTATION_AND_FEATURE_SCHEMA",
      }) || !validBoundary(config.boundary)) fail("CONFIG_INVALID");
    canonicalTime(config.createdAt, "CREATED_AT");
    const { configHash, signature, ...body } = config;
    if (configHash !== domainDigest(CORPUS_REGISTRY_SCHEMAS.config, body)) {
      fail("CONFIG_HASH_MISMATCH");
    }
    if (!verifySignature(configHash, signature, config.signer.keyId)) {
      fail("CONFIG_SIGNATURE_INVALID");
    }
    return Object.freeze({ ok: true, configHash, signerKeyId: config.signer.keyId });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function normalizeInstrument(value) {
  if (!exactKeys(value, ["instrumentId", "instrumentVersion", "implementationHash",
    "featureSchemaHash"])
    || !TOKEN.test(String(value.instrumentId ?? ""))
    || !TOKEN.test(String(value.instrumentVersion ?? ""))
    || !HASH.test(String(value.implementationHash ?? ""))
    || !HASH.test(String(value.featureSchemaHash ?? ""))) fail("INSTRUMENT_INVALID");
  return { instrumentId: value.instrumentId, instrumentVersion: value.instrumentVersion,
    implementationHash: value.implementationHash, featureSchemaHash: value.featureSchemaHash };
}

function instrumentHash(instrument) {
  return domainDigest("outsider/corpus-registry/instrument/v1", instrument);
}

function normalizeSourceProof(value) {
  if (!exactKeys(value, ["sourceKind", "verificationLevel", "sourceCompleteness",
    "verifierImplementationHash",
    "verificationHash", "manifestHashes", "sourceArtifactHashes", "migration"])
    || !TOKEN.test(String(value.sourceKind ?? ""))
    || !SOURCE_VERIFICATION_LEVELS.has(value.verificationLevel)
    || !SOURCE_COMPLETENESS.has(value.sourceCompleteness)
    || !HASH.test(String(value.verifierImplementationHash ?? ""))
    || !HASH.test(String(value.verificationHash ?? ""))) fail("SOURCE_PROOF_INVALID");
  const manifestHashes = sortedUniqueHashes(value.manifestHashes, "MANIFEST_HASHES", {
    allowEmpty: false });
  const sourceArtifactHashes = sortedUniqueHashes(value.sourceArtifactHashes,
    "SOURCE_ARTIFACT_HASHES", { allowEmpty: false });
  if (!exactKeys(value.migration, ["method", "legacySchemas"])
    || !["FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST",
      "SIGNED_REGISTRY_AND_RECEIPT_REVERIFY",
      "PINNED_METADATA_REVERIFY_NOT_TRACE_REPLAY"].includes(value.migration.method)
    || !Array.isArray(value.migration.legacySchemas) || value.migration.legacySchemas.length < 1
    || value.migration.legacySchemas.length > 16
    || value.migration.legacySchemas.some((schema) => !TOKEN.test(String(schema ?? "")))
    || new Set(value.migration.legacySchemas).size !== value.migration.legacySchemas.length) {
    fail("SOURCE_PROOF_MIGRATION_INVALID");
  }
  const privacyProjection = value.verificationLevel === "SIGNED_PRIVACY_PROJECTION_REVERIFIED";
  const metadataOnly = value.verificationLevel === "PINNED_METADATA_ONLY_REPRODUCED";
  if (privacyProjection && (value.sourceCompleteness !== "SIGNED_PRIVACY_PROJECTION_ONLY"
      || value.migration.method !== "SIGNED_REGISTRY_AND_RECEIPT_REVERIFY")
    || metadataOnly && (value.sourceCompleteness !== "QUARANTINED_NO_TRACE_BYTES"
      || value.migration.method !== "PINNED_METADATA_REVERIFY_NOT_TRACE_REPLAY")
    || !privacyProjection && !metadataOnly
      && (value.sourceCompleteness !== "FULL_DECLARED_SOURCE_SCOPE"
        || value.migration.method !== "FULL_SOURCE_REVERIFY_NOT_HASH_ONLY_TRUST")) {
    fail("SOURCE_PROOF_COMPLETENESS_MISMATCH");
  }
  return { sourceKind: value.sourceKind, verificationLevel: value.verificationLevel,
    sourceCompleteness: value.sourceCompleteness,
    verifierImplementationHash: value.verifierImplementationHash,
    verificationHash: value.verificationHash, manifestHashes, sourceArtifactHashes,
    migration: { method: value.migration.method,
      legacySchemas: [...value.migration.legacySchemas].sort() } };
}

function normalizeRetention(value) {
  if (!exactKeys(value, ["mode", "retainUntil", "storedPayloadClass", "sourcePayloadManaged",
    "expiryDisposition", "liveRevocationChecked"])
    || !RETENTION_MODES.has(value.mode)
    || value.storedPayloadClass !== "HASHES_AND_BOUNDED_METADATA_ONLY"
    || value.sourcePayloadManaged !== false || value.liveRevocationChecked !== false) {
    fail("RETENTION_INVALID");
  }
  if (value.mode === "NO_AUTOMATIC_EXPIRY_PUBLIC_SOURCE") {
    if (value.retainUntil !== null || value.expiryDisposition !== "NOT_APPLICABLE") {
      fail("RETENTION_PUBLIC_INVALID");
    }
  } else {
    canonicalTime(value.retainUntil, "RETAIN_UNTIL");
    if (value.expiryDisposition !== "BLOCK_USE_KEEP_HASH_ONLY_TOMBSTONE") {
      fail("RETENTION_EXPIRY_DISPOSITION_INVALID");
    }
  }
  return structuredClone(value);
}

function normalizeRightsBasis(value, licenseIds) {
  if (!exactKeys(value, ["class", "sourceCommitmentHashes", "registryGrantsRights"])
    || !RIGHTS_BASIS_CLASSES.has(value.class) || value.registryGrantsRights !== false) {
    fail("RIGHTS_BASIS_INVALID");
  }
  const sourceCommitmentHashes = sortedUniqueHashes(value.sourceCommitmentHashes,
    "RIGHTS_BASIS_SOURCE_COMMITMENTS", { allowEmpty: false });
  if (value.class === "PUBLIC_DATASET_LICENSE_DECLARATIONS" && licenseIds.length === 0
    || ["EXPLICIT_USER_CONTRIBUTION_CONSENT", "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"]
      .includes(value.class) && licenseIds.length !== 0) {
    fail("RIGHTS_BASIS_LICENSE_MISMATCH");
  }
  return { class: value.class, sourceCommitmentHashes,
    registryGrantsRights: false };
}

function unitSort(left, right) {
  return left.identityHash.localeCompare(right.identityHash)
    || left.recordHash.localeCompare(right.recordHash)
    || left.datasetRoot.localeCompare(right.datasetRoot);
}

function normalizeUnits(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_UNITS) {
    fail("UNITS_INVALID");
  }
  const output = value.map((unit) => {
    if (!exactKeys(unit, ["identityHash", "recordHash", "datasetRoot", "correlationRoots"])
      || !HASH.test(String(unit.identityHash ?? ""))
      || !HASH.test(String(unit.recordHash ?? ""))
      || !HASH.test(String(unit.datasetRoot ?? ""))) fail("UNIT_INVALID");
    const correlationRoots = sortedUniqueHashes(unit.correlationRoots,
      "UNIT_CORRELATION_ROOTS");
    if (correlationRoots.length > MAX_CORRELATION_ROOTS) {
      fail("UNIT_CORRELATION_ROOTS_TOO_MANY");
    }
    if (!correlationRoots.includes(unit.datasetRoot)) fail("UNIT_DATASET_ROOT_UNDISCLOSED");
    return { identityHash: unit.identityHash, recordHash: unit.recordHash,
      datasetRoot: unit.datasetRoot, correlationRoots };
  }).sort(unitSort);
  const byIdentity = new Map();
  for (const unit of output) {
    const prior = byIdentity.get(unit.identityHash);
    if (prior && prior.recordHash !== unit.recordHash) fail("INTRA_SET_IDENTITY_CONFLICT");
    byIdentity.set(unit.identityHash, unit);
  }
  return output;
}

function artifactSetBody(input) {
  const stage = input.stage;
  const stream = input.stream;
  if (!STAGES.has(stage) || !STREAMS.has(stream)
    || stage === "ATTEST" && stream !== "FORWARD_ACTION_EVIDENCE"
    || stage === "CURATE" && stream !== "BACKWARD_EXPERIENCE_EVIDENCE") {
    fail("STAGE_STREAM_INVALID");
  }
  if (!TOKEN.test(String(input.artifactSetId ?? ""))) fail("ARTIFACT_SET_ID_INVALID");
  const createdAt = canonicalTime(input.createdAt, "ARTIFACT_CREATED_AT");
  const instrument = normalizeInstrument(input.instrument);
  const units = normalizeUnits(input.units);
  const datasetIds = Array.isArray(input.datasetIds) ? [...input.datasetIds].sort() : [];
  if (datasetIds.length < 1 || datasetIds.length > 64
    || datasetIds.some((value) => !TOKEN.test(String(value ?? "")))
    || new Set(datasetIds).size !== datasetIds.length) fail("DATASET_IDS_INVALID");
  const licenseIds = Array.isArray(input.licenseIds) ? [...input.licenseIds].sort() : [];
  if (licenseIds.length > 32
    || licenseIds.some((value) => !TOKEN.test(String(value ?? "")))
    || new Set(licenseIds).size !== licenseIds.length) fail("LICENSE_IDS_INVALID");
  const rightsBasis = normalizeRightsBasis(input.rightsBasis, licenseIds);
  return {
    schema: CORPUS_REGISTRY_SCHEMAS.artifactSet,
    schemaVersion: "2.0.0",
    artifactSetId: input.artifactSetId,
    stage,
    stream,
    createdAt,
    createdAtEvidence: localTimeEvidence(),
    instrument,
    instrumentHash: instrumentHash(instrument),
    datasetIds,
    licenseIds,
    rightsBasis,
    sourceProof: normalizeSourceProof(input.sourceProof),
    units,
    counts: { candidates: units.length,
      uniqueIdentities: new Set(units.map((unit) => unit.identityHash)).size,
      exactDuplicates: units.length - new Set(units.map((unit) => unit.identityHash)).size },
    recordSetCommitment: artifactSetDomainDigest(
      "outsider/corpus-registry/record-set/v1", units),
    retention: normalizeRetention(input.retention),
    revocationBoundary: {
      statusAtRegistration: "NOT_REVOKED_BY_REGISTRY",
      liveSourceRevocationChecked: false,
      useRequiresCurrentRegistryIndex: true,
    },
    causalCreditPolicy: causalCreditPolicy(),
    boundary: fixedBoundary(),
  };
}

export function createCorpusArtifactSet(input, { privateKeyPem } = {}) {
  if (!privateKeyPem) fail("ARTIFACT_SET_SIGNING_KEY_REQUIRED");
  const body = artifactSetBody(input);
  const artifactSetHash = artifactSetDomainDigest(
    CORPUS_REGISTRY_SCHEMAS.artifactSet, body);
  const artifactSet = Object.freeze({ ...body, artifactSetHash,
    signature: signatureFor(artifactSetHash, privateKeyPem) });
  if (Buffer.byteLength(artifactSetCanonical(artifactSet)) + 1 > MAX_ARTIFACT_BYTES) {
    fail("ARTIFACT_SET_TOO_LARGE");
  }
  return artifactSet;
}

export function verifyCorpusArtifactSet(artifactSet, { expectedSignerKeyId = null } = {}) {
  try {
    if (Buffer.byteLength(artifactSetCanonical(artifactSet)) + 1 > MAX_ARTIFACT_BYTES) {
      fail("ARTIFACT_SET_TOO_LARGE");
    }
    if (!exactKeys(artifactSet, ["schema", "schemaVersion", "artifactSetId", "stage",
      "stream", "createdAt", "createdAtEvidence", "instrument", "instrumentHash",
      "datasetIds", "licenseIds", "rightsBasis", "sourceProof", "units", "counts",
      "recordSetCommitment", "retention", "revocationBoundary", "causalCreditPolicy",
      "boundary", "artifactSetHash", "signature"])
      || artifactSet.schema !== CORPUS_REGISTRY_SCHEMAS.artifactSet
      || artifactSet.schemaVersion !== "2.0.0" || !same(artifactSet.createdAtEvidence,
        localTimeEvidence()) || !same(artifactSet.revocationBoundary, {
        statusAtRegistration: "NOT_REVOKED_BY_REGISTRY",
        liveSourceRevocationChecked: false,
        useRequiresCurrentRegistryIndex: true,
      }) || !same(artifactSet.causalCreditPolicy, causalCreditPolicy())
      || !validBoundary(artifactSet.boundary)) fail("ARTIFACT_SET_INVALID");
    const expectedBody = artifactSetBody(artifactSet);
    const { artifactSetHash, signature, ...body } = artifactSet;
    if (!sameArtifactSet(body, expectedBody)
      || artifactSetHash !== artifactSetDomainDigest(
        CORPUS_REGISTRY_SCHEMAS.artifactSet, expectedBody)) {
      fail("ARTIFACT_SET_DERIVATION_MISMATCH");
    }
    if (!verifySignature(artifactSetHash, signature, expectedSignerKeyId)) {
      fail("ARTIFACT_SET_SIGNATURE_INVALID");
    }
    return Object.freeze({ ok: true, artifactSetHash,
      signerKeyId: signature.keyId, candidates: artifactSet.counts.candidates });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function timestampRequestBody({ subjectHash, requestedAt, nonceHash }) {
  if (!HASH.test(String(subjectHash ?? "")) || !HASH.test(String(nonceHash ?? ""))) {
    fail("TIMESTAMP_REQUEST_HASH_INVALID");
  }
  return { schema: CORPUS_REGISTRY_SCHEMAS.timestampRequest, schemaVersion: "1.0.0",
    subjectHash, requestedAt: canonicalTime(requestedAt, "TIMESTAMP_REQUESTED_AT"),
    requestedAtEvidence: localTimeEvidence(), nonceHash };
}

export function createExternalTimestampRequest({ subjectHash, requestedAt = new Date(),
  nonce = randomBytes(32) } = {}) {
  const nonceHash = HASH.test(String(nonce ?? "")) ? nonce
    : digest(Buffer.isBuffer(nonce) ? nonce : Buffer.from(String(nonce)));
  const body = timestampRequestBody({ subjectHash, requestedAt, nonceHash });
  return Object.freeze({ ...body,
    requestHash: domainDigest(CORPUS_REGISTRY_SCHEMAS.timestampRequest, body) });
}

export function verifyExternalTimestampRequest(request) {
  try {
    if (!exactKeys(request, ["schema", "schemaVersion", "subjectHash", "requestedAt",
      "requestedAtEvidence", "nonceHash", "requestHash"])
      || request.schema !== CORPUS_REGISTRY_SCHEMAS.timestampRequest
      || request.schemaVersion !== "1.0.0") fail("TIMESTAMP_REQUEST_INVALID");
    const expected = timestampRequestBody(request);
    if (!same(request.requestedAtEvidence, localTimeEvidence())
      || request.requestHash !== domainDigest(CORPUS_REGISTRY_SCHEMAS.timestampRequest,
        expected)) fail("TIMESTAMP_REQUEST_DERIVATION_MISMATCH");
    return Object.freeze({ ok: true, requestHash: request.requestHash,
      externallyTimestamped: false });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function externalTimestampReceiptSigningHash(receiptBody) {
  if (!exactKeys(receiptBody, ["schema", "schemaVersion", "providerId", "authorityKeyId",
    "requestHash", "subjectHash", "timestamp"])
    || receiptBody.schema !== CORPUS_REGISTRY_SCHEMAS.timestampReceipt
    || receiptBody.schemaVersion !== "1.0.0"
    || !TOKEN.test(String(receiptBody.providerId ?? ""))
    || !KEY_ID.test(String(receiptBody.authorityKeyId ?? ""))
    || !HASH.test(String(receiptBody.requestHash ?? ""))
    || !HASH.test(String(receiptBody.subjectHash ?? ""))) fail("TIMESTAMP_RECEIPT_BODY_INVALID");
  canonicalTime(receiptBody.timestamp, "EXTERNAL_TIMESTAMP");
  return domainDigest(CORPUS_REGISTRY_SCHEMAS.timestampReceipt, receiptBody);
}

export function verifyExternalTimestampReceipt(receipt, { request, authorities } = {}) {
  try {
    const requestCheck = verifyExternalTimestampRequest(request);
    if (!requestCheck.ok) fail("TIMESTAMP_RECEIPT_REQUEST_INVALID", requestCheck.error);
    if (!exactKeys(receipt, ["schema", "schemaVersion", "providerId", "authorityKeyId",
      "requestHash", "subjectHash", "timestamp", "signature"])
      || receipt.requestHash !== request.requestHash
      || receipt.subjectHash !== request.subjectHash
      || Date.parse(receipt.timestamp) < Date.parse(request.requestedAt)) {
      fail("TIMESTAMP_RECEIPT_BINDING_INVALID");
    }
    const body = Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== "signature"));
    const signingHash = externalTimestampReceiptSigningHash(body);
    const normalized = normalizeAuthorities(authorities ?? []);
    const authority = normalized.find((item) => item.providerId === receipt.providerId
      && item.keyId === receipt.authorityKeyId);
    if (!authority || !exactKeys(receipt.signature, ["algorithm", "value"])
      || receipt.signature.algorithm !== "Ed25519"
      || typeof receipt.signature.value !== "string"
      || !BASE64_ED25519_SIGNATURE.test(receipt.signature.value)
      || Buffer.from(receipt.signature.value, "base64").length !== 64
      || !cryptoVerify(null, Buffer.from(signingHash), createPublicKey(authority.publicKeyPem),
        Buffer.from(receipt.signature.value, "base64"))) fail("TIMESTAMP_RECEIPT_SIGNATURE_INVALID");
    return Object.freeze({ ok: true, signingHash, timestamp: receipt.timestamp,
      providerId: receipt.providerId, cryptographicallyValid: true,
      trustedByConfiguredPolicy: true, externallyTimestamped: true });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error),
      cryptographicallyValid: false, trustedByConfiguredPolicy: false,
      externallyTimestamped: false });
  }
}

function eventBody({ registryId, sequence, type, recordedAt, previousEventHash, payload }) {
  if (!TOKEN.test(String(registryId ?? "")) || !Number.isSafeInteger(sequence) || sequence < 1
    || !EVENT_TYPES.has(type) || !HASH.test(String(previousEventHash ?? ""))) {
    fail("EVENT_INVALID");
  }
  return { schema: CORPUS_REGISTRY_SCHEMAS.event, schemaVersion: "1.0.0", registryId,
    sequence, type, recordedAt: canonicalTime(recordedAt, "EVENT_RECORDED_AT"),
    recordedAtEvidence: localTimeEvidence(), previousEventHash, payload };
}

function createEvent(input) {
  const body = eventBody(input);
  return Object.freeze({ ...body, eventHash: domainDigest(CORPUS_REGISTRY_SCHEMAS.event, body) });
}

function verifyEvents(events, config) {
  let previous = GENESIS;
  let priorTime = config.createdAt;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!exactKeys(event, ["schema", "schemaVersion", "registryId", "sequence", "type",
      "recordedAt", "recordedAtEvidence", "previousEventHash", "payload", "eventHash"])
      || event.registryId !== config.registryId || event.sequence !== index + 1
      || event.previousEventHash !== previous || !same(event.recordedAtEvidence,
        localTimeEvidence())) fail("EVENT_CHAIN_INVALID", index + 1);
    const body = eventBody(event);
    if (!same(body, Object.fromEntries(Object.entries(event)
      .filter(([key]) => key !== "eventHash")))
      || event.eventHash !== domainDigest(CORPUS_REGISTRY_SCHEMAS.event, body)) {
      fail("EVENT_HASH_INVALID", index + 1);
    }
    if (Date.parse(event.recordedAt) < Date.parse(priorTime)) fail("EVENT_TIME_ROLLBACK");
    priorTime = event.recordedAt;
    previous = event.eventHash;
  }
  return previous;
}

function setSummary(set, state, timestamp) {
  return {
    artifactSetHash: set.artifactSetHash,
    artifactSetId: set.artifactSetId,
    stage: set.stage,
    stream: set.stream,
    sourceKind: set.sourceProof.sourceKind,
    sourceVerificationLevel: set.sourceProof.verificationLevel,
    sourceCompleteness: set.sourceProof.sourceCompleteness,
    rightsBasisClass: set.rightsBasis.class,
    instrumentHash: set.instrumentHash,
    candidates: set.counts.candidates,
    uniqueIdentities: set.counts.uniqueIdentities,
    state,
    retainUntil: set.retention.retainUntil,
    externalTimestamp: timestamp,
    boundary: fixedBoundary(),
  };
}

function deriveIndexBody(config, events, artifactSets) {
  verifyEvents(events, config);
  const registered = new Map();
  const revoked = new Map();
  const expired = new Map();
  const requests = new Map();
  const receipts = new Map();
  for (const event of events) {
    const payload = event.payload;
    if (event.type === "REGISTER_ARTIFACT_SET") {
      if (!exactKeys(payload, ["artifactSetHash"]) || !HASH.test(payload.artifactSetHash ?? "")
        || registered.has(payload.artifactSetHash)) fail("REGISTER_EVENT_INVALID");
      const set = artifactSets.get(payload.artifactSetHash);
      if (!set) fail("REGISTERED_ARTIFACT_SET_MISSING", payload.artifactSetHash);
      if ([...registered.values()].some((entry) => entry.set.artifactSetId
        === set.artifactSetId)) fail("ARTIFACT_SET_ID_REUSED", set.artifactSetId);
      const checked = verifyCorpusArtifactSet(set, { expectedSignerKeyId: config.signer.keyId });
      if (!checked.ok) fail("REGISTERED_ARTIFACT_SET_INVALID", checked.error);
      if (Date.parse(set.createdAt) > Date.parse(event.recordedAt)) {
        fail("ARTIFACT_SET_REGISTERED_BEFORE_CREATED");
      }
      if (set.retention.retainUntil !== null
        && Date.parse(set.retention.retainUntil) <= Date.parse(event.recordedAt)) {
        fail("ARTIFACT_SET_EXPIRED_AT_REGISTRATION");
      }
      registered.set(set.artifactSetHash, { set, event });
      continue;
    }
    if (event.type === "REVOKE_ARTIFACT_SET") {
      if (!exactKeys(payload, ["artifactSetHash", "reasonCode", "evidenceHash"])
        || !registered.has(payload.artifactSetHash) || revoked.has(payload.artifactSetHash)
        || expired.has(payload.artifactSetHash) || !REVOCATION_REASONS.has(payload.reasonCode)
        || payload.evidenceHash !== null && !HASH.test(payload.evidenceHash ?? "")) {
        fail("REVOCATION_EVENT_INVALID");
      }
      revoked.set(payload.artifactSetHash, { ...payload, eventHash: event.eventHash,
        recordedAt: event.recordedAt });
      continue;
    }
    if (event.type === "EXPIRE_ARTIFACT_SET") {
      if (!exactKeys(payload, ["artifactSetHash", "retainUntil"])
        || !registered.has(payload.artifactSetHash) || revoked.has(payload.artifactSetHash)
        || expired.has(payload.artifactSetHash)) fail("EXPIRY_EVENT_INVALID");
      const set = registered.get(payload.artifactSetHash).set;
      if (set.retention.mode !== "EXPIRES_AT_KEEP_HASH_ONLY_TOMBSTONE"
        || payload.retainUntil !== set.retention.retainUntil
        || Date.parse(event.recordedAt) < Date.parse(payload.retainUntil)) {
        fail("EXPIRY_EVENT_TIME_INVALID");
      }
      expired.set(payload.artifactSetHash, { artifactSetHash: payload.artifactSetHash,
        retainUntil: payload.retainUntil, tombstoneEventHash: event.eventHash,
        recordedAt: event.recordedAt, payloadRetained: "HASHES_AND_BOUNDED_METADATA_ONLY" });
      continue;
    }
    if (event.type === "REQUEST_EXTERNAL_TIMESTAMP") {
      if (!exactKeys(payload, ["request"]) || !verifyExternalTimestampRequest(payload.request).ok
        || !registered.has(payload.request.subjectHash)
        || requests.has(payload.request.requestHash)
        || [...requests.values()].some((request) => request.subjectHash
          === payload.request.subjectHash)) fail("TIMESTAMP_REQUEST_EVENT_INVALID");
      requests.set(payload.request.requestHash, payload.request);
      continue;
    }
    if (event.type === "ATTACH_EXTERNAL_TIMESTAMP") {
      if (!exactKeys(payload, ["requestHash", "receipt"])
        || !requests.has(payload.requestHash) || receipts.has(payload.requestHash)) {
        fail("TIMESTAMP_ATTACH_EVENT_INVALID");
      }
      const request = requests.get(payload.requestHash);
      const checked = verifyExternalTimestampReceipt(payload.receipt, { request,
        authorities: config.timestampAuthorities });
      if (!checked.ok || Date.parse(payload.receipt.timestamp) > Date.parse(event.recordedAt)) {
        fail("TIMESTAMP_ATTACH_RECEIPT_INVALID", checked.error);
      }
      receipts.set(payload.requestHash, { receipt: payload.receipt, checked });
    }
  }

  const sameInstrument = new Map();
  const globalIdentity = new Map();
  const duplicateDisclosure = [];
  const crossInstrumentDisclosure = [];
  let candidates = 0;
  for (const [artifactSetHash, { set }] of registered) {
    for (const unit of set.units) {
      candidates += 1;
      const key = `${set.instrumentHash}\0${unit.identityHash}`;
      const prior = sameInstrument.get(key);
      if (prior) {
        if (prior.recordHash !== unit.recordHash) fail("CROSS_BATCH_IDENTITY_CONFLICT",
          unit.identityHash);
        duplicateDisclosure.push({ identityHash: unit.identityHash,
          instrumentHash: set.instrumentHash, firstArtifactSetHash: prior.artifactSetHash,
          duplicateArtifactSetHash: artifactSetHash, recordHash: unit.recordHash });
      } else sameInstrument.set(key, { ...unit, artifactSetHash });
      const global = globalIdentity.get(unit.identityHash);
      if (global && global.instrumentHash !== set.instrumentHash) {
        crossInstrumentDisclosure.push({ identityHash: unit.identityHash,
          firstInstrumentHash: global.instrumentHash, reusedInstrumentHash: set.instrumentHash,
          firstArtifactSetHash: global.artifactSetHash,
          reusedArtifactSetHash: artifactSetHash });
      } else if (!global) globalIdentity.set(unit.identityHash,
        { instrumentHash: set.instrumentHash, artifactSetHash });
    }
  }
  duplicateDisclosure.sort((a, b) => canonicalizeStrict(a).localeCompare(canonicalizeStrict(b)));
  crossInstrumentDisclosure.sort((a, b) => canonicalizeStrict(a)
    .localeCompare(canonicalizeStrict(b)));

  const activeSets = [...registered.entries()].filter(([hash]) => !revoked.has(hash)
    && !expired.has(hash));
  const groups = new Map();
  for (const [artifactSetHash, { set }] of activeSets) {
    const group = groups.get(set.instrumentHash) ?? { instrument: set.instrument,
      instrumentHash: set.instrumentHash, artifactSetHashes: [], units: [] };
    group.artifactSetHashes.push(artifactSetHash);
    group.units.push(...set.units);
    groups.set(set.instrumentHash, group);
  }
  const d2Groups = [...groups.values()].map((group) => {
    const identities = new Set(group.units.map((unit) => unit.identityHash));
    return { instrument: group.instrument, instrumentHash: group.instrumentHash,
      artifactSetHashes: group.artifactSetHashes.sort(), candidates: group.units.length,
      uniqueIdentities: identities.size, exactDuplicates: group.units.length - identities.size,
      identityCommitment: domainDigest("outsider/corpus-registry/d2-identities/v1",
        [...identities].sort()), boundary: fixedBoundary() };
  }).sort((a, b) => a.instrumentHash.localeCompare(b.instrumentHash));

  const timestampFor = (setHash) => {
    const request = [...requests.values()].find((item) => item.subjectHash === setHash);
    if (!request) return { status: "NOT_REQUESTED", requestHash: null, receiptHash: null,
      timestamp: null, externallyVerified: false };
    const attached = receipts.get(request.requestHash);
    if (!attached) return { status: "REQUESTED_NO_RECEIPT", requestHash: request.requestHash,
      receiptHash: null, timestamp: null, externallyVerified: false };
    return { status: "EXTERNAL_RECEIPT_VERIFIED", requestHash: request.requestHash,
      receiptHash: domainDigest(CORPUS_REGISTRY_SCHEMAS.timestampReceipt,
        attached.receipt), timestamp: attached.receipt.timestamp, externallyVerified: true };
  };
  const artifactSetSummaries = [...registered.entries()].map(([hash, { set }]) => setSummary(set,
    revoked.has(hash) ? "REVOKED" : expired.has(hash) ? "EXPIRED" : "ACTIVE",
    timestampFor(hash))).sort((a, b) => a.artifactSetHash.localeCompare(b.artifactSetHash));
  const updatedAt = events.at(-1)?.recordedAt ?? config.createdAt;
  return {
    schema: CORPUS_REGISTRY_SCHEMAS.index,
    schemaVersion: "1.0.0",
    registryId: config.registryId,
    configHash: config.configHash,
    createdAt: config.createdAt,
    updatedAt,
    updatedAtEvidence: localTimeEvidence(),
    log: { events: events.length, head: events.at(-1)?.eventHash ?? GENESIS,
      appendOnlyClaim: "VERIFIED_FROM_COMPLETE_LOCAL_EVENT_LOG" },
    artifactSets: artifactSetSummaries,
    revocations: [...revoked.values()].sort((a, b) => a.artifactSetHash
      .localeCompare(b.artifactSetHash)),
    retentionTombstones: [...expired.values()].sort((a, b) => a.artifactSetHash
      .localeCompare(b.artifactSetHash)),
    d1: {
      scope: "CROSS_BATCH_ALL_RETAINED_HASH_IDENTITIES",
      candidates,
      uniqueSourceIdentities: globalIdentity.size,
      exactSameInstrumentDuplicates: duplicateDisclosure.length,
      crossInstrumentReuses: crossInstrumentDisclosure.length,
      conflicts: 0,
      duplicateDisclosure,
      crossInstrumentDisclosure,
    },
    d2: { rule: "EXACT_INSTRUMENT_ID_VERSION_IMPLEMENTATION_AND_FEATURE_SCHEMA",
      groups: d2Groups },
    counts: { artifactSets: registered.size, activeArtifactSets: activeSets.length,
      revokedArtifactSets: revoked.size, expiredArtifactSets: expired.size,
      candidates, d2Groups: d2Groups.length,
      operatorSignedFullSourceClaims: artifactSetSummaries.filter((set) =>
        set.sourceCompleteness === "FULL_DECLARED_SOURCE_SCOPE").length,
      operatorSignedPrivacyProjectionClaims: artifactSetSummaries.filter((set) =>
        set.sourceCompleteness === "SIGNED_PRIVACY_PROJECTION_ONLY").length,
      operatorSignedExplicitConsentClaims: artifactSetSummaries.filter((set) =>
        set.rightsBasisClass === "EXPLICIT_USER_CONTRIBUTION_CONSENT").length,
      externallyTimestampedArtifactSets: artifactSetSummaries
        .filter((set) => set.externalTimestamp.externallyVerified).length },
    intakeCapabilities: intakeCapabilities(),
    sourceVerificationBoundary: sourceVerificationBoundary(),
    retentionBoundary: {
      storedPayloadClass: "HASHES_AND_BOUNDED_METADATA_ONLY",
      rawSourcePayloadManaged: false,
      expiryRequiresAppendOnlyTombstoneEvent: true,
      erasureOfUpstreamSourceClaimed: false,
    },
    revocationBoundary: {
      liveSourceRevocationPolling: false,
      registryEventsAreOperatorAssertions: true,
      currentUseRequiresActiveIndexState: true,
    },
    timestampBoundary: {
      localEventTimesExternallyVerified: false,
      externalTimeClaimRequiresConfiguredAuthoritySignature: true,
      configuredAuthoritiesEstablishInstitutionalIndependence: false,
      localSnapshotRollbackResistanceClaimed: false,
    },
    boundary: fixedBoundary(),
  };
}

function sealIndex(body, privateKeyPem) {
  if (Buffer.byteLength(canonicalizeStrict(body)) + 1 > MAX_INDEX_BYTES) {
    fail("INDEX_TOO_LARGE");
  }
  const indexHash = domainDigest(CORPUS_REGISTRY_SCHEMAS.index, body);
  return Object.freeze({ ...body, indexHash, signature: signatureFor(indexHash, privateKeyPem) });
}

export function verifyCorpusRegistryIndex(index, { config, events, artifactSets,
  now = new Date(), enforceRetention = true } = {}) {
  try {
    if (Buffer.byteLength(canonicalizeStrict(index)) + 1 > MAX_INDEX_BYTES) {
      fail("INDEX_TOO_LARGE");
    }
    const configCheck = verifyCorpusRegistryConfig(config);
    if (!configCheck.ok) fail("INDEX_CONFIG_INVALID", configCheck.error);
    const currentTime = canonicalTime(now, "VERIFY_TIME");
    if (!(artifactSets instanceof Map)) fail("INDEX_ARTIFACT_MAP_REQUIRED");
    if (!exactKeys(index, ["schema", "schemaVersion", "registryId", "configHash",
      "createdAt", "updatedAt", "updatedAtEvidence", "log", "artifactSets", "revocations",
      "retentionTombstones", "d1", "d2", "counts", "intakeCapabilities", "retentionBoundary",
      "sourceVerificationBoundary", "revocationBoundary", "timestampBoundary", "boundary",
      "indexHash", "signature"])
      || index.schema !== CORPUS_REGISTRY_SCHEMAS.index
      || index.schemaVersion !== "1.0.0") fail("INDEX_INVALID");
    const expected = deriveIndexBody(config, events, artifactSets);
    const { indexHash, signature, ...body } = index;
    if (!same(body, expected)
      || indexHash !== domainDigest(CORPUS_REGISTRY_SCHEMAS.index, expected)
      || !verifySignature(indexHash, signature, config.signer.keyId)) {
      fail("INDEX_DERIVATION_OR_SIGNATURE_INVALID");
    }
    if (enforceRetention) {
      const overdue = index.artifactSets.filter((summary) => summary.state === "ACTIVE"
        && summary.retainUntil !== null
        && Date.parse(summary.retainUntil) <= Date.parse(currentTime));
      if (overdue.length > 0) fail("RETENTION_ACTION_REQUIRED", overdue[0].artifactSetHash);
    }
    return Object.freeze({ ok: true, indexHash, signed: true,
      signatureCryptographicallyValid: true, signatureTrustedByPolicy: false,
      checkedAt: currentTime, counts: index.counts, d1: index.d1, d2: index.d2,
      sourceArtifactsReverified: false, fullSourceArtifactSetsReverified: 0,
      sourceVerificationBoundary: index.sourceVerificationBoundary });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function stableFileSnapshot(file, code, { minimumBytes = 1,
  maximumBytes = MAX_ARTIFACT_BYTES } = {}) {
  let descriptor = null;
  try {
    try { descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); }
    catch (error) {
      if (error?.code === "ENOENT") fail(`${code}_MISSING`);
      fail(`${code}_INVALID`);
    }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < BigInt(minimumBytes)
      || before.size > BigInt(maximumBytes)) fail(`${code}_SIZE_INVALID`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== before.size) fail(`${code}_CHANGED_DURING_READ`);
    return bytes;
  } finally { if (descriptor !== null) closeSync(descriptor); }
}

function readCanonicalJson(file, code, { maximumBytes = MAX_ARTIFACT_BYTES } = {}) {
  const raw = stableFileSnapshot(file, code, { minimumBytes: 2, maximumBytes })
    .toString("utf8");
  let value;
  try { value = JSON.parse(raw); } catch { fail(`${code}_JSON_INVALID`); }
  if (raw !== `${storageCanonical(value)}\n`) fail(`${code}_NON_CANONICAL`);
  return value;
}

function fsyncDirectory(directory) {
  let descriptor = null;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== null) closeSync(descriptor); }
}

function atomicCanonicalJson(file, value, { exclusive = false } = {}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) fail("SYMLINK_REFUSED", file);
  if (exclusive && existsSync(file)) fail("FILE_EXISTS", file);
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  try {
    writeFileSync(temporary, `${storageCanonical(value)}\n`,
      { mode: 0o600, flag: "wx" });
    const descriptor = openSync(temporary, "r");
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    if (exclusive) {
      // link(2) is an atomic no-replace publication. rename(2) would overwrite
      // a winner created by a concurrent initializer.
      linkSync(temporary, file);
      unlinkSync(temporary);
    } else renameSync(temporary, file);
    fsyncDirectory(path.dirname(file));
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function artifactFile(directory, artifactSetHash) {
  if (!HASH.test(String(artifactSetHash ?? ""))) fail("ARTIFACT_HASH_INVALID");
  return path.join(directory, "artifact-sets", `${artifactSetHash.slice(7)}.json`);
}

function parseEvents(file) {
  const raw = stableFileSnapshot(file, "EVENT_LOG", { minimumBytes: 0,
    maximumBytes: MAX_EVENT_LOG_BYTES }).toString("utf8");
  if (raw === "") return [];
  if (!raw.endsWith("\n")) fail("EVENT_LOG_PARTIAL_TAIL");
  return raw.slice(0, -1).split("\n").map((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { fail("EVENT_LOG_JSON_INVALID", index + 1); }
    if (line !== canonicalizeStrict(event)) fail("EVENT_LOG_NON_CANONICAL", index + 1);
    return event;
  });
}

function syncEmptyFile(file) {
  const descriptor = openSync(file, "wx", 0o600);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function appendEvent(file, event) {
  const descriptor = openSync(file, "a", 0o600);
  try {
    writeSync(descriptor, `${canonicalizeStrict(event)}\n`);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  fsyncDirectory(path.dirname(file));
}

export class DurableStage1CurateCorpusRegistry {
  constructor({ directory, privateKeyPem = null, registryId = null, createdAt = new Date(),
    timestampAuthorities = [] } = {}) {
    if (typeof directory !== "string" || directory.length === 0) fail("DIRECTORY_REQUIRED");
    this.directory = path.resolve(directory);
    this.configFile = path.join(this.directory, "config.json");
    this.eventsFile = path.join(this.directory, "events.jsonl");
    this.indexFile = path.join(this.directory, "index.json");
    this.lockFile = path.join(this.directory, ".write.lock");
    this.initializationLockFile = path.join(this.directory, ".initialize.lock");
    this.privateKeyPem = privateKeyPem;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    if (!lstatSync(this.directory).isDirectory() || lstatSync(this.directory).isSymbolicLink()) {
      fail("DIRECTORY_INVALID");
    }
    this.artifactSetsDirectory = path.join(this.directory, "artifact-sets");
    mkdirSync(this.artifactSetsDirectory, { recursive: true, mode: 0o700 });
    if (!lstatSync(this.artifactSetsDirectory).isDirectory()
      || lstatSync(this.artifactSetsDirectory).isSymbolicLink()) {
      fail("ARTIFACT_DIRECTORY_INVALID");
    }
    if (![this.configFile, this.eventsFile, this.indexFile].every(existsSync)) {
      let initializationLock = null;
      try {
        try { initializationLock = openSync(this.initializationLockFile, "wx", 0o600); }
        catch (error) {
          if (error?.code === "EEXIST") fail("INITIALIZATION_LOCKED");
          throw error;
        }
        let config;
        if (existsSync(this.configFile)) {
          config = readCanonicalJson(this.configFile, "CONFIG", {
            maximumBytes: 2 * 1024 * 1024 });
          const check = verifyCorpusRegistryConfig(config);
          if (!check.ok) fail("CONFIG_INVALID", check.error);
          if (!privateKeyPem
            || privateKeyIdentity(privateKeyPem).keyId !== config.signer.keyId) {
            fail("INCOMPLETE_INITIALIZATION_SIGNING_KEY_REQUIRED");
          }
        } else {
          if (!privateKeyPem) fail("INITIALIZATION_SIGNING_KEY_REQUIRED");
          config = createCorpusRegistryConfig({ registryId: registryId
            ?? "outsider-stage1-curate", createdAt, privateKeyPem, timestampAuthorities });
          atomicCanonicalJson(this.configFile, config, { exclusive: true });
        }
        if (!existsSync(this.eventsFile)) syncEmptyFile(this.eventsFile);
        else if (parseEvents(this.eventsFile).length !== 0) fail("INITIALIZATION_LOG_NOT_EMPTY");
        if (!existsSync(this.indexFile)) atomicCanonicalJson(this.indexFile,
          sealIndex(deriveIndexBody(config, [], new Map()), privateKeyPem), { exclusive: true });
        fsyncDirectory(this.directory);
      } finally {
        if (initializationLock !== null) {
          closeSync(initializationLock);
          unlinkSync(this.initializationLockFile);
          fsyncDirectory(this.directory);
        }
      }
    }
    this.config = readCanonicalJson(this.configFile, "CONFIG", { maximumBytes: 2 * 1024 * 1024 });
    const checked = verifyCorpusRegistryConfig(this.config);
    if (!checked.ok) fail("CONFIG_INVALID", checked.error);
    if (registryId !== null && registryId !== this.config.registryId) fail("ID_MISMATCH");
    if (privateKeyPem && privateKeyIdentity(privateKeyPem).keyId !== this.config.signer.keyId) {
      fail("SIGNING_KEY_MISMATCH");
    }
  }

  #withLock(callback) {
    let lock = null;
    try {
      try { lock = openSync(this.lockFile, "wx", 0o600); }
      catch (error) { if (error?.code === "EEXIST") fail("STATE_LOCKED"); throw error; }
      return callback();
    } finally {
      if (lock !== null) { closeSync(lock); unlinkSync(this.lockFile); }
    }
  }

  #load({ recoverSignedSuffix = false, allowRetentionDue = false } = {}) {
    const config = readCanonicalJson(this.configFile, "CONFIG", { maximumBytes: 2 * 1024 * 1024 });
    if (!same(config, this.config)) fail("CONFIG_DRIFT");
    const events = parseEvents(this.eventsFile);
    verifyEvents(events, config);
    const registeredHashes = events.filter((event) => event.type === "REGISTER_ARTIFACT_SET")
      .map((event) => event.payload.artifactSetHash);
    const artifactSets = new Map();
    for (const hash of registeredHashes) {
      const set = readCanonicalJson(artifactFile(this.directory, hash), "ARTIFACT_SET");
      if (set.artifactSetHash !== hash) fail("ARTIFACT_FILE_HASH_MISMATCH", hash);
      artifactSets.set(hash, set);
    }
    let index = readCanonicalJson(this.indexFile, "INDEX", { maximumBytes: 64 * 1024 * 1024 });
    let indexCheck = verifyCorpusRegistryIndex(index, { config, events, artifactSets,
      now: index.updatedAt, enforceRetention: !allowRetentionDue });
    if (!indexCheck.ok && recoverSignedSuffix && this.privateKeyPem
      && Number.isSafeInteger(index?.log?.events) && index.log.events >= 0
      && index.log.events < events.length) {
      const prefixEvents = events.slice(0, index.log.events);
      const prefixHashes = new Set(prefixEvents
        .filter((event) => event.type === "REGISTER_ARTIFACT_SET")
        .map((event) => event.payload.artifactSetHash));
      const prefixSets = new Map([...artifactSets].filter(([hash]) => prefixHashes.has(hash)));
      const prefixCheck = verifyCorpusRegistryIndex(index, { config, events: prefixEvents,
        artifactSets: prefixSets, now: index.updatedAt,
        enforceRetention: !allowRetentionDue });
      if (prefixCheck.ok) {
        const recovered = sealIndex(deriveIndexBody(config, events, artifactSets),
          this.privateKeyPem);
        atomicCanonicalJson(this.indexFile, recovered);
        index = recovered;
        indexCheck = verifyCorpusRegistryIndex(index, { config, events, artifactSets,
          now: index.updatedAt, enforceRetention: !allowRetentionDue });
      }
    }
    if (!indexCheck.ok) fail("CURRENT_INDEX_INVALID", indexCheck.error);
    return { config, events, artifactSets, index };
  }

  #requireSigningKey() {
    if (!this.privateKeyPem) fail("SIGNING_KEY_REQUIRED");
    if (privateKeyIdentity(this.privateKeyPem).keyId !== this.config.signer.keyId) {
      fail("SIGNING_KEY_MISMATCH");
    }
  }

  #append(type, payload, recordedAt) {
    this.#requireSigningKey();
    return this.#withLock(() => {
      const eventTime = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      const state = this.#load({ recoverSignedSuffix: true,
        allowRetentionDue: type === "EXPIRE_ARTIFACT_SET" });
      if (type !== "EXPIRE_ARTIFACT_SET") this.#assertNoRetentionDue(state.index, eventTime);
      const event = createEvent({ registryId: state.config.registryId,
        sequence: state.events.length + 1, type,
        recordedAt: eventTime,
        previousEventHash: state.events.at(-1)?.eventHash ?? GENESIS, payload });
      const events = [...state.events, event];
      const nextBody = deriveIndexBody(state.config, events, state.artifactSets);
      const nextIndex = sealIndex(nextBody, this.privateKeyPem);
      appendEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return { event, index: nextIndex };
    });
  }

  appendArtifactSet(artifactSet, { recordedAt = new Date() } = {}) {
    const checked = verifyCorpusArtifactSet(artifactSet, {
      expectedSignerKeyId: this.config.signer.keyId });
    if (!checked.ok) fail("ARTIFACT_SET_ADMISSION_INVALID", checked.error);
    if (artifactSet.sourceProof.verificationLevel == null) fail("FULL_SOURCE_PROOF_REQUIRED");
    this.#requireSigningKey();
    return this.#withLock(() => {
      const eventTime = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      const state = this.#load({ recoverSignedSuffix: true });
      this.#assertNoRetentionDue(state.index, eventTime);
      if (state.artifactSets.has(artifactSet.artifactSetHash)) {
        return Object.freeze({ appended: false, duplicateArtifactSet: true,
          artifactSetHash: artifactSet.artifactSetHash, indexHash: state.index.indexHash });
      }
      const event = createEvent({ registryId: state.config.registryId,
        sequence: state.events.length + 1, type: "REGISTER_ARTIFACT_SET",
        recordedAt: eventTime,
        previousEventHash: state.events.at(-1)?.eventHash ?? GENESIS,
        payload: { artifactSetHash: artifactSet.artifactSetHash } });
      const events = [...state.events, event];
      const artifactSets = new Map(state.artifactSets);
      artifactSets.set(artifactSet.artifactSetHash, artifactSet);
      const nextIndex = sealIndex(deriveIndexBody(state.config, events, artifactSets),
        this.privateKeyPem);
      const target = artifactFile(this.directory, artifactSet.artifactSetHash);
      if (existsSync(target)) {
        const existing = readCanonicalJson(target, "ORPHAN_ARTIFACT_SET");
        if (!same(existing, artifactSet)) fail("ORPHAN_ARTIFACT_CONFLICT");
      } else atomicCanonicalJson(target, artifactSet, { exclusive: true });
      appendEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return Object.freeze({ appended: true, duplicateArtifactSet: false,
        artifactSetHash: artifactSet.artifactSetHash, eventHash: event.eventHash,
        indexHash: nextIndex.indexHash, counts: nextIndex.counts });
    });
  }

  appendArtifactSets(artifactSets, { recordedAt = new Date() } = {}) {
    if (!Array.isArray(artifactSets) || artifactSets.length < 1
      || artifactSets.length > 4_096) fail("ARTIFACT_SET_BATCH_INVALID");
    const hashes = new Set();
    for (const artifactSet of artifactSets) {
      const checked = verifyCorpusArtifactSet(artifactSet, {
        expectedSignerKeyId: this.config.signer.keyId });
      if (!checked.ok) fail("ARTIFACT_SET_ADMISSION_INVALID", checked.error);
      if (hashes.has(artifactSet.artifactSetHash)) fail("ARTIFACT_SET_BATCH_DUPLICATE");
      hashes.add(artifactSet.artifactSetHash);
    }
    this.#requireSigningKey();
    return this.#withLock(() => {
      const eventTime = canonicalTime(recordedAt, "EVENT_RECORDED_AT");
      const state = this.#load({ recoverSignedSuffix: true });
      this.#assertNoRetentionDue(state.index, eventTime);
      const additions = artifactSets.filter((set) => !state.artifactSets.has(set.artifactSetHash));
      if (additions.length === 0) return Object.freeze({ appended: 0,
        duplicateArtifactSets: artifactSets.length,
        artifactSetHashes: artifactSets.map((set) => set.artifactSetHash).sort(),
        eventHashes: [], indexHash: state.index.indexHash, counts: state.index.counts });
      const nextArtifactSets = new Map(state.artifactSets);
      const events = [...state.events];
      const appendedEvents = [];
      for (const set of additions) {
        nextArtifactSets.set(set.artifactSetHash, set);
        const event = createEvent({ registryId: state.config.registryId,
          sequence: events.length + 1, type: "REGISTER_ARTIFACT_SET", recordedAt: eventTime,
          previousEventHash: events.at(-1)?.eventHash ?? GENESIS,
          payload: { artifactSetHash: set.artifactSetHash } });
        events.push(event);
        appendedEvents.push(event);
      }
      const nextIndex = sealIndex(deriveIndexBody(state.config, events, nextArtifactSets),
        this.privateKeyPem);
      for (const set of additions) {
        const target = artifactFile(this.directory, set.artifactSetHash);
        if (existsSync(target)) {
          const existing = readCanonicalJson(target, "ORPHAN_ARTIFACT_SET");
          if (!same(existing, set)) fail("ORPHAN_ARTIFACT_CONFLICT");
        } else atomicCanonicalJson(target, set, { exclusive: true });
      }
      for (const event of appendedEvents) appendEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return Object.freeze({ appended: additions.length,
        duplicateArtifactSets: artifactSets.length - additions.length,
        artifactSetHashes: artifactSets.map((set) => set.artifactSetHash).sort(),
        eventHashes: appendedEvents.map((event) => event.eventHash),
        indexHash: nextIndex.indexHash, counts: nextIndex.counts });
    });
  }

  revoke(artifactSetHash, { reasonCode, evidenceHash = null,
    recordedAt = new Date() } = {}) {
    const result = this.#append("REVOKE_ARTIFACT_SET",
      { artifactSetHash, reasonCode, evidenceHash }, recordedAt);
    return Object.freeze({ revoked: true, artifactSetHash, eventHash: result.event.eventHash,
      indexHash: result.index.indexHash });
  }

  requestExternalTimestamp(artifactSetHash, { requestedAt = new Date(), nonce } = {}) {
    const request = createExternalTimestampRequest({ subjectHash: artifactSetHash,
      requestedAt, nonce });
    const result = this.#append("REQUEST_EXTERNAL_TIMESTAMP", { request }, requestedAt);
    return Object.freeze({ request, eventHash: result.event.eventHash,
      indexHash: result.index.indexHash });
  }

  attachExternalTimestamp(receipt, { recordedAt = new Date() } = {}) {
    const result = this.#append("ATTACH_EXTERNAL_TIMESTAMP",
      { requestHash: receipt?.requestHash, receipt }, recordedAt);
    return Object.freeze({ attached: true, requestHash: receipt.requestHash,
      eventHash: result.event.eventHash, indexHash: result.index.indexHash });
  }

  expireDue({ now = new Date() } = {}) {
    const time = canonicalTime(now, "EXPIRY_TIME");
    this.#requireSigningKey();
    return this.#withLock(() => {
      const state = this.#load({ recoverSignedSuffix: true, allowRetentionDue: true });
      const due = state.index.artifactSets.filter((set) => set.state === "ACTIVE"
        && set.retainUntil !== null && Date.parse(set.retainUntil) <= Date.parse(time));
      if (due.length === 0) return Object.freeze({ expired: 0, artifactSetHashes: [],
        indexHash: state.index.indexHash });
      const events = [...state.events];
      const appended = [];
      for (const set of due) {
        const event = createEvent({ registryId: state.config.registryId,
          sequence: events.length + 1, type: "EXPIRE_ARTIFACT_SET", recordedAt: time,
          previousEventHash: events.at(-1)?.eventHash ?? GENESIS,
          payload: { artifactSetHash: set.artifactSetHash, retainUntil: set.retainUntil } });
        events.push(event);
        appended.push(event);
      }
      const nextIndex = sealIndex(deriveIndexBody(state.config, events, state.artifactSets),
        this.privateKeyPem);
      for (const event of appended) appendEvent(this.eventsFile, event);
      atomicCanonicalJson(this.indexFile, nextIndex);
      return Object.freeze({ expired: due.length,
        artifactSetHashes: due.map((set) => set.artifactSetHash),
        indexHash: nextIndex.indexHash });
    });
  }

  repairIndex() {
    this.#requireSigningKey();
    return this.#withLock(() => {
      const state = this.#load({ recoverSignedSuffix: true, allowRetentionDue: true });
      return Object.freeze({ repaired: true, indexHash: state.index.indexHash,
        events: state.events.length, head: state.index.log.head });
    });
  }

  #assertNoRetentionDue(index, recordedAt) {
    const due = index.artifactSets.find((set) => set.state === "ACTIVE"
      && set.retainUntil !== null
      && Date.parse(set.retainUntil) <= Date.parse(recordedAt));
    if (due) fail("RETENTION_ACTION_REQUIRED", due.artifactSetHash);
  }

  verify({ now = new Date() } = {}) {
    try {
      const state = this.#load();
      const checked = verifyCorpusRegistryIndex(state.index, { config: state.config,
        events: state.events, artifactSets: state.artifactSets, now });
      if (!checked.ok) return checked;
      const expectedNames = new Set([...state.artifactSets.keys()].map((hash) => `${hash.slice(7)}.json`));
      const orphanArtifacts = readdirSync(path.join(this.directory, "artifact-sets"))
        .filter((name) => name.endsWith(".json") && !expectedNames.has(name)).sort();
      return Object.freeze({ ...checked, events: state.events.length,
        head: state.events.at(-1)?.eventHash ?? GENESIS, orphanArtifacts,
        appendOnlyLogVerified: true, artifactSetSignaturesVerified: true,
        externalTimestampReceiptsReverified: true });
    } catch (error) {
      return Object.freeze({ ok: false,
        error: error instanceof Error ? error.message : String(error) });
    }
  }

  operatorSignedClaimSnapshot({ now = new Date() } = {}) {
    try {
      const state = this.#load();
      const checked = verifyCorpusRegistryIndex(state.index, { config: state.config,
        events: state.events, artifactSets: state.artifactSets, now });
      if (!checked.ok) return checked;
      const stateByHash = new Map(state.index.artifactSets.map((summary) =>
        [summary.artifactSetHash, summary.state]));
      const claims = [...state.artifactSets.values()]
        .sort((left, right) => left.artifactSetHash.localeCompare(right.artifactSetHash))
        .map((artifactSet) => ({ state: stateByHash.get(artifactSet.artifactSetHash),
          artifactSet: structuredClone(artifactSet) }));
      return Object.freeze({ ok: true,
        schema: "outsider/stage1-curate-operator-signed-claim-snapshot/v1",
        registryId: state.config.registryId, registryIndexHash: state.index.indexHash,
        checkedAt: checked.checkedAt, operatorSignedClaims: claims,
        counts: state.index.counts, sourceArtifactsReverified: false,
        fullSourceArtifactSetsReverified: 0,
        sourceVerificationBoundary: state.index.sourceVerificationBoundary,
        boundary: fixedBoundary() });
    } catch (error) {
      return Object.freeze({ ok: false, sourceArtifactsReverified: false,
        fullSourceArtifactSetsReverified: 0,
        error: error instanceof Error ? error.message : String(error) });
    }
  }

  status({ now = new Date() } = {}) {
    const checked = this.verify({ now });
    let index = null;
    try { index = readCanonicalJson(this.indexFile, "INDEX", {
      maximumBytes: 64 * 1024 * 1024 }); } catch { /* verification carries the failure */ }
    return Object.freeze({ schema: "outsider/stage1-curate-corpus-registry-status/v1",
      registryId: this.config.registryId, directory: this.directory, ...checked,
      counts: index?.counts ?? null, d1: index?.d1 ?? null, d2: index?.d2 ?? null,
      intakeCapabilities: index?.intakeCapabilities ?? intakeCapabilities(),
      boundary: fixedBoundary() });
  }
}
