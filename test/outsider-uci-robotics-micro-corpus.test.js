import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  UCI_ROBOTICS_MICRO_CORPUS_CONSTANTS,
  UCI_ROBOTICS_MICRO_CORPUS_SCHEMA,
  buildUciRoboticsMicroCorpusFromSource,
  uciRoboticsSha256Bytes,
  verifyUciRoboticsMicroCorpusReport,
  verifyUciRoboticsMicroCorpusRunReceipt,
  verifyUciRoboticsMicroCorpusWithSource,
  verifyUciRoboticsSourceDirectory,
} from "../src/outsider-uci-robotics-micro-corpus.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ROOT = path.resolve(
  "artifacts/outsider-uci-robotics-micro-corpus-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "uci-robotics-micro-corpus.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");
const CLI = path.resolve("scripts/acquire-uci-robotics-micro-corpus.mjs");

function recursiveEntries(root, relative = "") {
  const files = [];
  const directories = [relative];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? relative + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      const nested = recursiveEntries(root, child);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else files.push(child);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function reseal(report, mutate) {
  const copy = structuredClone(report);
  mutate(copy);
  delete copy.artifactHash;
  copy.artifactHash = uciRoboticsSha256Bytes(Buffer.from(
    UCI_ROBOTICS_MICRO_CORPUS_SCHEMA + "/artifact\0" + canonicalizeStrict(copy)));
  return copy;
}

test("actual source is the exact private 5-dataset API/archive bracket", () => {
  const checked = verifyUciRoboticsSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verifiedRemoteFileCount, 15);
  assert.equal(checked.verifiedRemoteBytes, 4_600_773);
  assert.equal(checked.manifest.manifestHash,
    "sha256:84477c3901f9842a05281b68dfedbb6c2eb371f13038d6cc9b2034cba551c396");
  assert.deepEqual(checked.manifest.boundedTransientRetryPolicy, {
    maximumAttemptsPerRequest: 3,
    perAttemptTimeoutMilliseconds: 180_000,
    backoffMilliseconds: [1000, 4000],
    retryableHttpStatuses: [408, 425, 429, 500, 502, 503, 504],
  });
  assert.equal(checked.manifest.apiBracketedBeforeAndAfterArchiveDownload, true);
  assert.equal(checked.manifest.exactApiBytesStableForEveryDataset, true);
  assert.equal(checked.manifest.globalExhaustion, false);
  assert.equal(checked.manifest.datasets.length, 5);
  for (const dataset of checked.manifest.datasets) {
    assert.equal(dataset.apiBefore.sha256, dataset.apiAfter.sha256);
    assert.equal(dataset.apiBefore.bytes, dataset.apiAfter.bytes);
    assert.equal(dataset.apiByteIdenticalDuringAcquisition, true);
    assert.equal(dataset.licenseClaim.identifier, "CC-BY-4.0");
    assert.equal(dataset.licenseClaim.claimSource, "UCI_OFFICIAL_DATASET_PAGE");
    assert.equal(dataset.licenseClaim.bytePinnedInApiPayload, false);
    assert.equal(dataset.licenseClaim.legalConclusion, false);
  }
  const entries = recursiveEntries(SOURCE);
  assert.equal(entries.files.length, 16);
  assert.equal(entries.directories.length, 6);
  for (const directory of entries.directories) {
    assert.equal(lstatSync(path.join(SOURCE, directory)).mode & 0o777, 0o700);
  }
  for (const file of entries.files) {
    assert.equal(lstatSync(path.join(SOURCE, file)).mode & 0o777, 0o600);
  }
});

