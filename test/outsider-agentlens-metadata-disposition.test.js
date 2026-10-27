import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  AGENTLENS_ARXIV_ID,
  AGENTLENS_ARXIV_VERSION,
  AGENTLENS_DECLARED_REPOSITORY,
  AGENTLENS_REPORT_SCHEMA,
  AGENTLENS_SOURCE_OBJECT_SPECS,
  agentLensDigest,
  publishAgentLensMetadataDispositionArtifactDirectory,
  verifyAgentLensMetadataDispositionArtifactDirectory,
  verifyAgentLensMetadataDispositionReceipt,
  verifyAgentLensMetadataDispositionReport,
  verifyAgentLensMetadataDispositionReportWithSource,
  verifyAgentLensMetadataSourceDirectory,
} from "../src/outsider-agentlens-metadata-disposition.js";

const ROOT = path.resolve(
  "artifacts/outsider-agentlens-metadata-disposition-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "agentlens-metadata-disposition.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

const EXPECTED_HASHES = Object.freeze({
  artifact: "sha256:38991598f4166d1eabaf992b444a186cc3f35dcc2cbb78a05c7726b607f92c6f",
  reportFile: "sha256:44bf2084b2c6563076083df96fec70ecc4aa5746e8292d186988bc271c746664",
  receipt: "sha256:36551b893fd004937fe5b95526f0805ce4de2a4220d9b4f3c57b9b3f26c7c6bf",
  receiptFile: "sha256:ebe3dbaab5774795bdd5a1981f886995cb7648bbc1aba5debd02ae02dfe9a3b2",
  sourceRoot: "sha256:6667e70b30f1641c2c35573ae372ec5f9709d5f032ba3d14e20690767d946976",
  manifest: "sha256:86f4b1fb0ea0bf73348287704b2689636c06e127972db53a0c9f59150ea051f1",
  manifestFile: "sha256:69129cd7b09d96541c372b04d563eb947a757b02c6f014cf6fa530419d6cb42f",
  paperPdf: "sha256:c86120eb74bd7bffebaf736dae439a5f7ab81efdaee738c528b305912e43413d",
});

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = agentLensDigest(changed, `${AGENTLENS_REPORT_SCHEMA}/artifact`);
  return changed;
}

function assertPrivateTree(root) {
  const visit = (directory) => {
    const stat = lstatSync(directory);
    assert.equal(stat.isSymbolicLink(), false, directory);
    assert.equal(stat.isDirectory(), true, directory);
    assert.equal(stat.mode & 0o777, 0o700, directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const child = lstatSync(target);
      assert.equal(child.isSymbolicLink(), false, target);
      if (child.isDirectory()) visit(target);
      else {
        assert.equal(child.isFile(), true, target);
        assert.equal(child.mode & 0o777, 0o600, target);
      }
    }
  };
  visit(root);
}

test("official Microsoft and pinned arXiv metadata replay across the stable bracket", () => {
  const checked = verifyAgentLensMetadataSourceDirectory(SOURCE);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_OFFICIAL_METADATA_AND_ABSENCE_REPLAY");
  assert.equal(checked.manifest.officialIdentity.arxivId, AGENTLENS_ARXIV_ID);
  assert.equal(checked.manifest.officialIdentity.arxivVersion, AGENTLENS_ARXIV_VERSION);
  assert.equal(checked.manifest.officialIdentity.declaredRepository,
    AGENTLENS_DECLARED_REPOSITORY);
  assert.equal(checked.manifest.objects.length, AGENTLENS_SOURCE_OBJECT_SPECS.length);
  assert.equal(checked.manifest.objects.length, 17);
  assert.equal(checked.manifest.closure.disposition, "METADATA_ONLY");
  assert.equal(checked.manifest.closure.terminal, true);
  assert.equal(checked.manifest.closure.publicPayloadFiles, 0);
  assert.equal(checked.manifest.closure.repositoryRevision, null);
  assert.equal(checked.manifest.closure.datasetRevision, null);
  assert.equal(checked.manifest.closure.paperLicenseClaim, "CC-BY-4.0");
  assert.equal(checked.manifest.closure.datasetPayloadLicense, null);
  assert.equal(checked.replay.official.microsoft.publisherReleaseClaimPresent, true);
  assert.equal(checked.replay.official.atom.releaseStatus, "PLANNED_SOON");
  assert.equal(checked.replay.official.abs.paperLicenseClaim, "CC-BY-4.0");
  assert.deepEqual(checked.replay.absence, {
    declaredRepositoryHttpStatus: 404,
    githubMicrosoftAgentLensSearchMatches: 0,
    githubSearchIncomplete: false,
    hfAgentLensSearchMatches: 0,
    hfMicrosoftAgentLensSearchMatches: 0,
  });
  assert.equal(checked.replay.paperPdfBytes, 1_006_494);
  assert.equal(checked.replay.paperPdfSha256, EXPECTED_HASHES.paperPdf);
  assert.equal(checked.sourceRoot, EXPECTED_HASHES.sourceRoot);
  assert.equal(checked.manifest.manifestHash, EXPECTED_HASHES.manifest);
  assert.equal(checked.manifestFileSha256, EXPECTED_HASHES.manifestFile);
  assertPrivateTree(ROOT);
});

