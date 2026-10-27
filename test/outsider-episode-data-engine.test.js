import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  EPISODE_DATA_ENGINE_BASELINE_FEATURES,
  EPISODE_DATA_ENGINE_ISSUE_FEATURES,
  EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA,
  EPISODE_DATA_ENGINE_SCHEMA,
  buildEpisodeDataEngineRunReceipt,
  episodeDataEngineDigest,
  evaluateEpisodeDataEngineFromSource,
  verifyEpisodeDataEngineReport,
  verifyEpisodeDataEngineRunReceipt,
} from "../src/outsider-episode-data-engine.js";
import { EPISODE_DATA_SOURCE_LEDGER_SCHEMA } from
  "../src/outsider-episode-data-source-ledger.js";

const ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/public-agent-corpus-20260820/", import.meta.url,
));
const SOURCE_DIRECTORY = `${ARTIFACT_DIRECTORY}source`;
const BASELINE_REPORT_PATH = `${ARTIFACT_DIRECTORY}baseline-v3-provenance-final/report.json`;
const CUA_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/cua-verifier-bench-20260828/", import.meta.url,
));
const REBOOT_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-reboot-recovery-pilot-20260828-v1/", import.meta.url,
));
const REBOOT_SOURCE_DIRECTORY = `${REBOOT_ARTIFACT_DIRECTORY}source`;
const SENTINEL_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2/",
  import.meta.url,
));
const SENTINEL_V1_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-agent-trajectory-sentinel-quarantine-20260828-v1/",
  import.meta.url,
));
const STALE_CONSTRAINT_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-stale-constraint-episodes-20260828-v2/", import.meta.url,
));
const STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/outsider-stale-constraint-episodes-20260828-v1/", import.meta.url,
));
const SOURCE_READY = existsSync(`${ARTIFACT_DIRECTORY}acquisition-manifest.json`)
  && existsSync(`${SOURCE_DIRECTORY}/computer-agent-arena/agent_arena_data.jsonl`)
  && existsSync(`${SOURCE_DIRECTORY}/syfi_coding_trace.jsonl.gz`)
  && existsSync(`${SOURCE_DIRECTORY}/openhands-feedback.rows-000-099.json`)
  && existsSync(`${SOURCE_DIRECTORY}/nebius-stratified-selection.json`)
  && existsSync(BASELINE_REPORT_PATH)
  && existsSync(`${CUA_ARTIFACT_DIRECTORY}source-manifest.json`)
  && existsSync(`${CUA_ARTIFACT_DIRECTORY}source/trajectories.rows-000-099.json`)
  && existsSync(`${REBOOT_ARTIFACT_DIRECTORY}report.json`)
  && existsSync(`${REBOOT_SOURCE_DIRECTORY}/acquisition-manifest.json`)
  && existsSync(`${SENTINEL_ARTIFACT_DIRECTORY}run-receipt.json`)
  && existsSync(`${SENTINEL_ARTIFACT_DIRECTORY}source/raw/source/manifest.json`)
  && existsSync(`${SENTINEL_V1_ARTIFACT_DIRECTORY}REJECTED-SUPERSEDED.json`)
  && existsSync(`${STALE_CONSTRAINT_ARTIFACT_DIRECTORY}archive-index.json`)
  && existsSync(`${STALE_CONSTRAINT_ARTIFACT_DIRECTORY}source/paper2-data-and-code-v2.zip`)
  && existsSync(`${STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY}SUPERSEDED-REJECTED.json`);
const ENGINE_CLI = fileURLToPath(new URL(
  "../scripts/outsider-episode-data-engine.mjs", import.meta.url,
));

const SOURCE_DIRECTORIES = Object.freeze({
  sourceDirectory: SOURCE_DIRECTORY,
  artifactDirectory: ARTIFACT_DIRECTORY,
  cuaArtifactDirectory: CUA_ARTIFACT_DIRECTORY,
  rebootArtifactDirectory: REBOOT_ARTIFACT_DIRECTORY,
  rebootSourceDirectory: REBOOT_SOURCE_DIRECTORY,
  sentinelArtifactDirectory: SENTINEL_ARTIFACT_DIRECTORY,
  staleConstraintArtifactDirectory: STALE_CONSTRAINT_ARTIFACT_DIRECTORY,
});

let reportPromise = null;
function realReport() {
  reportPromise ??= evaluateEpisodeDataEngineFromSource(SOURCE_DIRECTORIES);
  return reportPromise;
}

function assessment(report, id) {
  return report.assessments.find((item) => item.dataset.id === id);
}

