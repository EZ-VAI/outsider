import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  SO101_COFFEE_RECOVERY_CENSUS_CONSTANTS,
  SO101_COFFEE_RECOVERY_CENSUS_SCHEMA,
  SO101_COFFEE_REVISION,
  buildSo101CoffeeRecoveryCensusFromSource,
  selectPinnedSo101CoffeeEntries,
  so101CoffeeSha256Bytes,
  verifySo101CoffeeRecoveryCensusReport,
  verifySo101CoffeeRecoveryCensusRunReceipt,
  verifySo101CoffeeRecoveryCensusWithSource,
  verifySo101CoffeeSourceDirectory,
} from "../src/outsider-so101-coffee-recovery-census.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ROOT = path.resolve("artifacts/outsider-so101-coffee-recovery-census-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "so101-coffee-recovery-census.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");
const CLI = path.resolve("scripts/acquire-so101-coffee-recovery-census.mjs");

function recursiveEntries(root, relative = "") {
  const files = [];
  const directories = [relative];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = recursiveEntries(root, child);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else files.push(child);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function reseal(report, mutate, { resealAttempts = false } = {}) {
  const copy = structuredClone(report);
  mutate(copy);
  if (resealAttempts) {
    copy.attemptLedger.recordsHash = so101CoffeeSha256Bytes(Buffer.from(
      `${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/attempts\0`
      + canonicalizeStrict(copy.attemptLedger.records)));
  }
  delete copy.artifactHash;
  copy.artifactHash = so101CoffeeSha256Bytes(Buffer.from(
    `${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/artifact\0${canonicalizeStrict(copy)}`));
  return copy;
}

test("canonical tree profile selects exactly 23 video-free objects and detects drift", () => {
  const manifest = JSON.parse(readFileSync(path.join(SOURCE, "acquisition-manifest.json"), "utf8"));
  const selected = selectPinnedSo101CoffeeEntries(manifest.treeBefore.entries);
  assert.equal(selected.selectedCount, 23);
  assert.equal(selected.selectedBytes, 3_405_847);
  assert.equal(selected.treeHash, SO101_COFFEE_RECOVERY_CENSUS_CONSTANTS.expectedTreeHash);
  assert.deepEqual(selected.exclusions, {
    selected: 23, rawTar: 15, perRunDuplicateNonVideo: 90, perRunVideo: 30,
    rootVideo: 3, conversionLogs: 2, gitAttributes: 1,
  });
  assert.ok(selected.selected.every((entry) =>
    !entry.path.includes("/videos/") && !entry.path.startsWith("videos/")
    && !entry.path.startsWith("raw/") && !entry.path.includes("/lerobot_ds/")));
  const drift = structuredClone(manifest.treeBefore.entries);
  drift.find((entry) => entry.path === "README.md").size += 1;
  assert.throws(() => selectPinnedSo101CoffeeEntries(drift),
    /TREE_CANONICAL_PROFILE_CHANGED|TREE_SELECTED_OBJECT_CHANGED/u);
});

test("actual source replays exact Git/LFS bindings, bracket, closure, and private modes", () => {
  const checked = verifySo101CoffeeSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.manifest.pinnedRevision, SO101_COFFEE_REVISION);
  assert.equal(checked.manifest.treeBefore.pagesFetched, 8);
  assert.equal(checked.manifest.treeBefore.entryCount, 356);
  assert.equal(checked.manifest.treeBefore.fileCount, 164);
  assert.equal(checked.manifest.treeBefore.snapshotHash,
    "sha256:c63943039748c91d76f524d4772da7f18348dd194e06e1e331db3d90680e6e2c");
  assert.deepEqual(checked.manifest.treeBefore, checked.manifest.treeAfter);
  assert.deepEqual(checked.manifest.repositoryBefore, checked.manifest.repositoryAfter);
  assert.equal(checked.verifiedObjectCount, 23);
  assert.equal(checked.verifiedBytes, 3_405_847);
  assert.equal(checked.manifest.manifestHash,
    "sha256:b17525d514aa1764e7024d07e7347ab8e9330561259232ea4da9f6c6f124eb4d");
  const entries = recursiveEntries(SOURCE);
  assert.equal(entries.files.length, 24);
  assert.ok(entries.files.every((file) => !file.includes("videos/")
    && !file.startsWith("raw/") && !file.includes("lerobot_ds/")
    && !file.endsWith("convert.log")));
  for (const directory of entries.directories) {
    assert.equal(lstatSync(path.join(SOURCE, directory)).mode & 0o777, 0o700);
  }
  for (const file of entries.files) {
    assert.equal(lstatSync(path.join(SOURCE, file)).mode & 0o777, 0o600);
  }
});

