import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  HANDOVER_DOI,
  HANDOVER_RECORD_ID,
  HANDOVER_REPORT_SCHEMA,
  handoverDigest,
  publishHandoverFailureArtifactDirectory,
  verifyHandoverFailureArtifactDirectory,
  verifyHandoverFailureReceipt,
  verifyHandoverFailureReport,
  verifyHandoverFailureReportWithSource,
  verifyHandoverFailureSourceDirectory,
} from "../src/outsider-handover-failure-sample-eval.js";

const ROOT = path.resolve(
  "artifacts/outsider-handover-failure-sample-eval-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = handoverDigest(changed, `${HANDOVER_REPORT_SCHEMA}/artifact`);
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

test("actual source replays the stable Zenodo revision, four pins, and both archives", () => {
  const checked = verifyHandoverFailureSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REPLAY");
  assert.equal(checked.manifest.recordBefore.recordId, HANDOVER_RECORD_ID);
  assert.equal(checked.manifest.recordBefore.doi, HANDOVER_DOI);
  assert.equal(checked.manifest.recordBefore.revision, 6);
  assert.equal(checked.manifest.recordBefore.publisherLicenseClaim, "CC-BY-4.0");
  assert.deepEqual(checked.manifest.recordBefore, checked.manifest.recordAfter);
  assert.equal(checked.manifest.recordBefore.files.length, 10);
  assert.equal(checked.manifest.manifestHash,
    "sha256:47774544c99e841b336eb8efc15830aa1e27b93982c64a808b6675cf3b88b5d3");
  assert.equal(checked.manifestFileSha256,
    "sha256:94dd24194983b6c4d40910cd1293e67f26d21076c2ca536104fe4df53e631f40");
  assert.equal(checked.sourceRoot,
    "sha256:1cac1edbfbbad17c0e8db90e376ac4c2eac0f558b1b2585cb6efed29a6c64580");
  assert.equal(checked.manifest.archives.inventoryHash,
    "sha256:5fcf85cd95f476ee53bee3f1f3718a2cbcee5c125ca62ca94214c60953cc6821");
  assert.equal(checked.manifest.archives.inventoryFileSha256,
    "sha256:65a6d67c24acaa8832445fd4741f67bdaa578f2a463fd5c41d29635fc76ecf76");
  assert.equal(checked.manifest.selection.selectedBytes, 60_097_757);
  assert.equal(checked.manifest.selection.fullDatasetPayloadDownloaded, false);
  assert.deepEqual(checked.manifest.selectedObjects.map((item) => ({ key: item.key,
    sizeBytes: item.sizeBytes, md5: item.recomputedMd5, sha256: item.sha256,
    parts: item.strict206PartCount })), [
    { key: "class_names.json", sizeBytes: 580,
      md5: "md5:4d3c62f83c1f0de4e7705eeae3f7e306",
      sha256: "sha256:a529dd91b4605fad26745f591f05b68a4511d91560c4c0b75d526ab5c4f8a656",
      parts: 1 },
    { key: "datasheet.pdf", sizeBytes: 142810,
      md5: "md5:da8d8c94d33534656c8ec7fe2762864e",
      sha256: "sha256:faee6c57ce920fb845d5a3be5a7485b94a18c9489915018eadecf286659a17d1",
      parts: 1 },
    { key: "sample_training_set.tar.gz", sizeBytes: 59949643,
      md5: "md5:c6466839bc34310fcf8e5e828874dbc7",
      sha256: "sha256:4203bc5685002ba959cc6356a5d0b3231a161d6259e6335727b766e30afeee93",
      parts: 115 },
    { key: "training_labels.tar.gz", sizeBytes: 4724,
      md5: "md5:d121a36ccbc3dec189ddcf0153c391a8",
      sha256: "sha256:4cfbdd9ee4b7b1b22fe38dc456b60a1be4d4b62e6deeae33b98ac8c75a26019b",
      parts: 1 },
  ]);
  assert.equal(checked.inventory.sampleArchive.rawTarBytes, 66_908_160);
  assert.equal(checked.inventory.sampleArchive.trailerCrc32, "d763efe6");
  assert.equal(checked.inventory.sampleArchive.gzipCrcAndISizeReplayed, true);
  assert.equal(checked.inventory.sampleArchive.memberCount, 1829);
  assert.equal(checked.inventory.sampleArchive.fileCount, 1824);
  assert.equal(checked.inventory.sampleArchive.directoryCount, 5);
  assert.equal(checked.inventory.trainingLabelArchive.rawTarBytes, 348_160);
  assert.equal(checked.inventory.trainingLabelArchive.trailerCrc32, "e04fdacb");
  assert.equal(checked.inventory.trainingLabelArchive.memberCount, 338);
  assert.equal(checked.inventory.trainingLabelArchive.fileCount, 337);
  assertPrivateTree(ROOT);
});

test("two sample trials exact-join publisher labels without creating independent outcomes", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:25b551c23162188829661a1c6ffe3062400f97b6ae58032d800525975335d5d4");
  assert.deepEqual(report.observations.sampleTrialIds, ["trial0000", "trial0002"]);
  assert.deepEqual(report.observations.sampleExtensionCounts,
    { jpg: 1790, json: 2, mp4: 2, npy: 30 });
  assert.equal(report.observations.sampleMemberCount, 1829);
  assert.equal(report.observations.sampleFileCount, 1824);
  assert.equal(report.observations.sampleDirectoryCount, 5);
  assert.equal(report.observations.sampleTotalMemberBytes, 65_502_467);
  assert.equal(report.observations.trainingLabelRows, 337);
  assert.deepEqual(report.observations.trainingLabelTaskCounts,
    { "human to robot handover": 169, "robot to human handover": 168 });
  assert.deepEqual(report.observations.sampleLabelJoins.map((item) => ({
    trialId: item.trialId, task: item.task, robot: item.robot,
    outcomeIndex: item.publisherOutcomeIndex, outcome: item.publisherOutcomeName,
    basenameJoin: item.exactBasenameJoinEstablished,
    taskInfoMatch: item.taskInfoExactMatchEstablished })), [
    { trialId: "trial0000", task: "human to robot handover", robot: "Kinova Gen3",
      outcomeIndex: 3, outcome: "drop", basenameJoin: true, taskInfoMatch: true },
    { trialId: "trial0002", task: "robot to human handover", robot: "Toyota HSR",
      outcomeIndex: 1, outcome: "no approach", basenameJoin: true, taskInfoMatch: true },
  ]);
  assert.equal(report.observations.npyProfiles.length, 30);
  assert.equal(report.observations.npyProfiles.every((item) =>
    item.exactDataLengthEstablished === true), true);
  assert.deepEqual(report.observations.npyProfiles.filter((item) =>
    item.path.endsWith("joint_names.npy")).map((item) =>
    ({ path: item.path, descr: item.descr, itemBytes: item.itemBytes, shape: item.shape })), [
    { path: "sample_training_set/trial0002/joint_names.npy",
      descr: "<U28", itemBytes: 112, shape: [13] },
    { path: "sample_training_set/trial0000/joint_names.npy",
      descr: "<U31", itemBytes: 124, shape: [13] },
  ]);
  assert.equal(report.denominators.boundedSampleTrials.units, 2);
  assert.equal(report.denominators.boundedSampleTrials.exactTrainingLabelJoinUnits, 2);
  assert.equal(report.denominators.fullDatasetPublisherClaim.units, 589);
  assert.equal(report.denominators.fullDatasetPublisherClaim.payloadReplayed, false);
  assert.equal(report.denominators.crossTotal, null);
  assert.equal(report.truthBoundary.taskOutcomeEstablishedOnlyAsPublisherLabel, true);
  assert.equal(report.truthBoundary.independentOutcomeEstablished, false);
  assert.equal(report.truthBoundary.humanParticipantInvolvementCountsAsIndependentWitness, false);
  assert.equal(report.segments.outcome.publisherLabelUnits, 2);
  assert.equal(report.segments.outcome.independentUnits, 0);
});

