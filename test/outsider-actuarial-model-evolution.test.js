import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalizeStrict } from "../src/canonical.js";

import {
  ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT,
  ACTUARIAL_MODEL_EVOLUTION_CANONICAL_RELEASE,
  ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH,
  ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES,
  buildActuarialModelEvolutionCandidateFromSources,
  buildActuarialModelEvolutionProjection,
  buildActuarialModelEvolutionFromSources,
  describeActuarialModelEvolution,
  verifyActuarialModelEvolution,
  verifyActuarialModelEvolutionAgainstSources,
} from "../src/outsider-actuarial-model-evolution.js";

const MATH_CANONICAL = path.resolve(
  "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json");
const MATH_SOURCE_PROFILE = path.resolve(
  "artifacts/actuarial-model-evolution-20260828/source-profile-v11.json");
const HAS_FULL_SOURCE_PROFILE = existsSync(MATH_CANONICAL) && existsSync(MATH_SOURCE_PROFILE);
const HAS_SUPERSEDED_ARTIFACTS = ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES
  .every((release) => existsSync(path.resolve(release.repositoryRelativePath))
    && existsSync(path.resolve(path.dirname(release.repositoryRelativePath), "SUPERSEDED.json")));

function resealArtifact(artifact) {
  const copy = structuredClone(artifact);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256")
    .update(`outsider/actuarial-model-evolution/v1\0${canonicalizeStrict(copy)}`, "utf8")
    .digest("hex")}`;
  return copy;
}

test("architecture separates 102 evidence factors from target predictors", () => {
  const artifact = buildActuarialModelEvolutionProjection();
  assert.equal(artifact.factorRoleAudit.factorCount, 102);
  assert.equal(artifact.factorRoleAudit.sourceDomainRetrospectiveReferenceUsesAdmitted, 102);
  assert.equal(artifact.factorRoleAudit.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(artifact.factorRoleAudit.temporallyOrderedReceiptReferenceFactorCount, 62);
  assert.equal(artifact.factorRoleAudit.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(artifact.factorRoleAudit.factorsAdmittedForCurrentRouting, 0);
  assert.equal(artifact.factorRoleAudit.targetPreActionPredictorCandidatesAdmitted, 0);
  assert.equal(artifact.factorRoleAudit.targetPriceFactorsAdmitted, 0);
  assert.equal(artifact.factorRoleAudit.postOutcomeLeakageRows, 81);
  assert.deepEqual(artifact.factorRoleAudit.roleCounts, {
    DATA_REGIME_IDENTITY_OR_DEDUP_CONTROL: 3,
    POST_OUTCOME_LABEL_OR_RETROSPECTIVE_DIAGNOSTIC: 81,
    RESPONSIBILITY_GOVERNANCE_CONSTRAINT: 5,
    SOURCE_DOMAIN_DATA_QUALITY_OR_MISSINGNESS_CONTROL: 5,
    SOURCE_DOMAIN_EXPOSURE_OFFSET_DESCRIPTOR: 8,
  });
  assert.equal(artifact.factorRoleAudit.rows.every((row) =>
    row.usableAsTargetPreActionPredictor === false
      && row.sourceDomainRetrospectiveReferenceUseAdmitted === true
      && row.currentCoverageAdmitted === false
      && row.currentRoutingAdmitted === false), true);
  const bridgeQuality = artifact.factorRoleAudit.rows.filter((row) =>
    row.factorId.startsWith("bridgedata_v2_"));
  assert.equal(bridgeQuality.length, 2);
  assert.equal(bridgeQuality.every((row) => row.architectureRole
    === "SOURCE_DOMAIN_DATA_QUALITY_OR_MISSINGNESS_CONTROL"
    && row.usableAsTargetPreActionPredictor === false
    && row.targetTransferEstablished === false), true);
  const wave5 = artifact.factorRoleAudit.rows.filter((row) =>
    row.sourceDomain === "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY");
  assert.equal(wave5.length, 3);
  assert.equal(wave5.every((row) => row.usableAsTargetPreActionPredictor === false
    && row.targetTransferEstablished === false), true);
  const contribution = artifact.sourceLaneComponentContributions.find((row) =>
    row.lane === "WAVE5_REAL_SOFTWARE");
  assert.match(contribution.blocker, /RETROSPECTIVE_SOURCE_ONLY/u);
  const quarantinedContributions = artifact.sourceLaneComponentContributions.filter(
    ({ temporalQuarantineReferenceOnly }) => temporalQuarantineReferenceOnly);
  assert.deepEqual(quarantinedContributions.map(({ lane }) => lane),
    ["USDA_RMA_CROP_INSURANCE_2024", "CAS_SCHEDULE_P"]);
  assert.equal(quarantinedContributions.every((row) =>
    row.currentModelComponentAdvanced === false
      && row.currentModelComponentsAdvanced.length === 0
      && row.currentCoverageAdmitted === false
      && row.currentRoutingAdmitted === false
      && row.targetModelAdmission === false), true);
});

test("modern target shift CRC causal multi-state tail DRO and UQ contracts fail closed", () => {
  const contracts = buildActuarialModelEvolutionProjection().modernActuarialContracts;
  assert.equal(contracts.typedAssumptionsAndEstimands.contractType,
    "TARGET_SHIFT_AND_OVERLAP");
  assert.deepEqual(contracts.typedAssumptionsAndEstimands.strata.map((row) => row.stratum),
    ["RANDOM_ROW", "OBSERVED_KNOWN_COMPONENT", "NEW_COMPONENT", "NEW_DOMAIN"]);
  assert.equal(contracts.typedAssumptionsAndEstimands.strata.every((row) =>
    row.qualifiedRecords === 0 && row.estimand === null), true);
  assert.deepEqual(contracts.fourSegmentConformalRiskControl.segments
    .map((row) => row.segment),
  ["TRAIN", "PROBABILITY_CALIBRATION", "RISK_CONTROL_CALIBRATION", "FINAL_TEST"]);
  assert.equal(contracts.fourSegmentConformalRiskControl.riskControlGuaranteeEstablished,
    false);
  assert.equal(contracts.anytimeValidMonitoring.contractType,
    "APPEND_ONLY_ANYTIME_VALID_MONITOR");
  assert.equal(contracts.anytimeValidMonitoring.eValue, null);
  assert.equal(contracts.targetCausalAndOffPolicyEvaluation.offPolicyValueEstimate, null);
  assert.equal(contracts.multiStateCompetingRisk.cumulativeIncidenceEstimate, null);
  assert.equal(contracts.extremeValueAndTailDependence.gpdShapeEstimate, null);
  assert.equal(contracts.distributionallyRobustSensitivity.worstCaseRiskBound, null);
  assert.equal(contracts.typedUncertaintyDecomposition.components.every((row) =>
    row.estimate === null && row.established === false), true);
  assert.deepEqual(contracts.globalNullBoundary, {
    qualifiedTargetRecords: 0, targetEstimate: null, targetModel: null,
    targetLossDistribution: null, price: null, PRICE: null,
    responsibilityDecision: null, responsibility: null, authority: false,
    targetTransferEstablished: false, trainingAuthorized: false,
    pricingAuthorized: false, responsibilityAuthorized: false,
    operationalAuthorityGranted: false,
  });
});

test("estimand graph is acyclic and blocks target model components and responsibility", () => {
  const artifact = buildActuarialModelEvolutionProjection();
  assert.equal(artifact.estimandComponentGraph.verification.acyclic, true);
  assert.equal(artifact.estimandComponentGraph.verification.nodeCount, 59);
  assert.equal(artifact.estimandComponentGraph.verification.edgeCount, 152);
  assert.equal(artifact.estimandComponentGraph.coreArchitectureNodeCount, 23);
  assert.equal(artifact.estimandComponentGraph.gapSpecificContractNodeCount, 36);
  assert.equal(artifact.estimandComponentGraph.nodeCompletionSemantics,
    "ALL_INCOMING_PREREQUISITES_REQUIRED");
  assert.equal(new Set(artifact.estimandComponentGraph.edges
    .map(([from, to]) => `${from}\0${to}`)).size,
  artifact.estimandComponentGraph.edges.length);
  assert.equal(artifact.estimandComponentGraph.responsibilityDecisionBlocked, true);
  assert.equal(artifact.promotionProtocol.targetModelComponentsFitted, 0);
  assert.deepEqual(artifact.promotionProtocol.currentOpenPrerequisites, [
    "TARGET_OBSERVATION_CONTRACT",
    "TARGET_PRE_ACTION_FEATURE_CONTRACT",
    "TARGET_DEPENDENCE_ROOT_CONTRACT",
    "TARGET_ECONOMIC_LOSS_CONTRACT",
    "TARGET_MULTI_CLOCK_CONTRACT",
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "PROSPECTIVE_VALIDATION",
    "DRIFT_AND_RECALIBRATION",
    "INDEPENDENT_ACTUARIAL_REVIEW",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION",
    "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
  ]);
  assert.equal(artifact.promotionProtocol.currentOpenPrerequisiteCount, 15);
  assert.equal(artifact.promotionProtocol.currentOpenGapContractCount, 36);
  assert.equal(artifact.promotionProtocol.currentOpenGapContractPrerequisites.length, 36);
  assert.equal(artifact.promotionProtocol.totalExplicitOpenPrerequisiteNodes, 51);
  assert.equal(artifact.promotionProtocol.graphTheoreticCutSetComputed, false);
  assert.equal(artifact.promotionProtocol.minimalityClaimed, false);
  assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
    from === "PREDICTIVE_DISTRIBUTION" && to === "PROSPECTIVE_VALIDATION"), true);
  assert.equal(artifact.promotionProtocol.currentOpenPrerequisites
    .includes("PROSPECTIVE_VALIDATION"), true);
  assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
    from === "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT"
      && to === "RESPONSIBILITY_BEARING_DECISION"), true);
  for (const predecessor of [
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION",
    "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY",
  ]) {
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === predecessor && to === "RESPONSIBILITY_BEARING_DECISION"), true,
    predecessor);
  }
  assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
    from === "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE"
      && to === "PREDICTIVE_DISTRIBUTION"), true);
  const componentModels = ["FREQUENCY_MODEL", "SEVERITY_MODEL", "DELAY_SURVIVAL_MODEL",
    "RESERVE_MODEL", "TAIL_MODEL", "DEPENDENCE_MODEL"];
  for (const model of componentModels) {
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE" && to === model), true,
    model);
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"
        && to === model), true, model);
  }
  for (const model of ["FREQUENCY_MODEL", "SEVERITY_MODEL", "DELAY_SURVIVAL_MODEL"]) {
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT"
        && to === model), true, model);
  }
  for (const predecessor of ["PREDICTIVE_DISTRIBUTION", "TAIL_MODEL", "DEPENDENCE_MODEL",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY", "PROSPECTIVE_VALIDATION",
    "INDEPENDENT_ACTUARIAL_REVIEW", "DRIFT_AND_RECALIBRATION"]) {
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === predecessor && to === "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"), true,
    predecessor);
  }
  for (const predecessor of ["PREDICTIVE_DISTRIBUTION", "RESERVE_MODEL", "TAIL_MODEL",
    "DEPENDENCE_MODEL", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY", "PROSPECTIVE_VALIDATION",
    "INDEPENDENT_ACTUARIAL_REVIEW", "DRIFT_AND_RECALIBRATION"]) {
    assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
      from === predecessor && to === "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"), true,
    predecessor);
  }
  const order = artifact.estimandComponentGraph.verification.topologicalOrder;
  for (const model of componentModels) {
    assert.ok(order.indexOf("TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE")
      < order.indexOf(model), model);
    assert.ok(order.indexOf("TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION")
      < order.indexOf(model), model);
  }
  assert.ok(order.indexOf("TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT")
    < order.indexOf("PROSPECTIVE_VALIDATION"));
  assert.ok(order.indexOf("TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION")
    < order.indexOf("PROSPECTIVE_VALIDATION"));
  for (const predecessor of ["PROSPECTIVE_VALIDATION", "INDEPENDENT_ACTUARIAL_REVIEW",
    "DRIFT_AND_RECALIBRATION"]) {
    assert.ok(order.indexOf(predecessor)
      < order.indexOf("TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"), predecessor);
    assert.ok(order.indexOf(predecessor)
      < order.indexOf("CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"), predecessor);
  }
  assert.ok(order.indexOf("TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION")
    < order.indexOf("CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"));
  assert.ok(order.indexOf("REALITY_STEWARDSHIP_OBLIGATION_CONTRACT")
    < order.indexOf("TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"));
  const rights = artifact.estimandComponentGraph.nodes.find((node) =>
    node.nodeId === "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE");
  assert.match(rights.requiredEvidence, /LAWFUL_BASIS/u);
  assert.match(rights.requiredEvidence, /WITHDRAWAL_AND_OBJECTION/u);
  assert.match(rights.requiredEvidence, /RETENTION_DELETION/u);
  assert.match(rights.requiredEvidence, /REUSE_LICENSE/u);
  const outcome = artifact.estimandComponentGraph.nodes.find((node) =>
    node.nodeId === "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT");
  assert.match(outcome.requiredEvidence, /TARGET_OUTCOME_IDS_INDEPENDENT_SENSOR/u);
  assert.match(outcome.requiredEvidence, /REVISION_AND_DEDUP/u);
  assert.match(outcome.requiredEvidence, /CAUSAL_ATTRIBUTION_OR_EXPLICIT_NONCAUSAL/u);
  assert.match(outcome.requiredEvidence, /APPEAL_FINALITY/u);
  const provenance = artifact.estimandComponentGraph.nodes.find((node) =>
    node.nodeId === "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION");
  assert.match(provenance.requiredEvidence, /SOURCE_AWARE_EXACT_BYTES/u);
  assert.match(provenance.requiredEvidence, /EXTERNAL_OR_PREREGISTERED_TIME/u);
  assert.match(provenance.requiredEvidence, /VERSION_AND_REVISION_LINEAGE/u);
  assert.equal(artifact.outputs.targetFrequencyEstimate, null);
  assert.equal(artifact.outputs.targetSeverityEstimate, null);
  assert.equal(artifact.outputs.premium, null);
  assert.equal(artifact.outputs.price, null);
  assert.equal(artifact.authority.operationalAuthorityGranted, false);
});

test("all 36 external readiness gaps map to non-final DAG prerequisites without bypass", () => {
  const artifact = buildActuarialModelEvolutionProjection();
  const coverage = artifact.readinessGapToPrerequisiteCoverage;
  assert.equal(coverage.catalogGapCount, 36);
  assert.equal(coverage.mappedGapCount, 36);
  assert.equal(coverage.gapSpecificContractNodeCount, 36);
  assert.equal(coverage.gapSpecificContractEdgeCount, 81);
  assert.equal(coverage.mappings.length, 36);
  assert.deepEqual(coverage.unmappedGapIds, []);
  assert.deepEqual(coverage.gapsOutsideResponsibilityArchitectureScope, []);
  assert.equal(coverage.everyCatalogGapMappedToAtLeastOneNonFinalPrerequisite, true);
  assert.equal(coverage.everyGapHasExactLedgerClosureEvidenceAndAcceptedInterface, true);
  assert.equal(coverage.everyGapHasGapSpecificMissingContractNode, true);
  assert.equal(coverage.everyMappedPrerequisiteExistsInDag, true);
  assert.equal(coverage.everyMappedPrerequisitePrecedesResponsibilityDecision, true);
  assert.equal(coverage.everyGapSpecificContractNodePrecedesResponsibilityDecision, true);
  assert.equal(coverage.currentOutsiderSpecificGapsClosedByArchitecture, 0);
  assert.equal(new Set(coverage.mappings.map((row) => row.gapId)).size, 36);
  assert.equal(coverage.mappings.every((row) => row.prerequisiteNodeIds.length > 0
    && !row.prerequisiteNodeIds.includes("RESPONSIBILITY_BEARING_DECISION")
    && typeof row.exactClosureEvidence === "string" && row.exactClosureEvidence.length > 0
    && row.acceptedClosureInterface.startsWith("REGISTERED_SOURCE_AWARE_VERIFIER_ONLY:")
    && row.genericCallerBooleanAccepted === false
    && row.gapClosureClaimedByArchitectureMapping === false
    && row.outsiderSpecificGapClosed === false), true);
  const byGap = new Map(coverage.mappings.map((row) => [row.gapId, row]));
  assert.ok(byGap.get("S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY")
    .prerequisiteNodeIds.includes("REALITY_STEWARDSHIP_OBLIGATION_CONTRACT"));
  assert.ok(byGap.get("S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS")
    .prerequisiteNodeIds
    .includes("TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT"));
  assert.ok(byGap.get("S2_PROSPECTIVE_PREACTION_FACTOR_STREAM").prerequisiteNodeIds
    .includes("TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"));
  assert.ok(byGap.get("S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES").prerequisiteNodeIds
    .includes("CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"));
  assert.ok(byGap.get("S4_CLOSURE_REOPENING_AUTHORITY").prerequisiteNodeIds
    .includes("REALITY_STEWARDSHIP_OBLIGATION_CONTRACT"));
  const exactContracts = {
    S05_CURRENT_ARTIFACT_R1_R5_CONFORMANCE:
      "preregistered current-package R1-R5 artifact set",
    S05_EXTERNAL_USER_REPOSITORIES_AND_SECOND_MACHINES:
      "signed run/evidence sets from unrelated operators and a second machine",
    S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS:
      "sensor-root receipts and signed platform parameter review",
    S2_LEGAL_PRODUCT_CLASSIFICATION:
      "counsel memorandum bound to exact product and jurisdiction",
    S4_REAL_EXECUTION_LOSS_CLAIM:
      "execution receipt, trigger evidence, economic fact and stable claim identity",
    S4_CUSTODIAN_PAYMENT_RAIL:
      "custody agreement, payment authority and idempotent acknowledgement policy",
  };
  const graphNodes = new Map(artifact.estimandComponentGraph.nodes
    .map((node) => [node.nodeId, node]));
  for (const [gapId, closureEvidence] of Object.entries(exactContracts)) {
    const mapping = byGap.get(gapId);
    assert.equal(mapping.exactClosureEvidence, closureEvidence, gapId);
    const contractNode = graphNodes.get(mapping.gapContractNodeId);
    assert.equal(contractNode.nodeType, "EXTERNAL_READINESS_GAP_CONTRACT", gapId);
    assert.equal(contractNode.currentState, "MISSING", gapId);
    assert.equal(contractNode.requiredEvidence, closureEvidence, gapId);
    assert.equal(contractNode.acceptedClosureInterface, mapping.acceptedClosureInterface, gapId);
    assert.equal(contractNode.closureOwnerClass, mapping.closureOwnerClass, gapId);
    assert.equal(contractNode.gapContractHash, mapping.gapContractHash, gapId);
    for (const prerequisiteNodeId of mapping.prerequisiteNodeIds) {
      assert.equal(artifact.estimandComponentGraph.edges.some(([from, to]) =>
        from === mapping.gapContractNodeId && to === prerequisiteNodeId), true,
      `${gapId}:${prerequisiteNodeId}`);
    }
  }
  assert.equal(byGap.get("S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY")
    .closureOwnerClass, "PLATFORM_PROVIDER");
  assert.equal(byGap.get("S2_INDEPENDENT_ACTUARIAL_REVIEW").closureOwnerClass,
    "AUTHORIZED_EXTERNAL_INSTITUTION");
});

test("FRA diagnostic rejects silent Poisson adequacy escalation", () => {
  const diagnostic = buildActuarialModelEvolutionProjection()
    .sourceDomainModelAdequacyDiagnostics.fraInterceptOnlyPoisson;
  assert.equal(diagnostic.calendarRootCount, 5);
  assert.equal(diagnostic.totalObservedReportedIncidents, 10449);
  assert.equal(diagnostic.totalTrainMileExposure, "3529396874");
  assert.equal(diagnostic.pooledRatePerMillionTrainMiles, "2.960562491");
  assert.equal(diagnostic.pearsonChiSquare, "42.346533703");
  assert.equal(diagnostic.poissonDispersionPearsonOverNominalDf, "10.586633426");
  assert.equal(diagnostic.poissonDeviance, "41.859068457");
  assert.equal(diagnostic.inferencePValue, null);
  assert.equal(diagnostic.equidispersedPoissonAdequateClaimed, false);
  assert.equal(diagnostic.negativeBinomialOrTrendFitPerformed, false);
  assert.equal(diagnostic.targetFrequencyEstimate, null);
  assert.equal(diagnostic.priceInput, null);
});

test("laboratory benchmark covers seven distinct model families without fitting them", () => {
  const artifact = buildActuarialModelEvolutionProjection();
  assert.equal(artifact.laboratoryModelFamilyBenchmark.length, 7);
  assert.equal(artifact.laboratoryModelFamilyBenchmark.every((row) =>
    row.fitAuthorized === false), true);
  assert.equal(artifact.laboratoryModelFamilyBenchmark.every((row) =>
    Array.isArray(row.candidateModelsAndDiagnostics)
      && row.candidateModelsAndDiagnostics.length > 0
      && !Object.hasOwn(row, "candidateDistributions")), true);
  assert.equal(artifact.benchmarkReferenceBoundary.references.length, 12);
  assert.equal(artifact.benchmarkReferenceBoundary
    .browsedReferenceDocumentsAreArchitectureCitationsNotEmpiricalTrainingRows, true);
  assert.equal(artifact.benchmarkReferenceBoundary
    .referenceCitationDoesNotClaimProfessionalConformanceOrIndependentReview, true);
  const frequency = artifact.laboratoryModelFamilyBenchmark.find((row) =>
    row.familyId === "FREQUENCY_GLM_GAM");
  assert.match(frequency.canonicalForm,
    /^log\(E\[N_i\|x_i\]\).*log\(exposure_i\).*only under the log link$/u);
  const compound = artifact.laboratoryModelFamilyBenchmark.find((row) =>
    row.familyId === "CONDITIONAL_SEVERITY_AND_COMPOUND_LOSS");
  assert.match(compound.canonicalForm,
    /generally E\[S\|x\]=sum_n P\(N=n\|x\)sum_\{j=1\}\^n E\[Y_j\|N=n,x\]/u);
  assert.match(compound.canonicalForm,
    /only with conditional identical means or exchangeability.*reduce to nE\[Y\|N=n,x\]/u);
  assert.match(compound.canonicalForm,
    /only with conditional mean-independence of N.*E\[N\|x\]E\[Y\|x\]$/u);
});

test("projection and verifier are deterministic and fixed-time fail closed", () => {
  const first = buildActuarialModelEvolutionProjection();
  const second = buildActuarialModelEvolutionProjection({
    generatedAt: ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT,
  });
  assert.deepEqual(first, second);
  assert.equal(Date.parse(first.generatedAt) <= Date.now(), true);
  assert.equal(first.generatedAtTrust,
    "CODE_FIXED_ARCHITECTURE_SNAPSHOT_AS_OF_NOT_BUILD_COMPLETION_OR_EXTERNAL_TIME_ATTESTATION");
  const checked = verifyActuarialModelEvolution(first);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.targetPreActionPredictorsAdmitted, 0);
  assert.throws(() => buildActuarialModelEvolutionProjection({
    generatedAt: "2000-01-01T00:00:00.000Z",
  }), /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
  assert.throws(() => buildActuarialModelEvolutionProjection({
    generatedAt: "2099-01-01T00:00:00.000Z",
  }), /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
  assert.throws(() => buildActuarialModelEvolutionProjection({
    generatedAt: "2026-08-22T04:00:00.000Z",
  }), /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
});

test("model candidate time fails before math replay when future or before frozen math", async () => {
  await assert.rejects(buildActuarialModelEvolutionCandidateFromSources({
    mathArtifactPath: "unused", mathSources: {},
    generatedAt: "2099-01-01T00:00:00.000Z",
  }), /CANDIDATE_TIME_IN_FUTURE/u);
  await assert.rejects(buildActuarialModelEvolutionCandidateFromSources({
    mathArtifactPath: "unused", mathSources: {},
    generatedAt: "2026-08-28T09:03:30.090Z",
  }), /GENERATED_AT_PRECEDES_FROZEN_MATH/u);
});

test("canonical release selection preserves and marks every superseded artifact", {
  skip: !HAS_SUPERSEDED_ARTIFACTS,
}, () => {
  const current = buildActuarialModelEvolutionProjection();
  assert.equal(ACTUARIAL_MODEL_EVOLUTION_CANONICAL_RELEASE, "final-v11");
  assert.equal(current.artifactLifecycle.status,
    "CANONICAL_LOCAL_MODEL_ARCHITECTURE_DIAGNOSTIC_WITH_UPSTREAM_TEMPORAL_HOLD");
  assert.equal(current.artifactLifecycle.routingStatus,
    "CANONICAL_RELEASE_TEMPORAL_QUARANTINE_HOLD");
  assert.equal(current.artifactLifecycle.canonicalRelease, "final-v11");
  assert.equal(current.artifactLifecycle.canonicalRepositoryRelativePath,
    "artifacts/actuarial-model-evolution-20260828/final-v11/architecture.json");
  assert.deepEqual(current.artifactLifecycle.supersedes,
    ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES);
  const cli = path.resolve("scripts/actuarial-model-evolution.mjs");
  for (const release of ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES) {
    const artifactPath = path.resolve(release.repositoryRelativePath);
    const bytes = readFileSync(artifactPath);
    assert.equal(bytes.length, release.artifactFileBytes, release.canonicalRelease);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      release.artifactFileHash, release.canonicalRelease);
    const oldArtifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(oldArtifact.artifactHash, release.artifactHash, release.canonicalRelease);
    assert.equal(verifyActuarialModelEvolution(oldArtifact).ok, false,
      release.canonicalRelease);
    const rejected = spawnSync(process.execPath,
      [cli, "verify-structure", "--artifact", artifactPath], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0, release.canonicalRelease);

    const markerPath = path.join(path.dirname(artifactPath), "SUPERSEDED.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    const { markerHash, ...markerBody } = marker;
    const expectedMarkerHash = `sha256:${createHash("sha256")
      .update(`outsider/actuarial-model-evolution-supersession/v1\0${
        canonicalizeStrict(markerBody)}`, "utf8").digest("hex")}`;
    assert.equal(markerHash, expectedMarkerHash, release.canonicalRelease);
    assert.equal(marker.status, "SUPERSEDED", release.canonicalRelease);
    assert.equal(marker.supersededRelease, release.canonicalRelease);
    assert.equal(marker.supersededArtifactPath, release.repositoryRelativePath);
    assert.equal(marker.supersededArtifactHash, release.artifactHash);
    assert.equal(marker.supersededArtifactFileHash, release.artifactFileHash);
    assert.equal(marker.supersededArtifactFileBytes, release.artifactFileBytes);
    assert.equal(marker.supersededArtifactBytesPreserved, true);
    const directSuccessor = release.canonicalRelease === "final-v10" ? "final-v11"
      : release.canonicalRelease === "final-v9" ? "final-v10"
      : release.canonicalRelease === "final-v8" ? "final-v9"
      : release.canonicalRelease === "final-v7" ? "final-v8"
      : release.canonicalRelease === "final-v6" ? "final-v7"
      : release.canonicalRelease === "final-v5" ? "final-v6"
      : release.canonicalRelease === "final-v4" ? "final-v5" : "final-v4";
    assert.equal(marker.supersededByRelease, directSuccessor);
    assert.equal(marker.currentCanonicalPath,
      ["final-v7", "final-v8", "final-v9", "final-v10"]
        .includes(release.canonicalRelease)
        ? `artifacts/actuarial-model-evolution-20260828/${directSuccessor}/architecture.json`
      : `artifacts/actuarial-model-evolution-20260822/${directSuccessor}/architecture.json`);
    if (release.canonicalRelease === "final-v4") {
      assert.equal(marker.previousGeneratedAt, "2026-08-22T04:00:00.000Z");
      assert.equal(marker.currentSnapshotAsOf, "2026-08-22T02:35:00.000Z");
      assert.equal(marker.futureDatedCanonicalAccepted, false);
      assert.match(marker.reason, /MODERN_TYPED_TARGET_SHIFT_FOUR_SEGMENT_CRC/u);
    }
    if (release.canonicalRelease === "final-v5") {
      assert.equal(marker.wave5SourceNativeRows, 49);
      assert.equal(marker.wave5TrainerRowsEnqueued, 0);
      assert.equal(marker.wave5TargetPredictorsAdmitted, 0);
      assert.equal(marker.operationalAuthorityGranted, false);
    }
    if (release.canonicalRelease === "final-v6") {
      assert.equal(marker.previousFrozenMathRelease, "final-v9");
      assert.equal(marker.currentFrozenMathRelease, "final-v10");
      assert.equal(marker.targetPreActionPredictorsAdmitted, 0);
      assert.equal(marker.operationalAuthorityGranted, false);
    }
  }
});

test("canonical architecture directory artifact and supersession marker are private", () => {
  const root = path.resolve("artifacts/actuarial-model-evolution-20260828");
  assert.equal(statSync(path.join(root, "final-v11")).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(root, "final-v11/architecture.json")).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(root, "final-v8/SUPERSEDED.json")).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(root, "final-v9/SUPERSEDED.json")).mode & 0o777, 0o600);
  assert.equal(statSync(path.join(root, "final-v10/SUPERSEDED.json")).mode & 0o777, 0o600);
});

test("final-v14 math canonical and full same-call source replay are mandatory", {
  skip: !HAS_FULL_SOURCE_PROFILE,
  timeout: 600_000,
}, async () => {
  assert.deepEqual(ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH, {
    repositoryRelativePath:
      "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json",
    artifactPathRole:
      "FROZEN_CANONICAL_REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_TEMPORAL_QUARANTINE_HOLD_JSON",
    generatedAt: "2026-08-28T09:03:30.091Z",
    artifactHash: "sha256:201199fbaec303e82ae41ea3b5555cbffdc24173536a8a1a33e347e95d01655e",
    artifactFileHash:
      "sha256:4e582303848e304500344121fbd0a7b415df430db29fb6ba6ab60320b87a70c8",
    artifactFileBytes: 539149,
    factorDictionaryHash:
      "sha256:64edf882a2b06b7050e0c5ec934fc40c3c5838ae114ab975377fb61d203e9456",
  });
  const mathSources = JSON.parse(readFileSync(MATH_SOURCE_PROFILE, "utf8"));
  const sourceOptions = { mathArtifactPath: MATH_CANONICAL, mathSources };
  const built = await buildActuarialModelEvolutionFromSources(sourceOptions);
  assert.deepEqual(built, buildActuarialModelEvolutionProjection());
  const receipt = await verifyActuarialModelEvolutionAgainstSources(built, sourceOptions);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.verificationLevel,
    "FULL_SOURCE_REPLAYED_REFERENCE_ARCHITECTURE_WITH_MATH_TEMPORAL_QUARANTINE");
  assert.equal(receipt.sourceArtifactsReverified, true);
  assert.equal(receipt.frozenMathCanonicalStableRead, true);
  assert.equal(receipt.frozenMathCanonicalFileHashVerified, true);
  assert.equal(receipt.frozenMathExactlyRebuiltFromSources, true);
  assert.equal(receipt.staleOrSupersededMathAccepted, false);
  assert.equal(receipt.typedFactorCount, 102);
  assert.equal(receipt.readinessStatus, "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(receipt.temporalQuarantineReceiptCount, 7);
  assert.equal(receipt.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(receipt.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(receipt.factorsAdmittedForCurrentRouting, 0);
  assert.equal(receipt.operationalAuthorityGranted, false);

  await assert.rejects(buildActuarialModelEvolutionFromSources({
    ...sourceOptions,
    callerClaimsVerified: true,
  }), /SOURCE_BUILD_OPTIONS_INVALID/u);
  await assert.rejects(buildActuarialModelEvolutionFromSources({
    mathArtifactPath: path.resolve(
      "artifacts/real-responsibility-math-diagnostics-20260821/final-v6/diagnostics.json"),
    mathSources,
  }), /FROZEN_MATH_CANONICAL_HASH_MISMATCH/u);
  await assert.rejects(buildActuarialModelEvolutionFromSources({
    mathArtifactPath: path.resolve("artifacts/does-not-exist/diagnostics.json"),
    mathSources,
  }));

  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-actuarial-math-reseal-"));
  try {
    const reserialized = path.join(temporary, "diagnostics.json");
    writeFileSync(reserialized,
      JSON.stringify(JSON.parse(readFileSync(MATH_CANONICAL, "utf8"))), "utf8");
    await assert.rejects(buildActuarialModelEvolutionFromSources({
      mathArtifactPath: reserialized,
      mathSources,
    }), /FROZEN_MATH_CANONICAL_HASH_MISMATCH/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("tampered math, score, DAG, time, or authority claims cannot be resealed by callers", () => {
  const artifact = buildActuarialModelEvolutionProjection();
  const attacks = [
    (value) => { value.factorRoleAudit.targetPreActionPredictorCandidatesAdmitted = 1; },
    (value) => { value.sourceDomainModelAdequacyDiagnostics
      .fraInterceptOnlyPoisson.equidispersedPoissonAdequateClaimed = true; },
    (value) => { value.estimandComponentGraph.edges.pop(); },
    (value) => { value.estimandComponentGraph.edges.push(
      structuredClone(value.estimandComponentGraph.edges[0])); },
    (value) => { value.readinessGapToPrerequisiteCoverage.mappings.pop(); },
    (value) => { value.readinessGapToPrerequisiteCoverage.mappings[0]
      .exactClosureEvidence = "generic successful run"; },
    (value) => { value.readinessGapToPrerequisiteCoverage.mappings[3]
      .closureOwnerClass = "CALLER_SELF_ASSERTION"; },
    (value) => { value.readinessGapToPrerequisiteCoverage.mappings[21]
      .prerequisiteNodeIds = ["TARGET_OBSERVATION_CONTRACT"]; },
    (value) => {
      const mapping = value.readinessGapToPrerequisiteCoverage.mappings[33];
      value.estimandComponentGraph.nodes.find((node) =>
        node.nodeId === mapping.gapContractNodeId).requiredEvidence
          = "payment rail exists";
    },
    (value) => { value.outputs.price = "1.00"; },
    (value) => { value.modernActuarialContracts.typedAssumptionsAndEstimands
      .transportabilityEstablished = true; },
    (value) => { value.modernActuarialContracts.fourSegmentConformalRiskControl
      .riskControlGuaranteeEstablished = true; },
    (value) => { value.modernActuarialContracts.anytimeValidMonitoring.eValue = "100"; },
    (value) => { value.modernActuarialContracts.targetCausalAndOffPolicyEvaluation
      .offPolicyValueEstimate = "1"; },
    (value) => { value.modernActuarialContracts.globalNullBoundary.price = "1"; },
    (value) => { value.authority.operationalAuthorityGranted = true; },
    (value) => { value.generatedAt = "2099-01-01T00:00:00.000Z"; },
  ];
  for (const attack of attacks) {
    const copy = structuredClone(artifact);
    attack(copy);
    assert.equal(verifyActuarialModelEvolution(resealArtifact(copy)).ok, false);
  }
});

test("description exposes only bounded architecture progress", () => {
  const description = describeActuarialModelEvolution();
  assert.equal(description.typedRetrospectiveEvidenceFactors, 102);
  assert.equal(description.targetPreActionPredictorsAdmitted, 0);
  assert.equal(description.laboratoryBenchmarkFamilies, 7);
  assert.equal(description.estimandGraphNodes, 59);
  assert.equal(description.coreArchitectureNodes, 23);
  assert.equal(description.gapSpecificContractNodes, 36);
  assert.equal(description.readinessGapsMappedToExactPrerequisites, 36);
  assert.equal(description.readinessGapsClosedByArchitecture, 0);
  assert.equal(description.targetModelComponentsFitted, 0);
  assert.equal(description.targetPrice, null);
  assert.equal(description.readyToBearResponsibility, false);
});

test("CLI builds a no-clobber structure projection and verifies it honestly", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-actuarial-evolution-"));
  const artifactPath = path.join(directory, "architecture.json");
  const cli = path.resolve("scripts/actuarial-model-evolution.mjs");
  const built = spawnSync(process.execPath,
    [cli, "build-projection", "--out", artifactPath], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).verificationLevel,
    "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION");
  assert.equal(JSON.parse(readFileSync(artifactPath, "utf8")).schema,
    "outsider/actuarial-model-evolution/v1");

  const verified = spawnSync(process.execPath,
    [cli, "verify-structure", "--artifact", artifactPath], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const receipt = JSON.parse(verified.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.sourceArtifactsReverified, false);

  const clobber = spawnSync(process.execPath,
    [cli, "build-projection", "--out", artifactPath], { encoding: "utf8" });
  assert.notEqual(clobber.status, 0);
  assert.match(clobber.stderr, /OUTPUT_EXISTS/);
});
