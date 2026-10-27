import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AGENT_FAILURE_DYNAMICS_DATASET_ID,
  AGENT_FAILURE_DYNAMICS_DISPOSITION,
  AGENT_FAILURE_DYNAMICS_REVISION,
  verifyAgentFailureDynamicsArtifactDirectory,
} from "../src/outsider-agent-failure-dynamics-full-repo.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agent-failure-dynamics-full-repo-20260829-v1");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (status.isDirectory()) {
    for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
  }
}

test("full fixed AgentHazard repo replays visible derived benchmark without promoting global claims", () => {
  const checked = verifyAgentFailureDynamicsArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_REPOSITORY_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, AGENT_FAILURE_DYNAMICS_DISPOSITION);
  assert.equal(report.source.datasetId, AGENT_FAILURE_DYNAMICS_DATASET_ID);
  assert.equal(report.source.revision, AGENT_FAILURE_DYNAMICS_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.fixedRevisionUsedStorageBytes, 2_225_307);
  assert.equal(report.source.exactRecordSiblingPaths, 39);
  assert.equal(report.source.exactRecordSiblingPathRoot,
    "sha256:a2dab1c923de5d0cd722f7a0570538242abb0260dfa363f2e25cea37485a6b8b");
  assert.equal(report.source.fullTreeEntries, 43);
  assert.equal(report.source.fullTreeFiles, 39);
  assert.equal(report.source.fullTreeDirectories, 4);
  assert.equal(report.source.fullTreeDeclaredFileBytes, 4_526_823);
  assert.deepEqual(report.source.fullTreeExtensionCounts,
    { gitattributes: 1, json: 12, md: 4, pdf: 11, png: 10, py: 1 });
  assert.equal(report.source.fullTreeLfsFiles, 10);
  assert.equal(report.source.fullTreeXetFiles, 10);
  assert.equal(report.source.fullTreeRoot,
    "sha256:f442477b913ad157b525ac48ef610114828573128df087c0f04f39bb684523a1");
  assert.equal(report.source.completeRecordAndTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, true);
  assert.equal(report.source.fullRepositoryPayloadBytes, 4_526_823);
  assert.equal(report.source.materialRecordAndTreeStateStable, true);

  assert.equal(report.visibleBenchmark.semanticUnit,
    "DERIVED_EDIT_OUTCOME_SEQUENCE");
  assert.equal(report.visibleBenchmark.uniqueBenchmarkIds, 5_072);
  assert.deepEqual(report.visibleBenchmark.splitRows,
    { test: 1_015, train: 3_043, val: 1_014 });
  assert.deepEqual(report.visibleBenchmark.train, {
    cleanOutcomes: 46_887, editOutcomeValues: 59_098,
    errorOutcomes: 12_211, maxEdits: 115, minEdits: 8,
    publisherResolvedFalse: 1_908, publisherResolvedTrue: 1_135,
    rows: 3_043, scaffolds: { ticks: 1_060, tool: 936, xml: 1_047 },
  });
  assert.deepEqual(report.visibleBenchmark.val, {
    cleanOutcomes: 15_259, editOutcomeValues: 19_205,
    errorOutcomes: 3_946, maxEdits: 86, minEdits: 8,
    publisherResolvedFalse: 642, publisherResolvedTrue: 372,
    rows: 1_014, scaffolds: { ticks: 358, tool: 336, xml: 320 },
  });
  assert.deepEqual(report.visibleBenchmark.test, {
    cleanOutcomes: 15_828, editOutcomeValues: 19_895,
    errorOutcomes: 4_067, maxEdits: 84, minEdits: 8,
    rows: 1_015, scaffolds: { ticks: 364, tool: 278, xml: 373 },
  });
  assert.deepEqual(report.visibleBenchmark.hiddenTestLabels,
    { idsMatchTestInOrder: true, resolvedFalse: 660,
      resolvedTrue: 355, rows: 1_015 });
  assert.deepEqual(report.visibleBenchmark.scaffoldTotals,
    { ticks: 1_782, tool: 1_550, xml: 1_740 });
  assert.equal(report.visibleBenchmark.editOutcomeValues, 98_198);
  assert.equal(report.visibleBenchmark.errorEditOutcomes, 20_224);
  assert.equal(report.visibleBenchmark.cleanEditOutcomes, 77_974);
  assert.equal(report.visibleBenchmark.actualEditOutcomeJsonType, "boolean");
  assert.equal(report.visibleBenchmark.idsContiguousWithinEachSplit, true);
  assert.equal(report.visibleBenchmark.splitIdSetsDisjoint, true);
  assert.equal(report.visibleBenchmark.testHiddenIdsMatchInOrder, true);
  assert.equal(report.visibleBenchmark.nEditsEqualsSequenceLengthForAllRows, true);

  assert.equal(report.contracts.schemaVersion, "1.0.0");
  assert.equal(report.contracts.schemaDeclaresEditOutcomesAsIntegerList, true);
  assert.equal(report.contracts.currentBytesEncodeEditOutcomesAsBooleanList, true);
  assert.equal(report.contracts.declaredAndPhysicalEditOutcomeJsonTypesMatch, false);
  assert.deepEqual(report.contracts.exampleRows.collapse,
    { currentTestIdsMissingFromExample: 1_015,
      extraIdsBeyondCurrentTest: 100, rows: 100,
      testIdOverlap: 0, uniqueIds: 100 });
  assert.deepEqual(report.contracts.exampleRows.resolution,
    { currentTestIdsMissingFromExample: 0,
      extraIdsBeyondCurrentTest: 185, rows: 1_200,
      testIdOverlap: 1_015, uniqueIds: 1_200 });
  assert.deepEqual(report.contracts.exampleRows.stopping,
    report.contracts.exampleRows.resolution);
  assert.equal(report.contracts.resolutionAndStoppingExamplesMatchCurrentTestDenominator,
    false);
  assert.deepEqual(report.contracts.ecosystem, {
    dataConfigurations: 134, dataConfigurationsWithResolvedCount: 134,
    referenceMatchesDataResultAvailability: false,
    referenceTotalConfigurations: 134, referenceWithResults: 0,
  });

  assert.equal(report.repositoryPayload.jsonFilesParsed, 12);
  assert.equal(report.repositoryPayload.markdownFilesUtf8Validated, 4);
  assert.equal(report.repositoryPayload.figurePdfFiles, 11);
  assert.equal(report.repositoryPayload.figurePngFiles, 10);
  assert.equal(report.repositoryPayload.figureBytes, 2_400_958);
  assert.equal(report.repositoryPayload.figureHeadersValidated, true);
  assert.equal(report.repositoryPayload.evaluatePyFiles, 1);
  assert.equal(report.repositoryPayload.evaluatePyBytes, 2_555);
  assert.equal(report.repositoryPayload.evaluatePyExecutedDuringReplay, false);
  assert.equal(report.repositoryPayload.allFilesOidLfsSizeAndSha256Bound, true);

  assert.equal(report.documentationClaims.publisherGlobalRawTrajectoryClaim, 85_050);
  assert.equal(report.documentationClaims.currentVisibleRawTrajectoryRows, 0);
  assert.equal(report.documentationClaims.currentVisibleDerivedBenchmarkIds, 5_072);
  assert.equal(report.documentationClaims.readmeApproxBenchmarkRows, 6_000);
  assert.equal(report.documentationClaims.currentBenchmarkRows, 5_072);
  assert.equal(report.documentationClaims.readmeApproxTrainRows, 3_600);
  assert.equal(report.documentationClaims.currentTrainRows, 3_043);
  assert.equal(report.documentationClaims.readmeClaimedRawTrajectoriesPresent, true);
  assert.equal(report.documentationClaims.rawTrajectoryFilesPresentAtFixedRevision,
    false);
  assert.equal(report.documentationClaims.readmeClaimsAnalysisDirectory, true);
  assert.equal(report.documentationClaims.fixedRevisionAnalysisDirectoryPresent,
    false);
  assert.equal(report.documentationClaims.readmeClaimsAllScaffoldsParsedFile, true);
  assert.equal(report.documentationClaims.fixedRevisionAllScaffoldsParsedFilePresent,
    false);
  assert.equal(report.documentationClaims.visibleBytesVerifyGlobalTrajectoryClaim,
    false);
  assert.equal(report.documentationClaims.visibleBytesVerifyPublisherCausalFailureClaims,
    false);

  assert.equal(report.semantics.visibleRowsAreRawAgentTrajectories, false);
  assert.equal(report.semantics.visibleRowsAreProcessLevelDerivedSequences, true);
  assert.equal(report.semantics.editOutcomeIsIndependentCausalFailureTruth, false);
  assert.equal(report.semantics.resolvedIsPublisherDerivedLabel, true);
  assert.equal(report.semantics.publisherGlobalClaimsIndependentlyReproduced, false);
  assert.equal(report.semantics.sequenceRowsAreRetryOrRecoveryEpisodes, false);
  assert.equal(report.outcome.publisherResolvedLabelRows, 5_072);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);

  assert.equal(report.rights.datasetCardLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.datasetApiLicenseTagPresent, true);
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.equal(report.rights.readmeCodeMitClaimPresent, true);
  assert.equal(report.rights.readmeParsedDataCcByClaimPresent, true);
  assert.equal(report.rights.upstreamSourceRightsEstablishedByCurrentBytes, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.publisherNoPersonalDataClaimPresent, true);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawIdsSequencesLabelsFiguresOrCodeProjected, false);
  for (const field of ["independentOutcomeRows", "physicalEffectRows",
    "realWorldOutcomeRows", "longitudinalOutcomeRows", "recoveryEpisodeRows",
    "retrySequenceRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.source.sourceManifestHash,
    "sha256:7a5f5c8d140a4d69495f8cf6d4f9ad0c50784a3acbc6f7f38dcb9ab818557408");
  assert.equal(report.source.sourceRoot,
    "sha256:aa7b2b4eadad6b6d7d9c329d86d903904a1388a5c78b379643e036e7378ff42e");
  assert.equal(report.artifactHash,
    "sha256:c03f913aadeba4a09f5a8eda371c55b330224e2115c46635947f36c0586cf515");
  assert.equal(receipt.receiptHash,
    "sha256:0d3e10daf5ae6c01fc84a212a75722af4d1ee1e6afd7e3a0610d18c424cea5df");
});

test("raw benchmark, figures, and evaluator stay private; publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const train = path.join(ARTIFACT, "source/files/benchmark_package/train.json");
  const evaluator = path.join(ARTIFACT,
    "source/files/benchmark_package/evaluate.py");
  const figure = path.join(ARTIFACT,
    "source/files/figures/fig1_hazard_shuffling.png");
  const before = [sha256(report), sha256(receipt), sha256(train),
    sha256(evaluator), sha256(figure)];
  const trainBefore = lstatSync(train, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-agent-failure-dynamics-full-repo.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const trainAfter = lstatSync(train, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(train),
    sha256(evaluator), sha256(figure)], before);
  assert.equal(trainAfter.size, trainBefore.size);
  assert.equal(trainAfter.mtimeNs, trainBefore.mtimeNs);
});

