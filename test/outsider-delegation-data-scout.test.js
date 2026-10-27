import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  DELEGATION_DATA_SCOUT_SCHEMA,
  buildDelegationDataScoutCatalog,
  delegationDataScoutDisposition,
  listDelegationDataScoutCandidates,
  verifyDelegationDataScoutCatalog,
} from "../src/outsider-delegation-data-scout.js";

function reseal(record) {
  const copy = structuredClone(record);
  delete copy.catalogHash;
  copy.catalogHash = `sha256:${createHash("sha256")
    .update(`${DELEGATION_DATA_SCOUT_SCHEMA}\0${canonicalizeStrict(copy)}`, "utf8")
    .digest("hex")}`;
  return copy;
}

test("reviewed scout catalog is deterministic and grants no training or action authority", () => {
  const catalog = buildDelegationDataScoutCatalog();
  assert.equal(verifyDelegationDataScoutCatalog(catalog).ok, true);
  assert.equal(catalog.accounting.candidates, 17);
  assert.equal(catalog.accounting.automaticTrainingRows, 0);
  assert.equal(catalog.accounting.actionAuthorityGrants, 0);
  assert.equal(catalog.authority.trainingAuthorized, false);
  assert.equal(catalog.authority.actionReady, false);
  for (const source of catalog.candidates) {
    assert.equal(source.evidenceBoundary.automaticTraining, false);
    assert.equal(source.evidenceBoundary.governedTraining, false);
    assert.equal(source.evidenceBoundary.actionAuthority, false);
    assert.equal(source.rightsBoundary.adapterGrantsRights, false);
    assert.equal(source.sourceReplay.moduleReplaysBytes, false);
  }
});

test("source-specific dispositions preserve the real, simulated, and harmful-content boundaries", () => {
  const cua = delegationDataScoutDisposition("ZJUSCL/CUAStepBench");
  assert.equal(cua.publisherClaims.trajectories, 278);
  assert.equal(cua.rightsBoundary.upstreamSourceRightsResolved, false);
  assert.equal(cua.disposition, "QUARANTINE_METADATA_FIRST");

  const robo = delegationDataScoutDisposition("MINT-SJTU/RoboFAC-dataset");
  assert.equal(robo.publisherClaims.erroneousTrajectories, 9_440);
  assert.equal(robo.publisherClaims.realSimulationPartitionPublishedInReviewedCard, false);

  const rapt = delegationDataScoutDisposition("hmunn/rapt-g1-ood");
  assert.equal(rapt.publisherClaims.publicDatasetReality, "SIMULATION");
  assert.equal(rapt.publisherClaims.realRobotRunsPresentInPublicDataset, false);

  const hazard = delegationDataScoutDisposition("Yunhao-Feng/AgentHazard");
  assert.equal(hazard.evidenceBoundary.taxonomyUse, true);
  assert.match(hazard.disposition, /DO_NOT_EXECUTE_OR_REPRODUCE/u);

  const real = delegationDataScoutDisposition("InternRobotics/REAL");
  assert.equal(real.publisherClaims.taskDefinitions, 241);
  assert.equal(real.publisherClaims.publicTrajectories, null);
});

test("existing BotFails integration is referenced rather than duplicated", () => {
  const bot = delegationDataScoutDisposition("kantine/BotFails");
  assert.equal(bot.sourceReplay.existingAdapter,
    "src/outsider-public-robotics-adapter.js");
  assert.equal(bot.sourceReplay.selectedScopeDenominatorFrozen, true);
  assert.equal(bot.evidenceBoundary.automaticTraining, false);
  assert.deepEqual(listDelegationDataScoutCandidates(), [
    "InternRobotics/REAL",
    "MINT-SJTU/RoboFAC-dataset",
    "ManipArena/maniparena-dataset",
    "PrentisAI/AutoResearchEval",
    "ProcessBench-2026/RoboProcessBench",
    "ServiceNow/AgentHorizon",
    "Yunhao-Feng/AgentHazard",
    "ZJUSCL/CUAStepBench",
    "aradhye/agent-safety-bench",
    "ethz-spylab/agentdojo",
    "hmunn/rapt-g1-ood",
    "kantine/BotFails",
    "microsoft/Orchard",
    "nvidia/PhysicalAI-Robotics-Open-H-Embodiment",
    "sii-rhos-ai/ViFailback-Dataset",
    "xlang-ai/OSWorld-V2",
    "xlangai/computer-agent-arena",
  ]);
});

