/*
 * Stage 1 lifecycle/source-reverification frontier.
 *
 * This module is deliberately separate from the durable corpus registry. It
 * can establish local cryptographic and source-replay facts, and it can
 * enforce receipts issued under an explicitly pinned local policy. It cannot
 * turn configured keys into institutional standing, grant data rights, create
 * causal-experience units, authorize training, or authorize financial use.
 */

import {
  createHash, createPrivateKey, createPublicKey, randomBytes,
  sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { verifyStage05RunDirectory } from "./outsider-stage05-evidence.js";
import { DurableStage1CurateCorpusRegistry } from "./outsider-corpus-registry.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
  verifyKnownPublicCorpusRegistrySources,
  verifyPublicAgentWave3MetadataCorpusRegistrySource,
} from "./outsider-corpus-registry-intake.js";

export const STAGE1_LIFECYCLE_SCHEMAS = Object.freeze({
  policy: "outsider/stage1-lifecycle-policy/v1",
  sourceReceipt: "outsider/stage1-source-replay-receipt/v1",
  providerReceipt: "outsider/stage1-provider-lifecycle-receipt/v1",
  state: "outsider/stage1-lifecycle-state/v1",
  challenge: "outsider/stage1-lifecycle-poll-challenge/v1",
  evaluation: "outsider/stage1-lifecycle-evaluation/v1",
  corpusSnapshot: "outsider/stage1-lifecycle-corpus-verification-snapshot/v1",
  corpusProfile: "outsider/stage1-lifecycle-exact-corpus-profile/v1",
});

export const STAGE1_PROVIDER_CAPABILITIES = Object.freeze({
  TIMESTAMP: "TIMESTAMP",
  MEMBERSHIP: "MEMBERSHIP",
  REVOCATION: "REVOCATION",
  RETENTION: "RETENTION",
});

export const STAGE1_PROVIDER_INTERFACES = Object.freeze({
  timestamp: "outsider.stage1.provider.timestamp-signed-json/v1",
  membership: "outsider.stage1.provider.membership-signed-json/v1",
  revocation: "outsider.stage1.provider.revocation-signed-json/v1",
  retention: "outsider.stage1.provider.retention-signed-json/v1",
  sourceReplay: "outsider.stage1.operator.sealed-stage05-source-replay/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const CAPABILITIES = new Set(Object.values(STAGE1_PROVIDER_CAPABILITIES));
const PROVIDER_GENESIS = domainDigest("outsider/stage1/provider-stream/genesis/v1", "genesis");
const SOURCE_GENESIS = domainDigest("outsider/stage1/source-receipt-stream/genesis/v1", "genesis");
const STATE_GENESIS = domainDigest("outsider/stage1/lifecycle-state/genesis/v1", "genesis");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_RECEIPTS = 256;
const MAX_HISTORY = 100_000;
const DISPOSITIONS = new Set(["NO_LIFECYCLE_POLL_COMMITTED",
  "HOLD_REVOKED", "HOLD_RETENTION_EXPIRED", "HOLD_STALE_OR_UNKNOWN_PROVIDER_STATE",
  "HOLD_MEMBERSHIP_NOT_ACTIVE", "HOLD_REVOCATION_UNKNOWN", "HOLD_EXTERNAL_TIME_UNKNOWN",
  "HOLD_RETENTION_UNKNOWN", "ADMIT_STAGE1_LIFECYCLE_BOUNDED"]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `STAGE1_LIFECYCLE_${code}`
    : `STAGE1_LIFECYCLE_${code}:${detail}`);
}

export function stage1LifecycleDigest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainDigest(domain, value) {
  return stage1LifecycleDigest(`${domain}\0${typeof value === "string"
    ? value : canonicalizeStrict(value)}`);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function canonicalTime(value, code) {
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string" || text.length > 40) fail(`${code}_INVALID`);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) {
    fail(`${code}_NON_CANONICAL`);
  }
  return text;
}

function positiveSeconds(value, code) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 31_536_000) fail(`${code}_INVALID`);
  return value;
}

function normalizedPublicKey(publicKeyPem) {
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    return key.export({ type: "spki", format: "pem" }).toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STAGE1_LIFECYCLE_")) throw error;
    fail("PUBLIC_KEY_INVALID");
  }
}

export function stage1LifecycleKeyId(publicKeyPem) {
  const key = createPublicKey(normalizedPublicKey(publicKeyPem));
  return `ed25519:${stage1LifecycleDigest(key.export({ type: "spki", format: "der" }))}`;
}