test("full source replay exactly rebuilds all five typed source profiles", () => {
  const stored = JSON.parse(readFileSync(REPORT, "utf8"));
  const rebuilt = buildUciRoboticsMicroCorpusFromSource(SOURCE);
  assert.deepEqual(rebuilt, stored);
  const full = verifyUciRoboticsMicroCorpusWithSource(stored, SOURCE);
  assert.equal(full.ok, true, full.errors.join(","));
  assert.equal(stored.sourceReplay.replayHash,
    "sha256:4d6aeca0cbfb6517c4601abe9fd390181f06f3b512b60433bf48efdea50ba5ff");
  assert.equal(stored.artifactHash,
    "sha256:b9f9f1c9cd2eecd3d555be6f9b2a56977f69c6e1bb2388fc4a055274c6190f1f");
  assert.equal(uciRoboticsSha256Bytes(readFileSync(REPORT)),
    "sha256:4d5e2f431a6e3ffbf38f32403cb39ab2224b23a75668b92f55c7f8685107c1ae");

  const byId = new Map(stored.sourceReplay.perSource.map((entry) => [entry.uciId, entry]));
  assert.equal(byId.get(963).mechanicalRows, 7409);
  assert.equal(byId.get(963).missingMechanicalRows, 54);
  assert.equal(byId.get(963).anomalies.nonContiguousCycleIdentifiers, 24);
  assert.equal(byId.get(138).postFailureWindows, 463);
  assert.equal(byId.get(138).uniqueNumericWindowPayloads, 251);
  assert.equal(byId.get(138).duplicateLearningProblemInstanceExcess, 212);
  assert.deepEqual(byId.get(138).pairwiseNumericPayloadOverlaps, {
    "lp2.data:lp3.data": 46,
    "lp2.data:lp5.data": 45,
    "lp3.data:lp5.data": 45,
    "lp4.data:lp5.data": 116,
  });
  assert.equal(byId.get(135).sourceDefinedExperiences, 160);
  assert.equal(byId.get(135).observationRows, 9150);
  assert.equal(byId.get(66).mobileRobotTraces, 83);
  assert.equal(byId.get(66).rawMeasurementTraces, 78);
  assert.equal(byId.get(66).rawMeasurementRows, 81_546);
  assert.deepEqual(byId.get(66).numericFieldsPerMeasurement, { five: 10, six: 81_536 });
  assert.equal(byId.get(194).navigationTimeSteps, 5456);
  assert.equal(byId.get(194).representationRowsNotAdditive, 16_368);
  assert.equal(byId.get(194).archiveLevelCopiesOfEachRepresentation, 3);
});

test("typed denominators remain per-domain and never form a cross-total", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.deepEqual(report.denominatorRegistry.populations,
    UCI_ROBOTICS_MICRO_CORPUS_CONSTANTS.denominatorPopulations);
  assert.deepEqual(report.denominatorRegistry.populations.map((entry) => [
    entry.denominatorClass, entry.units, entry.populationType, entry.episodeStatus,
  ]), [
    ["MECHANICAL_SYSTEM_OPERATION_ROW", 7409, "MECHANICAL_ROW", "NOT_AN_EPISODE"],
    ["POST_FAILURE_LEARNING_PROBLEM_WINDOW", 463, "POST_FAILURE_WINDOW",
      "NOT_AN_EPISODE"],
    ["SOURCE_DEFINED_PIONEER_EXPERIENCE", 160, "SOURCE_DEFINED_EXPERIENCE",
      "EPISODE_LIKE_NOT_OUTSIDER_PROSPECTIVE_EPISODE"],
    ["MOBILE_ROBOT_TRACE", 83, "MOBILE_TRACE", "NOT_AN_EPISODE"],
    ["NAVIGATION_TIME_STEP", 5456, "NAVIGATION_STEP", "NOT_AN_EPISODE"],
  ]);
  assert.equal(report.denominatorRegistry.crossDomainTotal, null);
  assert.equal(report.denominatorRegistry.crossDomainAdditionProhibited, true);
  assert.equal(report.denominatorRegistry.representationRowsAcrossSourcesAdditive, false);
  assert.equal(report.denominatorRegistry.sourceNativeRowsAndExperiencesCommensurate, false);
  assert.ok(report.sourceReplay.perSource.every((source) =>
    source.outsiderProspectiveEpisodes === 0));
  assert.equal(report.sourceReplay.perSource[1]
    .anomalies.uniquePhysicalFailureEventsEstablished, false);
});

