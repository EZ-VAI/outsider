/*
 * Verified public-source catalog contract for the Episode Data Engine.
 *
 * A source can expose several legitimate populations (for example, kept
 * episodes, attempt-census records, frames, annotations, or mechanical
 * traces).  Those populations are not silently added together.  This module
 * accepts standardized verifier attestations and normalized facts; its
 * generic builder checks shape and internal binding only.  Independent
 * source-replay trust requires the fixed workspace-backed profile verifier.
 * This module does not acquire data, infer rights, or turn publisher labels
 * into independent outcomes.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA =
  "outsider/episode-data-public-source-catalog/v2";
export const EPISODE_DATA_PUBLIC_SOURCE_VERIFICATION_RECEIPT_SCHEMA =
  "outsider/episode-data-public-source-verification-receipt/v2";
export const EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA =
  "outsider/episode-data-public-source-verifier-attestation/v1";

export const EPISODE_DATA_PUBLIC_SOURCE_DISPOSITIONS = Object.freeze([
  "ADMITTED_RESEARCH_ONLY",
  "QUARANTINE_EVALUATION_ONLY",
  "METADATA_ONLY",
  "LEDGER_DUPLICATE",
  "REJECTED",
]);

export const EPISODE_DATA_PUBLIC_SOURCE_PHYSICALITY = Object.freeze([
  "REAL_DIGITAL",
  "REAL_ROBOT",
  "PUBLISHER_CLAIMED_REAL_ROBOT",
  "REAL_MECHANICAL",
  "SIMULATED_ROBOT",
  "CONSTRUCTED_DIGITAL",
  "METADATA_ONLY",
]);

export const EPISODE_DATA_PUBLIC_SOURCE_EVIDENCE_DOMAINS = Object.freeze([
  "REAL_AGENT_EXECUTION",
  "REAL_ROBOT_EXECUTION",
  "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
  "REAL_MECHANICAL_TELEMETRY",
  "SIMULATED_ROBOT_EXECUTION",
  "CONSTRUCTED_AGENT_EVALUATION",
  "PUBLISHER_ANNOTATION",
  "DERIVED_LINEAGE",
  "METADATA_CLAIM",
]);

export const EPISODE_DATA_PUBLIC_SOURCE_POPULATION_RELATIONSHIPS = Object.freeze([
  "PRIMARY_SOURCE_NATIVE",
  "NESTED_WITHIN_PARENT",
  "OVERLAPPING_VIEW",
  "PUBLISHER_CLAIM_ONLY",
  "METADATA_ONLY",
]);

export const EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS = Object.freeze([
  "opportunityCensus",
  "delegationAuthorization",
  "actionTrace",
  "intervention",
  "effect",
  "outcome",
  "recovery",
  "longitudinal",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const VERIFICATION_LEVELS = new Set([
  "FULL_SOURCE_REDERIVED",
  "FULL_SELECTED_SOURCE_REDERIVED",
  "FULL_FIXED_REVISION_METADATA_REPLAYED",
]);
const REPLAY_CLASS_TO_LEVEL = Object.freeze({
  FULL_SOURCE: "FULL_SOURCE_REDERIVED",
  FULL_SELECTED_SOURCE: "FULL_SELECTED_SOURCE_REDERIVED",
  METADATA_ONLY: "FULL_FIXED_REVISION_METADATA_REPLAYED",
});
export const EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY =
  "REQUIRES_FIXED_PROFILE_WORKSPACE_REBUILD";
const SCOPE_KINDS = new Set([
  "FULL_FIXED_REVISION",
  "FULL_SOURCE_NATIVE_GROUP",
  "BOUNDED_SOURCE_NATIVE_SLICE",
  "METADATA_ONLY_DISPOSITION",
]);
const SELECTION_BIAS_STATES = new Set([
  "NONE_ESTABLISHED",
  "KNOWN_PUBLISHER_SELECTION",
  "UNKNOWN_ATTEMPT_CENSUS",
  "METADATA_ONLY",
]);
const LINEAGE_KINDS = new Set([
  "NO_EXACT_REPACK_RELATION_ESTABLISHED",
  "EXACT_REPACK_DUPLICATE",
]);
const PHYSICALITY_EVIDENCE_DOMAINS = Object.freeze({
  REAL_DIGITAL: new Set([
    "REAL_AGENT_EXECUTION", "PUBLISHER_ANNOTATION", "DERIVED_LINEAGE",
    "METADATA_CLAIM",
  ]),
  REAL_ROBOT: new Set([
    "REAL_ROBOT_EXECUTION", "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED",
    "PUBLISHER_ANNOTATION", "DERIVED_LINEAGE", "METADATA_CLAIM",
  ]),
  PUBLISHER_CLAIMED_REAL_ROBOT: new Set([
    "ROBOT_TELEMETRY_PROVENANCE_UNRESOLVED", "PUBLISHER_ANNOTATION",
    "DERIVED_LINEAGE", "METADATA_CLAIM",
  ]),
  REAL_MECHANICAL: new Set([
    "REAL_MECHANICAL_TELEMETRY", "PUBLISHER_ANNOTATION", "DERIVED_LINEAGE",
    "METADATA_CLAIM",
  ]),
  SIMULATED_ROBOT: new Set([
    "SIMULATED_ROBOT_EXECUTION", "PUBLISHER_ANNOTATION", "DERIVED_LINEAGE",
    "METADATA_CLAIM",
  ]),
  CONSTRUCTED_DIGITAL: new Set([
    "CONSTRUCTED_AGENT_EVALUATION", "PUBLISHER_ANNOTATION", "DERIVED_LINEAGE",
    "METADATA_CLAIM",
  ]),
  METADATA_ONLY: new Set(["METADATA_CLAIM"]),
});

const exactKeys = (value, keys) => value && typeof value === "object"
  && !Array.isArray(value)
  && canonicalizeStrict(Object.keys(value).sort())
    === canonicalizeStrict([...keys].sort());

function fail(code, detail = null) {
  throw new Error(`EPISODE_DATA_PUBLIC_SOURCE_CATALOG_${code}${
    detail === null ? "" : `:${detail}`}`);
}

function digest(value, domain = EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function cloneCanonical(value) {
  return JSON.parse(canonicalizeStrict(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonempty(value, detail) {
  if (typeof value !== "string" || value.length === 0) {
    fail("STRING_INVALID", detail);
  }
  return value;
}

function count(value, detail) {
  if (!Number.isSafeInteger(value) || value < 0) fail("COUNT_INVALID", detail);
  return value;
}

function hash(value, detail) {
  if (!HASH.test(value ?? "")) fail("HASH_INVALID", detail);
  return value;
}

function validateVerification(verification, sourceId, disposition) {
  if (!exactKeys(verification, [
    "schema", "attestationStructurallyAccepted", "verifierId", "verifierCodeHash",
    "verificationResultHash", "verificationLevel", "attestedPayloadReplay",
    "artifactHash", "sourceBindingHash", "sourceBindingKind", "attestation",
    "attestationTrustBoundary",
  ])
    || verification.schema !== EPISODE_DATA_PUBLIC_SOURCE_VERIFICATION_RECEIPT_SCHEMA
    || verification.attestationStructurallyAccepted !== true
    || verification.attestationTrustBoundary
      !== EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY
    || !VERIFICATION_LEVELS.has(verification.verificationLevel)
    || typeof verification.attestedPayloadReplay !== "boolean") {
    fail("VERIFICATION_INVALID", sourceId);
  }
  nonempty(verification.verifierId, `${sourceId}:verifierId`);
  hash(verification.verifierCodeHash, `${sourceId}:verifierCodeHash`);
  hash(verification.verificationResultHash, `${sourceId}:verificationResultHash`);
  hash(verification.artifactHash, `${sourceId}:artifactHash`);
  hash(verification.sourceBindingHash, `${sourceId}:sourceBindingHash`);
  nonempty(verification.sourceBindingKind, `${sourceId}:sourceBindingKind`);
  const attestation = verification.attestation;
  if (!exactKeys(attestation, [
    "schema", "ok", "verifiedArtifactHash", "verifiedSourceBindingHash",
    "sourceBindingKind", "replayClass", "sourceSpecificVerificationLevel",
    "sourceSpecificResultHash",
  ]) || attestation.schema
      !== EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA
    || attestation.ok !== true
    || !Object.hasOwn(REPLAY_CLASS_TO_LEVEL, attestation.replayClass)) {
    fail("VERIFIER_ATTESTATION_INVALID", sourceId);
  }
  hash(attestation.verifiedArtifactHash,
    `${sourceId}:attestation:verifiedArtifactHash`);
  hash(attestation.verifiedSourceBindingHash,
    `${sourceId}:attestation:verifiedSourceBindingHash`);
  nonempty(attestation.sourceBindingKind,
    `${sourceId}:attestation:sourceBindingKind`);
  hash(attestation.sourceSpecificResultHash,
    `${sourceId}:attestation:sourceSpecificResultHash`);
  nonempty(attestation.sourceSpecificVerificationLevel,
    `${sourceId}:attestation:sourceSpecificVerificationLevel`);
  if (verification.artifactHash !== attestation.verifiedArtifactHash
    || verification.sourceBindingHash !== attestation.verifiedSourceBindingHash
    || verification.sourceBindingKind !== attestation.sourceBindingKind
    || verification.verificationResultHash !== attestation.sourceSpecificResultHash
    || verification.verificationLevel
      !== REPLAY_CLASS_TO_LEVEL[attestation.replayClass]
    || verification.attestedPayloadReplay
      !== (attestation.replayClass !== "METADATA_ONLY")) {
    fail("VERIFIER_ATTESTATION_BINDING_INVALID", sourceId);
  }
  if (disposition === "METADATA_ONLY") {
    if (verification.verificationLevel
        !== "FULL_FIXED_REVISION_METADATA_REPLAYED"
      || verification.attestedPayloadReplay !== false) {
      fail("METADATA_VERIFICATION_RADIUS_INVALID", sourceId);
    }
  } else if (verification.attestedPayloadReplay !== true) {
    fail("PAYLOAD_REPLAY_ATTESTATION_REQUIRED", sourceId);
  }
}

function validateArtifact(artifact, sourceId) {
  if (!exactKeys(artifact, [
    "directoryBasename", "reportRelativePath", "reportSchema",
    "reportFileSha256", "artifactHash", "sourceBindingHash", "sourceBindingKind",
  ])) fail("ARTIFACT_SHAPE_INVALID", sourceId);
  for (const field of ["directoryBasename", "reportRelativePath", "reportSchema"]) {
    nonempty(artifact[field], `${sourceId}:${field}`);
  }
  if (artifact.directoryBasename.includes("/")
    || artifact.directoryBasename === "." || artifact.directoryBasename === ".."
    || artifact.reportRelativePath.startsWith("/")
    || artifact.reportRelativePath.split("/").includes("..")) {
    fail("ARTIFACT_PATH_INVALID", sourceId);
  }
  hash(artifact.reportFileSha256, `${sourceId}:reportFileSha256`);
  hash(artifact.artifactHash, `${sourceId}:artifactHash`);
  hash(artifact.sourceBindingHash, `${sourceId}:sourceBindingHash`);
  if (!["SOURCE_ROOT", "SOURCE_MANIFEST"].includes(artifact.sourceBindingKind)) {
    fail("SOURCE_BINDING_KIND_INVALID", sourceId);
  }
}

function validateIdentity(identity, sourceId) {
  if (!exactKeys(identity, [
    "publisher", "datasetId", "revision", "physicality",
  ]) || !EPISODE_DATA_PUBLIC_SOURCE_PHYSICALITY.includes(identity.physicality)) {
    fail("IDENTITY_INVALID", sourceId);
  }
  nonempty(identity.publisher, `${sourceId}:publisher`);
  nonempty(identity.datasetId, `${sourceId}:datasetId`);
  nonempty(identity.revision, `${sourceId}:revision`);
}

function validateLineage(lineage, sourceId, disposition) {
  if (!exactKeys(lineage, [
    "kind", "duplicateOfSourceId", "addsUniqueEpisodes", "addsUniqueFrames",
    "evidenceHash",
  ]) || !LINEAGE_KINDS.has(lineage.kind)) {
    fail("LINEAGE_INVALID", sourceId);
  }
  hash(lineage.evidenceHash, `${sourceId}:lineage:evidenceHash`);
  if (lineage.kind === "NO_EXACT_REPACK_RELATION_ESTABLISHED") {
    if (disposition === "LEDGER_DUPLICATE"
      || lineage.duplicateOfSourceId !== null
      || lineage.addsUniqueEpisodes !== null
      || lineage.addsUniqueFrames !== null) {
      fail("NON_DUPLICATE_LINEAGE_INVALID", sourceId);
    }
    return;
  }
  nonempty(lineage.duplicateOfSourceId, `${sourceId}:duplicateOfSourceId`);
  if (disposition !== "LEDGER_DUPLICATE"
    || lineage.duplicateOfSourceId === sourceId
    || lineage.addsUniqueEpisodes !== 0 || lineage.addsUniqueFrames !== 0) {
    fail("DUPLICATE_SOURCE_LINEAGE_INVALID", sourceId);
  }
}

function validateScope(scope, sourceId) {
  if (!exactKeys(scope, [
    "scopeId", "scopeKind", "description", "sourceNativeGroupComplete",
    "declaredScopeExhausted", "sourceUniverseExhausted", "globalExhaustion",
    "selectionBias",
  ])
    || !SCOPE_KINDS.has(scope.scopeKind)
    || typeof scope.sourceNativeGroupComplete !== "boolean"
    || typeof scope.declaredScopeExhausted !== "boolean"
    || scope.sourceUniverseExhausted !== false
    || scope.globalExhaustion !== false
    || !SELECTION_BIAS_STATES.has(scope.selectionBias)) {
    fail("SCOPE_INVALID", sourceId);
  }
  nonempty(scope.scopeId, `${sourceId}:scopeId`);
  nonempty(scope.description, `${sourceId}:scopeDescription`);
  if (scope.scopeKind === "FULL_FIXED_REVISION"
    && (scope.sourceNativeGroupComplete !== true
      || scope.declaredScopeExhausted !== true)) {
    fail("FULL_REVISION_SCOPE_INCOMPLETE", sourceId);
  }
  if (scope.scopeKind === "METADATA_ONLY_DISPOSITION"
    && scope.selectionBias !== "METADATA_ONLY") {
    fail("METADATA_SCOPE_BIAS_INVALID", sourceId);
  }
}

function validatePopulation(population, sourceId, populationIds) {
  if (!exactKeys(population, [
    "populationId", "unit", "count", "evidenceDomain", "relationship",
    "parentPopulationId", "realityEligible", "analyticAdmission",
  ])
    || !EPISODE_DATA_PUBLIC_SOURCE_EVIDENCE_DOMAINS
      .includes(population.evidenceDomain)
    || !EPISODE_DATA_PUBLIC_SOURCE_POPULATION_RELATIONSHIPS
      .includes(population.relationship)
    || typeof population.realityEligible !== "boolean"
    || typeof population.analyticAdmission !== "boolean") {
    fail("POPULATION_INVALID", `${sourceId}:${population?.populationId}`);
  }
  nonempty(population.populationId, `${sourceId}:populationId`);
  nonempty(population.unit, `${sourceId}:${population.populationId}:unit`);
  count(population.count, `${sourceId}:${population.populationId}:count`);
  if (populationIds.has(population.populationId)) {
    fail("POPULATION_DUPLICATE", `${sourceId}:${population.populationId}`);
  }
  populationIds.add(population.populationId);
  if (population.relationship === "PRIMARY_SOURCE_NATIVE") {
    if (population.parentPopulationId !== null) {
      fail("PRIMARY_POPULATION_PARENT_FORBIDDEN", sourceId);
    }
  } else if (["NESTED_WITHIN_PARENT", "OVERLAPPING_VIEW"]
    .includes(population.relationship)) {
    nonempty(population.parentPopulationId,
      `${sourceId}:${population.populationId}:parentPopulationId`);
  } else if (population.parentPopulationId !== null) {
    fail("NONSTRUCTURAL_POPULATION_PARENT_FORBIDDEN", sourceId);
  }
  if (population.realityEligible && ![
    "REAL_AGENT_EXECUTION", "REAL_ROBOT_EXECUTION", "REAL_MECHANICAL_TELEMETRY",
  ].includes(population.evidenceDomain)) {
    fail("REALITY_ELIGIBILITY_DOMAIN_INVALID", `${sourceId}:${population.populationId}`);
  }
  if (population.relationship === "PUBLISHER_CLAIM_ONLY"
    && (population.realityEligible || population.analyticAdmission)) {
    fail("PUBLISHER_CLAIM_ADMISSION_FORBIDDEN", `${sourceId}:${population.populationId}`);
  }
  if (population.evidenceDomain === "DERIVED_LINEAGE"
    && (population.realityEligible || population.analyticAdmission)) {
    fail("DERIVED_LINEAGE_ADMISSION_FORBIDDEN",
      `${sourceId}:${population.populationId}`);
  }
}

function validatePopulationGraph(populations, sourceId) {
  const ids = new Set(populations.map((population) => population.populationId));
  const parents = new Map(populations.map((population) =>
    [population.populationId, population.parentPopulationId]));
  for (const population of populations) {
    if (population.parentPopulationId !== null
      && !ids.has(population.parentPopulationId)) {
      fail("POPULATION_PARENT_MISSING", `${sourceId}:${population.populationId}`);
    }
    if (population.parentPopulationId === population.populationId) {
      fail("POPULATION_SELF_PARENT", `${sourceId}:${population.populationId}`);
    }
    const visited = new Set([population.populationId]);
    let cursor = population.parentPopulationId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        fail("POPULATION_PARENT_CYCLE", `${sourceId}:${population.populationId}`);
      }
      visited.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
}

function validateSegment(segment, sourceId, segmentId, populationsById) {
  if (!exactKeys(segment, [
    "populationId", "sourceNativeCount", "independentCount",
    "sourceNativeAttribution", "independentAttribution",
    "crossAttributionAdditionPermitted", "additiveTotal",
  ])) fail("SEGMENT_INVALID", `${sourceId}:${segmentId}`);
  count(segment.sourceNativeCount, `${sourceId}:${segmentId}:sourceNativeCount`);
  count(segment.independentCount, `${sourceId}:${segmentId}:independentCount`);
  nonempty(segment.sourceNativeAttribution,
    `${sourceId}:${segmentId}:sourceNativeAttribution`);
  nonempty(segment.independentAttribution,
    `${sourceId}:${segmentId}:independentAttribution`);
  if (segment.crossAttributionAdditionPermitted !== false
    || segment.additiveTotal !== null) {
    fail("SEGMENT_ADDITION_FORBIDDEN", `${sourceId}:${segmentId}`);
  }
  if (segment.populationId === null) {
    if (segment.sourceNativeCount !== 0 || segment.independentCount !== 0) {
      fail("SEGMENT_COUNT_WITHOUT_POPULATION", `${sourceId}:${segmentId}`);
    }
    return;
  }
  const population = populationsById.get(segment.populationId);
  if (!population) fail("SEGMENT_POPULATION_MISSING", `${sourceId}:${segmentId}`);
  if (segment.sourceNativeCount > population.count
    || segment.independentCount > population.count) {
    fail("SEGMENT_COUNT_EXCEEDS_POPULATION", `${sourceId}:${segmentId}`);
  }
}

function validateClearances(clearances, sourceId) {
  if (!exactKeys(clearances, ["revision", "rights", "privacy", "use"])
    || !exactKeys(clearances.revision, ["status", "evidenceHash"])
    || !exactKeys(clearances.rights, [
      "status", "evidenceHash", "legalConclusionEstablished",
      "productionTrainingAuthorized", "redistributionAuthorized",
    ])
    || !exactKeys(clearances.privacy, [
      "status", "evidenceHash", "rawContentProjected", "noPiiGuaranteed",
    ])
    || !exactKeys(clearances.use, [
      "status", "evidenceHash", "offlineResearchAllowed",
      "authorizedTrainingAllowed", "networkAdmissionAllowed",
      "delegationAuthorityAllowed",
    ])) fail("CLEARANCE_INVALID", sourceId);
  for (const [name, clearance] of Object.entries(clearances)) {
    nonempty(clearance.status, `${sourceId}:${name}:status`);
    hash(clearance.evidenceHash, `${sourceId}:${name}:evidenceHash`);
  }
  if (clearances.rights.legalConclusionEstablished !== false
    || clearances.rights.productionTrainingAuthorized !== false
    || clearances.rights.redistributionAuthorized !== false
    || clearances.privacy.rawContentProjected !== false
    || clearances.privacy.noPiiGuaranteed !== false
    || typeof clearances.use.offlineResearchAllowed !== "boolean"
    || clearances.use.authorizedTrainingAllowed !== false
    || clearances.use.networkAdmissionAllowed !== false
    || clearances.use.delegationAuthorityAllowed !== false) {
    fail("CLEARANCE_BOUNDARY_INVALID", sourceId);
  }
}

function validateSource(source) {
  if (!exactKeys(source, [
    "sourceId", "family", "disposition", "identity", "artifact",
    "lineage", "verification", "scope", "populations", "segments", "clearances",
    "completeEpisodeIntersection",
  ])
    || !EPISODE_DATA_PUBLIC_SOURCE_DISPOSITIONS.includes(source.disposition)) {
    fail("SOURCE_INVALID", source?.sourceId);
  }
  nonempty(source.sourceId, "sourceId");
  nonempty(source.family, `${source.sourceId}:family`);
  validateIdentity(source.identity, source.sourceId);
  validateArtifact(source.artifact, source.sourceId);
  validateLineage(source.lineage, source.sourceId, source.disposition);
  validateVerification(source.verification, source.sourceId, source.disposition);
  if (source.verification.artifactHash !== source.artifact.artifactHash
    || source.verification.sourceBindingHash !== source.artifact.sourceBindingHash
    || source.verification.sourceBindingKind !== source.artifact.sourceBindingKind) {
    fail("VERIFICATION_ARTIFACT_BINDING_INVALID", source.sourceId);
  }
  validateScope(source.scope, source.sourceId);
  if (!Array.isArray(source.populations) || source.populations.length === 0) {
    fail("POPULATIONS_REQUIRED", source.sourceId);
  }
  const populationIds = new Set();
  for (const population of source.populations) {
    validatePopulation(population, source.sourceId, populationIds);
  }
  if (source.identity.physicality === "PUBLISHER_CLAIMED_REAL_ROBOT"
    && source.populations.some((population) =>
      population.evidenceDomain === "REAL_ROBOT_EXECUTION"
      || population.realityEligible)) {
    fail("PUBLISHER_CLAIMED_PHYSICALITY_PROMOTION_FORBIDDEN", source.sourceId);
  }
  const allowedEvidenceDomains = PHYSICALITY_EVIDENCE_DOMAINS[
    source.identity.physicality];
  if (source.populations.some((population) =>
    !allowedEvidenceDomains.has(population.evidenceDomain))) {
    fail("PHYSICALITY_EVIDENCE_DOMAIN_MISMATCH", source.sourceId);
  }
  validatePopulationGraph(source.populations, source.sourceId);
  if (!exactKeys(source.segments, EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS)) {
    fail("SEGMENTS_INVALID", source.sourceId);
  }
  const populationsById = new Map(source.populations.map((population) =>
    [population.populationId, population]));
  for (const segmentId of EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS) {
    validateSegment(source.segments[segmentId], source.sourceId, segmentId,
      populationsById);
  }
  validateClearances(source.clearances, source.sourceId);
  if (!exactKeys(source.completeEpisodeIntersection, ["established", "count"])
    || source.completeEpisodeIntersection.established !== false
    || source.completeEpisodeIntersection.count !== 0) {
    fail("COMPLETE_EPISODE_INTERSECTION_INVALID", source.sourceId);
  }
  if (source.disposition === "METADATA_ONLY"
    && source.populations.some((population) =>
      population.relationship !== "METADATA_ONLY"
      || population.evidenceDomain !== "METADATA_CLAIM"
      || population.realityEligible || population.analyticAdmission)) {
    fail("METADATA_POPULATION_BOUNDARY_INVALID", source.sourceId);
  }
  if ((source.disposition === "METADATA_ONLY")
      !== (source.identity.physicality === "METADATA_ONLY")
    || (source.disposition === "METADATA_ONLY")
      !== (source.scope.scopeKind === "METADATA_ONLY_DISPOSITION")) {
    fail("METADATA_IDENTITY_SCOPE_BOUNDARY_INVALID", source.sourceId);
  }
  if (source.disposition === "METADATA_ONLY"
    && Object.values(source.segments).some((segment) =>
      segment.sourceNativeCount !== 0 || segment.independentCount !== 0)) {
    fail("METADATA_SEGMENT_PROMOTION_FORBIDDEN", source.sourceId);
  }
  if (source.disposition === "REJECTED"
    && source.populations.some((population) => population.analyticAdmission)) {
    fail("REJECTED_SOURCE_ADMISSION_FORBIDDEN", source.sourceId);
  }
  if (source.disposition === "LEDGER_DUPLICATE"
    && (source.populations.some((population) => population.analyticAdmission)
      || source.populations.some((population) =>
        population.evidenceDomain !== "DERIVED_LINEAGE"
        || population.realityEligible)
      || Object.values(source.segments).some((item) =>
        item.sourceNativeCount !== 0 || item.independentCount !== 0)
      || source.clearances.use.offlineResearchAllowed !== false)) {
    fail("LEDGER_DUPLICATE_ADMISSION_FORBIDDEN", source.sourceId);
  }
}

function validateDiscoveryScope(scope) {
  if (!exactKeys(scope, [
    "scopeId", "channel", "queryOrDeclaration", "cutoff", "evidenceHash",
    "candidateCount", "terminalCount", "declaredScopeExhausted",
    "sourceUniverseExhausted", "globalExhaustion",
  ])) fail("DISCOVERY_SCOPE_INVALID", scope?.scopeId);
  nonempty(scope.scopeId, "discoveryScopeId");
  nonempty(scope.channel, `${scope.scopeId}:channel`);
  nonempty(scope.queryOrDeclaration, `${scope.scopeId}:queryOrDeclaration`);
  if (typeof scope.cutoff !== "string" || Number.isNaN(Date.parse(scope.cutoff))
    || new Date(scope.cutoff).toISOString() !== scope.cutoff) {
    fail("DISCOVERY_SCOPE_CUTOFF_INVALID", scope.scopeId);
  }
  hash(scope.evidenceHash, `${scope.scopeId}:evidenceHash`);
  count(scope.candidateCount, `${scope.scopeId}:candidateCount`);
  count(scope.terminalCount, `${scope.scopeId}:terminalCount`);
  if (scope.terminalCount > scope.candidateCount
    || typeof scope.declaredScopeExhausted !== "boolean"
    || scope.sourceUniverseExhausted !== false
    || scope.globalExhaustion !== false
    || scope.declaredScopeExhausted
      !== (scope.terminalCount === scope.candidateCount)) {
    fail("DISCOVERY_SCOPE_EXHAUSTION_INVALID", scope.scopeId);
  }
}

function segmentSummary(sources) {
  return Object.fromEntries(EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS.map((segmentId) => {
    const nativeSources = sources.filter((source) =>
      source.segments[segmentId].sourceNativeCount > 0).map((source) => source.sourceId);
    const independentSources = sources.filter((source) =>
      source.segments[segmentId].independentCount > 0).map((source) => source.sourceId);
    return [segmentId, {
      sourceNativeSourceIds: nativeSources,
      independentSourceIds: independentSources,
      sourceNativeCrossSourceTotal: null,
      independentCrossSourceTotal: null,
      crossSourceAdditionProhibited: true,
    }];
  }));
}

export function buildEpisodeDataPublicSourceVerificationReceipt({
  verifierId, verifierCodeHash, verificationAttestation,
} = {}) {
  nonempty(verifierId, "verifierId");
  hash(verifierCodeHash, "verifierCodeHash");
  if (!verificationAttestation || verificationAttestation.ok !== true) {
    fail("SOURCE_SPECIFIC_VERIFIER_NOT_OK", verifierId);
  }
  if (!exactKeys(verificationAttestation, [
    "schema", "ok", "verifiedArtifactHash", "verifiedSourceBindingHash",
    "sourceBindingKind", "replayClass", "sourceSpecificVerificationLevel",
    "sourceSpecificResultHash",
  ]) || verificationAttestation.schema
      !== EPISODE_DATA_PUBLIC_SOURCE_VERIFIER_ATTESTATION_SCHEMA
    || !Object.hasOwn(REPLAY_CLASS_TO_LEVEL, verificationAttestation.replayClass)
    || !HASH.test(verificationAttestation.verifiedArtifactHash ?? "")
    || !HASH.test(verificationAttestation.verifiedSourceBindingHash ?? "")
    || !["SOURCE_ROOT", "SOURCE_MANIFEST"]
      .includes(verificationAttestation.sourceBindingKind)
    || !HASH.test(verificationAttestation.sourceSpecificResultHash ?? "")
    || typeof verificationAttestation.sourceSpecificVerificationLevel !== "string"
    || verificationAttestation.sourceSpecificVerificationLevel.length === 0) {
    fail("VERIFIER_ATTESTATION_INVALID", verifierId);
  }
  const attestation = cloneCanonical(verificationAttestation);
  const verificationLevel = REPLAY_CLASS_TO_LEVEL[attestation.replayClass];
  const attestedPayloadReplay = attestation.replayClass !== "METADATA_ONLY";
  return deepFreeze({
    schema: EPISODE_DATA_PUBLIC_SOURCE_VERIFICATION_RECEIPT_SCHEMA,
    attestationStructurallyAccepted: true,
    verifierId,
    verifierCodeHash,
    verificationResultHash: attestation.sourceSpecificResultHash,
    verificationLevel,
    attestedPayloadReplay,
    artifactHash: attestation.verifiedArtifactHash,
    sourceBindingHash: attestation.verifiedSourceBindingHash,
    sourceBindingKind: attestation.sourceBindingKind,
    attestationTrustBoundary:
      EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
    attestation,
  });
}

export function buildEpisodeDataPublicSourceCatalog({ discoveryScopes, sources } = {}) {
  if (!Array.isArray(discoveryScopes) || discoveryScopes.length === 0) {
    fail("DISCOVERY_SCOPES_REQUIRED");
  }
  if (!Array.isArray(sources) || sources.length === 0) fail("SOURCES_REQUIRED");
  const normalizedScopes = discoveryScopes.map(cloneCanonical);
  const normalizedSources = sources.map(cloneCanonical);
  const scopeIds = new Set();
  for (const scope of normalizedScopes) {
    validateDiscoveryScope(scope);
    if (scopeIds.has(scope.scopeId)) fail("DISCOVERY_SCOPE_DUPLICATE", scope.scopeId);
    scopeIds.add(scope.scopeId);
  }
  const sourceIds = new Set();
  for (const source of normalizedSources) {
    validateSource(source);
    if (sourceIds.has(source.sourceId)) fail("SOURCE_DUPLICATE", source.sourceId);
    sourceIds.add(source.sourceId);
    if (!scopeIds.has(source.scope.scopeId)) {
      fail("SOURCE_DISCOVERY_SCOPE_MISSING", source.sourceId);
    }
  }
  for (const source of normalizedSources) {
    if (source.lineage.kind === "EXACT_REPACK_DUPLICATE"
      && !sourceIds.has(source.lineage.duplicateOfSourceId)) {
      fail("DUPLICATE_TARGET_SOURCE_MISSING", source.sourceId);
    }
    if (source.lineage.kind === "EXACT_REPACK_DUPLICATE") {
      const target = normalizedSources.find((candidate) =>
        candidate.sourceId === source.lineage.duplicateOfSourceId);
      if (target.lineage.kind !== "NO_EXACT_REPACK_RELATION_ESTABLISHED"
        || target.disposition === "LEDGER_DUPLICATE") {
        fail("DUPLICATE_TARGET_NOT_PRIMARY_LEDGER_ENTRY", source.sourceId);
      }
      if (target.identity.physicality !== source.identity.physicality) {
        fail("DUPLICATE_TARGET_PHYSICALITY_MISMATCH", source.sourceId);
      }
    }
  }
  normalizedScopes.sort((left, right) => left.scopeId.localeCompare(right.scopeId));
  normalizedSources.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const populationEntries = normalizedSources.flatMap((source) =>
    source.populations.map((population) => ({ sourceId: source.sourceId, ...population })));
  const body = {
    schema: EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA,
    schemaVersion: "2.0.0",
    discovery: {
      scopes: normalizedScopes,
      scopeCount: normalizedScopes.length,
      exhaustedDeclaredScopeCount: normalizedScopes.filter((scope) =>
        scope.declaredScopeExhausted).length,
      allDeclaredScopesExhausted: normalizedScopes.every((scope) =>
        scope.declaredScopeExhausted),
      sourceUniverseExhausted: false,
      undiscoveredSourcesRuledOut: false,
      globalExhaustion: false,
    },
    sources: normalizedSources,
    sourceSummary: {
      sourceCount: normalizedSources.length,
      nonDuplicateLedgerEntryCount: normalizedSources.filter((source) =>
        source.lineage.kind === "NO_EXACT_REPACK_RELATION_ESTABLISHED").length,
      lineageDuplicateSourceCount: normalizedSources.filter((source) =>
        source.lineage.kind === "EXACT_REPACK_DUPLICATE").length,
      dispositionCounts: Object.fromEntries(
        EPISODE_DATA_PUBLIC_SOURCE_DISPOSITIONS.map((disposition) => [disposition,
          normalizedSources.filter((source) => source.disposition === disposition).length])),
      ledgerEntryPhysicalityCounts: Object.fromEntries(
        EPISODE_DATA_PUBLIC_SOURCE_PHYSICALITY.map((physicality) => [physicality,
          normalizedSources.filter((source) =>
            source.identity.physicality === physicality).length])),
      nonDuplicateLedgerEntryPhysicalityCounts: Object.fromEntries(
        EPISODE_DATA_PUBLIC_SOURCE_PHYSICALITY.map((physicality) => [physicality,
          normalizedSources.filter((source) =>
            source.lineage.kind === "NO_EXACT_REPACK_RELATION_ESTABLISHED"
            && source.identity.physicality === physicality).length])),
      allArtifactAttestationsStructurallyBound: true,
      sourceReplayTrustEstablishedByCatalogAlone: false,
      completeEpisodeIntersectionCount: 0,
      completeEpisodeIntersectionEstablished: false,
    },
    populationRegistry: {
      entries: populationEntries,
      entryCount: populationEntries.length,
      domainEntryCounts: Object.fromEntries(
        EPISODE_DATA_PUBLIC_SOURCE_EVIDENCE_DOMAINS.map((domain) => [domain,
          populationEntries.filter((population) =>
            population.evidenceDomain === domain).length])),
      crossPopulationTotal: null,
      crossPopulationAdditionProhibited: true,
      crossSourceDisjointnessEstablished: false,
      analyticPopulationFromCatalogSumEstablished: false,
    },
    segmentCoverage: {
      segments: segmentSummary(normalizedSources),
      completeEpisodeIntersectionCount: 0,
      completeEpisodeIntersectionEstablished: false,
      crossSegmentAdditionProhibited: true,
    },
    useBoundary: {
      authorizedTrainingSources: 0,
      productionTrainingRows: 0,
      networkAdmissionSources: 0,
      delegationAuthoritySources: 0,
      actionAuthorityUnits: 0,
      causalExperienceUnits: 0,
      closureCredit: 0,
      pricingAuthorized: false,
      guaranteeAuthorized: false,
      settlementAuthorized: false,
    },
  };
  return deepFreeze({
    ...body,
    catalogHash: digest(body, EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA),
  });
}

export function verifyEpisodeDataPublicSourceCatalog(catalog,
  { discoveryScopes, sources } = {}) {
  try {
    if (!catalog || catalog.schema !== EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA
      || catalog.schemaVersion !== "2.0.0" || !HASH.test(catalog.catalogHash ?? "")) {
      return Object.freeze({ ok: false,
        error: "EPISODE_DATA_PUBLIC_SOURCE_CATALOG_INVALID" });
    }
    const rebuilt = buildEpisodeDataPublicSourceCatalog({ discoveryScopes, sources });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(catalog)) {
      return Object.freeze({ ok: false,
        error: "EPISODE_DATA_PUBLIC_SOURCE_CATALOG_REPRODUCTION_MISMATCH" });
    }
    return Object.freeze({
      ok: true,
      sourceReplayEstablished: false,
      attestationTrustBoundary:
        EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
      catalogHash: rebuilt.catalogHash,
      sourceCount: rebuilt.sourceSummary.sourceCount,
      populationEntryCount: rebuilt.populationRegistry.entryCount,
      completeEpisodeIntersectionCount: 0,
      globalExhaustion: false,
      productionTrainingRows: 0,
    });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export { digest as episodeDataPublicSourceCatalogDigest };
