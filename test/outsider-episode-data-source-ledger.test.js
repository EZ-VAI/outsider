import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEpisodeDataExternalDiscoveryQueryLedger,
  EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
  buildEpisodeDataSourceLedger,
  verifyEpisodeDataSourceLedger,
} from "../src/outsider-episode-data-source-ledger.js";

const HASH = (character) => `sha256:${character.repeat(64)}`;

function segment(sourceNativeCount = 0, independentCount = 0) {
  return { sourceNativeCount,
    sourceNativeAttribution: sourceNativeCount === 0 ? "NONE" : "SOURCE_NATIVE_TEST",
    independentCount,
    independentAttribution: independentCount === 0 ? "NONE" : "INDEPENDENT_TEST",
    crossAttributionAdditionPermitted: false, additiveTotal: null };
}

function source({ id, denominatorClass, units, sourceKind, reality,
  fittingState = "NOT_PERFORMED", modelCount = 0, outcomeNative = 0,
  outcomeIndependent = 0 } = {}) {
  return {
    sourceId: id,
    revision: "revision-1",
    revisionCommitment: HASH("1"),
    sourceKind,
    denominator: { class: denominatorClass, unit: "test-unit", units,
      realitySegmentGapEligible: reality },
    discovery: { channel: "TEST_FIXED_POLICY",
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: HASH("2"), declaredScope: "TEST_SCOPE",
      declaredScopeExhausted: true, sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false },
    clearances: {
      revision: { status: "TEST_REVISION_REPLAYED", evidenceHash: HASH("3") },
      rights: { status: "TEST_DECLARATION_ONLY", evidenceHash: HASH("4"),
        legalConclusionEstablished: false, productionTrainingAuthorized: false },
      privacy: { status: "TEST_NO_PII_GUARANTEE", evidenceHash: HASH("5"),
        rawContentProjected: false, noPiiGuaranteed: false },
      use: { status: "TEST_LOCAL_OFFLINE_ONLY", evidenceHash: HASH("6"),
        offlineModelFittingAllowed: modelCount > 0,
        authorizedTrainingAllowed: false, networkAdmissionAllowed: false,
        delegationAuthorityAllowed: false },
    },
    admission: { realitySegmentGapAccounting: reality,
      offlineModelFitting: modelCount > 0, authorizedTraining: false,
      networkAdmission: false, delegationAuthority: false },
    segments: { opportunityCensus: segment(), delegationAuthorization: segment(),
      actionTrace: segment(units), effect: segment(),
      outcome: segment(outcomeNative, outcomeIndependent), recovery: segment(),
      longitudinal: segment() },
    modelUse: { offlineModelFitting: { state: fittingState, modelCount,
      automaticallyDeployed: false }, authorizedTraining: { performed: false,
      rowsAuthorized: 0, jobsAuthorized: 0 } },
  };
}

function candidate(candidateId, disposition = "ADMITTED", sourceEntryBound = true) {
  return { candidateId, disposition, reason: "TEST_EXPLICIT_CANDIDATE_DISPOSITION",
    sourceEntryBound,
    gates: { acquisition: "TEST_ACQUISITION_GATE",
      sourceReplay: "TEST_SOURCE_REPLAY_GATE", revision: "TEST_REVISION_GATE",
      rights: "TEST_RIGHTS_GATE", privacy: "TEST_PRIVACY_GATE", use: "TEST_USE_GATE" } };
}

function candidatesFor(sources) {
  return sources.map((item) => candidate(item.sourceId));
}

function discoveryScope(externalDiscoveryQueryLedger = null) {
  return { scopeId: "TEST_DECLARED_CANDIDATE_SCOPE",
    declarationEvidenceHash: HASH("0"),
    externalDiscoveryPerformed: externalDiscoveryQueryLedger !== null,
    externalDiscoveryQueryLedger };
}

function fixtures() {
  return [
    source({ id: "reality-source", denominatorClass: "REALITY_EPISODE_RECORD",
      units: 2, sourceKind: "REAL_DIGITAL_AGENT_EPISODE", reality: true,
      fittingState: "PERFORMED_IN_ENGINE", modelCount: 2,
      outcomeNative: 2, outcomeIndependent: 1 }),
    source({ id: "constructed-source",
      denominatorClass: "CONSTRUCTED_EPISODE_BYTE_COMMITMENT", units: 3,
      sourceKind: "CONSTRUCTED_OFFLINE_RESEARCH_EPISODE", reality: false }),
    source({ id: "morphology-source",
      denominatorClass: "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION", units: 1,
      sourceKind: "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION", reality: false }),
  ];
}