test("datasheet facts force privacy quarantine and preserve all authority at zero", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.privacy.extractionMethod, "MANUAL_PAGE_REVIEW_OF_PINNED_PDF");
  assert.deepEqual(report.privacy.reviewedPages, [2, 3, 4]);
  assert.equal(report.privacy.participantsPublisherClaim, 17);
  assert.equal(report.privacy.rgbFacesVisibleAndPotentiallyIdentifiable, true);
  assert.equal(report.privacy.participantsNotified, true);
  assert.equal(report.privacy.participantConsentPublisherClaim, true);
  assert.equal(report.privacy.futureRevocationMechanismOffered, true);
  assert.equal(report.privacy.deletionOfAllPublicCopiesGuaranteedAfterRevocation, false);
  assert.equal(report.privacy.ethicalReviewConductedPublisherClaim, false);
  assert.equal(report.privacy.dataSubjectImpactAnalysisConductedPublisherClaim, false);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.truthBoundary.opportunityOrAttemptCensusEstablished, false);
  assert.equal(report.truthBoundary.rawRosBagPresentInPublishedSample, false);
  assert.equal(report.truthBoundary.recoveryEstablished, false);
  assert.equal(report.truthBoundary.longitudinalFollowupEstablished, false);
  assert.equal(report.rights.publisherLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.legalAdjudicationPerformed, false);
  assert.equal(report.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.governedTrainingRows, 0);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.economics.pricingUnits, 0);
  assert.equal(report.authority.authorityUnits, 0);
});