test("operator help is side-effect free and an existing output fails before replay", () => {
  const help = spawnSync(process.execPath, [ENGINE_CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--sentinel-input-dir DIR/u);
  assert.match(help.stdout, /--stale-constraint-input-dir DIR/u);
  const collision = spawnSync(process.execPath, [ENGINE_CLI, "--output-dir",
    STALE_CONSTRAINT_ARTIFACT_DIRECTORY], { encoding: "utf8" });
  assert.equal(collision.status, 1);
  assert.match(collision.stderr, /^EPISODE_DATA_ENGINE_OUTPUT_EXISTS\n$/u);
});

test("full-source episode engine fits deterministically and emits a quarantined control-plane queue",
  { skip: !SOURCE_READY, timeout: 180_000 }, async () => {
    const report = await realReport();
    assert.equal(report.schema, EPISODE_DATA_ENGINE_SCHEMA);
    assert.equal(report.schemaVersion, "4.0.0");
    assert.equal(report.engine.version, "1.2.0");
    assert.equal(report.sourceTrust.trustClass, "FULL_SOURCE_REPLAY_BOUND");
    assert.equal(report.sourceTrust.derivation, "FULL_SOURCE_REDERIVED");
    assert.equal(report.sourceTrust.sourceRecordCount, 9381);
    assert.equal(report.runSummary.sourceRecordsReplayed, 9547);
    assert.equal(report.runSummary.sourceRecordsReplayedScope,
      "REALITY_SEGMENT_ELIGIBLE_PUBLIC_EPISODES_ONLY");
    assert.equal(report.runSummary.supplementalEpisodeRecordsReplayed, 166);
    assert.equal(report.runSummary.crossDomainSourceUnitTotal, null);
    assert.equal(report.runSummary.crossDomainSourceUnitAdditionProhibited, true);
    assert.deepEqual(report.runSummary.sourceDenominatorRegistry.domains.map((item) =>
      [item.class, item.units]), [
      ["REALITY_EPISODE_RECORD", 9547],
      ["CONSTRUCTED_EPISODE_BYTE_COMMITMENT", 5400],
      ["PAIRED_RECOVERY_MORPHOLOGY_EVALUATION", 55],
      ["MECHANICAL_SYSTEM_IDENTIFICATION_TRACE", 0],
    ]);
    assert.equal(report.runSummary.constructedEpisodeByteCommitmentsReplayed, 5400);
    assert.equal(report.runSummary.constructedEpisodesSchemaInspected, 4896);
    assert.equal(report.runSummary.outcomeBlindAuditByteCommitments, 504);
    assert.equal(report.runSummary.pairedRecoveryEvaluationPairsReplayed, 55);
    assert.equal(report.runSummary.offlineModelFitsPerformedInEngine, 4);
    assert.equal(report.runSummary.offlineModelFitsReplayedFromVerifiedSupplements, 6);
    assert.equal(report.runSummary.authorizedTrainingPerformed, false);
    assert.equal(report.runSummary.authorizedTrainingRows, 0);
    assert.equal(report.runSummary.authorizedTrainingJobs, 0);
    assert.equal(report.runSummary.supplementalOfflineResearchRankersReplayed, 1);
    assert.equal(report.runSummary.productionModelsPromoted, 0);
    assert.deepEqual(report.runSummary.inEngineModelFittingSources, [
      "xlangai/computer-agent-arena",
      "nebius/SWE-rebench-openhands-trajectories",
    ]);

    assert.deepEqual(report.issueFinder.totals, {
      realityEpisodeRecords: 9547,
      opportunityCensusSourceNative: 0,
      opportunityCensusIndependent: 0,
      delegationAuthorizationSourceNative: 0,
      delegationAuthorizationIndependent: 0,
      actionTraceSourceNative: 9547,
      actionTraceIndependent: 0,
      effectSourceNative: 60,
      effectIndependent: 0,
      outcomeSourceNative: 5201,
      outcomeIndependent: 85,
      recoverySourceNative: 57,
      recoveryIndependent: 0,
      longitudinalSourceNative: 0,
      longitudinalIndependent: 0,
      crossAttributionAdditionPermitted: false,
      crossSegmentAdditionPermitted: false,
      completeEpisodeIntersectionCount: 0,
    });
    assert.equal(report.issueFinder.denominatorRegistry.crossDomainTotal, null);
    assert.equal(report.issueFinder.denominatorRegistry.crossDomainAdditionProhibited, true);
    assert.equal(report.issueFinder.completeEpisodeClaimed, false);
    assert.equal(report.sourceLedger.schema, EPISODE_DATA_SOURCE_LEDGER_SCHEMA);
    assert.equal(report.sourceTrust.sourceLedgerHash, report.sourceLedger.ledgerHash);
    assert.equal(report.sourceLedger.sources.length, 8);
    assert.equal(report.sourceLedger.discovery.globalExhaustion, false);
    assert.equal(report.sourceLedger.discovery.sourceUniverseExhausted, false);
    assert.equal(report.sourceLedger.discovery.undiscoveredSourcesRuledOut, false);
    assert.equal(report.sourceLedger.discovery.declaredScopeExhausted, true);
    assert.equal(report.sourceLedger.discovery.allDeclaredCandidatesTerminal, true);
    assert.equal(report.sourceLedger.discovery.allSourceAcquisitionScopesExhausted, false);
    assert.equal(report.sourceLedger.discovery.declaredScope.externalDiscoveryPerformed, false);
    assert.equal(report.sourceLedger.discovery.declaredScope
      .externalDiscoveryQueryLedger, null);
    assert.deepEqual(report.sourceLedger.discovery.dispositionCounts, {
      ADMITTED: 7,
      PENDING_ACQUISITION: 0,
      QUARANTINE_EVAL: 1,
      METADATA_ONLY: 0,
      REJECTED: 0,
    });
    const nebiusLedger = report.sourceLedger.sources.find((item) =>
      item.sourceId === "nebius/SWE-rebench-openhands-trajectories");
    assert.equal(nebiusLedger.discovery.declaredScopeExhausted, false);
    assert.equal(nebiusLedger.discovery.candidateLedgerState,
      "BOUNDED_SAMPLE_LEDGER_REPLAYED_NOT_EXHAUSTIVE");
    const rebootLedger = report.sourceLedger.sources.find((item) =>
      item.sourceId === "REBOOT26/sample_recovery-demonstration");
    assert.equal(rebootLedger.clearances.rights.status,
      "HOLD_UNRESOLVED_LICENSE_MISMATCH");
    assert.equal(rebootLedger.segments.effect.sourceNativeCount, 60);
    assert.equal(rebootLedger.segments.recovery.sourceNativeCount, 57);
    const cuaLedger = report.sourceLedger.sources.find((item) =>
      item.sourceId === "microsoft/CUAVerifierBench");
    assert.equal(cuaLedger.segments.outcome.sourceNativeCount, 85);
    assert.equal(cuaLedger.segments.outcome.independentCount, 85);
    assert.equal(cuaLedger.segments.outcome.additiveTotal, null);
    assert.equal(cuaLedger.segments.outcome.crossAttributionAdditionPermitted, false);
    assert.equal(report.sourceLedger.segmentCoverageAttribution
      .crossSegmentAdditionPermitted, false);
    assert.equal(report.sourceLedger.sources.every((item) =>
      item.clearances.privacy.noPiiGuaranteed === false
      && item.clearances.rights.productionTrainingAuthorized === false
      && item.clearances.use.authorizedTrainingAllowed === false
      && item.admission.authorizedTraining === false), true);
    assert.deepEqual(report.sourceLedger.modelUse.authorizedTraining, {
      performed: false, rowsAuthorized: 0, jobsAuthorized: 0,
      inheritedFromModelFitting: false,
    });
    assert.equal(report.controlPlaneProjection.gapAcquisitionQueue.length, 4);
    assert.equal(report.controlPlaneProjection.datasetGapAcquisitionQueues.length, 3);
    assert.equal(report.controlPlaneProjection.feederAcquisitionQueues.length, 3);
    assert.equal(report.controlPlaneProjection.enforcement.fullSourceReplayRequired, true);
    assert.equal(report.controlPlaneProjection.enforcement.actionReady, false);
    assert.equal(report.controlPlaneProjection.enforcement.executable, false);
    assert.equal(report.controlPlaneProjection.enforcement
      .supplementalStandaloneSealsTrusted, false);
    const cuaQueue = report.controlPlaneProjection.datasetGapAcquisitionQueues.find((item) =>
      item.datasetId === "microsoft/CUAVerifierBench");
    const rebootQueue = report.controlPlaneProjection.datasetGapAcquisitionQueues.find((item) =>
      item.datasetId === "REBOOT26/sample_recovery-demonstration");
    const sentinelQueue = report.controlPlaneProjection.datasetGapAcquisitionQueues.find((item) =>
      item.datasetId === "sunnydubey1111/agent-trajectory-sentinel");
    const staleConstraintQueue = report.controlPlaneProjection.feederAcquisitionQueues
      .find((item) => item.datasetId === "ZENODO_22117197_STALE_CONSTRAINT_V2");
    assert.deepEqual(cuaQueue.observed, {
      actionBoundaryTrace: 106,
      independentHumanTerminalReview: 85,
      independentLongitudinalOutcomeRecovery: 0,
      opportunityCensus: 0,
      delegationAuthorization: 0,
    });
    assert.equal(cuaQueue.state, "HOLD_QUARANTINED_REVIEW_REQUIRED");
    assert.equal(cuaQueue.trainingDecision.every((item) =>
      item.scope === "OFFLINE_RESEARCH_CANDIDATE_ONLY"
      && item.productionPromotionAuthorized === false), true);
    assert.deepEqual(rebootQueue.observed, {
      commandActionStateTrace: 60,
      physicalEffectTrace: 60,
      sourceNativeRecoveryTrace: 57,
      independentLongitudinalOutcomeRecovery: 0,
      opportunityCensus: 0,
      delegationAuthorization: 0,
    });
    assert.equal(rebootQueue.trainingDecision,
      "KEEP_BASELINE_GROUP_DISJOINT_SPLIT_IMPOSSIBLE");
    assert.equal(rebootQueue.state, "HOLD_QUARANTINED_REVIEW_REQUIRED");
    for (const queue of [cuaQueue, rebootQueue, sentinelQueue]) {
      assert.equal(queue.standaloneSealAccepted, false);
      assert.equal(queue.dispatched, false);
      assert.equal(queue.actionReady, false);
      assert.equal(queue.executable, false);
      const { queueHash, ...queueBody } = queue;
      assert.equal(queueHash, episodeDataEngineDigest(queueBody,
        "outsider/episode-data-engine/dataset-gap-queue/v2"));
    }
    assert.equal(sentinelQueue.lane,
      "QUARANTINE_EVALUATION_ONLY_GAP_RECOVERY_MORPHOLOGY");
    assert.equal(sentinelQueue.state, "QUARANTINE_EVALUATION_ONLY");
    assert.equal(sentinelQueue.artifactDisposition, "QUARANTINE_EVALUATION_ONLY");
    assert.equal(sentinelQueue.provenanceGate,
      "PASS_GITHUB_COMMIT_ROOT_TO_SELECTED_LEAF_MEMBERSHIP_REPLAYED");
    assert.equal(sentinelQueue.sourceAdmissionEligible, false);
    assert.deepEqual(sentinelQueue.observed, {
      pairedRecoveryEvaluationMorphologies: 55,
      sourceTraceEpisodes: 55,
      recoveryTraceEpisodes: 55,
      publisherNowCorrectTrue: 24,
      publisherNowCorrectFalse: 31,
      realExternalEffectTrace: 0,
      independentOutcomeTruth: 0,
      independentLongitudinalOutcomeRecovery: 0,
      opportunityCensus: 0,
      delegationAuthorization: 0,
    });
    assert.equal(sentinelQueue.rightsStatus, "FAIL_CLOSED");
    assert.equal(sentinelQueue.offlineResearchTrainingRows, 0);
    assert.equal(sentinelQueue.productionTrainingRows, 0);
    assert.equal(sentinelQueue.networkAdmissionRows, 0);
    assert.equal(sentinelQueue.networkProjectionRows, 0);
    assert.equal(sentinelQueue.rawTraceProjectionRows, 0);
    assert.equal(sentinelQueue.mayFillRealityEvidenceGap, false);

    assert.equal(staleConstraintQueue.lane,
      "CONSTRUCTED_OFFLINE_RESEARCH_ACQUISITION_RANKING");
    assert.equal(staleConstraintQueue.state, "CONSTRUCTED_OFFLINE_RESEARCH");
    assert.equal(staleConstraintQueue.fixedPriorityGroupBudget, 6);
    assert.equal(staleConstraintQueue.selectedEpisodes, 144);
    assert.equal(staleConstraintQueue.randomAuditReserve.groups, 30);
    assert.equal(staleConstraintQueue.randomAuditReserve.episodes, 504);
    assert.equal(staleConstraintQueue.randomAuditReserve.outcomeBlindSelection, true);
    assert.equal(staleConstraintQueue.randomAuditReserve.labelsUsedForSelection, false);
    assert.equal(staleConstraintQueue.randomAuditReserve.labelsInspectedForThisReport, false);
    assert.equal(staleConstraintQueue.randomAuditReserve.metricsComputed, false);
    assert.equal(staleConstraintQueue.randomAuditReserve.jsonParses, 0);
    assert.equal(staleConstraintQueue.researchQueueDecision,
      "USE_CANDIDATE_FOR_NEXT_OFFLINE_REVIEW_QUEUE");
    assert.equal(staleConstraintQueue.productionDecision,
      "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED");
    assert.equal(staleConstraintQueue.baselineMetrics.auc, 0.5);
    assert.equal(staleConstraintQueue.candidateMetrics.auc, 0.77295278061);
    assert.equal(staleConstraintQueue.productionTrainingRows, 0);
    assert.equal(staleConstraintQueue.networkProjectionRows, 0);
    assert.equal(staleConstraintQueue.realOutcomeRows, 0);
    assert.equal(staleConstraintQueue.rawTextIncluded, false);
    assert.equal(staleConstraintQueue.networkProjection, false);
    const { queueHash: staleQueueHash, ...staleQueueBody } = staleConstraintQueue;
    assert.equal(staleQueueHash, episodeDataEngineDigest(staleQueueBody,
      "outsider/episode-data-engine/control-plane-feeder-queue/v2"));
    assert.deepEqual(report.sourceTrust.supplementalSources.map((item) => ({
      datasetId: item.datasetId,
      trustClass: item.trustClass,
      standaloneSealAccepted: item.standaloneSealAccepted,
    })), [
      { datasetId: "microsoft/CUAVerifierBench",
        trustClass: "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND", standaloneSealAccepted: false },
      { datasetId: "REBOOT26/sample_recovery-demonstration",
        trustClass: "FULL_SOURCE_REPLAY", standaloneSealAccepted: false },
      { datasetId: "sunnydubey1111/agent-trajectory-sentinel",
        trustClass: "FULL_GIT_ANCESTRY_SELECTED_BYTES_REPORT_AND_RECEIPT_REPLAY_BOUND",
        standaloneSealAccepted: false },
      { datasetId: "ZENODO_22117197_STALE_CONSTRAINT_V2",
        trustClass: "FULL_PINNED_ARCHIVE_REPORT_AND_RECEIPT_REPLAY_BOUND",
        standaloneSealAccepted: false },
    ]);
    const sentinelTrust = report.sourceTrust.supplementalSources.find((item) =>
      item.datasetId === "sunnydubey1111/agent-trajectory-sentinel");
    const staleTrust = report.sourceTrust.supplementalSources.find((item) =>
      item.datasetId === "ZENODO_22117197_STALE_CONSTRAINT_V2");
    assert.equal(sentinelTrust.rightsGate, "FAIL_CLOSED");
    assert.equal(sentinelTrust.provenanceGate,
      "PASS_GITHUB_COMMIT_ROOT_TO_SELECTED_LEAF_MEMBERSHIP_REPLAYED");
    assert.equal(sentinelTrust.sourceAdmissionEligible, false);
    assert.equal(sentinelTrust.predecessorStatus, "REJECTED_SUPERSEDED");
    assert.equal(sentinelTrust.predecessorSupersessionMarkerHash,
      "sha256:b4689308e09483c1c6a97491825cbacc87bb26965e629120cf956547981db50c");
    assert.equal(sentinelTrust.trainingUseAllowed, false);
    assert.equal(sentinelTrust.offlineResearchTrainingRows, 0);
    assert.equal(sentinelTrust.networkProjectionRows, 0);
    assert.equal(staleTrust.version, "v2");
    assert.equal(staleTrust.predecessorStatus,
      "REJECTED_P1_INTRINSIC_AND_STRICT_AUDIT_ZERO_ACCESS_CLAIMS");
    assert.equal(staleTrust.predecessorSupersessionMarkerStatus,
      "REJECTED_SUPERSEDED_DO_NOT_USE_DERIVED_REPORT_OR_RECEIPT");
    assert.equal(staleTrust.predecessorSupersessionMarkerFileSha256,
      "sha256:c61b73ad75fce52641af997b0530836eafa88d9c8acb1751bc53b45620ae9b30");
    assert.equal(staleTrust.productionDecision,
      "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED");
    const { projectionHash, ...projectionBody } = report.controlPlaneProjection;
    assert.equal(projectionHash, episodeDataEngineDigest(projectionBody,
      "outsider/episode-data-engine/control-plane-projection/v2"));
    const projectionSerialized = JSON.stringify(report.controlPlaneProjection);
    assert.doesNotMatch(projectionSerialized,
      /(?:raw\/source\/|raw\/recovery\/|next_studies\/stale_constraints\/)/u);
    assert.equal(report.controlPlaneProjection.enforcement.rawSourceProjection, false);

    const caa = assessment(report, "xlangai/computer-agent-arena");
    const nebius = assessment(report, "nebius/SWE-rebench-openhands-trajectories");
    const openhands = assessment(report, "OpenHands/openhands-feedback");
    const traceLab = assessment(report, "uw-syfi/TraceLab");
    assert.equal(caa.split.groupOverlap, 0);
    assert.equal(nebius.split.groupOverlap, 0);
    assert.equal(caa.modelSelection.decision, "USE_OPTIMIZED_AS_NEXT_FEEDER_CANDIDATE");
    assert.equal(caa.modelSelection.clearImprovement, true);
    assert.equal(caa.frozenHoldoutVerification.deltaOptimizedMinusBaseline.auc > 0, true);
    assert.equal(caa.frozenHoldoutVerification.deltaOptimizedMinusBaseline.sampleBrier < 0, true);
    assert.equal(caa.frozenHoldoutVerification.deltaOptimizedMinusBaseline
      .negativeOutcomeFollowUpYield > 0, true);
    assert.equal(nebius.modelSelection.decision, "KEEP_BASELINE");
    assert.equal(nebius.modelSelection.clearImprovement, false);
    assert.equal(openhands.decision, "ABSTAIN_SINGLE_COLLECTOR_CORRELATION_COMPONENT");
    assert.equal(openhands.input.correlationComponents, 1);
    assert.equal(openhands.modelFitting, null);
    assert.equal(traceLab.decision, "ISSUE_FINDER_GAP_ACCOUNTING_ONLY_NO_OUTCOME");
    assert.equal(traceLab.input.labelledRecords, 0);
    assert.equal(traceLab.modelFitting, null);

    for (const fittedAssessment of [caa, nebius]) {
      assert.deepEqual(fittedAssessment.modelFitting.baseline.model.featureNames,
        EPISODE_DATA_ENGINE_BASELINE_FEATURES);
      assert.deepEqual(fittedAssessment.modelFitting.optimizedIssueFeatures.model.featureNames,
        EPISODE_DATA_ENGINE_ISSUE_FEATURES);
      for (const fit of [fittedAssessment.modelFitting.baseline.model,
        fittedAssessment.modelFitting.optimizedIssueFeatures.model]) {
        const { modelHash, ...modelBody } = fit;
        assert.equal(modelHash, episodeDataEngineDigest(modelBody,
          "outsider/episode-data-engine/model/v1"));
        assert.equal(fit.weights.length, fit.featureNames.length);
        assert.equal(fit.standardizer.mean.length, fit.featureNames.length);
        assert.equal(fit.standardizer.std.length, fit.featureNames.length);
      }
      for (const variant of ["baseline", "optimizedIssueFeatures"]) {
        const verification = fittedAssessment.frozenHoldoutVerification[variant];
        assert.equal(Number.isFinite(verification.metrics.auc), true);
        assert.equal(Number.isFinite(verification.metrics.sampleBrier), true);
        assert.equal(Number.isFinite(verification.metrics.balancedAccuracy), true);
        assert.equal(verification.followUpAtFixedGroupBudget.budgetGroups > 0, true);
      }
      const queue = report.controlPlaneProjection.feederAcquisitionQueues.find((item) =>
        item.datasetId === fittedAssessment.dataset.id);
      assert.equal(queue.fixedPriorityGroupBudget, queue.rankedPriorityGroups.length);
      assert.equal(queue.rankedPriorityGroups.every((item, index) =>
        item.rank === index + 1 && /^sha256:[a-f0-9]{64}$/.test(item.groupRoot)), true);
      assert.equal(queue.randomAuditReserve.outcomeBlindSelection, true);
      assert.equal(queue.randomAuditReserve.selectedGroups,
        queue.randomAuditReserve.groups.length);
      assert.equal(queue.randomAuditReserve.groups.every((audit) =>
        !queue.rankedPriorityGroups.some((priority) =>
          priority.groupRoot === audit.groupRoot)), true);
      assert.equal(queue.dispatched, false);
      assert.equal(queue.automaticRetrieval, false);
      assert.equal(queue.actionReady, false);
      assert.equal(queue.executable, false);
    }

    const existingBaseline = JSON.parse(readFileSync(BASELINE_REPORT_PATH, "utf8"));
    for (const [id, sourceTarget] of [
      ["xlangai/computer-agent-arena", "CAA_TASK_CORRECTNESS"],
      ["nebius/SWE-rebench-openhands-trajectories", "NEBIUS_BENCHMARK_RESOLVED"],
    ]) {
      const engineAssessment = assessment(report, id);
      const baselineAssessment = existingBaseline.assessments.find((item) =>
        item.target === sourceTarget);
      assert.equal(engineAssessment.split.trainGroupSetHash,
        baselineAssessment.split.trainGroupSetHash);
      assert.equal(engineAssessment.split.holdoutGroupSetHash,
        baselineAssessment.split.holdoutGroupSetHash);
    }

    assert.deepEqual(report.boundary, {
      offlineModelFittingPurpose: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY_ONLY",
      offlineModelFittingPerformed: true,
      authorizedTrainingPerformed: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      authorizedTrainingInheritedFromModelFitting: false,
      automaticAuthorizedTraining: false,
      automaticModelPromotion: false,
      authority: "none",
      authorityUnits: 0,
      actionReady: false,
      executable: false,
      causalExperienceUnits: 0,
      CEU: 0,
      lossEvidenceUnits: 0,
      economicLossObserved: false,
      responsibilityTruthEstablished: false,
      modelDeploymentAuthorized: false,
      pseudoLabelsPromoted: false,
      permits: { PRICE: false, GUARANTEE: false, SETTLE: false,
        DEPLOY_MODEL: false, EXPAND_DELEGATION: false },
    });
    assert.equal(report.assessments.every((item) =>
      item.interpretation.agentRiskClaimed === false
      && item.interpretation.authorityClaimed === false
      && item.interpretation.responsibilityClaimed === false
      && item.interpretation.pseudoLabelsUsed === false), true);

    const { reportHash, ...body } = report;
    assert.equal(reportHash, episodeDataEngineDigest(body, EPISODE_DATA_ENGINE_SCHEMA));
    const receipt = buildEpisodeDataEngineRunReceipt(report);
    assert.equal(receipt.schema, EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA);
    assert.equal(receipt.schemaVersion, "4.0.0");
    assert.equal(receipt.input.sourceRecordCount, 9547);
    assert.equal(receipt.input.sourceLedgerHash, report.sourceLedger.ledgerHash);
    assert.equal(receipt.input.sourceDiscovery.globalExhaustion, false);
    assert.equal(receipt.input.sourceDenominatorRegistry.crossDomainTotal, null);
    assert.equal(receipt.output.realitySegmentAttribution
      .opportunityCensusSourceNative, 0);
    assert.equal(receipt.output.realitySegmentAttribution
      .delegationAuthorizationSourceNative, 0);
    assert.equal(receipt.output.realitySegmentAttribution.effectSourceNative, 60);
    assert.equal(receipt.output.realitySegmentAttribution.outcomeIndependent, 85);
    assert.equal(receipt.output.realitySegmentAttribution.recoverySourceNative, 57);
    assert.equal(receipt.output.realitySegmentAttribution.longitudinalIndependent, 0);
    assert.equal(receipt.output.completeEpisodeIntersectionCount, 0);
    assert.equal(receipt.output.offlineModelFitsPerformedInEngine, 4);
    assert.equal(receipt.output.offlineModelFitsReplayedFromVerifiedSupplements, 6);
    assert.equal(receipt.output.authorizedTrainingPerformed, false);
    assert.equal(receipt.output.authorizedTrainingRows, 0);
    assert.equal(receipt.output.authorizedTrainingJobs, 0);
    assert.equal(receipt.supplementalResult["sunnydubey1111/agent-trajectory-sentinel"]
      .offlineResearchTrainingRows, 0);
    assert.equal(receipt.supplementalResult.ZENODO_22117197_STALE_CONSTRAINT_V2
      .productionDecision, "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED");
    assert.equal(receipt.output.reportFileContentHash,
      `sha256:${createHash("sha256").update(`${JSON.stringify(report, null, 2)}\n`)
        .digest("hex")}`);
    const verified = await verifyEpisodeDataEngineRunReceipt(receipt, report,
      SOURCE_DIRECTORIES);
    assert.equal(verified.ok, true);
    assert.equal(verified.reportHash, report.reportHash);
    assert.equal(verified.receiptHash, receipt.receiptHash);
    assert.equal(verified.sourceDenominatorRegistry.crossDomainTotal, null);
    assert.equal(verified.authorizedTrainingRows, 0);
    assert.equal(verified.productionModelsPromoted, 0);
  });

test("a re-sealed report cannot self-promote authority or execution",
  { skip: !SOURCE_READY, timeout: 180_000 }, async () => {
    const report = await realReport();
    const forged = structuredClone(report);
    forged.boundary.authority = "root";
    forged.boundary.authorityUnits = 1;
    forged.boundary.actionReady = true;
    forged.boundary.executable = true;
    forged.boundary.modelDeploymentAuthorized = true;
    forged.boundary.permits.DEPLOY_MODEL = true;
    const { reportHash: ignored, ...body } = forged;
    forged.reportHash = episodeDataEngineDigest(body, EPISODE_DATA_ENGINE_SCHEMA);
    const checked = await verifyEpisodeDataEngineReport(forged);
    assert.deepEqual(checked, { ok: false, error: "EPISODE_DATA_ENGINE_BOUNDARY_INVALID" });
    assert.notEqual(canonicalizeStrict(forged.boundary), canonicalizeStrict(report.boundary));
  });

test("self-resealed supplemental queues cannot promote evaluation-only or constructed sources",
  { skip: !SOURCE_READY, timeout: 180_000 }, async () => {
    const report = await realReport();
    const forged = structuredClone(report);
    const sentinelTrust = forged.sourceTrust.supplementalSources.find((item) =>
      item.datasetId === "sunnydubey1111/agent-trajectory-sentinel");
    const sentinelQueue = forged.controlPlaneProjection.datasetGapAcquisitionQueues
      .find((item) => item.datasetId === "sunnydubey1111/agent-trajectory-sentinel");
    const staleTrust = forged.sourceTrust.supplementalSources.find((item) =>
      item.datasetId === "ZENODO_22117197_STALE_CONSTRAINT_V2");
    const staleQueue = forged.controlPlaneProjection.feederAcquisitionQueues
      .find((item) => item.datasetId === "ZENODO_22117197_STALE_CONSTRAINT_V2");
    sentinelTrust.sourceAdmissionEligible = true;
    sentinelTrust.trainingUseAllowed = true;
    sentinelQueue.sourceAdmissionEligible = true;
    sentinelQueue.productionTrainingRows = 55;
    staleTrust.productionTrainingRows = 4896;
    staleTrust.productionDecision = "PROMOTE_TO_PRODUCTION";
    staleQueue.productionTrainingRows = 4896;
    staleQueue.networkProjection = true;
    staleQueue.productionDecision = "PROMOTE_TO_PRODUCTION";
    const { reportHash: ignored, ...body } = forged;
    forged.reportHash = episodeDataEngineDigest(body, EPISODE_DATA_ENGINE_SCHEMA);
    const checked = await verifyEpisodeDataEngineReport(forged, SOURCE_DIRECTORIES);
    assert.deepEqual(checked, {
      ok: false,
      error: "EPISODE_DATA_ENGINE_REPRODUCTION_MISMATCH",
    });
  });

test("rejected predecessor artifacts cannot enter the v4 engine",
  { skip: !SOURCE_READY, timeout: 180_000 }, async () => {
    const marker = JSON.parse(readFileSync(
      `${STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY}SUPERSEDED-REJECTED.json`, "utf8"));
    assert.equal(marker.status,
      "REJECTED_SUPERSEDED_DO_NOT_USE_DERIVED_REPORT_OR_RECEIPT");
    assert.equal(marker.predecessorDerivedReportOrReceiptAuthorized, false);
    assert.equal(marker.successorSemanticHashes.reportHash,
      "sha256:80776546230f6a819a511ab1719be0b47e7d7323d0fb3c847209cd87ba99e954");
    const sentinelMarker = JSON.parse(readFileSync(
      `${SENTINEL_V1_ARTIFACT_DIRECTORY}REJECTED-SUPERSEDED.json`, "utf8"));
    assert.equal(sentinelMarker.status, "REJECTED_SUPERSEDED");
    assert.equal(sentinelMarker.supersedingReportHash,
      "sha256:d96a6aef51acdc5490291ff5990e517eef4bd46593610af34a67f7e9de929920");
    await assert.rejects(evaluateEpisodeDataEngineFromSource({
      ...SOURCE_DIRECTORIES,
      sentinelArtifactDirectory: SENTINEL_V1_ARTIFACT_DIRECTORY,
    }), /EPISODE_DATA_ENGINE_SENTINEL_FULL_SOURCE_REPLAY_FAILED/u);
    await assert.rejects(evaluateEpisodeDataEngineFromSource({
      ...SOURCE_DIRECTORIES,
      staleConstraintArtifactDirectory: STALE_CONSTRAINT_V1_ARTIFACT_DIRECTORY,
    }), /EPISODE_DATA_ENGINE_STALE_CONSTRAINT_FULL_SOURCE_REPLAY_FAILED/u);
  });

test("a self-resealed receipt cannot alter counts, completeness, or supplemental source truth",
  { skip: !SOURCE_READY, timeout: 180_000 }, async () => {
    const report = await realReport();
    const receipt = buildEpisodeDataEngineRunReceipt(report);
    const forged = structuredClone(receipt);
    forged.input.sourceRecordCount += 1;
    forged.input.supplementalSources[0].sourceRecordCount += 1;
    forged.input.supplementalSources[2].sourceAdmissionEligible = true;
    forged.input.supplementalSources[3].productionTrainingRows = 4896;
    forged.input.sourceDiscovery.globalExhaustion = true;
    forged.input.sourceDenominatorRegistry.crossDomainTotal = 15002;
    forged.output.completeEpisodeIntersectionCount = 1;
    const { receiptHash: ignored, ...body } = forged;
    forged.receiptHash = episodeDataEngineDigest(body,
      EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA);
    const checked = await verifyEpisodeDataEngineRunReceipt(forged, report,
      SOURCE_DIRECTORIES);
    assert.deepEqual(checked, { ok: false,
      error: "EPISODE_DATA_ENGINE_RUN_RECEIPT_REPRODUCTION_MISMATCH" });

    const missingSources = await verifyEpisodeDataEngineRunReceipt(receipt, report);
    assert.equal(missingSources.ok, false);
    assert.match(missingSources.error,
      /^EPISODE_DATA_ENGINE_RUN_RECEIPT_REPORT_SOURCE_VERIFY_FAILED:/);
  });