test("independent truth, longitudinal, delegation, network, authority, CEU, and training stay zero", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.equal(report.segmentCoverageAttribution.additiveAcrossSources, false);
  assert.equal(report.segmentCoverageAttribution.additiveAcrossSegments, false);
  assert.equal(report.segmentCoverageAttribution.completeIndependentEpisodeIntersection, 0);
  assert.equal(report.segmentCoverageAttribution.outcome.independentOutcomeRecords, 0);
  assert.equal(report.segmentCoverageAttribution.longitudinal.independentlyTrackedRecords, 0);
  assert.equal(report.segmentCoverageAttribution.delegationAuthorization.delegationRecords, 0);
  assert.equal(report.segmentCoverageAttribution.delegationAuthorization.authorityRecords, 0);
  assert.equal(report.authorityBoundary.networkContributionRecords, 0);
  assert.equal(report.authorityBoundary.authorityRecords, 0);
  assert.equal(report.authorityBoundary.CEURecords, 0);
  assert.equal(report.authorityBoundary.actionsDispatched, 0);
  assert.equal(report.authorityBoundary.executable, false);
  assert.equal(report.modelAndTrainingBoundary.offlineModelFittingPerformed, false);
  assert.equal(report.modelAndTrainingBoundary.authorizedTraining, false);
  assert.equal(report.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(report.modelAndTrainingBoundary.authorizedTrainingJobs, 0);
  assert.equal(report.modelAndTrainingBoundary.productionTraining, false);
  assert.equal(report.modelAndTrainingBoundary.productionTrainingRows, 0);
  assert.ok(Object.values(report.privacyAndProjection).every((value) => value === 0));
});

test("license claims stay source-attributed and do not become legal or training clearance", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.equal(report.rightsAndUseClearance.sourceClaims.length, 5);
  assert.deepEqual(report.rightsAndUseClearance.sourceClaims.map((entry) => entry.doi), [
    "10.24432/C5J891",
    "10.24432/C5M89N",
    "10.24432/C5BS5T",
    "10.24432/C5G881",
    "10.24432/C57C8W",
  ]);
  assert.ok(report.rightsAndUseClearance.sourceClaims.every((entry) =>
    entry.licenseClaim === "CC-BY-4.0"
    && entry.licenseClaimSource === "UCI_OFFICIAL_DATASET_PAGE"
    && entry.licenseClaimBytePinnedInApiPayload === false
    && entry.legalConclusion === false));
  assert.equal(report.rightsAndUseClearance.apiPayloadsContainLicenseField, false);
  assert.equal(report.rightsAndUseClearance.legalConclusion, false);
  assert.equal(report.rightsAndUseClearance.authorizedTrainingClearanceAdjudicated, false);
  assert.equal(report.rightsAndUseClearance.artifactUseBoundary,
    "OFFLINE_EVALUATION_AND_RESEARCH_ONLY");
});

test("receipt binds exact report bytes, is last, and every artifact node is private", () => {
  const reportBytes = readFileSync(REPORT);
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  const checked = verifyUciRoboticsMicroCorpusRunReceipt(receipt, reportBytes);
  assert.equal(checked.ok, true, checked.errors.join(","));
  assert.equal(receipt.receiptHash,
    "sha256:b8fe86ae1345d1c58fa0cefc45c555a677d0e18dd8bb6e03a842fd88a352d6e8");
  assert.ok(lstatSync(RECEIPT, { bigint: true }).mtimeNs
    >= lstatSync(REPORT, { bigint: true }).mtimeNs);
  const entries = recursiveEntries(ROOT);
  assert.equal(entries.files.length, 18);
  assert.equal(entries.directories.length, 7);
  for (const directory of entries.directories) {
    assert.equal(lstatSync(path.join(ROOT, directory)).mode & 0o777, 0o700);
  }
  for (const file of entries.files) {
    assert.equal(lstatSync(path.join(ROOT, file)).mode & 0o777, 0o600);
  }
});

test("resealing cannot invent a cross-total, outcome, training, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  const mutations = [
    reseal(report, (copy) => { copy.denominatorRegistry.crossDomainTotal = 13_571; }),
    reseal(report, (copy) => {
      copy.segmentCoverageAttribution.outcome.independentOutcomeRecords = 463;
    }),
    reseal(report, (copy) => { copy.modelAndTrainingBoundary.authorizedTrainingRows = 7409; }),
    reseal(report, (copy) => { copy.authorityBoundary.authorityRecords = 1; }),
    reseal(report, (copy) => { copy.sourceReplay.perSource[1].postFailureWindows = 464; }),
  ];
  assert.ok(mutations.every((candidate) =>
    verifyUciRoboticsMicroCorpusReport(candidate).ok === false));
});

test("CLI help is side-effect free and existing default output fails before network", () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /exact five-dataset UCI API\/archive closure/u);
  const collision = spawnSync(process.execPath, [CLI], {
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(collision.status, 1);
  assert.match(collision.stderr, /UCI_ROBOTICS_CLI_OUTPUT_EXISTS/u);
  assert.equal(collision.stdout, "");
});