test("report and receipt fully rederive from the bounded private source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(receipt.receiptHash,
    "sha256:c290da36ed580d64dd7726cd9b0a6f0c9b0cbd4a7f62518b1601d2dbf30306fe");
  assert.equal(receipt.reportFileSha256,
    "sha256:7d32785bd74ca89725c7a449314e75bcb0dd0ba40faa8b42599e1bc93df9a99b");
  assert.equal(verifyHandoverFailureReport(report).ok, true);
  assert.equal(verifyHandoverFailureReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyHandoverFailureReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  const artifact = verifyHandoverFailureArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.independentWitnessUnits, 0);
  assert.equal(artifact.recoveryUnits, 0);
  assert.equal(artifact.governedTrainingRows, 0);
  assert.equal(artifact.networkAdmissionRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture witness, outcome, census, recovery, privacy, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.source.fullDatasetPayloadDownloaded = true; },
    (copy) => { copy.denominators.crossTotal = 926; },
    (copy) => { copy.observations.sampleLabelJoins[0].publisherOutcomeName = "success"; },
    (copy) => { copy.truthBoundary.independentOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.humanParticipantInvolvementCountsAsIndependentWitness = true; },
    (copy) => { copy.truthBoundary.opportunityOrAttemptCensusEstablished = true; },
    (copy) => { copy.truthBoundary.recoveryEstablished = true; },
    (copy) => { copy.truthBoundary.longitudinalFollowupEstablished = true; },
    (copy) => { copy.segments.outcome.independentUnits = 2; },
    (copy) => { copy.segments.recovery.units = 2; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.rgbFacesVisibleAndPotentiallyIdentifiable = false; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.privacy.ethicalReviewConductedPublisherClaim = true; },
    (copy) => { copy.useBoundary.governedTrainingRows = 2; },
    (copy) => { copy.network.networkAdmissionRows = 2; },
    (copy) => { copy.economics.CEU = 2; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyHandoverFailureReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyHandoverFailureReport(fakeSource).ok, true);
  assert.equal(verifyHandoverFailureReportWithSource(fakeSource, SOURCE).ok, false);
});

test("artifact publication refuses an occupied target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-handover-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishHandoverFailureArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});