test("the unavailable declared repository receives one terminal METADATA_ONLY disposition", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash, EXPECTED_HASHES.artifact);
  assert.equal(report.disposition.status, "METADATA_ONLY");
  assert.equal(report.disposition.terminal, true);
  assert.equal(report.disposition.reasonCode,
    "DECLARED_PUBLIC_REPOSITORY_UNAVAILABLE_NO_PUBLIC_DATASET_PAYLOAD");
  assert.equal(report.disposition.gates.officialMicrosoftPublicationPresent, true);
  assert.equal(report.disposition.gates.pinnedArxivV3Present, true);
  assert.equal(report.disposition.gates.declaredGithubRepositoryPubliclyAvailable, false);
  assert.equal(report.disposition.gates.publicPayloadTreeEstablished, false);
  assert.equal(report.disposition.gates.publicPayloadRevisionEstablished, false);
  assert.equal(report.officialIdentity.repositoryRevision, null);
  assert.equal(report.officialIdentity.datasetRevision, null);
  assert.equal(report.officialIdentity.publicationPageReleaseClaim,
    "RELEASED_ANONYMIZED_REPOSITORY");
  assert.equal(report.officialIdentity.pinnedPaperReleaseStatement, "PLANNED_SOON");
  assert.equal(report.officialIdentity.publisherSurfaceConflictPreserved, true);
  assert.deepEqual(report.discovery.exactChecks.map((item) =>
    [item.id, item.observations, item.httpStatus, item.publicMatches]), [
    ["DECLARED_GITHUB_REPOSITORY", 2, 404, 0],
    ["GITHUB_MICROSOFT_AGENTLENS_SEARCH", 2, 200, 0],
    ["HF_AGENTLENS_SEARCH", 2, 200, 0],
    ["HF_MICROSOFT_AGENTLENS_SEARCH", 2, 200, 0],
  ]);
  assert.equal(report.discovery.declaredScopeExhausted, true);
  assert.equal(report.discovery.globalExhaustion, false);
  assert.equal(report.discovery.sourceUniverseExhausted, false);
  assert.equal(report.discovery.noClaimThatAHiddenPrivateRepositoryDoesNotExist, true);
});

test("publisher corpus, subset, and annotation claims retain exact typed denominators", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.deepEqual(report.publisherClaims.corpus, {
    fail: 1_217, modelBackends: 8, outcomeUnrecorded: 8,
    partitionArithmeticExact: true, pass: 1_389, tasks: 60, trajectories: 2_614,
  });
  assert.deepEqual(report.publisherClaims.agentLensBenchSubset, {
    fail: 679, featureColumns: 40, partitionArithmeticExact: true,
    pass: 1_136, ptaEligibleTasks: 47, subsetOfCorpus: true, trajectories: 1_815,
  });
  assert.deepEqual(report.publisherClaims.annotations, {
    divergencePoints: true, qualityScores: true, qualityTierLabels: true,
    taskLevelPtaReferences: 47, wasteSignals: true,
  });
  assert.deepEqual(report.publisherClaims.luckyPass, {
    independentReplayPerformed: false, publisherLabeledCount: 122,
    publisherRatePercentOfPassingSubset: 10.7,
  });
  assert.equal(report.denominators.publisherCorpusTrajectoryClaim.units, 2_614);
  assert.equal(report.denominators.publisherCorpusTrajectoryClaim.replayed, false);
  assert.equal(report.denominators.publisherBenchSubsetTrajectoryClaim.units, 1_815);
  assert.equal(report.denominators.publisherBenchSubsetTrajectoryClaim.replayed, false);
  assert.equal(report.denominators.publisherBenchSubsetTrajectoryClaim.nestedWithinCorpusClaim,
    true);
  assert.equal(report.denominators.sourceNativeTrajectoryRows.units, 0);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
});

