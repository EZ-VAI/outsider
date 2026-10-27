/*
 * Typed source, admission and coverage ledger for the Episode Data Engine.
 *
 * This module does not discover, acquire or re-verify a source.  It accepts
 * only normalized facts emitted after the source-specific verifiers have run,
 * then prevents heterogeneous source units, segment attributions and model-use
 * states from being silently collapsed into one denominator or permission.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const EPISODE_DATA_SOURCE_LEDGER_SCHEMA =
  "outsider/episode-data-source-admission-ledger/v1";
export const EPISODE_DATA_EXTERNAL_DISCOVERY_QUERY_LEDGER_SCHEMA =
  "outsider/episode-data-external-discovery-query-ledger/v1";

export const EPISODE_DATA_SOURCE_DENOMINATOR_CLASSES = Object.freeze([
  "REALITY_EPISODE_RECORD",
  "CONSTRUCTED_EPISODE_BYTE_COMMITMENT",
  "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION",
  "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
]);

export const EPISODE_DATA_SOURCE_KINDS = Object.freeze([
  "REAL_DIGITAL_AGENT_EPISODE",
  "REAL_DIGITAL_AGENT_EPISODE_WITH_INDEPENDENT_TERMINAL_REVIEW",
  "REAL_EMBODIED_ACTION_EFFECT_EPISODE",
  "CONSTRUCTED_OFFLINE_RESEARCH_EPISODE",
  "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION",
  "REAL_MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
]);

export const EPISODE_DATA_SEGMENTS = Object.freeze([
  "opportunityCensus", "delegationAuthorization", "actionTrace", "effect", "outcome",
  "recovery", "longitudinal",
]);

export const EPISODE_DATA_SOURCE_CANDIDATE_DISPOSITIONS = Object.freeze([
  "ADMITTED",
  "PENDING_ACQUISITION",
  "QUARANTINE_EVAL",
  "METADATA_ONLY",
  "REJECTED",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const DISCOVERY_LEDGER_STATES = new Set([
  "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
  "BOUNDED_SAMPLE_LEDGER_REPLAYED_NOT_EXHAUSTIVE",
  "NO_DISCOVERY_CANDIDATE_LEDGER",
]);
const MODEL_FITTING_STATES = new Set([
  "PERFORMED_IN_ENGINE",
  "REPLAYED_FROM_VERIFIED_SUPPLEMENT",
  "NOT_PERFORMED",
]);
const SOURCE_KIND_DENOMINATOR_CLASS = Object.freeze({
  REAL_DIGITAL_AGENT_EPISODE: "REALITY_EPISODE_RECORD",
  REAL_DIGITAL_AGENT_EPISODE_WITH_INDEPENDENT_TERMINAL_REVIEW:
    "REALITY_EPISODE_RECORD",
  REAL_EMBODIED_ACTION_EFFECT_EPISODE: "REALITY_EPISODE_RECORD",
  CONSTRUCTED_OFFLINE_RESEARCH_EPISODE: "CONSTRUCTED_EPISODE_BYTE_COMMITMENT",
  PAIRED_RECOVERY_MORPHOLOGY_EVALUATION:
    "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION",
  REAL_MECHANICAL_SYSTEM_IDENTIFICATION_TRACE:
    "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
});
const TERMINAL_CANDIDATE_DISPOSITIONS = new Set([
  "ADMITTED", "QUARANTINE_EVAL", "METADATA_ONLY", "REJECTED",
]);

const exactKeys = (value, keys) => value && typeof value === "object"
  && !Array.isArray(value)
  && canonicalizeStrict(Object.keys(value).sort()) === canonicalizeStrict([...keys].sort());

function fail(code, detail = null) {
  throw new Error(`EPISODE_DATA_SOURCE_LEDGER_${code}${detail === null ? "" : `:${detail}`}`);
}

function digest(value, domain = EPISODE_DATA_SOURCE_LEDGER_SCHEMA) {
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

function count(value, detail) {
  if (!Number.isSafeInteger(value) || value < 0) fail("COUNT_INVALID", detail);
  return value;
}

function nonempty(value, detail) {
  if (typeof value !== "string" || value.length === 0) fail("STRING_INVALID", detail);
  return value;
}

function validateDiscovery(discovery, sourceId) {
  if (!exactKeys(discovery, [
    "channel", "candidateLedgerState", "candidateLedgerEvidenceHash",
    "declaredScope", "declaredScopeExhausted", "sourceUniverseExhausted",
    "globalDiscoveryExhausted",
  ])
    || !DISCOVERY_LEDGER_STATES.has(discovery.candidateLedgerState)
    || !HASH.test(discovery.candidateLedgerEvidenceHash ?? "")
    || typeof discovery.declaredScopeExhausted !== "boolean"
    || discovery.sourceUniverseExhausted !== false
    || discovery.globalDiscoveryExhausted !== false) {
    fail("DISCOVERY_INVALID", sourceId);
  }
  nonempty(discovery.channel, `${sourceId}:channel`);
  nonempty(discovery.declaredScope, `${sourceId}:declaredScope`);
  if (discovery.declaredScopeExhausted
    && discovery.candidateLedgerState !== "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED") {
    fail("DECLARED_SCOPE_EXHAUSTION_WITHOUT_EXACT_LEDGER", sourceId);
  }
}

function validateClearances(clearances, sourceId) {
  if (!exactKeys(clearances, ["revision", "rights", "privacy", "use"])
    || !exactKeys(clearances.revision, ["status", "evidenceHash"])
    || !exactKeys(clearances.rights, [
      "status", "evidenceHash", "legalConclusionEstablished",
      "productionTrainingAuthorized",
    ])
    || !exactKeys(clearances.privacy, [
      "status", "evidenceHash", "rawContentProjected", "noPiiGuaranteed",
    ])
    || !exactKeys(clearances.use, [
      "status", "evidenceHash", "offlineModelFittingAllowed",
      "authorizedTrainingAllowed", "networkAdmissionAllowed",
      "delegationAuthorityAllowed",
    ])) {
    fail("CLEARANCE_SHAPE_INVALID", sourceId);
  }
  for (const [kind, clearance] of Object.entries(clearances)) {
    nonempty(clearance.status, `${sourceId}:${kind}:status`);
    if (!HASH.test(clearance.evidenceHash ?? "")) {
      fail("CLEARANCE_EVIDENCE_HASH_INVALID", `${sourceId}:${kind}`);
    }
  }
  if (clearances.rights.legalConclusionEstablished !== false
    || clearances.rights.productionTrainingAuthorized !== false
    || clearances.privacy.rawContentProjected !== false
    || clearances.privacy.noPiiGuaranteed !== false
    || typeof clearances.use.offlineModelFittingAllowed !== "boolean"
    || clearances.use.authorizedTrainingAllowed !== false
    || clearances.use.networkAdmissionAllowed !== false
    || clearances.use.delegationAuthorityAllowed !== false) {
    fail("CLEARANCE_BOUNDARY_INVALID", sourceId);
  }
}

function validateSegment(segment, units, detail) {
  if (!exactKeys(segment, [
    "sourceNativeCount", "sourceNativeAttribution", "independentCount",
    "independentAttribution", "crossAttributionAdditionPermitted", "additiveTotal",
  ])) fail("SEGMENT_SHAPE_INVALID", detail);
  count(segment.sourceNativeCount, `${detail}:sourceNativeCount`);
  count(segment.independentCount, `${detail}:independentCount`);
  if (segment.sourceNativeCount > units || segment.independentCount > units) {
    fail("SEGMENT_COUNT_EXCEEDS_SOURCE_UNITS", detail);
  }
  nonempty(segment.sourceNativeAttribution, `${detail}:sourceNativeAttribution`);
  nonempty(segment.independentAttribution, `${detail}:independentAttribution`);
  if (segment.crossAttributionAdditionPermitted !== false
    || segment.additiveTotal !== null) {
    fail("SEGMENT_ATTRIBUTION_ADDITION_FORBIDDEN", detail);
  }
}

function validateSource(source) {
  if (!exactKeys(source, [
    "sourceId", "revision", "revisionCommitment", "sourceKind", "denominator",
    "discovery", "clearances", "admission", "segments", "modelUse",
  ])) fail("SOURCE_SHAPE_INVALID", source?.sourceId);
  nonempty(source.sourceId, "sourceId");
  canonicalizeStrict(source.revision);
  if (!HASH.test(source.revisionCommitment ?? "")
    || !EPISODE_DATA_SOURCE_KINDS.includes(source.sourceKind)
    || !exactKeys(source.denominator, [
      "class", "unit", "units", "realitySegmentGapEligible",
    ])
    || !EPISODE_DATA_SOURCE_DENOMINATOR_CLASSES.includes(source.denominator.class)
    || typeof source.denominator.realitySegmentGapEligible !== "boolean") {
    fail("SOURCE_IDENTITY_OR_DENOMINATOR_INVALID", source.sourceId);
  }
  nonempty(source.denominator.unit, `${source.sourceId}:denominatorUnit`);
  count(source.denominator.units, `${source.sourceId}:denominatorUnits`);
  if (source.denominator.class !== SOURCE_KIND_DENOMINATOR_CLASS[source.sourceKind]) {
    fail("SOURCE_KIND_DENOMINATOR_MISMATCH", source.sourceId);
  }
  if (source.denominator.realitySegmentGapEligible
    !== (source.denominator.class === "REALITY_EPISODE_RECORD")) {
    fail("REALITY_DENOMINATOR_ADMISSION_MISMATCH", source.sourceId);
  }
  validateDiscovery(source.discovery, source.sourceId);
  validateClearances(source.clearances, source.sourceId);
  if (!exactKeys(source.admission, [
    "realitySegmentGapAccounting", "offlineModelFitting", "authorizedTraining",
    "networkAdmission", "delegationAuthority",
  ])
    || source.admission.realitySegmentGapAccounting
      !== source.denominator.realitySegmentGapEligible
    || typeof source.admission.offlineModelFitting !== "boolean"
    || source.admission.authorizedTraining !== false
    || source.admission.networkAdmission !== false
    || source.admission.delegationAuthority !== false
    || (source.admission.offlineModelFitting
      && source.clearances.use.offlineModelFittingAllowed !== true)) {
    fail("SOURCE_ADMISSION_INVALID", source.sourceId);
  }
  if (!exactKeys(source.segments, EPISODE_DATA_SEGMENTS)) {
    fail("SOURCE_SEGMENTS_INVALID", source.sourceId);
  }
  for (const segment of EPISODE_DATA_SEGMENTS) {
    validateSegment(source.segments[segment], source.denominator.units,
      `${source.sourceId}:${segment}`);
  }
  if (!exactKeys(source.modelUse, ["offlineModelFitting", "authorizedTraining"])
    || !exactKeys(source.modelUse.offlineModelFitting, [
      "state", "modelCount", "automaticallyDeployed",
    ])
    || !MODEL_FITTING_STATES.has(source.modelUse.offlineModelFitting.state)
    || source.modelUse.offlineModelFitting.automaticallyDeployed !== false
    || !exactKeys(source.modelUse.authorizedTraining, [
      "performed", "rowsAuthorized", "jobsAuthorized",
    ])
    || source.modelUse.authorizedTraining.performed !== false
    || source.modelUse.authorizedTraining.rowsAuthorized !== 0
    || source.modelUse.authorizedTraining.jobsAuthorized !== 0) {
    fail("MODEL_USE_BOUNDARY_INVALID", source.sourceId);
  }
  count(source.modelUse.offlineModelFitting.modelCount,
    `${source.sourceId}:offlineModelCount`);
  if ((source.modelUse.offlineModelFitting.state === "NOT_PERFORMED")
      !== (source.modelUse.offlineModelFitting.modelCount === 0)
    || (source.modelUse.offlineModelFitting.modelCount > 0
      && source.admission.offlineModelFitting !== true)) {
    fail("MODEL_FITTING_ADMISSION_INVALID", source.sourceId);
  }
}

function validateCandidate(candidate) {
  if (!exactKeys(candidate, [
    "candidateId", "disposition", "reason", "sourceEntryBound", "gates",
  ])
    || typeof candidate.candidateId !== "string" || candidate.candidateId.length === 0
    || !EPISODE_DATA_SOURCE_CANDIDATE_DISPOSITIONS.includes(candidate.disposition)
    || typeof candidate.reason !== "string" || candidate.reason.length === 0
    || typeof candidate.sourceEntryBound !== "boolean"
    || !exactKeys(candidate.gates, [
      "acquisition", "sourceReplay", "revision", "rights", "privacy", "use",
    ])) {
    fail("CANDIDATE_INVALID", candidate?.candidateId);
  }
  for (const [gate, state] of Object.entries(candidate.gates)) {
    nonempty(state, `${candidate.candidateId}:${gate}`);
  }
  if (candidate.sourceEntryBound
    && !["ADMITTED", "QUARANTINE_EVAL"].includes(candidate.disposition)) {
    fail("CANDIDATE_BOUND_NONADMISSIBLE_DISPOSITION", candidate.candidateId);
  }
  if (candidate.disposition === "ADMITTED" && candidate.sourceEntryBound !== true) {
    fail("ADMITTED_CANDIDATE_SOURCE_ENTRY_REQUIRED", candidate.candidateId);
  }
}

function queryLedgerBody({ cutoff, query, candidates }) {
  nonempty(query, "externalDiscoveryQuery");
  if (typeof cutoff !== "string" || Number.isNaN(Date.parse(cutoff))
    || new Date(cutoff).toISOString() !== cutoff) {
    fail("EXTERNAL_DISCOVERY_CUTOFF_INVALID");
  }
  return {
    cutoff,
    query,
    resultCount: candidates.length,
    terminalDispositions: candidates
      .filter((candidate) => TERMINAL_CANDIDATE_DISPOSITIONS.has(candidate.disposition))
      .map((candidate) => ({ candidateId: candidate.candidateId,
        disposition: candidate.disposition }))
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
  };
}

export function buildEpisodeDataExternalDiscoveryQueryLedger(
  { cutoff, query, candidates } = {},
) {
  if (!Array.isArray(candidates)) fail("EXTERNAL_DISCOVERY_CANDIDATES_REQUIRED");
  const normalizedCandidates = candidates.map(cloneCanonical);
  const candidateIds = new Set();
  for (const candidate of normalizedCandidates) {
    validateCandidate(candidate);
    if (candidateIds.has(candidate.candidateId)) {
      fail("CANDIDATE_DUPLICATE", candidate.candidateId);
    }
    candidateIds.add(candidate.candidateId);
  }
  const body = queryLedgerBody({ cutoff, query, candidates: normalizedCandidates });
  return deepFreeze({ ...body, queryLedgerHash: digest(body,
    EPISODE_DATA_EXTERNAL_DISCOVERY_QUERY_LEDGER_SCHEMA) });
}

function validateScope(scope, candidates) {
  if (!exactKeys(scope, [
    "scopeId", "declarationEvidenceHash", "externalDiscoveryPerformed",
    "externalDiscoveryQueryLedger",
  ])
    || typeof scope.scopeId !== "string" || scope.scopeId.length === 0
    || !HASH.test(scope.declarationEvidenceHash ?? "")
    || typeof scope.externalDiscoveryPerformed !== "boolean") {
    fail("DISCOVERY_SCOPE_INVALID");
  }
  if (scope.externalDiscoveryPerformed === false) {
    if (scope.externalDiscoveryQueryLedger !== null) {
      fail("EXTERNAL_DISCOVERY_LEDGER_WITHOUT_DISCOVERY");
    }
    return;
  }
  const ledger = scope.externalDiscoveryQueryLedger;
  if (!exactKeys(ledger, [
    "cutoff", "query", "resultCount", "terminalDispositions", "queryLedgerHash",
  ]) || !HASH.test(ledger.queryLedgerHash ?? "")
    || !Array.isArray(ledger.terminalDispositions)) {
    fail("EXTERNAL_DISCOVERY_LEDGER_INVALID");
  }
  const expected = buildEpisodeDataExternalDiscoveryQueryLedger({
    cutoff: ledger.cutoff,
    query: ledger.query,
    candidates,
  });
  if (canonicalizeStrict(expected) !== canonicalizeStrict(ledger)) {
    fail("EXTERNAL_DISCOVERY_LEDGER_REPRODUCTION_MISMATCH");
  }
}

function attributionSummary(sources) {
  const reality = sources.filter((source) =>
    source.denominator.class === "REALITY_EPISODE_RECORD");
  return Object.fromEntries(EPISODE_DATA_SEGMENTS.map((segment) => [segment, {
    sourceNativeCount: reality.reduce((total, source) =>
      total + source.segments[segment].sourceNativeCount, 0),
    independentCount: reality.reduce((total, source) =>
      total + source.segments[segment].independentCount, 0),
    crossAttributionAdditionPermitted: false,
    additiveTotal: null,
    episodeUnionEstablished: false,
  }]));
}

export function buildEpisodeDataSourceLedger({ scope, candidates, sources } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    fail("CANDIDATES_REQUIRED");
  }
  if (!Array.isArray(sources) || sources.length === 0) fail("SOURCES_REQUIRED");
  const normalizedCandidates = candidates.map(cloneCanonical);
  const normalized = sources.map(cloneCanonical);
  const ids = new Set();
  for (const source of normalized) {
    validateSource(source);
    if (ids.has(source.sourceId)) fail("SOURCE_DUPLICATE", source.sourceId);
    ids.add(source.sourceId);
  }
  normalized.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const candidateIds = new Set();
  for (const candidate of normalizedCandidates) {
    validateCandidate(candidate);
    if (candidateIds.has(candidate.candidateId)) {
      fail("CANDIDATE_DUPLICATE", candidate.candidateId);
    }
    candidateIds.add(candidate.candidateId);
    if (candidate.sourceEntryBound !== ids.has(candidate.candidateId)) {
      fail("CANDIDATE_SOURCE_BINDING_INVALID", candidate.candidateId);
    }
  }
  for (const sourceId of ids) {
    if (!candidateIds.has(sourceId)) fail("SOURCE_CANDIDATE_MISSING", sourceId);
  }
  validateScope(scope, normalizedCandidates);
  normalizedCandidates.sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId));
  const denominatorRegistry = EPISODE_DATA_SOURCE_DENOMINATOR_CLASSES.map((kind) => ({
    class: kind,
    units: normalized.filter((source) => source.denominator.class === kind)
      .reduce((total, source) => total + source.denominator.units, 0),
    sourceCount: normalized.filter((source) => source.denominator.class === kind).length,
  }));
  const performedInEngine = normalized.filter((source) =>
    source.modelUse.offlineModelFitting.state === "PERFORMED_IN_ENGINE")
    .reduce((total, source) => total + source.modelUse.offlineModelFitting.modelCount, 0);
  const replayedSupplemental = normalized.filter((source) =>
    source.modelUse.offlineModelFitting.state === "REPLAYED_FROM_VERIFIED_SUPPLEMENT")
    .reduce((total, source) => total + source.modelUse.offlineModelFitting.modelCount, 0);
  const body = {
    schema: EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
    schemaVersion: "1.0.0",
    discovery: {
      sourceSetSelectionAuthority:
        "CODE_FIXED_ENGINE_POLICY_AFTER_SOURCE_SPECIFIC_REPLAY_NOT_GLOBAL_DISCOVERY",
      declaredScope: cloneCanonical(scope),
      candidateUniverseExplicit: true,
      candidates: normalizedCandidates,
      dispositionCounts: Object.fromEntries(
        EPISODE_DATA_SOURCE_CANDIDATE_DISPOSITIONS.map((disposition) => [disposition,
          normalizedCandidates.filter((candidate) =>
            candidate.disposition === disposition).length])),
      allDeclaredCandidatesTerminal: normalizedCandidates.every((candidate) =>
        TERMINAL_CANDIDATE_DISPOSITIONS.has(candidate.disposition)),
      declaredScopeExhausted: normalizedCandidates.every((candidate) =>
        TERMINAL_CANDIDATE_DISPOSITIONS.has(candidate.disposition)),
      sourceCount: normalized.length,
      sourcesWithExactDeclaredScopeLedger: normalized.filter((source) =>
        source.discovery.candidateLedgerState
          === "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED").length,
      declaredScopesExhausted: normalized.filter((source) =>
        source.discovery.declaredScopeExhausted).length,
      allSourceAcquisitionScopesExhausted: normalized.every((source) =>
        source.discovery.declaredScopeExhausted),
      discoveryCandidateUniverseComplete: false,
      undiscoveredSourcesRuledOut: false,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    sources: normalized,
    denominatorRegistry: {
      domains: denominatorRegistry,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
      analyticPopulationFromCrossDomainSumEstablished: false,
    },
    segmentCoverageAttribution: {
      denominatorClass: "REALITY_EPISODE_RECORD",
      segments: attributionSummary(normalized),
      crossSegmentAdditionPermitted: false,
      crossSourceIndependenceEstablished: false,
      completeEpisodeIntersectionCount: 0,
      completeEpisodeIntersectionEstablished: false,
    },
    admissions: {
      realitySegmentGapAccountingSources: normalized.filter((source) =>
        source.admission.realitySegmentGapAccounting).length,
      offlineModelFittingSources: normalized.filter((source) =>
        source.admission.offlineModelFitting).length,
      authorizedTrainingSources: 0,
      networkAdmissionSources: 0,
      delegationAuthoritySources: 0,
    },
    modelUse: {
      offlineModelFitting: {
        performedInEngineModelCount: performedInEngine,
        replayedVerifiedSupplementModelCount: replayedSupplemental,
        crossOriginModelCountTotal: null,
        crossOriginAdditionProhibited: true,
        automaticallyDeployed: false,
      },
      authorizedTraining: {
        performed: false,
        rowsAuthorized: 0,
        jobsAuthorized: 0,
        inheritedFromModelFitting: false,
      },
    },
    boundary: {
      authority: "NONE",
      authorityUnits: 0,
      causalExperienceUnits: 0,
      closureCredit: 0,
      actionAuthorized: false,
      pricingAuthorized: false,
      guaranteeAuthorized: false,
      settlementAuthorized: false,
    },
  };
  return deepFreeze({ ...body,
    ledgerHash: digest(body, EPISODE_DATA_SOURCE_LEDGER_SCHEMA) });
}

export function verifyEpisodeDataSourceLedger(ledger, { scope, candidates, sources } = {}) {
  try {
    if (!ledger || ledger.schema !== EPISODE_DATA_SOURCE_LEDGER_SCHEMA
      || ledger.schemaVersion !== "1.0.0" || !HASH.test(ledger.ledgerHash ?? "")) {
      return Object.freeze({ ok: false, error: "EPISODE_DATA_SOURCE_LEDGER_INVALID" });
    }
    const rebuilt = buildEpisodeDataSourceLedger({ scope, candidates, sources });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(ledger)) {
      return Object.freeze({ ok: false,
        error: "EPISODE_DATA_SOURCE_LEDGER_REPRODUCTION_MISMATCH" });
    }
    return Object.freeze({ ok: true, ledgerHash: rebuilt.ledgerHash,
      sourceCount: rebuilt.sources.length,
      globalExhaustion: false,
      crossDomainTotal: null,
      authorizedTrainingRows: 0 });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export { digest as episodeDataSourceLedgerDigest };