function privateKeyIdentity(privateKeyPem) {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    const publicKeyPem = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: stage1LifecycleKeyId(publicKeyPem) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("STAGE1_LIFECYCLE_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

function signatureFor(hash, privateKeyPem) {
  const identity = privateKeyIdentity(privateKeyPem);
  return { algorithm: "Ed25519", keyId: identity.keyId,
    value: cryptoSign(null, Buffer.from(hash), identity.privateKey).toString("base64") };
}

function verifySignature(hash, signature, publicKeyPem, expectedKeyId) {
  try {
    return exactKeys(signature, ["algorithm", "keyId", "value"])
      && signature.algorithm === "Ed25519"
      && signature.keyId === expectedKeyId
      && KEY_ID.test(signature.keyId)
      && typeof signature.value === "string"
      && SIGNATURE.test(signature.value)
      && Buffer.from(signature.value, "base64").length === 64
      && cryptoVerify(null, Buffer.from(hash), createPublicKey(publicKeyPem),
        Buffer.from(signature.value, "base64"));
  } catch { return false; }
}

function fixedBoundary() {
  return {
    authority: "none",
    institutionalTrustEstablished: false,
    rightsGranted: false,
    causalExperienceUnits: 0,
    automaticTraining: false,
    productionModelUpdate: false,
    pricingEligible: false,
    permitsPrice: false,
    permitsGuarantee: false,
    permitsSettle: false,
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function corpusProfileSource({ sourceKind, stage, stream, candidates,
  sourceCompleteness, verificationLevel, instrumentId, instrumentVersion,
  datasetIds, licenseIds, rightsBasisClass, rightsStatus }) {
  return {
    sourceKind, stage, stream, candidates, sourceCompleteness, verificationLevel,
    instrumentId, instrumentVersion,
    datasetIds: [...datasetIds].sort(),
    licenseIds: [...licenseIds].sort(),
    rightsBasisClass,
    rightsStatus,
    registryGrantsRights: false,
  };
}

const SIX_SET_SOURCES = [
  corpusProfileSource({
    sourceKind: "AGENTRX_TAU_MANUAL_FAILURE_TRACE_REGISTRY",
    stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 29,
    sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
    verificationLevel: "FULL_SOURCE_REPRODUCED",
    instrumentId: "agentrx-tau-wave4-failure-trace-intake", instrumentVersion: "1.0.0",
    datasetIds: ["microsoft/AgentRx:tau_retail"], licenseIds: ["MIT"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
  corpusProfileSource({
    sourceKind: "CUAREWARDBENCH_METADATA_LABEL_REGISTRY",
    stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 272,
    sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
    verificationLevel: "PINNED_METADATA_ONLY_REPRODUCED",
    instrumentId: "cuarewardbench-wave3-metadata-only-intake", instrumentVersion: "1.0.0",
    datasetIds: ["Tencent/CUARewardBench"], licenseIds: ["Apache-2.0"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
  corpusProfileSource({
    sourceKind: "DROID100_PUBLIC_ROBOTICS_PILOT",
    stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 2,
    sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
    verificationLevel: "FULL_SOURCE_REPRODUCED",
    instrumentId: "droid100-full-source-curate-intake", instrumentVersion: "1.0.0",
    datasetIds: ["r2d2_faceblur"], licenseIds: ["CC-BY-4.0"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
  corpusProfileSource({
    sourceKind: "PUBLIC_AGENT_CORPUS",
    stage: "ATTEST", stream: "FORWARD_ACTION_EVIDENCE", candidates: 9_381,
    sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
    verificationLevel: "FULL_SOURCE_REPRODUCED",
    instrumentId: "public-agent-full-source-intake", instrumentVersion: "2.0.0",
    datasetIds: ["OpenHands/openhands-feedback", "nebius/SWE-rebench-openhands-trajectories",
      "uw-syfi/TraceLab", "xlangai/computer-agent-arena"],
    licenseIds: ["CC-BY-4.0", "MIT"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
  corpusProfileSource({
    sourceKind: "PUBLIC_AGENT_WAVE2_CORPUS",
    stage: "ATTEST", stream: "FORWARD_ACTION_EVIDENCE", candidates: 1_474,
    sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
    verificationLevel: "FULL_SOURCE_REPRODUCED",
    instrumentId: "public-agent-wave2-full-source-intake", instrumentVersion: "1.0.0",
    datasetIds: ["AI45Research/ATBench-Claw", "AI45Research/ATBench-Codex",
      "kimdanny/matm", "sierra-research/tau2-bench"],
    licenseIds: ["Apache-2.0", "MIT"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
  corpusProfileSource({
    sourceKind: "PUBLIC_ROBOTICS_CORPUS",
    stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 160,
    sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
    verificationLevel: "FULL_SOURCE_REDERIVED",
    instrumentId: "public-robotics-full-source-intake", instrumentVersion: "1.1.0",
    datasetIds: ["kantine/BotFails", "paulpacaud/Guardian-FailCoT-OOD-datasets"],
    licenseIds: ["Apache-2.0"],
    rightsBasisClass: "PUBLIC_DATASET_LICENSE_DECLARATIONS",
    rightsStatus: "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS",
  }),
].sort((left, right) => left.sourceKind.localeCompare(right.sourceKind));

const NHTSA_SOURCE = corpusProfileSource({
  sourceKind: "NHTSA_SGO_INCIDENT_TAXONOMY_QUARANTINE",
  stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 1_324,
  sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
  verificationLevel: "FULL_SOURCE_REPRODUCED",
  instrumentId: "nhtsa-sgo-incident-taxonomy-curate-intake", instrumentVersion: "1.0.0",
  datasetIds: ["NHTSA_SGO_ADS_CRASH_REPORTS"], licenseIds: [],
  rightsBasisClass: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
  rightsStatus: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
});

const WAVE5_SOURCE = corpusProfileSource({
  sourceKind: PUBLIC_EVIDENCE_WAVE5_CORPUS_SOURCE_KIND,
  stage: "CURATE", stream: "BACKWARD_EXPERIENCE_EVIDENCE", candidates: 49,
  sourceCompleteness: "FULL_DECLARED_SOURCE_SCOPE",
  verificationLevel: "FULL_SOURCE_REPRODUCED",
  instrumentId: "public-evidence-wave5-source-aware-taxonomy-intake",
  instrumentVersion: "1.0.0",
  datasetIds: ["trace-commons/agent-traces",
    "robust-rosin/robust:industrial-arms"],
  licenseIds: [],
  rightsBasisClass: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
  rightsStatus: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
});

function createExactCorpusProfile(profileId, profileVersion, sourceKinds) {
  const sources = sourceKinds.map((source) => structuredClone(source))
    .sort((left, right) => left.sourceKind.localeCompare(right.sourceKind));
  const full = sources.filter((source) =>
    source.sourceCompleteness === "FULL_DECLARED_SOURCE_SCOPE");
  const metadata = sources.filter((source) =>
    source.sourceCompleteness === "QUARANTINED_NO_TRACE_BYTES");
  const privacy = sources.filter((source) =>
    source.sourceCompleteness === "SIGNED_PRIVACY_PROJECTION_ONLY");
  const expected = {
    counts: {
      artifactSets: sources.length,
      activeArtifactSets: sources.length,
      revokedArtifactSets: 0,
      expiredArtifactSets: 0,
      candidates: sources.reduce((total, source) => total + source.candidates, 0),
      d2Groups: sources.length,
    },
    sourceClassCounts: {
      fullSourceArtifactSets: full.length,
      fullSourceCandidates: full.reduce((total, source) => total + source.candidates, 0),
      metadataOnlyArtifactSets: metadata.length,
      metadataOnlyCandidates: metadata.reduce((total, source) => total + source.candidates, 0),
      privacyProjectionArtifactSets: privacy.length,
      privacyProjectionCandidates: privacy.reduce((total, source) => total + source.candidates, 0),
    },
    sourceKinds: sources,
    rightsStatus: {
      rightsEstablished: false,
      anyRegistryGrantsRights: false,
      rightsBasisClasses: [...new Set(sources.map((source) => source.rightsBasisClass))].sort(),
    },
    authorityBoundary: fixedBoundary(),
  };
  const body = {
    schema: STAGE1_LIFECYCLE_SCHEMAS.corpusProfile,
    schemaVersion: "1.0.0",
    profileId,
    profileVersion,
    matchingRule: "EXACT_SOURCE_KIND_COUNT_D2_INSTRUMENT_RIGHTS_AND_CLASS_PARTITION",
    expected,
  };
  return deepFreeze({ ...body,
    profileHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.corpusProfile, body) });
}

export const STAGE1_CORPUS_PROFILE_IDS = Object.freeze({
  SIX_SET_V1: "SIX_SET_V1",
  SEVEN_SET_NHTSA_V2: "SEVEN_SET_NHTSA_V2",
  EIGHT_SET_NHTSA_WAVE5_V3: "EIGHT_SET_NHTSA_WAVE5_V3",
});

export const STAGE1_CORPUS_PROFILES = deepFreeze({
  SIX_SET_V1: createExactCorpusProfile("SIX_SET_V1", "1.0.0", SIX_SET_SOURCES),
  SEVEN_SET_NHTSA_V2: createExactCorpusProfile("SEVEN_SET_NHTSA_V2", "2.0.0",
    [...SIX_SET_SOURCES, NHTSA_SOURCE]),
  EIGHT_SET_NHTSA_WAVE5_V3: createExactCorpusProfile(
    "EIGHT_SET_NHTSA_WAVE5_V3", "3.0.0",
    [...SIX_SET_SOURCES, NHTSA_SOURCE, WAVE5_SOURCE]),
});

export function stage1ExactCorpusProfile(profileId) {
  if (typeof profileId !== "string" || !TOKEN.test(profileId)
    || !Object.hasOwn(STAGE1_CORPUS_PROFILES, profileId)) {
    fail("CORPUS_PROFILE_UNKNOWN", String(profileId ?? "missing"));
  }
  return STAGE1_CORPUS_PROFILES[profileId];
}

export function verifyStage1ExactCorpusProfile(profile) {
  try {
    if (!exactKeys(profile, ["schema", "schemaVersion", "profileId", "profileVersion",
      "matchingRule", "expected", "profileHash"])
      || profile.schema !== STAGE1_LIFECYCLE_SCHEMAS.corpusProfile
      || profile.schemaVersion !== "1.0.0") fail("CORPUS_PROFILE_INVALID");
    const expected = stage1ExactCorpusProfile(profile.profileId);
    if (!same(profile, expected)) fail("CORPUS_PROFILE_DERIVATION_INVALID");
    return Object.freeze({ ok: true, profileId: profile.profileId,
      profileHash: profile.profileHash });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

function normalizeKeyHistory(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    fail("KEY_HISTORY_INVALID");
  }
  const seen = new Set();
  const output = value.map((entry) => {
    if (!exactKeys(entry, ["keyId", "publicKeyPem", "validFrom", "validUntil", "revokedAt"])) {
      fail("KEY_HISTORY_ENTRY_INVALID");
    }
    const publicKeyPem = normalizedPublicKey(entry.publicKeyPem);
    const keyId = stage1LifecycleKeyId(publicKeyPem);
    if (entry.keyId !== keyId || seen.has(keyId)) fail("KEY_HISTORY_ID_INVALID");
    seen.add(keyId);
    const validFrom = canonicalTime(entry.validFrom, "KEY_VALID_FROM");
    const validUntil = canonicalTime(entry.validUntil, "KEY_VALID_UNTIL");
    const revokedAt = entry.revokedAt === null ? null
      : canonicalTime(entry.revokedAt, "KEY_REVOKED_AT");
    if (Date.parse(validFrom) >= Date.parse(validUntil)
      || revokedAt !== null && Date.parse(revokedAt) < Date.parse(validFrom)) {
      fail("KEY_TIME_SCOPE_INVALID");
    }
    return { keyId, publicKeyPem, validFrom, validUntil, revokedAt };
  });
  return output.sort((left, right) => left.validFrom.localeCompare(right.validFrom)
    || left.keyId.localeCompare(right.keyId));
}

function keyAt(history, keyId, observedAt) {
  const time = Date.parse(observedAt);
  return history.find((entry) => entry.keyId === keyId
    && Date.parse(entry.validFrom) <= time && time < Date.parse(entry.validUntil)
    && (entry.revokedAt === null || time < Date.parse(entry.revokedAt))) ?? null;
}

function normalizeSourceVerifier(value) {
  if (!exactKeys(value, ["verifierId", "interfaceId", "adapterVersion",
    "allowedImplementationHashes", "maxReceiptAgeSeconds", "keyHistory"])
    || !TOKEN.test(String(value.verifierId ?? ""))
    || value.interfaceId !== STAGE1_PROVIDER_INTERFACES.sourceReplay
    || !TOKEN.test(String(value.adapterVersion ?? ""))
    || !Array.isArray(value.allowedImplementationHashes)
    || value.allowedImplementationHashes.length < 1
    || value.allowedImplementationHashes.length > 16
    || value.allowedImplementationHashes.some((hash) => !HASH.test(String(hash ?? "")))) {
    fail("SOURCE_VERIFIER_INVALID");
  }
  const allowedImplementationHashes = [...new Set(value.allowedImplementationHashes)].sort();
  if (allowedImplementationHashes.length !== value.allowedImplementationHashes.length) {
    fail("SOURCE_VERIFIER_IMPLEMENTATION_DUPLICATED");
  }
  return { verifierId: value.verifierId, interfaceId: value.interfaceId,
    adapterVersion: value.adapterVersion, allowedImplementationHashes,
    maxReceiptAgeSeconds: positiveSeconds(value.maxReceiptAgeSeconds,
      "SOURCE_RECEIPT_MAX_AGE"), keyHistory: normalizeKeyHistory(value.keyHistory) };
}

function normalizeProvider(value) {
  if (!exactKeys(value, ["providerId", "capability", "interfaceId", "adapterVersion",
    "interfaceProfileHash", "required", "maxReceiptAgeSeconds", "keyHistory"])
    || !TOKEN.test(String(value.providerId ?? ""))
    || !CAPABILITIES.has(value.capability)
    || !TOKEN.test(String(value.interfaceId ?? ""))
    || !TOKEN.test(String(value.adapterVersion ?? ""))
    || !HASH.test(String(value.interfaceProfileHash ?? ""))
    || typeof value.required !== "boolean") fail("PROVIDER_INVALID");
  return { providerId: value.providerId, capability: value.capability,
    interfaceId: value.interfaceId, adapterVersion: value.adapterVersion,
    interfaceProfileHash: value.interfaceProfileHash, required: value.required,
    maxReceiptAgeSeconds: positiveSeconds(value.maxReceiptAgeSeconds,
      "PROVIDER_RECEIPT_MAX_AGE"), keyHistory: normalizeKeyHistory(value.keyHistory) };
}

function policyBody(input) {
  if (!TOKEN.test(String(input.policyId ?? "")) || !TOKEN.test(String(input.policyVersion ?? ""))) {
    fail("POLICY_ID_INVALID");
  }
  const effectiveFrom = canonicalTime(input.effectiveFrom, "POLICY_EFFECTIVE_FROM");
  const effectiveUntil = canonicalTime(input.effectiveUntil, "POLICY_EFFECTIVE_UNTIL");
  if (Date.parse(effectiveFrom) >= Date.parse(effectiveUntil)) fail("POLICY_TIME_SCOPE_INVALID");
  if (!Array.isArray(input.sourceVerifiers) || input.sourceVerifiers.length < 1
    || input.sourceVerifiers.length > 32 || !Array.isArray(input.providers)
    || input.providers.length < 1 || input.providers.length > 64) fail("POLICY_VERIFIERS_INVALID");
  const sourceVerifiers = input.sourceVerifiers.map(normalizeSourceVerifier)
    .sort((left, right) => left.verifierId.localeCompare(right.verifierId));
  const providers = input.providers.map(normalizeProvider)
    .sort((left, right) => left.providerId.localeCompare(right.providerId)
      || left.capability.localeCompare(right.capability));
  if (new Set(sourceVerifiers.map((value) => value.verifierId)).size !== sourceVerifiers.length
    || new Set(providers.map((value) => `${value.providerId}\0${value.capability}`)).size
      !== providers.length) fail("POLICY_VERIFIER_DUPLICATED");
  const requiredCapabilities = new Set(providers.filter((provider) => provider.required)
    .map((provider) => provider.capability));
  for (const capability of CAPABILITIES) {
    if (!requiredCapabilities.has(capability)) fail("POLICY_REQUIRED_CAPABILITY_MISSING", capability);
  }
  return {
    schema: STAGE1_LIFECYCLE_SCHEMAS.policy,
    schemaVersion: "1.0.0",
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    effectiveFrom,
    effectiveUntil,
    sourceVerifiers,
    providers,
    trustBoundary: {
      configuredKeysTrustedForLocalPolicyChecks: true,
      configuredKeysEstablishInstitutionalTrust: false,
      callerLabelsAcceptedAsVerification: false,
      genericHashOnlySubmissionsAccepted: false,
      rightsEstablishedByPolicy: false,
    },
    boundary: fixedBoundary(),
  };
}

export function createStage1LifecyclePolicy(input = {}) {
  const body = policyBody(input);
  return Object.freeze({ ...body,
    policyHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.policy, body) });
}

export function verifyStage1LifecyclePolicy(policy) {
  try {
    if (!exactKeys(policy, ["schema", "schemaVersion", "policyId", "policyVersion",
      "effectiveFrom", "effectiveUntil", "sourceVerifiers", "providers", "trustBoundary",
      "boundary", "policyHash"]) || policy.schema !== STAGE1_LIFECYCLE_SCHEMAS.policy
      || policy.schemaVersion !== "1.0.0") fail("POLICY_INVALID");
    const expected = policyBody(policy);
    if (!same(policy.trustBoundary, expected.trustBoundary)
      || !same(policy.boundary, fixedBoundary())
      || policy.policyHash !== domainDigest(STAGE1_LIFECYCLE_SCHEMAS.policy, expected)
      || !same(Object.fromEntries(Object.entries(policy)
        .filter(([key]) => key !== "policyHash")), expected)) fail("POLICY_DERIVATION_INVALID");
    return { ok: true, policyHash: policy.policyHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function policyActiveAt(policy, at) {
  const time = Date.parse(at);
  return Date.parse(policy.effectiveFrom) <= time && time < Date.parse(policy.effectiveUntil);
}

export function stage1SourceVerifierImplementationHash() {
  const file = path.join(HERE, "outsider-stage05-evidence.js");
  return domainDigest("outsider/stage1/sealed-source-verifier-implementation/v1", {
    sourceVerifier: stage1LifecycleDigest(readFileSync(file)),
    profile: "verifyStage05RunDirectory/exact-sealed-artifact-replay/v1",
  });
}

function corpusRightsStatus(artifactSet) {
  return artifactSet.rightsBasis.class === "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"
    ? "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"
    : artifactSet.rightsBasis.class === "PUBLIC_DATASET_LICENSE_DECLARATIONS"
      ? "LICENSE_DECLARATIONS_RECORDED_REGISTRY_GRANTS_NO_RIGHTS"
      : "UNRECOGNIZED_OR_CONSENT_RIGHTS_CLASS";
}

function observedExactCorpusProfile(structure, claims) {
  const sourceKinds = claims.operatorSignedClaims.map(({ artifactSet }) => ({
    sourceKind: artifactSet.sourceProof.sourceKind,
    stage: artifactSet.stage,
    stream: artifactSet.stream,
    candidates: artifactSet.counts.candidates,
    sourceCompleteness: artifactSet.sourceProof.sourceCompleteness,
    verificationLevel: artifactSet.sourceProof.verificationLevel,
    instrumentId: artifactSet.instrument.instrumentId,
    instrumentVersion: artifactSet.instrument.instrumentVersion,
    datasetIds: [...artifactSet.datasetIds].sort(),
    licenseIds: [...artifactSet.licenseIds].sort(),
    rightsBasisClass: artifactSet.rightsBasis.class,
    rightsStatus: corpusRightsStatus(artifactSet),
    registryGrantsRights: artifactSet.rightsBasis.registryGrantsRights,
  })).sort((left, right) => left.sourceKind.localeCompare(right.sourceKind));
  const full = sourceKinds.filter((source) =>
    source.sourceCompleteness === "FULL_DECLARED_SOURCE_SCOPE");
  const metadata = sourceKinds.filter((source) =>
    source.sourceCompleteness === "QUARANTINED_NO_TRACE_BYTES");
  const privacy = sourceKinds.filter((source) =>
    source.sourceCompleteness === "SIGNED_PRIVACY_PROJECTION_ONLY");
  return {
    counts: {
      artifactSets: structure.counts.artifactSets,
      activeArtifactSets: structure.counts.activeArtifactSets,
      revokedArtifactSets: structure.counts.revokedArtifactSets,
      expiredArtifactSets: structure.counts.expiredArtifactSets,
      candidates: structure.counts.candidates,
      d2Groups: structure.counts.d2Groups,
    },
    sourceClassCounts: {
      fullSourceArtifactSets: full.length,
      fullSourceCandidates: full.reduce((total, source) => total + source.candidates, 0),
      metadataOnlyArtifactSets: metadata.length,
      metadataOnlyCandidates: metadata.reduce((total, source) => total + source.candidates, 0),
      privacyProjectionArtifactSets: privacy.length,
      privacyProjectionCandidates: privacy.reduce((total, source) => total + source.candidates, 0),
    },
    sourceKinds,
    rightsStatus: {
      rightsEstablished: structure.rightsEstablished,
      anyRegistryGrantsRights: sourceKinds.some((source) =>
        source.registryGrantsRights === true),
      rightsBasisClasses: [...new Set(sourceKinds.map((source) =>
        source.rightsBasisClass))].sort(),
    },
    authorityBoundary: structuredClone(structure.boundary),
  };
}

function corpusProfileBinding(profile) {
  return {
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    profileHash: profile.profileHash,
    matchingRule: profile.matchingRule,
  };
}

/**
 * Reverify a durable Stage 1/CURATE directory without silently treating the
 * registry's operator-signed source claims as source replay. This is the
 * ordinary-verify half of the compatibility boundary.
 */
export function verifyStage1CorpusRegistryLifecycleStructure({ directory,
  now = new Date() } = {}) {
  try {
    const checkedAt = canonicalTime(now, "CORPUS_STRUCTURE_CHECKED_AT");
    if (typeof directory !== "string" || directory.length === 0) {
      fail("CORPUS_DIRECTORY_REQUIRED");
    }
    const root = path.resolve(directory);
    if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()
      || ["config.json", "events.jsonl", "index.json", "artifact-sets"]
        .some((name) => !existsSync(path.join(root, name)))) {
      fail("CORPUS_DIRECTORY_INCOMPLETE");
    }
    const registry = new DurableStage1CurateCorpusRegistry({ directory: root });
    const verified = registry.verify({ now: checkedAt });
    if (!verified.ok) fail("CORPUS_STRUCTURE_INVALID", verified.error);
    const snapshot = registry.operatorSignedClaimSnapshot({ now: checkedAt });
    if (!snapshot.ok) fail("CORPUS_CLAIM_SNAPSHOT_INVALID", snapshot.error);
    const body = {
      schema: STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot,
      schemaVersion: "1.0.0",
      ok: true,
      mode: "ORDINARY_REGISTRY_VERIFY",
      checkedAt,
      registryId: snapshot.registryId,
      registryIndexHash: snapshot.registryIndexHash,
      eventLogHead: verified.head,
      appendOnlyLogVerified: verified.appendOnlyLogVerified === true,
      artifactSetSignaturesVerified: verified.artifactSetSignaturesVerified === true,
      externalTimestampReceiptsReverified:
        verified.externalTimestampReceiptsReverified === true,
      counts: structuredClone(snapshot.counts),
      sourceArtifactsReverified: false,
      sourceReplayStatus: "NOT_PERFORMED_BY_ORDINARY_REGISTRY_VERIFY",
      operatorSignedSourceClaimsTrustedAsSourceReplay: false,
      rightsEstablished: false,
      institutionalTrustEstablished: false,
      boundary: fixedBoundary(),
    };
    return Object.freeze({ ...body,
      snapshotHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot, body) });
  } catch (error) {
    return Object.freeze({ schema: STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot,
      schemaVersion: "1.0.0", mode: "ORDINARY_REGISTRY_VERIFY", ok: false,
      sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: fixedBoundary() });
  }
}

/**
 * Independently invoke the registered full-source and metadata-only replay
 * adapters and bind their results to the exact ordinary registry snapshot.
 * No caller-supplied `sourceReplay: true` flag or precomputed hash is accepted.
 */
export async function replayStage1CorpusRegistryLifecycleSources({ directory,
  agentArtifactDirectory, wave2SourceRoot, roboticsSourceRoot,
  droidArtifactDirectory, droidSourceRoot, wave4SourceRoot,
  wave3SourceRoot = null, nhtsaCsvPath = null,
  nhtsaDataDictionaryPath = null, wave5SourceRoot = null, expectedProfile,
  now = new Date() } = {}) {
  let profile = null;
  try {
    profile = stage1ExactCorpusProfile(expectedProfile);
    const checkedAt = canonicalTime(now, "CORPUS_SOURCE_REPLAY_CHECKED_AT");
    const structure = verifyStage1CorpusRegistryLifecycleStructure({ directory, now: checkedAt });
    if (structure.ok === false) fail("CORPUS_STRUCTURE_INVALID", structure.error);
    const registry = new DurableStage1CurateCorpusRegistry({ directory });
    const claims = registry.operatorSignedClaimSnapshot({ now: checkedAt });
    if (!claims.ok) fail("CORPUS_CLAIM_SNAPSHOT_INVALID", claims.error);
    const observedProfile = observedExactCorpusProfile(structure, claims);
    if (!same(observedProfile, profile.expected)) {
      fail("CORPUS_PROFILE_MISMATCH", profile.profileId);
    }
    const metadataClaims = claims.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceCompleteness === "QUARANTINED_NO_TRACE_BYTES");
    const privacyProjectionClaims = claims.operatorSignedClaims.filter(({ artifactSet }) =>
      artifactSet.sourceProof.sourceCompleteness === "SIGNED_PRIVACY_PROJECTION_ONLY");
    const full = await verifyKnownPublicCorpusRegistrySources({ directory,
      agentArtifactDirectory, wave2SourceRoot, roboticsSourceRoot,
      droidArtifactDirectory, droidSourceRoot, wave4SourceRoot,
      nhtsaCsvPath, nhtsaDataDictionaryPath, wave5SourceRoot, now: checkedAt });
    if (!full.ok || full.registryIndexHash !== structure.registryIndexHash) {
      fail("CORPUS_FULL_SOURCE_REPLAY_INVALID", full.error ?? "index binding mismatch");
    }
    let metadata = null;
    if (metadataClaims.length > 0) {
      if (metadataClaims.length !== 1 || typeof wave3SourceRoot !== "string"
        || wave3SourceRoot.length === 0) fail("CORPUS_METADATA_SOURCE_REPLAY_REQUIRED");
      metadata = verifyPublicAgentWave3MetadataCorpusRegistrySource({ directory,
        sourceRoot: wave3SourceRoot, now: checkedAt });
      if (!metadata.ok || metadata.registryIndexHash !== structure.registryIndexHash) {
        fail("CORPUS_METADATA_SOURCE_REPLAY_INVALID",
          metadata.error ?? "index binding mismatch");
      }
    }
    const allSourceClaimsReverified = privacyProjectionClaims.length === 0
      && full.fullSourceArtifactSetsReverified
        === claims.counts.operatorSignedFullSourceClaims
      && (metadataClaims.length === 0 || metadata?.sourceArtifactsReverified === true);
    const expectedPartition = profile.expected.sourceClassCounts;
    const replayedSourceKinds = [...full.artifacts.map((artifact) => artifact.sourceKind),
      ...(metadata ? [metadata.sourceKind] : [])].sort();
    const expectedSourceKinds = profile.expected.sourceKinds
      .map((source) => source.sourceKind).sort();
    if (!allSourceClaimsReverified
      || full.fullSourceArtifactSetsReverified !== expectedPartition.fullSourceArtifactSets
      || full.fullSourceCandidatesReverified !== expectedPartition.fullSourceCandidates
      || (metadata === null ? 0 : 1) !== expectedPartition.metadataOnlyArtifactSets
      || (metadata?.candidates ?? 0) !== expectedPartition.metadataOnlyCandidates
      || privacyProjectionClaims.length !== expectedPartition.privacyProjectionArtifactSets
      || !same(replayedSourceKinds, expectedSourceKinds)) {
      fail("CORPUS_PROFILE_REPLAY_PARTITION_MISMATCH", profile.profileId);
    }
    const replayBindings = [full.verificationHash,
      ...(metadata ? [metadata.verificationHash] : [])].sort();
    const sourceSubject = {
      ...corpusProfileBinding(profile),
      profileExact: true,
      registryId: structure.registryId,
      registryIndexHash: structure.registryIndexHash,
      eventLogHead: structure.eventLogHead,
      ordinarySnapshotHash: structure.snapshotHash,
      replayVerificationHashes: replayBindings,
      fullSourceArtifactSetsReverified: full.fullSourceArtifactSetsReverified,
      fullSourceCandidatesReverified: full.fullSourceCandidatesReverified,
      metadataOnlyArtifactSetsReverified: metadata === null ? 0 : 1,
      metadataOnlyCandidatesReverified: metadata?.candidates ?? 0,
      privacyProjectionArtifactSetsReverified: 0,
    };
    const body = {
      schema: STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot,
      schemaVersion: "1.0.0",
      ok: true,
      mode: "DIRECT_KNOWN_SOURCE_REPLAY",
      checkedAt,
      registryId: structure.registryId,
      registryIndexHash: structure.registryIndexHash,
      eventLogHead: structure.eventLogHead,
      corpusProfile: corpusProfileBinding(profile),
      profileId: profile.profileId,
      profileHash: profile.profileHash,
      profileExact: true,
      ordinaryRegistryVerification: structure,
      fullSourceReplay: full,
      metadataOnlyReplay: metadata,
      privacyProjectionClaims: privacyProjectionClaims.length,
      allSourceClaimsReverified,
      sourceArtifactsReverified: allSourceClaimsReverified,
      sourceReplayStatus: "EXACT_CORPUS_PROFILE_ALL_SOURCES_REPLAYED",
      sourceSubject,
      sourceCommitment: domainDigest(
        "outsider/stage1/lifecycle-corpus-source-commitment/v1", sourceSubject),
      rightsEstablished: false,
      institutionalTrustEstablished: false,
      boundary: fixedBoundary(),
    };
    return Object.freeze({ ...body,
      snapshotHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot, body) });
  } catch (error) {
    return Object.freeze({ schema: STAGE1_LIFECYCLE_SCHEMAS.corpusSnapshot,
      schemaVersion: "1.0.0", mode: "DIRECT_KNOWN_SOURCE_REPLAY", ok: false,
      sourceArtifactsReverified: false, allSourceClaimsReverified: false,
      profileId: profile?.profileId ?? (typeof expectedProfile === "string"
        && expectedProfile.length <= 128 ? expectedProfile : null),
      profileHash: profile?.profileHash ?? null,
      profileExact: false,
      error: error instanceof Error ? error.message : String(error),
      boundary: fixedBoundary() });
  }
}

function sourceSubjectFromVerified(verified) {
  const { binding, manifest, projection, publicEvidence } = verified;
  const subject = {
    sourceRunId: manifest.sourceRunId,
    contractSeal: binding.contractRef.contractSeal,
    bindingHash: binding.bindingHash,
    manifestHash: manifest.manifestHash,
    projectionHash: projection.projectionHash,
    publicEvidenceHash: publicEvidence.publicEvidenceHash,
    rawEvidenceRoot: manifest.rawLocalRoot.merkleRoot,
    publicDerivativeRoot: manifest.publicDerivativeRoot.merkleRoot,
    eventChainHash: manifest.eventChain.chainHash,
    terminalClass: manifest.terminal.terminalClass,
  };
  return { subject, sourceCommitment: domainDigest(
    "outsider/stage1/exact-sealed-stage05-source/v1", subject) };
}

function normalizeSourceSubject(subject) {
  if (!exactKeys(subject, ["sourceRunId", "contractSeal", "bindingHash", "manifestHash",
    "projectionHash", "publicEvidenceHash", "rawEvidenceRoot", "publicDerivativeRoot",
    "eventChainHash", "terminalClass"])
    || !TOKEN.test(String(subject.sourceRunId ?? ""))
    || !["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED",
      "CONTROL_BOUNDARY_CONTAINMENT", "CONSERVATIVE_STOP", "UNFINALIZED"]
      .includes(subject.terminalClass)
    || ["contractSeal", "bindingHash", "manifestHash", "projectionHash",
      "publicEvidenceHash", "rawEvidenceRoot", "publicDerivativeRoot", "eventChainHash"]
      .some((field) => !HASH.test(String(subject[field] ?? "")))) {
    fail("SOURCE_SUBJECT_INVALID");
  }
  return structuredClone(subject);
}

export function replaySealedStage05Source(directory) {
  const verified = verifyStage05RunDirectory(directory);
  if (!verified.ok) fail("SEALED_SOURCE_REPLAY_INVALID", verified.error);
  return { ok: true, method: "DIRECT_EXACT_SEALED_STAGE05_REPLAY",
    verifierImplementationHash: stage1SourceVerifierImplementationHash(),
    ...sourceSubjectFromVerified(verified) };
}

function sourceReceiptBody(input) {
  if (!TOKEN.test(String(input.verifierId ?? ""))
    || input.interfaceId !== STAGE1_PROVIDER_INTERFACES.sourceReplay
    || !TOKEN.test(String(input.adapterVersion ?? ""))
    || !HASH.test(String(input.policyHash ?? ""))
    || !HASH.test(String(input.verifierImplementationHash ?? ""))
    || !HASH.test(String(input.sourceCommitment ?? ""))
    || !Number.isSafeInteger(input.sequence) || input.sequence < 1
    || !HASH.test(String(input.previousReceiptHash ?? ""))) fail("SOURCE_RECEIPT_BODY_INVALID");
  const verifiedAt = canonicalTime(input.verifiedAt, "SOURCE_VERIFIED_AT");
  const validUntil = canonicalTime(input.validUntil, "SOURCE_VALID_UNTIL");
  const subject = normalizeSourceSubject(input.subject);
  if (Date.parse(verifiedAt) >= Date.parse(validUntil)
    || input.sourceCommitment !== domainDigest(
      "outsider/stage1/exact-sealed-stage05-source/v1", subject)) {
    fail("SOURCE_RECEIPT_BINDING_INVALID");
  }
  return {
    schema: STAGE1_LIFECYCLE_SCHEMAS.sourceReceipt,
    schemaVersion: "1.0.0",
    verifierId: input.verifierId,
    interfaceId: input.interfaceId,
    adapterVersion: input.adapterVersion,
    policyHash: input.policyHash,
    verifierImplementationHash: input.verifierImplementationHash,
    subject,
    sourceCommitment: input.sourceCommitment,
    verifiedAt,
    validUntil,
    sequence: input.sequence,
    previousReceiptHash: input.previousReceiptHash,
    verificationClaim: "ORIGINAL_SEALED_STAGE05_ARTIFACTS_EXACTLY_REPLAYED",
    authorityClaim: "LOCAL_VERIFIER_RECEIPT_NO_INSTITUTIONAL_STANDING",
  };
}

export function createStage1SourceVerifierReceipt({ directory, policy, verifierId,
  privateKeyPem, verifiedAt = new Date(), validUntil, sequence = 1,
  previousReceiptHash = SOURCE_GENESIS } = {}) {
  const policyCheck = verifyStage1LifecyclePolicy(policy);
  if (!policyCheck.ok) fail("SOURCE_RECEIPT_POLICY_INVALID", policyCheck.error);
  const at = canonicalTime(verifiedAt, "SOURCE_VERIFIED_AT");
  if (!policyActiveAt(policy, at)) fail("SOURCE_RECEIPT_POLICY_INACTIVE");
  const verifier = policy.sourceVerifiers.find((entry) => entry.verifierId === verifierId);
  if (!verifier) fail("SOURCE_VERIFIER_NOT_REGISTERED");
  const identity = privateKeyIdentity(privateKeyPem);
  if (!keyAt(verifier.keyHistory, identity.keyId, at)) fail("SOURCE_VERIFIER_KEY_OUT_OF_SCOPE");
  const replay = replaySealedStage05Source(directory);
  if (!verifier.allowedImplementationHashes.includes(replay.verifierImplementationHash)) {
    fail("SOURCE_VERIFIER_IMPLEMENTATION_NOT_ALLOWED");
  }
  const defaultUntil = new Date(Date.parse(at)
    + verifier.maxReceiptAgeSeconds * 1_000).toISOString();
  const body = sourceReceiptBody({ verifierId, interfaceId: verifier.interfaceId,
    adapterVersion: verifier.adapterVersion, policyHash: policy.policyHash,
    verifierImplementationHash: replay.verifierImplementationHash,
    subject: replay.subject, sourceCommitment: replay.sourceCommitment,
    verifiedAt: at, validUntil: validUntil ?? defaultUntil, sequence, previousReceiptHash });
  const receiptHash = domainDigest(STAGE1_LIFECYCLE_SCHEMAS.sourceReceipt, body);
  return Object.freeze({ ...body, receiptHash, signature: signatureFor(receiptHash, privateKeyPem) });
}

export function verifyStage1SourceVerifierReceipt(receipt, { policy, now = new Date(),
  watermark = null } = {}) {
  let cryptographicallyValid = false;
  let trustedByConfiguredPolicy = false;
  try {
    const policyCheck = verifyStage1LifecyclePolicy(policy);
    if (!policyCheck.ok) fail("SOURCE_RECEIPT_POLICY_INVALID", policyCheck.error);
    const checkedAt = canonicalTime(now, "SOURCE_RECEIPT_CHECKED_AT");
    if (!exactKeys(receipt, ["schema", "schemaVersion", "verifierId", "interfaceId",
      "adapterVersion", "policyHash", "verifierImplementationHash", "subject",
      "sourceCommitment", "verifiedAt", "validUntil", "sequence", "previousReceiptHash",
      "verificationClaim", "authorityClaim", "receiptHash", "signature"])
      || receipt.schema !== STAGE1_LIFECYCLE_SCHEMAS.sourceReceipt
      || receipt.schemaVersion !== "1.0.0" || receipt.policyHash !== policy.policyHash) {
      fail("SOURCE_RECEIPT_INVALID");
    }
    const verifier = policy.sourceVerifiers.find((entry) => entry.verifierId === receipt.verifierId
      && entry.interfaceId === receipt.interfaceId
      && entry.adapterVersion === receipt.adapterVersion);
    if (!verifier || !verifier.allowedImplementationHashes
      .includes(receipt.verifierImplementationHash)) fail("SOURCE_VERIFIER_NOT_REGISTERED");
    const body = sourceReceiptBody(receipt);
    const receiptHash = domainDigest(STAGE1_LIFECYCLE_SCHEMAS.sourceReceipt, body);
    const listedKey = verifier.keyHistory.find((entry) =>
      entry.keyId === receipt.signature?.keyId) ?? null;
    if (receipt.receiptHash !== receiptHash || !listedKey
      || !verifySignature(receiptHash, receipt.signature,
        listedKey.publicKeyPem, listedKey.keyId)) {
      fail("SOURCE_RECEIPT_SIGNATURE_INVALID");
    }
    cryptographicallyValid = true;
    const key = keyAt(verifier.keyHistory, receipt.signature.keyId, receipt.verifiedAt);
    if (!key || !policyActiveAt(policy, receipt.verifiedAt)) {
      fail("SOURCE_VERIFIER_KEY_OR_POLICY_OUT_OF_SCOPE");
    }
    trustedByConfiguredPolicy = true;
    if (Date.parse(receipt.verifiedAt) > Date.parse(checkedAt)
      || Date.parse(receipt.validUntil) <= Date.parse(checkedAt)
      || Date.parse(checkedAt) - Date.parse(receipt.verifiedAt)
        > verifier.maxReceiptAgeSeconds * 1_000) fail("SOURCE_RECEIPT_STALE");
    if (watermark === null) {
      if (receipt.sequence !== 1 || receipt.previousReceiptHash !== SOURCE_GENESIS) {
        fail("SOURCE_RECEIPT_STREAM_NOT_AT_GENESIS");
      }
    } else if (receipt.sequence !== watermark.sequence + 1
      || receipt.previousReceiptHash !== watermark.receiptHash
      || Date.parse(receipt.verifiedAt) < Date.parse(watermark.verifiedAt)) {
      fail("SOURCE_RECEIPT_REPLAY_OR_ROLLBACK");
    }
    return { ok: true, cryptographicallyValid: true, trustedByConfiguredPolicy: true,
      institutionallyTrusted: false, fresh: true, checkedAt, receiptHash,
      signerKeyId: key.keyId, verifierId: receipt.verifierId,
      subject: receipt.subject, sourceCommitment: receipt.sourceCommitment,
      sequence: receipt.sequence, previousReceiptHash: receipt.previousReceiptHash,
      verifiedAt: receipt.verifiedAt, validUntil: receipt.validUntil };
  } catch (error) {
    return { ok: false, cryptographicallyValid, trustedByConfiguredPolicy,
      institutionallyTrusted: false, fresh: false,
      error: error instanceof Error ? error.message : String(error) };
  }
}

function interfaceProfile(interfaceId, adapterVersion, capability, payloadSchema,
  verifyPayload) {
  const verifierImplementationHash = domainDigest(
    "outsider/stage1/provider-interface-verifier-implementation/v1",
    Function.prototype.toString.call(verifyPayload));
  return { interfaceId, adapterVersion, capability, payloadSchema,
    verifierImplementationHash,
    profileHash: domainDigest("outsider/stage1/provider-interface-profile/v1",
      { interfaceId, adapterVersion, capability, payloadSchema,
        verifierImplementationHash }) };
}

function payloadTimestamp(payload, context) {
  if (!exactKeys(payload, ["timestamp", "logRootHash"])
    || !HASH.test(String(payload.logRootHash ?? ""))) fail("TIMESTAMP_PAYLOAD_INVALID");
  const timestamp = canonicalTime(payload.timestamp, "PROVIDER_TIMESTAMP");
  if (Date.parse(timestamp) < Date.parse(context.challenge.issuedAt)
    || Date.parse(timestamp) > Date.parse(context.receipt.observedAt)) {
    fail("TIMESTAMP_PAYLOAD_OUT_OF_CHALLENGE_SCOPE");
  }
  return { timestamp, logRootHash: payload.logRootHash };
}

function payloadMembership(payload, context) {
  if (!exactKeys(payload, ["memberSubjectHash", "status", "membershipEpoch", "scopeHash"])
    || payload.memberSubjectHash !== context.receipt.subjectHash
    || !["ACTIVE", "INACTIVE", "UNKNOWN"].includes(payload.status)
    || !Number.isSafeInteger(payload.membershipEpoch) || payload.membershipEpoch < 0
    || !HASH.test(String(payload.scopeHash ?? ""))) fail("MEMBERSHIP_PAYLOAD_INVALID");
  return structuredClone(payload);
}

function payloadRevocation(payload, context) {
  if (!exactKeys(payload, ["status", "effectiveAt", "reasonCode", "registryEpoch"])
    || !["NOT_REVOKED", "REVOKED", "UNKNOWN"].includes(payload.status)
    || !Number.isSafeInteger(payload.registryEpoch) || payload.registryEpoch < 0) {
    fail("REVOCATION_PAYLOAD_INVALID");
  }
  if (payload.status === "REVOKED") {
    const effectiveAt = canonicalTime(payload.effectiveAt, "REVOCATION_EFFECTIVE_AT");
    if (!TOKEN.test(String(payload.reasonCode ?? ""))
      || Date.parse(effectiveAt) > Date.parse(context.receipt.observedAt)) {
      fail("REVOCATION_PAYLOAD_TIME_INVALID");
    }
    return { ...payload, effectiveAt };
  }
  if (payload.effectiveAt !== null || payload.reasonCode !== null) {
    fail("REVOCATION_PAYLOAD_STATUS_MISMATCH");
  }
  return structuredClone(payload);
}

function payloadRetention(payload, context) {
  if (!exactKeys(payload, ["status", "retainUntil", "policyReferenceHash"])
    || !["ACTIVE", "EXPIRED", "UNKNOWN"].includes(payload.status)
    || !HASH.test(String(payload.policyReferenceHash ?? ""))) fail("RETENTION_PAYLOAD_INVALID");
  if (payload.status === "UNKNOWN") {
    if (payload.retainUntil !== null) fail("RETENTION_PAYLOAD_STATUS_MISMATCH");
    return structuredClone(payload);
  }
  const retainUntil = canonicalTime(payload.retainUntil, "RETAIN_UNTIL");
  if (payload.status === "ACTIVE" && Date.parse(retainUntil) <= Date.parse(context.checkedAt)
    || payload.status === "EXPIRED" && Date.parse(retainUntil) > Date.parse(context.checkedAt)) {
    fail("RETENTION_PAYLOAD_TIME_MISMATCH");
  }
  return { ...payload, retainUntil };
}

export class Stage1ProviderVerifierRegistry {
  #adapters;

  constructor() { this.#adapters = new Map(); }

  register({ interfaceId, adapterVersion, capability, payloadSchema, verifyPayload }) {
    if (!TOKEN.test(String(interfaceId ?? "")) || !TOKEN.test(String(adapterVersion ?? ""))
      || !CAPABILITIES.has(capability) || !TOKEN.test(String(payloadSchema ?? ""))
      || typeof verifyPayload !== "function") fail("INTERFACE_REGISTRATION_INVALID");
    const key = `${interfaceId}\0${adapterVersion}`;
    if (this.#adapters.has(key)) fail("INTERFACE_ALREADY_REGISTERED");
    const profile = interfaceProfile(interfaceId, adapterVersion, capability,
      payloadSchema, verifyPayload);
    this.#adapters.set(key, { ...profile, verifyPayload });
    return profile;
  }

  describe(interfaceId, adapterVersion) {
    const adapter = this.#adapters.get(`${interfaceId}\0${adapterVersion}`);
    if (!adapter) return null;
    const { verifyPayload: ignored, ...profile } = adapter;
    return structuredClone(profile);
  }

  verify(receipt, context) {
    const adapter = this.#adapters.get(`${receipt.interfaceId}\0${receipt.adapterVersion}`);
    if (!adapter || adapter.capability !== receipt.capability) {
      fail("PROVIDER_INTERFACE_UNREGISTERED");
    }
    return { profile: this.describe(receipt.interfaceId, receipt.adapterVersion),
      payload: adapter.verifyPayload(receipt.payload, context) };
  }
}

export function createDefaultStage1ProviderVerifierRegistry() {
  const registry = new Stage1ProviderVerifierRegistry();
  registry.register({ interfaceId: STAGE1_PROVIDER_INTERFACES.timestamp,
    adapterVersion: "1.0.0", capability: "TIMESTAMP", payloadSchema: "timestamp+log-root/v1",
    verifyPayload: payloadTimestamp });
  registry.register({ interfaceId: STAGE1_PROVIDER_INTERFACES.membership,
    adapterVersion: "1.0.0", capability: "MEMBERSHIP",
    payloadSchema: "subject-membership-epoch/v1", verifyPayload: payloadMembership });
  registry.register({ interfaceId: STAGE1_PROVIDER_INTERFACES.revocation,
    adapterVersion: "1.0.0", capability: "REVOCATION",
    payloadSchema: "subject-revocation-epoch/v1", verifyPayload: payloadRevocation });
  registry.register({ interfaceId: STAGE1_PROVIDER_INTERFACES.retention,
    adapterVersion: "1.0.0", capability: "RETENTION",
    payloadSchema: "subject-retention-policy/v1", verifyPayload: payloadRetention });
  return registry;
}

function providerReceiptBody(input) {
  if (!TOKEN.test(String(input.providerId ?? "")) || !CAPABILITIES.has(input.capability)
    || !TOKEN.test(String(input.interfaceId ?? ""))
    || !TOKEN.test(String(input.adapterVersion ?? ""))
    || !HASH.test(String(input.interfaceProfileHash ?? ""))
    || !HASH.test(String(input.policyHash ?? "")) || !HASH.test(String(input.subjectHash ?? ""))
    || !HASH.test(String(input.challengeHash ?? "")) || !HASH.test(String(input.pollId ?? ""))
    || !Number.isSafeInteger(input.sequence) || input.sequence < 1
    || !HASH.test(String(input.previousReceiptHash ?? ""))) fail("PROVIDER_RECEIPT_BODY_INVALID");
  const observedAt = canonicalTime(input.observedAt, "PROVIDER_OBSERVED_AT");
  const validUntil = canonicalTime(input.validUntil, "PROVIDER_VALID_UNTIL");
  if (Date.parse(observedAt) >= Date.parse(validUntil)) fail("PROVIDER_RECEIPT_TIME_INVALID");
  return {
    schema: STAGE1_LIFECYCLE_SCHEMAS.providerReceipt,
    schemaVersion: "1.0.0",
    providerId: input.providerId,
    capability: input.capability,
    interfaceId: input.interfaceId,
    adapterVersion: input.adapterVersion,
    interfaceProfileHash: input.interfaceProfileHash,
    policyHash: input.policyHash,
    subjectHash: input.subjectHash,
    challengeHash: input.challengeHash,
    pollId: input.pollId,
    sequence: input.sequence,
    previousReceiptHash: input.previousReceiptHash,
    observedAt,
    validUntil,
    payload: structuredClone(input.payload),
  };
}

export function createSignedStage1ProviderReceipt({ policy, registry, providerId, capability,
  challenge, privateKeyPem, sequence = 1, previousReceiptHash = PROVIDER_GENESIS,
  pollId = null, observedAt = new Date(), validUntil, payload } = {}) {
  const policyCheck = verifyStage1LifecyclePolicy(policy);
  if (!policyCheck.ok || !(registry instanceof Stage1ProviderVerifierRegistry)) {
    fail("PROVIDER_RECEIPT_ARGUMENT_INVALID");
  }
  const provider = policy.providers.find((entry) => entry.providerId === providerId
    && entry.capability === capability);
  if (!provider) fail("PROVIDER_NOT_REGISTERED");
  const profile = registry.describe(provider.interfaceId, provider.adapterVersion);
  if (!profile || profile.profileHash !== provider.interfaceProfileHash
    || profile.capability !== capability) fail("PROVIDER_INTERFACE_POLICY_MISMATCH");
  const at = canonicalTime(observedAt, "PROVIDER_OBSERVED_AT");
  const identity = privateKeyIdentity(privateKeyPem);
  if (!keyAt(provider.keyHistory, identity.keyId, at)) fail("PROVIDER_KEY_OUT_OF_SCOPE");
  const defaultUntil = new Date(Date.parse(at)
    + provider.maxReceiptAgeSeconds * 1_000).toISOString();
  const body = providerReceiptBody({ providerId, capability,
    interfaceId: provider.interfaceId, adapterVersion: provider.adapterVersion,
    interfaceProfileHash: profile.profileHash, policyHash: policy.policyHash,
    subjectHash: challenge.subjectHash, challengeHash: challenge.challengeHash,
    pollId: pollId ?? domainDigest("outsider/stage1/provider-poll-id/v1",
      stage1LifecycleDigest(randomBytes(32))),
    sequence, previousReceiptHash, observedAt: at, validUntil: validUntil ?? defaultUntil,
    payload });
  registry.verify(body, { receipt: body, challenge, checkedAt: at });
  const receiptHash = domainDigest(STAGE1_LIFECYCLE_SCHEMAS.providerReceipt, body);
  return Object.freeze({ ...body, receiptHash, signature: signatureFor(receiptHash, privateKeyPem) });
}

function verifyProviderReceipt(receipt, { policy, registry, state, challenge, checkedAt }) {
  if (!exactKeys(receipt, ["schema", "schemaVersion", "providerId", "capability",
    "interfaceId", "adapterVersion", "interfaceProfileHash", "policyHash", "subjectHash",
    "challengeHash", "pollId", "sequence", "previousReceiptHash", "observedAt", "validUntil",
    "payload", "receiptHash", "signature"]) || receipt.schema !== STAGE1_LIFECYCLE_SCHEMAS.providerReceipt
    || receipt.schemaVersion !== "1.0.0") fail("PROVIDER_RECEIPT_INVALID");
  const provider = policy.providers.find((entry) => entry.providerId === receipt.providerId
    && entry.capability === receipt.capability);
  if (!provider || provider.interfaceId !== receipt.interfaceId
    || provider.adapterVersion !== receipt.adapterVersion
    || provider.interfaceProfileHash !== receipt.interfaceProfileHash) {
    fail("PROVIDER_NOT_REGISTERED");
  }
  if (receipt.policyHash !== policy.policyHash || receipt.subjectHash !== challenge.subjectHash
    || receipt.challengeHash !== challenge.challengeHash) fail("PROVIDER_RECEIPT_BINDING_INVALID");
  const body = providerReceiptBody(receipt);
  const receiptHash = domainDigest(STAGE1_LIFECYCLE_SCHEMAS.providerReceipt, body);
  const key = keyAt(provider.keyHistory, receipt.signature?.keyId, receipt.observedAt);
  if (receipt.receiptHash !== receiptHash || !key
    || !verifySignature(receiptHash, receipt.signature, key.publicKeyPem, key.keyId)) {
    fail("PROVIDER_RECEIPT_SIGNATURE_INVALID");
  }
  if (!policyActiveAt(policy, receipt.observedAt)
    || Date.parse(receipt.observedAt) < Date.parse(challenge.issuedAt)
    || Date.parse(receipt.observedAt) > Date.parse(checkedAt)
    || Date.parse(receipt.validUntil) <= Date.parse(checkedAt)
    || Date.parse(checkedAt) - Date.parse(receipt.observedAt)
      > provider.maxReceiptAgeSeconds * 1_000) fail("PROVIDER_RECEIPT_STALE");
  const stream = `${provider.providerId}\0${provider.capability}`;
  const watermark = state.providerWatermarks[stream] ?? null;
  if (watermark === null) {
    if (receipt.sequence !== 1 || receipt.previousReceiptHash !== PROVIDER_GENESIS) {
      fail("PROVIDER_STREAM_NOT_AT_GENESIS");
    }
  } else if (receipt.sequence !== watermark.sequence + 1
    || receipt.previousReceiptHash !== watermark.receiptHash
    || Date.parse(receipt.observedAt) < Date.parse(watermark.observedAt)) {
    fail("PROVIDER_RECEIPT_REPLAY_OR_ROLLBACK");
  }
  const adapter = registry.verify(receipt, { receipt, challenge, checkedAt });
  if (adapter.profile.profileHash !== provider.interfaceProfileHash) {
    fail("PROVIDER_INTERFACE_PROFILE_MISMATCH");
  }
  return { ok: true, providerId: provider.providerId, capability: provider.capability,
    required: provider.required, cryptographicallyValid: true,
    trustedByConfiguredPolicy: true, institutionallyTrusted: false, fresh: true,
    receiptHash, pollId: receipt.pollId, sequence: receipt.sequence,
    previousReceiptHash: receipt.previousReceiptHash, observedAt: receipt.observedAt,
    validUntil: receipt.validUntil, signerKeyId: key.keyId, stream,
    payload: adapter.payload };
}

function stateBody(input) {
  return {
    schema: STAGE1_LIFECYCLE_SCHEMAS.state,
    schemaVersion: "1.0.0",
    frontierId: input.frontierId,
    policyHash: input.policyHash,
    createdAt: input.createdAt,
    sequence: input.sequence,
    headHash: input.headHash,
    subjectHash: input.subjectHash,
    lastCommittedAt: input.lastCommittedAt,
    sourceReceiptWatermark: input.sourceReceiptWatermark,
    providerWatermarks: input.providerWatermarks,
    seenReceiptHashes: input.seenReceiptHashes,
    seenPollIds: input.seenPollIds,
    evaluationHashes: input.evaluationHashes,
    permanentlyRevokedAt: input.permanentlyRevokedAt,
    lastDisposition: input.lastDisposition,
    boundary: fixedBoundary(),
  };
}

function sealState(body) {
  return Object.freeze({ ...body,
    stateHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.state, body) });
}

function validateSourceWatermark(value) {
  if (value === null) return;
  if (!exactKeys(value, ["verifierId", "receiptHash", "sequence", "previousReceiptHash",
    "verifiedAt", "signerKeyId"])
    || !TOKEN.test(String(value.verifierId ?? ""))
    || !HASH.test(String(value.receiptHash ?? ""))
    || !HASH.test(String(value.previousReceiptHash ?? ""))
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !KEY_ID.test(String(value.signerKeyId ?? ""))) fail("SOURCE_WATERMARK_INVALID");
  canonicalTime(value.verifiedAt, "SOURCE_WATERMARK_TIME");
}

function validateProviderWatermarks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length > 64) fail("PROVIDER_WATERMARKS_INVALID");
  for (const [stream, watermark] of Object.entries(value)) {
    if (!exactKeys(watermark, ["stream", "providerId", "capability", "receiptHash", "pollId",
      "sequence", "previousReceiptHash", "observedAt", "signerKeyId",
      "revocationEffectiveAt"])
      || watermark.stream !== stream
      || stream !== `${watermark.providerId}\0${watermark.capability}`
      || !TOKEN.test(String(watermark.providerId ?? ""))
      || !CAPABILITIES.has(watermark.capability)
      || !HASH.test(String(watermark.receiptHash ?? ""))
      || !HASH.test(String(watermark.pollId ?? ""))
      || !HASH.test(String(watermark.previousReceiptHash ?? ""))
      || !Number.isSafeInteger(watermark.sequence) || watermark.sequence < 1
      || !KEY_ID.test(String(watermark.signerKeyId ?? ""))) {
      fail("PROVIDER_WATERMARK_INVALID", stream);
    }
    canonicalTime(watermark.observedAt, "PROVIDER_WATERMARK_TIME");
    if (watermark.revocationEffectiveAt !== null) {
      if (watermark.capability !== "REVOCATION") fail("PROVIDER_WATERMARK_REVOCATION_INVALID");
      canonicalTime(watermark.revocationEffectiveAt,
        "PROVIDER_WATERMARK_REVOCATION_TIME");
    }
  }
}

export function createStage1LifecycleState({ frontierId = "outsider-stage1-lifecycle",
  policy, createdAt = new Date() } = {}) {
  const checked = verifyStage1LifecyclePolicy(policy);
  if (!checked.ok || !TOKEN.test(String(frontierId ?? ""))) fail("STATE_ARGUMENT_INVALID");
  const at = canonicalTime(createdAt, "STATE_CREATED_AT");
  if (!policyActiveAt(policy, at)) fail("STATE_POLICY_INACTIVE");
  return sealState(stateBody({ frontierId, policyHash: policy.policyHash, createdAt: at,
    sequence: 0, headHash: STATE_GENESIS, subjectHash: null, lastCommittedAt: at,
    sourceReceiptWatermark: null, providerWatermarks: {}, seenReceiptHashes: [],
    seenPollIds: [], evaluationHashes: [], permanentlyRevokedAt: null,
    lastDisposition: "NO_LIFECYCLE_POLL_COMMITTED" }));
}

export function verifyStage1LifecycleState(state, { policy } = {}) {
  try {
    const checked = verifyStage1LifecyclePolicy(policy);
    if (!checked.ok || !exactKeys(state, ["schema", "schemaVersion", "frontierId",
      "policyHash", "createdAt", "sequence", "headHash", "subjectHash", "lastCommittedAt",
      "sourceReceiptWatermark", "providerWatermarks", "seenReceiptHashes", "seenPollIds",
      "evaluationHashes", "permanentlyRevokedAt", "lastDisposition", "boundary", "stateHash"])
      || state.schema !== STAGE1_LIFECYCLE_SCHEMAS.state || state.schemaVersion !== "1.0.0"
      || state.policyHash !== policy.policyHash || !TOKEN.test(String(state.frontierId ?? ""))
      || !Number.isSafeInteger(state.sequence) || state.sequence < 0
      || !HASH.test(String(state.headHash ?? ""))
      || state.subjectHash !== null && !HASH.test(String(state.subjectHash ?? ""))
      || !Array.isArray(state.seenReceiptHashes) || !Array.isArray(state.seenPollIds)
      || !Array.isArray(state.evaluationHashes)
      || state.seenReceiptHashes.length > MAX_HISTORY || state.seenPollIds.length > MAX_HISTORY
      || state.evaluationHashes.length !== state.sequence
      || state.seenReceiptHashes.some((hash) => !HASH.test(String(hash ?? "")))
      || state.seenPollIds.some((hash) => !HASH.test(String(hash ?? "")))
      || state.evaluationHashes.some((hash) => !HASH.test(String(hash ?? "")))
      || new Set(state.seenReceiptHashes).size !== state.seenReceiptHashes.length
      || new Set(state.seenPollIds).size !== state.seenPollIds.length
      || !same(state.seenReceiptHashes, [...state.seenReceiptHashes].sort())
      || !same(state.seenPollIds, [...state.seenPollIds].sort())
      || !DISPOSITIONS.has(state.lastDisposition)
      || !same(state.boundary, fixedBoundary())) fail("STATE_INVALID");
    canonicalTime(state.createdAt, "STATE_CREATED_AT");
    canonicalTime(state.lastCommittedAt, "STATE_LAST_COMMITTED_AT");
    if (Date.parse(state.lastCommittedAt) < Date.parse(state.createdAt)) {
      fail("STATE_TIME_ROLLBACK");
    }
    validateSourceWatermark(state.sourceReceiptWatermark);
    validateProviderWatermarks(state.providerWatermarks);
    if (state.permanentlyRevokedAt !== null) {
      canonicalTime(state.permanentlyRevokedAt, "STATE_REVOKED_AT");
    }
    if (state.sequence === 0 && (state.headHash !== STATE_GENESIS || state.subjectHash !== null
      || state.sourceReceiptWatermark !== null || Object.keys(state.providerWatermarks).length > 0
      || state.seenReceiptHashes.length > 0 || state.seenPollIds.length > 0
      || state.permanentlyRevokedAt !== null
      || state.lastDisposition !== "NO_LIFECYCLE_POLL_COMMITTED")) {
      fail("STATE_GENESIS_INVALID");
    }
    if (state.sequence > 0 && (state.headHash === STATE_GENESIS || state.subjectHash === null)) {
      fail("STATE_ADVANCED_INVALID");
    }
    if (state.sourceReceiptWatermark !== null
      && !state.seenReceiptHashes.includes(state.sourceReceiptWatermark.receiptHash)) {
      fail("STATE_SOURCE_WATERMARK_UNDISCLOSED");
    }
    for (const watermark of Object.values(state.providerWatermarks)) {
      if (!state.seenReceiptHashes.includes(watermark.receiptHash)
        || !state.seenPollIds.includes(watermark.pollId)) {
        fail("STATE_PROVIDER_WATERMARK_UNDISCLOSED");
      }
    }
    const { stateHash, ...body } = state;
    if (!same(body, stateBody(state))
      || stateHash !== domainDigest(STAGE1_LIFECYCLE_SCHEMAS.state, body)) fail("STATE_HASH_INVALID");
    return { ok: true, stateHash, sequence: state.sequence };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveSource(source, { policy, now, state }) {
  if (source?.mode === "DIRECT_SEALED_RUN") {
    const replay = replaySealedStage05Source(source.directory);
    return { ok: true, mode: source.mode, sourceEvidenceHash: replay.sourceCommitment,
      sourceCommitment: replay.sourceCommitment, subject: replay.subject,
      cryptography: "NOT_APPLICABLE_DIRECT_SOURCE_REPLAY", fresh: true,
      sourceAdvance: null };
  }
  if (source?.mode === "OPERATOR_VERIFIER_RECEIPT") {
    const checked = verifyStage1SourceVerifierReceipt(source.receipt, { policy, now,
      watermark: state.sourceReceiptWatermark });
    if (!checked.ok) fail("SOURCE_RECEIPT_REJECTED", checked.error);
    return { ok: true, mode: source.mode, sourceEvidenceHash: checked.receiptHash,
      sourceCommitment: checked.sourceCommitment, subject: checked.subject,
      cryptography: "VALID", fresh: checked.fresh,
      sourceAdvance: { verifierId: checked.verifierId, receiptHash: checked.receiptHash,
        sequence: checked.sequence, previousReceiptHash: checked.previousReceiptHash,
        verifiedAt: checked.verifiedAt, signerKeyId: checked.signerKeyId } };
  }
  fail("SOURCE_MODE_INVALID");
}

function challengeBody(input) {
  if (!TOKEN.test(String(input.frontierId ?? "")) || !HASH.test(String(input.policyHash ?? ""))
    || !HASH.test(String(input.baseStateHash ?? ""))
    || !Number.isSafeInteger(input.baseSequence) || input.baseSequence < 0
    || !HASH.test(String(input.subjectHash ?? ""))
    || !["DIRECT_SEALED_RUN", "OPERATOR_VERIFIER_RECEIPT"].includes(input.sourceMode)
    || !HASH.test(String(input.sourceEvidenceHash ?? ""))
    || !HASH.test(String(input.nonceHash ?? ""))) fail("CHALLENGE_INVALID");
  const issuedAt = canonicalTime(input.issuedAt, "CHALLENGE_ISSUED_AT");
  const expiresAt = canonicalTime(input.expiresAt, "CHALLENGE_EXPIRES_AT");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)) fail("CHALLENGE_TIME_INVALID");
  return { schema: STAGE1_LIFECYCLE_SCHEMAS.challenge, schemaVersion: "1.0.0",
    frontierId: input.frontierId, policyHash: input.policyHash,
    baseStateHash: input.baseStateHash, baseSequence: input.baseSequence,
    subjectHash: input.subjectHash, sourceMode: input.sourceMode,
    sourceEvidenceHash: input.sourceEvidenceHash, issuedAt, expiresAt,
    nonceHash: input.nonceHash };
}

export function prepareStage1LifecyclePoll({ state, policy, source, issuedAt = new Date(),
  expiresAt, nonce = randomBytes(32) } = {}) {
  const stateCheck = verifyStage1LifecycleState(state, { policy });
  if (!stateCheck.ok) fail("CHALLENGE_STATE_INVALID", stateCheck.error);
  const at = canonicalTime(issuedAt, "CHALLENGE_ISSUED_AT");
  if (!policyActiveAt(policy, at) || Date.parse(at) < Date.parse(state.lastCommittedAt)) {
    fail("CHALLENGE_TIME_ROLLBACK");
  }
  const resolved = resolveSource(source, { policy, now: at, state });
  if (state.subjectHash !== null && state.subjectHash !== resolved.sourceCommitment) {
    fail("CHALLENGE_SOURCE_SUBSTITUTION");
  }
  const defaultExpiry = new Date(Date.parse(at) + 300_000).toISOString();
  const nonceHash = HASH.test(String(nonce ?? "")) ? nonce
    : stage1LifecycleDigest(Buffer.isBuffer(nonce) ? nonce : Buffer.from(String(nonce)));
  const body = challengeBody({ frontierId: state.frontierId, policyHash: policy.policyHash,
    baseStateHash: state.stateHash, baseSequence: state.sequence,
    subjectHash: resolved.sourceCommitment, sourceMode: resolved.mode,
    sourceEvidenceHash: resolved.sourceEvidenceHash, issuedAt: at,
    expiresAt: expiresAt ?? defaultExpiry, nonceHash });
  return Object.freeze({ ...body,
    challengeHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.challenge, body) });
}

function verifyChallenge(challenge, { state, policy, now }) {
  if (!exactKeys(challenge, ["schema", "schemaVersion", "frontierId", "policyHash",
    "baseStateHash", "baseSequence", "subjectHash", "sourceMode", "sourceEvidenceHash",
    "issuedAt", "expiresAt", "nonceHash", "challengeHash"])
    || challenge.schema !== STAGE1_LIFECYCLE_SCHEMAS.challenge
    || challenge.schemaVersion !== "1.0.0") fail("CHALLENGE_INVALID");
  const body = challengeBody(challenge);
  if (challenge.challengeHash !== domainDigest(STAGE1_LIFECYCLE_SCHEMAS.challenge, body)
    || challenge.frontierId !== state.frontierId || challenge.policyHash !== policy.policyHash
    || challenge.baseStateHash !== state.stateHash || challenge.baseSequence !== state.sequence) {
    fail("CHALLENGE_STALE_OR_TAMPERED");
  }
  if (Date.parse(now) < Date.parse(challenge.issuedAt)
    || Date.parse(now) >= Date.parse(challenge.expiresAt)) fail("CHALLENGE_EXPIRED");
  if (!policyActiveAt(policy, now)) fail("CHALLENGE_POLICY_NO_LONGER_ACTIVE");
}

function providerReceiptCryptographyStatus(receipt, policy) {
  try {
    if (!exactKeys(receipt, ["schema", "schemaVersion", "providerId", "capability",
      "interfaceId", "adapterVersion", "interfaceProfileHash", "policyHash", "subjectHash",
      "challengeHash", "pollId", "sequence", "previousReceiptHash", "observedAt", "validUntil",
      "payload", "receiptHash", "signature"])
      || receipt.schema !== STAGE1_LIFECYCLE_SCHEMAS.providerReceipt
      || receipt.schemaVersion !== "1.0.0") return false;
    const provider = policy.providers.find((entry) => entry.providerId === receipt.providerId
      && entry.capability === receipt.capability);
    if (!provider) return false;
    const body = providerReceiptBody(receipt);
    const receiptHash = domainDigest(STAGE1_LIFECYCLE_SCHEMAS.providerReceipt, body);
    const listedKey = provider.keyHistory.find((entry) =>
      entry.keyId === receipt.signature?.keyId) ?? null;
    return receipt.receiptHash === receiptHash && listedKey !== null
      && verifySignature(receiptHash, receipt.signature,
        listedKey.publicKeyPem, listedKey.keyId);
  } catch { return false; }
}

function unverifiedSubmission(error, index, cryptographicallyValid = false) {
  return { index, status: "UNVERIFIED_SUBMISSION",
    error: error instanceof Error ? error.message : String(error),
    cryptographicallyValid, trustedByConfiguredPolicy: false,
    institutionallyTrusted: false };
}

function capabilityStatus(capability, providerResults, state, checkedAt) {
  const relevant = providerResults.filter((result) => result.ok
    && result.capability === capability);
  if (relevant.length === 0) return { status: "UNKNOWN", evidence: [] };
  if (capability === "TIMESTAMP") return { status: "WITNESSED",
    evidence: relevant.map((result) => ({ providerId: result.providerId,
      timestamp: result.payload.timestamp, receiptHash: result.receiptHash })) };
  if (capability === "MEMBERSHIP") {
    const statuses = relevant.map((result) => result.payload.status);
    return { status: statuses.includes("INACTIVE") ? "INACTIVE"
      : statuses.every((status) => status === "ACTIVE") ? "ACTIVE" : "UNKNOWN",
    evidence: relevant.map((result) => ({ providerId: result.providerId,
      status: result.payload.status, membershipEpoch: result.payload.membershipEpoch,
      receiptHash: result.receiptHash })) };
  }
  if (capability === "REVOCATION") {
    const historicalRevocation = state.permanentlyRevokedAt !== null;
    const revoked = relevant.filter((result) => result.payload.status === "REVOKED");
    return { status: historicalRevocation || revoked.length > 0 ? "REVOKED"
      : relevant.every((result) => result.payload.status === "NOT_REVOKED")
        ? "NOT_REVOKED" : "UNKNOWN",
    evidence: relevant.map((result) => ({ providerId: result.providerId,
      status: result.payload.status, effectiveAt: result.payload.effectiveAt,
      receiptHash: result.receiptHash })) };
  }
  const expired = relevant.some((result) => result.payload.status === "EXPIRED"
    || result.payload.retainUntil !== null
      && Date.parse(result.payload.retainUntil) <= Date.parse(checkedAt));
  return { status: expired ? "EXPIRED"
    : relevant.every((result) => result.payload.status === "ACTIVE") ? "ACTIVE" : "UNKNOWN",
  evidence: relevant.map((result) => ({ providerId: result.providerId,
    status: result.payload.status, retainUntil: result.payload.retainUntil,
    receiptHash: result.receiptHash })) };
}

export function finalizeStage1LifecyclePoll({ state, policy, source, challenge,
  providerReceipts = [], registry = createDefaultStage1ProviderVerifierRegistry(),
  now = new Date() } = {}) {
  const stateCheck = verifyStage1LifecycleState(state, { policy });
  if (!stateCheck.ok || !(registry instanceof Stage1ProviderVerifierRegistry)
    || !Array.isArray(providerReceipts) || providerReceipts.length > MAX_RECEIPTS) {
    fail("EVALUATION_ARGUMENT_INVALID");
  }
  const checkedAt = canonicalTime(now, "EVALUATION_CHECKED_AT");
  verifyChallenge(challenge, { state, policy, now: checkedAt });
  const sourceBefore = resolveSource(source, { policy, now: checkedAt, state });
  if (sourceBefore.sourceCommitment !== challenge.subjectHash
    || sourceBefore.sourceEvidenceHash !== challenge.sourceEvidenceHash
    || sourceBefore.mode !== challenge.sourceMode) fail("EVALUATION_SOURCE_CHANGED_BEFORE_POLL");
  const providerResults = [];
  const submittedReceiptHashes = [];
  const submittedPollIds = [];
  const inPollReceipts = new Set();
  const inPollIds = new Set();
  const inPollStreams = new Set();
  for (let index = 0; index < providerReceipts.length; index += 1) {
    const receipt = providerReceipts[index];
    try {
      if (HASH.test(String(receipt?.receiptHash ?? ""))) submittedReceiptHashes.push(receipt.receiptHash);
      if (HASH.test(String(receipt?.pollId ?? ""))) submittedPollIds.push(receipt.pollId);
      if (inPollReceipts.has(receipt?.receiptHash) || inPollIds.has(receipt?.pollId)) {
        fail("DUPLICATE_RECEIPT_IN_POLL");
      }
      const stream = `${receipt?.providerId}\0${receipt?.capability}`;
      if (inPollStreams.has(stream)) fail("DUPLICATE_PROVIDER_STREAM_IN_POLL");
      inPollReceipts.add(receipt?.receiptHash);
      inPollIds.add(receipt?.pollId);
      inPollStreams.add(stream);
      providerResults.push(verifyProviderReceipt(receipt,
        { policy, registry, state, challenge, checkedAt }));
    } catch (error) {
      providerResults.push(unverifiedSubmission(error, index,
        providerReceiptCryptographyStatus(receipt, policy)));
    }
  }
  let sourceAfter;
  try {
    sourceAfter = resolveSource(source, { policy, now: checkedAt, state });
  } catch (error) {
    fail("SOURCE_TOCTOU_DETECTED", error instanceof Error ? error.message : String(error));
  }
  if (sourceAfter.sourceCommitment !== sourceBefore.sourceCommitment
    || sourceAfter.sourceEvidenceHash !== sourceBefore.sourceEvidenceHash
    || !same(sourceAfter.subject, sourceBefore.subject)) fail("SOURCE_TOCTOU_DETECTED");
  const configured = policy.providers.map((provider) => {
    const result = providerResults.find((item) => item.ok && item.providerId === provider.providerId
      && item.capability === provider.capability);
    const failed = providerResults.find((item) => !item.ok
      && providerReceipts[item.index]?.providerId === provider.providerId
      && providerReceipts[item.index]?.capability === provider.capability);
    return result ?? { ok: false, providerId: provider.providerId,
      capability: provider.capability, required: provider.required,
      status: failed ? "PROVIDER_ERROR" : "LIVE_POLL_UNAVAILABLE",
      error: failed?.error ?? null, cryptographicallyValid: false,
      trustedByConfiguredPolicy: false, institutionallyTrusted: false, fresh: false };
  });
  const invalidSubmissions = providerResults.filter((result) => !result.ok);
  const missingOrFailedRequired = configured.filter((result) => result.required && !result.ok);
  const time = capabilityStatus("TIMESTAMP", providerResults, state, checkedAt);
  const membership = capabilityStatus("MEMBERSHIP", providerResults, state, checkedAt);
  const revocation = capabilityStatus("REVOCATION", providerResults, state, checkedAt);
  const retention = capabilityStatus("RETENTION", providerResults, state, checkedAt);
  const fresh = sourceAfter.fresh && missingOrFailedRequired.length === 0
    && invalidSubmissions.length === 0;
  const revoked = state.permanentlyRevokedAt !== null || revocation.status === "REVOKED";
  const lifecycleEligible = fresh && time.status === "WITNESSED"
    && membership.status === "ACTIVE" && revocation.status === "NOT_REVOKED"
    && retention.status === "ACTIVE" && !revoked;
  const disposition = revoked ? "HOLD_REVOKED"
    : retention.status === "EXPIRED" ? "HOLD_RETENTION_EXPIRED"
      : !fresh ? "HOLD_STALE_OR_UNKNOWN_PROVIDER_STATE"
        : membership.status !== "ACTIVE" ? "HOLD_MEMBERSHIP_NOT_ACTIVE"
          : revocation.status !== "NOT_REVOKED" ? "HOLD_REVOCATION_UNKNOWN"
            : time.status !== "WITNESSED" ? "HOLD_EXTERNAL_TIME_UNKNOWN"
              : retention.status !== "ACTIVE" ? "HOLD_RETENTION_UNKNOWN"
                : "ADMIT_STAGE1_LIFECYCLE_BOUNDED";
  const sourceAdvance = sourceAfter.sourceAdvance;
  const providerAdvances = providerResults.filter((result) => result.ok).map((result) => ({
    stream: result.stream, providerId: result.providerId, capability: result.capability,
    receiptHash: result.receiptHash, pollId: result.pollId, sequence: result.sequence,
    previousReceiptHash: result.previousReceiptHash, observedAt: result.observedAt,
    signerKeyId: result.signerKeyId,
    revocationEffectiveAt: result.capability === "REVOCATION"
      && result.payload.status === "REVOKED" ? result.payload.effectiveAt : null,
  })).sort((left, right) => left.stream.localeCompare(right.stream));
  const body = {
    schema: STAGE1_LIFECYCLE_SCHEMAS.evaluation,
    schemaVersion: "1.0.0",
    frontierId: state.frontierId,
    policyHash: policy.policyHash,
    baseStateHash: state.stateHash,
    baseSequence: state.sequence,
    challengeHash: challenge.challengeHash,
    checkedAt,
    subjectHash: sourceAfter.sourceCommitment,
    source: { mode: sourceAfter.mode, sourceEvidenceHash: sourceAfter.sourceEvidenceHash,
      sourceCommitment: sourceAfter.sourceCommitment,
      replayStatus: "SOURCE_REPLAY_VERIFIED", cryptographicStatus: sourceAfter.cryptography,
      fresh: sourceAfter.fresh, verifierReceiptTrustedByConfiguredPolicy:
        sourceAfter.mode === "OPERATOR_VERIFIER_RECEIPT",
      verifierReceiptEstablishesInstitutionalTrust: false },
    axes: {
      cryptographicValidity: invalidSubmissions.length === 0
        ? "ALL_SUBMITTED_STRUCTURED_RECEIPTS_VALID" : "PARTIAL_OR_INVALID",
      sourceReplay: "VERIFIED",
      freshness: fresh ? "FRESH" : missingOrFailedRequired.length > 0 ? "UNKNOWN" : "STALE",
      externalTime: time,
      membership,
      revocation,
      retention,
      rights: { status: "NOT_ESTABLISHED_BY_LIFECYCLE_RECEIPTS",
        configuredReceiptGrantsRights: false },
      institutionalTrust: { status: "NOT_ESTABLISHED_BY_LOCAL_POLICY_OR_KEYS",
        configuredKeysEstablishStanding: false },
    },
    providers: configured,
    unverifiedSubmissions: invalidSubmissions,
    submittedReceiptHashes: [...new Set(submittedReceiptHashes)].sort(),
    submittedPollIds: [...new Set(submittedPollIds)].sort(),
    sourceAdvance,
    providerAdvances,
    disposition,
    use: { stage1LifecycleEligible: lifecycleEligible,
      descriptiveAttestAdmission: lifecycleEligible,
      causalExperienceUnits: 0, automaticTraining: false, productionModelUpdate: false,
      pricingEligible: false, authority: "none" },
    boundary: fixedBoundary(),
  };
  return Object.freeze({ ...body,
    evaluationHash: domainDigest(STAGE1_LIFECYCLE_SCHEMAS.evaluation, body) });
}

function verifyEvaluation(evaluation) {
  if (!exactKeys(evaluation, ["schema", "schemaVersion", "frontierId", "policyHash",
    "baseStateHash", "baseSequence", "challengeHash", "checkedAt", "subjectHash", "source",
    "axes", "providers", "unverifiedSubmissions", "submittedReceiptHashes", "submittedPollIds",
    "sourceAdvance", "providerAdvances", "disposition", "use", "boundary", "evaluationHash"])
    || evaluation.schema !== STAGE1_LIFECYCLE_SCHEMAS.evaluation
    || evaluation.schemaVersion !== "1.0.0" || !same(evaluation.boundary, fixedBoundary())) {
    fail("EVALUATION_INVALID");
  }
  const { evaluationHash, ...body } = evaluation;
  if (evaluationHash !== domainDigest(STAGE1_LIFECYCLE_SCHEMAS.evaluation, body)) {
    fail("EVALUATION_HASH_INVALID");
  }
}

export function commitStage1LifecycleEvaluation({ state, policy, evaluation,
  verificationContext } = {}) {
  const checked = verifyStage1LifecycleState(state, { policy });
  if (!checked.ok) fail("COMMIT_STATE_INVALID", checked.error);
  verifyEvaluation(evaluation);
  if (evaluation.frontierId !== state.frontierId || evaluation.policyHash !== policy.policyHash
    || evaluation.baseStateHash !== state.stateHash || evaluation.baseSequence !== state.sequence) {
    fail("CONCURRENT_STALE_BASE");
  }
  if (!verificationContext || typeof verificationContext !== "object") {
    fail("COMMIT_REVERIFICATION_CONTEXT_REQUIRED");
  }
  const reproduced = finalizeStage1LifecyclePoll({ state, policy,
    source: verificationContext.source,
    challenge: verificationContext.challenge,
    providerReceipts: verificationContext.providerReceipts,
    registry: verificationContext.registry,
    now: evaluation.checkedAt });
  if (reproduced.evaluationHash !== evaluation.evaluationHash
    || !same(reproduced, evaluation)) fail("EVALUATION_REVERIFICATION_MISMATCH");
  if (Date.parse(evaluation.checkedAt) < Date.parse(state.lastCommittedAt)) {
    fail("COMMIT_TIME_ROLLBACK");
  }
  if (state.subjectHash !== null && state.subjectHash !== evaluation.subjectHash) {
    fail("COMMIT_SOURCE_SUBSTITUTION");
  }
  const seenReceipts = new Set(state.seenReceiptHashes);
  const seenPollIds = new Set(state.seenPollIds);
  for (const hash of evaluation.submittedReceiptHashes) {
    if (seenReceipts.has(hash)) fail("RECEIPT_REPLAY", hash);
    seenReceipts.add(hash);
  }
  for (const pollId of evaluation.submittedPollIds) {
    if (seenPollIds.has(pollId)) fail("POLL_ID_REPLAY", pollId);
    seenPollIds.add(pollId);
  }
  let sourceReceiptWatermark = state.sourceReceiptWatermark;
  if (evaluation.sourceAdvance) {
    const advance = evaluation.sourceAdvance;
    if (sourceReceiptWatermark === null) {
      if (advance.sequence !== 1 || advance.previousReceiptHash !== SOURCE_GENESIS) {
        fail("SOURCE_ADVANCE_INVALID");
      }
    } else if (advance.sequence !== sourceReceiptWatermark.sequence + 1
      || advance.previousReceiptHash !== sourceReceiptWatermark.receiptHash) {
      fail("SOURCE_ADVANCE_ROLLBACK");
    }
    sourceReceiptWatermark = structuredClone(advance);
    seenReceipts.add(advance.receiptHash);
  }
  const providerWatermarks = structuredClone(state.providerWatermarks);
  let permanentlyRevokedAt = state.permanentlyRevokedAt;
  for (const advance of evaluation.providerAdvances) {
    const prior = providerWatermarks[advance.stream] ?? null;
    if (prior === null) {
      if (advance.sequence !== 1 || advance.previousReceiptHash !== PROVIDER_GENESIS) {
        fail("PROVIDER_ADVANCE_INVALID", advance.stream);
      }
    } else if (advance.sequence !== prior.sequence + 1
      || advance.previousReceiptHash !== prior.receiptHash
      || Date.parse(advance.observedAt) < Date.parse(prior.observedAt)) {
      fail("PROVIDER_ADVANCE_ROLLBACK", advance.stream);
    }
    providerWatermarks[advance.stream] = structuredClone(advance);
    seenReceipts.add(advance.receiptHash);
    seenPollIds.add(advance.pollId);
    if (advance.revocationEffectiveAt !== null
      && (permanentlyRevokedAt === null
        || Date.parse(advance.revocationEffectiveAt) < Date.parse(permanentlyRevokedAt))) {
      permanentlyRevokedAt = advance.revocationEffectiveAt;
    }
  }
  if (seenReceipts.size > MAX_HISTORY || seenPollIds.size > MAX_HISTORY
    || state.evaluationHashes.length >= MAX_HISTORY) fail("STATE_HISTORY_LIMIT_REACHED");
  const nextSequence = state.sequence + 1;
  const headHash = domainDigest("outsider/stage1/lifecycle-state-head/v1", {
    previousHead: state.headHash, sequence: nextSequence,
    evaluationHash: evaluation.evaluationHash });
  return sealState(stateBody({ frontierId: state.frontierId, policyHash: state.policyHash,
    createdAt: state.createdAt, sequence: nextSequence, headHash,
    subjectHash: evaluation.subjectHash, lastCommittedAt: evaluation.checkedAt,
    sourceReceiptWatermark, providerWatermarks,
    seenReceiptHashes: [...seenReceipts].sort(), seenPollIds: [...seenPollIds].sort(),
    evaluationHashes: [...state.evaluationHashes, evaluation.evaluationHash],
    permanentlyRevokedAt, lastDisposition: permanentlyRevokedAt === null
      ? evaluation.disposition : "HOLD_REVOKED", boundary: fixedBoundary() }));
}

export const STAGE1_PROVIDER_RECEIPT_GENESIS = PROVIDER_GENESIS;
export const STAGE1_SOURCE_RECEIPT_GENESIS = SOURCE_GENESIS;