test("typed source ledger forbids global exhaustion, cross-domain totals and training inheritance",
  () => {
    const sources = fixtures();
    const candidates = candidatesFor(sources);
    const scope = discoveryScope();
    const ledger = buildEpisodeDataSourceLedger({ scope, candidates, sources });
    assert.equal(ledger.schema, EPISODE_DATA_SOURCE_LEDGER_SCHEMA);
    assert.equal(ledger.discovery.globalExhaustion, false);
    assert.equal(ledger.discovery.sourceUniverseExhausted, false);
    assert.equal(ledger.discovery.declaredScopeExhausted, true);
    assert.equal(ledger.discovery.declaredScope.externalDiscoveryPerformed, false);
    assert.equal(ledger.discovery.declaredScope.externalDiscoveryQueryLedger, null);
    assert.deepEqual(ledger.denominatorRegistry.domains.map((item) =>
      [item.class, item.units]), [
      ["REALITY_EPISODE_RECORD", 2],
      ["CONSTRUCTED_EPISODE_BYTE_COMMITMENT", 3],
      ["PAIRED_RECOVERY_MORPHOLOGY_EVALUATION", 1],
      ["MECHANICAL_SYSTEM_IDENTIFICATION_TRACE", 0],
    ]);
    assert.equal(ledger.denominatorRegistry.crossDomainTotal, null);
    assert.equal(ledger.denominatorRegistry.crossDomainAdditionProhibited, true);
    assert.equal(ledger.segmentCoverageAttribution.segments.outcome.sourceNativeCount, 2);
    assert.equal(ledger.segmentCoverageAttribution.segments.outcome.independentCount, 1);
    assert.equal(ledger.segmentCoverageAttribution.segments.outcome.additiveTotal, null);
    assert.equal(ledger.segmentCoverageAttribution.crossSegmentAdditionPermitted, false);
    assert.equal(ledger.modelUse.offlineModelFitting.performedInEngineModelCount, 2);
    assert.deepEqual(ledger.modelUse.authorizedTraining, {
      performed: false, rowsAuthorized: 0, jobsAuthorized: 0,
      inheritedFromModelFitting: false,
    });
    assert.equal(verifyEpisodeDataSourceLedger(ledger,
      { scope, candidates, sources }).ok, true);

    const global = fixtures();
    global[0].discovery.globalDiscoveryExhausted = true;
    assert.throws(() => buildEpisodeDataSourceLedger({ scope, candidates, sources: global }),
      /DISCOVERY_INVALID/u);
    const unprovedScope = fixtures();
    unprovedScope[0].discovery.candidateLedgerState = "NO_DISCOVERY_CANDIDATE_LEDGER";
    assert.throws(() => buildEpisodeDataSourceLedger(
      { scope, candidates, sources: unprovedScope }),
      /DECLARED_SCOPE_EXHAUSTION_WITHOUT_EXACT_LEDGER/u);
    const additive = fixtures();
    additive[0].segments.outcome.additiveTotal = 3;
    assert.throws(() => buildEpisodeDataSourceLedger({ scope, candidates, sources: additive }),
      /SEGMENT_ATTRIBUTION_ADDITION_FORBIDDEN/u);
    const training = fixtures();
    training[0].modelUse.authorizedTraining.performed = true;
    training[0].modelUse.authorizedTraining.rowsAuthorized = 2;
    assert.throws(() => buildEpisodeDataSourceLedger({ scope, candidates, sources: training }),
      /MODEL_USE_BOUNDARY_INVALID/u);
    const resealed = structuredClone(ledger);
    resealed.denominatorRegistry.crossDomainTotal = 6;
    assert.equal(verifyEpisodeDataSourceLedger(resealed,
      { scope, candidates, sources }).ok, false);
  });

test("candidate API represents pending, quarantine, metadata and rejected discovery results",
  () => {
    const sources = fixtures();
    const candidates = candidatesFor(sources).concat([
      candidate("future-robot-source", "PENDING_ACQUISITION", false),
      candidate("future-agent-quarantine", "QUARANTINE_EVAL", false),
      candidate("metadata-only-source", "METADATA_ONLY", false),
      candidate("rejected-source", "REJECTED", false),
    ]);
    const queryLedger = buildEpisodeDataExternalDiscoveryQueryLedger({
      cutoff: "2026-08-29T00:00:00.000Z",
      query: "TEST_PINNED_ROBOT_AND_AGENT_CANDIDATE_QUERY",
      candidates,
    });
    const scope = discoveryScope(queryLedger);
    const ledger = buildEpisodeDataSourceLedger({ scope, candidates, sources });
    assert.equal(ledger.discovery.declaredScopeExhausted, false);
    assert.equal(ledger.discovery.allDeclaredCandidatesTerminal, false);
    assert.equal(ledger.discovery.globalExhaustion, false);
    assert.equal(queryLedger.resultCount, candidates.length);
    assert.equal(queryLedger.terminalDispositions.length, candidates.length - 1);
    assert.deepEqual(ledger.discovery.dispositionCounts, {
      ADMITTED: 3,
      PENDING_ACQUISITION: 1,
      QUARANTINE_EVAL: 1,
      METADATA_ONLY: 1,
      REJECTED: 1,
    });

    const terminalCandidates = candidates.map((item) => item.candidateId
      === "future-robot-source"
      ? { ...item, disposition: "REJECTED",
        reason: "TEST_TERMINAL_ACQUISITION_REJECTION" }
      : item);
    const terminalQueryLedger = buildEpisodeDataExternalDiscoveryQueryLedger({
      cutoff: "2026-08-29T00:00:00.000Z",
      query: "TEST_PINNED_ROBOT_AND_AGENT_CANDIDATE_QUERY",
      candidates: terminalCandidates,
    });
    const terminalScope = discoveryScope(terminalQueryLedger);
    const terminalLedger = buildEpisodeDataSourceLedger({ scope: terminalScope,
      candidates: terminalCandidates, sources });
    assert.equal(terminalLedger.discovery.declaredScopeExhausted, true);
    assert.equal(terminalLedger.discovery.allDeclaredCandidatesTerminal, true);
    assert.equal(terminalLedger.discovery.globalExhaustion, false);
  });