test("latest candidates stay metadata-only and preserve repair, rights, and label gaps", () => {
  const osworld = delegationDataScoutDisposition("xlang-ai/OSWorld-V2");
  assert.equal(osworld.publisherClaims.longHorizonWorkflows, 108);
  assert.equal(osworld.publisherClaims.taskAssetsRequireGatedTerms, true);
  assert.equal(osworld.access.payloadGated, true);

  const process = delegationDataScoutDisposition("ProcessBench-2026/RoboProcessBench");
  assert.equal(process.publisherClaims.supervisedRows + process.publisherClaims.evaluationRows,
    process.publisherClaims.totalQuestionAnswerRows);
  assert.equal(process.publisherClaims.evalManifestPathMismatchObserved, true);
  assert.match(process.rightsBoundary.declaredLicense, /MIXED_UPSTREAM/);

  const embodiment = delegationDataScoutDisposition(
    "nvidia/PhysicalAI-Robotics-Open-H-Embodiment");
  assert.equal(embodiment.publisherClaims.obudaNeedleThreadingEpisodes
    + embodiment.publisherClaims.obudaPegTransferEpisodes
    + embodiment.publisherClaims.obudaRollercoasterEpisodes
    + embodiment.publisherClaims.obudaSeaspikeEpisodes,
  embodiment.publisherClaims.obudaRecoverySliceEpisodes);
  assert.equal(embodiment.publisherClaims.obudaPerEpisodeOutcomeFieldPresent, false);

  const dojo = delegationDataScoutDisposition("ethz-spylab/agentdojo");
  assert.equal(dojo.publisherClaims.guardBlockedCallMustNotCountAsExecutedEffect, true);
  assert.match(dojo.disposition, /DO_NOT_EXECUTE_INJECTION_CONTENT/);

  const safety = delegationDataScoutDisposition("aradhye/agent-safety-bench");
  assert.equal(safety.publisherClaims.unsafeRows + safety.publisherClaims.safeRows,
    safety.publisherClaims.defaultRows);
  assert.equal(safety.publisherClaims.unfulfillableRows + safety.publisherClaims.fulfillableRows,
    safety.publisherClaims.defaultRows);
  assert.equal(safety.publisherClaims.defaultRows + safety.publisherClaims.augmentedRows,
    safety.publisherClaims.totalRows);
  assert.equal(safety.publisherClaims.labelsAreTaskLabelsNotExecutionOutcomes, true);
  assert.equal(safety.evidenceBoundary.automaticTraining, false);
});

test("new candidates preserve failure denominators, source classes, and rights holds", () => {
  const orchard = delegationDataScoutDisposition("microsoft/Orchard");
  assert.equal(orchard.publisherClaims.resolvedByHiddenTests
    + orchard.publisherClaims.unresolvedByHiddenTests,
  orchard.publisherClaims.softwareEngineeringTrajectories);
  assert.equal(orchard.publisherClaims.guiSuccessfulOnly, true);
  assert.equal(orchard.publisherClaims.guiUniqueTasks
    - orchard.publisherClaims.guiLastTurnRows, 1);
  assert.equal(orchard.rightsBoundary.upstreamSourceRightsResolved, false);

  const horizon = delegationDataScoutDisposition("ServiceNow/AgentHorizon");
  assert.equal(horizon.publisherClaims.hardPositive
    + horizon.publisherClaims.hardNegative, horizon.publisherClaims.hardItems);
  assert.equal(horizon.publisherClaims.simplePositive
    + horizon.publisherClaims.simpleNegative, horizon.publisherClaims.simpleItems);
  assert.equal(horizon.publisherClaims.hardItems + horizon.publisherClaims.simpleItems,
    horizon.publisherClaims.totalTrajectoryLabels);
  assert.equal(horizon.rightsBoundary.declaredLicense, null);
  assert.match(horizon.disposition, /LICENSE_UNDECLARED/u);

  const failback = delegationDataScoutDisposition("sii-rhos-ai/ViFailback-Dataset");
  assert.equal(failback.publisherClaims.successfulTrajectories
    + failback.publisherClaims.failedTrajectories,
  failback.publisherClaims.realRobotTrajectories);
  assert.equal(failback.publisherClaims.rgbDepthSpatialAlignmentKnownFalseForDabaiCameras,
    true);
  assert.equal(failback.publisherClaims.publishedFailureTaxonomyRemainderUnexplainedPercent,
    "12.63");

  const arena = delegationDataScoutDisposition("ManipArena/maniparena-dataset");
  assert.equal(arena.access.payloadGated, true);
  assert.equal(arena.rightsBoundary.declaredUseRestriction,
    "RESEARCH_AND_COMPETITION_ONLY");
  assert.equal(arena.publisherClaims.realRobotEpisodes, 10_812);
  assert.equal(arena.evidenceBoundary.governedTraining, false);

  const research = delegationDataScoutDisposition("PrentisAI/AutoResearchEval");
  assert.equal(research.publisherClaims.optimizationSuccess
    + research.publisherClaims.optimizationNonSuccess,
  research.publisherClaims.optimizationRollouts);
  assert.equal(research.publisherClaims.openEndedCartesianExpectation
    - research.publisherClaims.openEndedRollouts, 1);
  assert.equal(research.publisherClaims.taskCountFromSubsets
    - research.publisherClaims.titleClaimedTasks, 1);

  const arenaGui = delegationDataScoutDisposition("xlangai/computer-agent-arena");
  assert.equal(arenaGui.publisherClaims.trajectories, 4_641);
  assert.equal(arenaGui.publisherClaims.privacyClaimsIndependentlyReplayed, false);
  assert.equal(arenaGui.evidenceBoundary.automaticTraining, false);
});

test("self-consistent rehashing cannot promote reviewed metadata into training or authority", () => {
  const catalog = buildDelegationDataScoutCatalog();
  for (const mutate of [
    (value) => { value.authority.trainingAuthorized = true; },
    (value) => { value.candidates[0].evidenceBoundary.actionAuthority = true; },
    (value) => { value.candidates[3].rightsBoundary.upstreamSourceRightsResolved = true; },
    (value) => { value.candidates[2].evidenceBoundary.rawPayloadIngress = true; },
  ]) {
    const changed = structuredClone(catalog);
    mutate(changed);
    assert.equal(verifyDelegationDataScoutCatalog(reseal(changed)).ok, false);
  }
});

test("non-JSON array semantics cannot enter the catalog verifier", () => {
  const catalog = structuredClone(buildDelegationDataScoutCatalog());
  catalog.candidates.length += 1;
  assert.equal(Object.hasOwn(catalog.candidates, catalog.candidates.length - 1), false);
  assert.equal(verifyDelegationDataScoutCatalog(catalog).ok, false);
});