test("full replay rebuilds the 184 kept episodes and exact 200-attempt census", () => {
  const stored = JSON.parse(readFileSync(REPORT, "utf8"));
  const rebuilt = buildSo101CoffeeRecoveryCensusFromSource(SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.deepEqual(rebuilt, stored);
  const full = verifySo101CoffeeRecoveryCensusWithSource(stored, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(full.ok, true, full.errors?.join(","));
  assert.equal(stored.artifactHash,
    "sha256:45c880df84ff2369d294fd7b72e6a7d5716bfbcab8c6f738154dd8cd4b0d1e2a");
  assert.equal(so101CoffeeSha256Bytes(readFileSync(REPORT)),
    "sha256:476f7cf3831d1b7d3d1393e61b069fde7413bc77f5422e52ac405475a55f4027");
  assert.equal(stored.census.attemptCensusRecords, 200);
  assert.equal(stored.census.keptRealRobotEpisodes, 184);
  assert.equal(stored.census.deletedAbortedMetadataOnlyAttempts, 16);
  assert.equal(stored.census.taskStartOpportunityRecords, 200);
  assert.equal(stored.census.actionTraceEpisodes, 184);
  assert.equal(stored.census.actionTraceFrames, 38_718);
});

test("typed populations stay non-additive and deleted attempts remain metadata only", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.deepEqual(report.denominatorRegistry.populations, [
    { denominatorClass: "KEPT_REAL_ROBOT_EPISODE", units: 184,
      sourceComponent: "ROOT_MERGED_ACTION_AND_PROPRIOCEPTIVE_EPISODES" },
    { denominatorClass: "ATTEMPT_CENSUS_RECORD", units: 200,
      sourceComponent: "FIFTEEN_PROSPECTIVE_RUN_LOGS" },
  ]);
  assert.equal(report.denominatorRegistry.crossPopulationTotal, null);
  assert.equal(report.denominatorRegistry.crossPopulationAdditionProhibited, true);
  const kept = report.attemptLedger.records
    .filter((record) => record.disposition === "KEPT_REAL_ROBOT_EPISODE");
  const deleted = report.attemptLedger.records
    .filter((record) => record.disposition === "DELETED_METADATA_ONLY");
  assert.equal(kept.length, 184);
  assert.equal(deleted.length, 16);
  assert.ok(kept.every((record) => record.opportunityRecordPresent
    && record.actionTraceAdmitted && record.proprioceptiveTelemetryAdmitted));
  assert.ok(deleted.every((record) => record.opportunityRecordPresent
    && !record.actionTraceAdmitted && !record.proprioceptiveTelemetryAdmitted
    && record.keptEpisodeIndex === null && record.admittedActionFrameCount === null
    && record.publisherOutcome === null));
});

test("publisher labels and retry recovery include intervening deleted attempts", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.deepEqual(report.publisherOutcomeClaims, {
    source: "BYTE_PINNED_EPISODE_LABEL_CSV",
    keptEpisodeClaims: 184,
    success: 149,
    fail: 31,
    unstable: 4,
    runLogFinalLabelClaims: { success: 151, fail: 29, unstable: 4 },
    runLogToPublisherLabelCorrections: 2,
    independentOutcomeVerification: false,
    independentOutcomeVerifiedEpisodes: 0,
  });
  assert.deepEqual(report.retryAndRecovery.counts, {
    groupCount: 150, singleAttemptGroups: 120, retryGroups: 30,
    attemptCountHistogram: { 1: 120, 2: 17, 3: 8, 4: 4, 6: 1 },
    publisherFailToEventualSuccessChains: 21,
    recoveredPublisherFailAttempts: 30,
    unrecoveredPublisherFailAttempts: 1,
    chainsWithInterveningDeletedAttempts: 3,
    recoveryChainAttemptSpanCount: 55,
  });
  const withDeleted = report.retryAndRecovery.publisherFailToEventualSuccessChains
    .filter((chain) => chain.interveningDeletedAttemptCount > 0);
  assert.equal(withDeleted.length, 3);
  assert.ok(withDeleted.every((chain) => chain.dispositions
    .includes("DELETED_METADATA_ONLY")));
});