test("paper labels never become payload replay, independent truth, training, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.deepEqual(report.payloadReplay, {
    divergencePointRows: 0, ptaObjects: 0, publicPayloadAvailable: false,
    publicPayloadFiles: 0, publisherLabelRows: 0, qualityScoreRows: 0,
    rawDialogueFiles: 0, rawDialogueRows: 0, rawToolContentFiles: 0,
    rawToolContentRows: 0, sourceNativeTrajectoryFiles: 0,
    sourceNativeTrajectoryRows: 0, wasteSignalRows: 0,
  });
  assert.equal(report.truthBoundary.officialPaperClaimsEstablished, true);
  assert.equal(report.truthBoundary.publicPayloadAvailabilityEstablished, false);
  assert.equal(report.truthBoundary.sourceNativeTrajectoriesReplayed, false);
  assert.equal(report.truthBoundary.publisherLabelsReplayed, false);
  assert.equal(report.truthBoundary.passFailOutcomesIndependentlyVerified, false);
  assert.equal(report.truthBoundary.qualityScoresIndependentlyVerified, false);
  assert.equal(report.truthBoundary.wasteSignalsCausalTruthEstablished, false);
  assert.equal(report.truthBoundary.divergencePointsIndependentlyVerified, false);
  assert.equal(report.truthBoundary.completeAttemptCensusEstablished, false);
  assert.equal(report.segments.action.replayedTrajectoryUnits, 0);
  assert.equal(report.segments.effect.causalWasteUnits, 0);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.rights.paperLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.datasetPayloadLicense, null);
  assert.equal(report.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(report.privacy.publicationPageAnonymizedRepositoryClaim, true);
  assert.equal(report.privacy.independentAnonymizationVerification, false);
  assert.equal(report.privacy.rawDialogueOrToolContentRetained, false);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.useBoundary.status, "METADATA_ONLY");
  assert.equal(report.useBoundary.offlineModelFittingRows, 0);
  assert.equal(report.useBoundary.authorizedTrainingRows, 0);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.authority.executionAuthorityUnits, 0);
});

test("report and receipt fully rederive from official metadata and absence bytes", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receiptBytes = readFileSync(RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.receiptHash, EXPECTED_HASHES.receipt);
  assert.equal(receipt.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(verifyAgentLensMetadataDispositionReport(report).ok, true);
  assert.equal(verifyAgentLensMetadataDispositionReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyAgentLensMetadataDispositionReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.verificationLevel,
    "FULL_OFFICIAL_METADATA_AND_ABSENCE_REDERIVED");
  const artifact = verifyAgentLensMetadataDispositionArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true, artifact.error);
  assert.equal(artifact.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(artifact.receiptFileSha256, EXPECTED_HASHES.receiptFile);
  assert.equal(artifact.disposition, "METADATA_ONLY");
  assert.equal(artifact.publisherClaimedCorpusTrajectories, 2_614);
  assert.equal(artifact.publisherClaimedBenchTrajectories, 1_815);
  assert.equal(artifact.sourceNativeTrajectoryRows, 0);
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.causalWasteUnits, 0);
  assert.equal(artifact.authorizedTrainingRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot invent a payload, replay, causal waste, training, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.disposition.status = "ADMITTED"; },
    (copy) => { copy.disposition.gates.publicPayloadTreeEstablished = true; },
    (copy) => { copy.officialIdentity.repositoryRevision = "0".repeat(40); },
    (copy) => { copy.discovery.globalExhaustion = true; },
    (copy) => { copy.payloadReplay.publicPayloadAvailable = true; },
    (copy) => { copy.payloadReplay.sourceNativeTrajectoryRows = 1_815; },
    (copy) => { copy.payloadReplay.publisherLabelRows = 1_815; },
    (copy) => { copy.truthBoundary.passFailOutcomesIndependentlyVerified = true; },
    (copy) => { copy.truthBoundary.wasteSignalsCausalTruthEstablished = true; },
    (copy) => { copy.segments.effect.causalWasteUnits = 122; },
    (copy) => { copy.segments.outcome.independentUnits = 1_815; },
    (copy) => { copy.rights.datasetPayloadLicense = "CC-BY-4.0"; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.authorizedTrainingRows = 1_815; },
    (copy) => { copy.network.networkAdmissionRows = 1_815; },
    (copy) => { copy.economics.CEU = 122; },
    (copy) => { copy.authority.executionAuthorityUnits = 1; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyAgentLensMetadataDispositionReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyAgentLensMetadataDispositionReport(fakeSource).ok, true);
  assert.equal(verifyAgentLensMetadataDispositionReportWithSource(fakeSource, SOURCE).ok,
    false);
});

test("source tampering, report-byte substitution, and occupied publication fail closed", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-agentlens-metadata-test-"));
  chmodSync(parent, 0o700);
  try {
    const sourceCopy = path.join(parent, "source");
    cpSync(SOURCE, sourceCopy, { recursive: true, preserveTimestamps: true });
    const repository = path.join(sourceCopy, "control",
      "github-declared-repository-before.json");
    writeFileSync(repository, Buffer.from('{"message":"Found"}\n', "utf8"),
      { mode: 0o600 });
    chmodSync(repository, 0o600);
    assert.equal(verifyAgentLensMetadataSourceDirectory(sourceCopy).ok, false);

    const report = JSON.parse(readFileSync(REPORT));
    const receipt = JSON.parse(readFileSync(RECEIPT));
    const substituted = Buffer.concat([readFileSync(REPORT), Buffer.from(" ")]);
    assert.equal(verifyAgentLensMetadataDispositionReceipt(receipt, report, substituted).ok,
      false);

    const staging = path.join(parent, "staging");
    const occupied = path.join(parent, "occupied");
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(occupied, { mode: 0o700 });
    writeFileSync(path.join(staging, "marker"), "staging\n", { mode: 0o600 });
    writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
    assert.throws(() => publishAgentLensMetadataDispositionArtifactDirectory(
      staging, occupied), /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
    assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