test("independent effect/outcome, longitudinal, training, CEU, and authority stay zero", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.equal(report.segmentCoverageAttribution.additiveAcrossSegments, false);
  assert.equal(report.segmentCoverageAttribution.completeIndependentEpisodeIntersection, 0);
  assert.equal(report.segmentCoverageAttribution.delegationAuthorization.delegatedRecords, 0);
  assert.equal(report.segmentCoverageAttribution.delegationAuthorization.authorizedRecords, 0);
  assert.equal(report.segmentCoverageAttribution.effect.independentPhysicalEffects, 0);
  assert.equal(report.segmentCoverageAttribution.outcome.independentOutcomes, 0);
  assert.equal(report.segmentCoverageAttribution.recovery.independentlyVerifiedRecoveryChains, 0);
  assert.equal(report.segmentCoverageAttribution.longitudinal.independentlyTrackedEpisodes, 0);
  assert.ok(Object.values(report.privacyAndProjection).every((value) => value === 0));
  assert.equal(report.modelAndTrainingBoundary.offlineModelFittingPerformed, false);
  assert.equal(report.modelAndTrainingBoundary.authorizedTraining, false);
  assert.equal(report.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(report.modelAndTrainingBoundary.authorizedTrainingJobs, 0);
  assert.ok(Object.entries(report.authorityBoundary).every(([key, value]) =>
    key === "executable" ? value === false : value === 0));
  const serialized = canonicalizeStrict(report);
  for (const rawSourceText of ["pick up the cup on the blue circle", "컵 넘어짐",
    "intern_coffee 오프라인 분석"]) assert.equal(serialized.includes(rawSourceText), false);
});

test("receipt binds report bytes and all final artifact nodes are private", () => {
  const reportBytes = readFileSync(REPORT);
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  const checked = verifySo101CoffeeRecoveryCensusRunReceipt(receipt, reportBytes);
  assert.equal(checked.ok, true, checked.errors.join(","));
  assert.equal(receipt.receiptHash,
    "sha256:729ff22f5002b018b789cac42ad7bb55771b90d1d7489a8b5ee588696b4bbb91");
  const entries = recursiveEntries(ROOT);
  for (const directory of entries.directories) {
    assert.equal(lstatSync(path.join(ROOT, directory)).mode & 0o777, 0o700);
  }
  for (const file of entries.files) {
    assert.equal(lstatSync(path.join(ROOT, file)).mode & 0o777, 0o600);
  }
});

test("resealing cannot add an aggregate, action bytes, training, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  const deletedIndex = report.attemptLedger.records
    .findIndex((record) => record.disposition === "DELETED_METADATA_ONLY");
  const mutations = [
    reseal(report, (copy) => { copy.denominatorRegistry.crossPopulationTotal = 384; }),
    reseal(report, (copy) => { copy.modelAndTrainingBoundary.authorizedTraining = true; }),
    reseal(report, (copy) => { copy.authorityBoundary.authorizedActionRecords = 1; }),
    reseal(report, (copy) => {
      copy.attemptLedger.records[deletedIndex].actionTraceAdmitted = true;
    }, { resealAttempts: true }),
  ];
  assert.ok(mutations.every((candidate) =>
    verifySo101CoffeeRecoveryCensusReport(candidate).ok === false));
});

test("CLI help is side-effect free and an existing target fails before network", () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /exact 23-file, video-free pinned source closure/u);
  const collision = spawnSync(process.execPath, [CLI], { encoding: "utf8", timeout: 10_000 });
  assert.equal(collision.status, 1);
  assert.match(collision.stderr, /SO101_COFFEE_CLI_OUTPUT_EXISTS/u);
  assert.equal(collision.stdout, "");
});

