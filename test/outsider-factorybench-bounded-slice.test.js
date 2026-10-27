import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FACTORYBENCH_ID, FACTORYBENCH_PROFILE, FACTORYBENCH_REVISION,
  acquirePinnedFactoryBenchSource, factoryBenchArtifactHash,
  verifyFactoryBenchArtifact, verifyFactoryBenchArtifactWithSource,
  verifyFactoryBenchSourceDirectory,
} from "../src/outsider-factorybench-bounded-slice.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-factorybench-bounded-slice-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "factorybench-bounded-slice.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:3d5c6710903105e2b603d9defb1e70dc126e374d60340ddfb366964fd3bcae99";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:1f74586afdcf6342f724597cdb99d84b255772e5c16582619d1d44d8d77c3315";
const EXPECTED_SOURCE_ROOT =
  "sha256:4de8e0a8d42dd272892904afa8b6657ef5e33a479e13faa769df916ff28a0a12";
const EXPECTED_MANIFEST_HASH =
  "sha256:8e6e3debedca8578d255e3f94e2e301a63b7e203b01f5c282bcb5b2b3278f4b0";
const EXPECTED_RECEIPT_HASH =
  "sha256:b63bea7e4acac834221ceb5a28ba6bfbf75b20b1b865ee5f0c510386b57936b8";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function artifact() {
  assert.equal(existsSync(REPORT_PATH), true);
  return readJson(REPORT_PATH);
}

function walk(root) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      assert.equal(entry.isSymbolicLink(), false, child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push(child);
      else assert.fail(`special file refused: ${child}`);
    }
  }
  return { files, directories };
}

test("the fixed revision and bounded-slice arithmetic remain exact", () => {
  assert.equal(FACTORYBENCH_ID, "FactoryBench/FactoryBench");
  assert.equal(FACTORYBENCH_REVISION,
    "d0a3735b89eced7016e59e87eecf764287bc297c");
  assert.deepEqual(FACTORYBENCH_PROFILE, {
    usedStorage: 13_427_184_505,
    treeEntries: 22, treeDirectories: 4, treeFiles: 18,
    treeBytes: 5_223_446_797,
    selectedFiles: 11, selectedBytes: 291_800_891,
    liteFiles: 4, liteBytes: 70_118_768,
    ur10Bytes: 220_910_648,
    supportFiles: 6, supportBytes: 771_475,
    unselectedFiles: 7, unselectedBytes: 4_931_645_906,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "factorybench-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedFactoryBenchSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /FACTORYBENCH_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the complete tree bracket binds all selected bytes and dispositions", () => {
  const checked = verifyFactoryBenchSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "PINNED_COMPLETE_291800891_BYTE_NATURAL_SLICE_AND_FULL_TREE_DISPOSITION");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 33);
  assert.equal(checked.manifest.remoteObjects.length, 11);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 291_800_891);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.rangeChunks, 0), 558);
  assert.equal(checked.manifest.terminalDispositions.length, 18);
  assert.equal(checked.manifest.terminalDispositions.filter((row) =>
    row.disposition === "ACQUIRED_AND_REPLAYED").length, 11);
  assert.equal(checked.manifest.terminalDispositions.filter((row) =>
    row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length, 7);
  const objects = Object.fromEntries(checked.manifest.remoteObjects.map((row) =>
    [row.path, row]));
  assert.equal(objects["factorywave/ur_signals_10hz.parquet"].sha256,
    "sha256:8d8ed6ad69a2230c50ad88c19f06d81595e67db8ef2ed16030dbc19b6669da4a");
  assert.equal(objects["factorywave/ur_signals_10hz.parquet"].rangeLogHash,
    "sha256:2e84776bb0701266bd6af83cbae7a4da72f7f4bb7426d7a8edbaa29342ba330f");
  assert.equal(checked.before.repository.usedStorage, 13_427_184_505);
  assert.equal(checked.manifest.closure.recursiveTreeBytes, 5_223_446_797);
});

test("all four Lite JSONL files replay and join provenance without becoming full QA", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.qaLite.rows, 3_000);
  assert.equal(value.replay.qaLite.uniqueIds, 3_000);
  assert.deepEqual(value.replay.qaLite.fileReports.map((row) => row.rows),
    [572, 1_430, 712, 286]);
  assert.deepEqual(value.replay.qaLite.provenanceReferenceCounts,
    { aursad: 232, factorywave: 2_669, vorausad: 242 });
  assert.deepEqual(value.replay.qaLite.distinctProvenanceEpisodeCounts,
    { aursad: 225, factorywave: 1_707, vorausad: 210 });
  assert.deepEqual(value.replay.qaLite.factorywaveProvenance, {
    matchedEpisodeMetadataOccurrences: 2_669,
    matchedOtherEpisodeMetadataOccurrences: 1_359,
    matchedSelectedUr10Occurrences: 1_310,
    missingEpisodeMetadataOccurrences: 0,
    referenceOccurrences: 2_669,
  });
  assert.equal(value.replay.qaLite.logicalRecordsSha256,
    "sha256:3eaa0b8a0cfc13896801ab3a95c500b5d9d71e6d68ed0502274c4b167b978ae7");
  assert.equal(value.sourceDrift.readmePublisherQaCountClaim, 70_918);
  assert.equal(value.sourceDrift.fixedTreeFlatLevelFiles, 4);
  assert.equal(value.sourceDrift.fixedTreeNestedSplitFiles, 0);
  assert.equal(value.sourceDrift.liveViewerStatus, 404);
  assert.equal(value.semantics.fullQaCorpusAcquired, false);
});

test("UR 10 Hz telemetry replays every field while retaining source quality gaps", () => {
  const signal = artifact().replay.urSignals10Hz;
  assert.equal(signal.bytes, 220_910_648);
  assert.equal(signal.rows, 590_715);
  assert.equal(signal.fields, 136);
  assert.equal(signal.rowGroups, 2);
  assert.deepEqual(signal.rowGroupRows, [259_546, 331_169]);
  assert.equal(signal.uniqueEpisodes, 3_984);
  assert.deepEqual(signal.faultRowLabelCounts,
    { 0: 581_813, 11: 3_037, 29: 3_356, 30: 2_509 });
  assert.equal(signal.totalNullValues, 10_646_423);
  assert.equal(signal.totalNanValues, 0);
  assert.equal(signal.totalInfValues, 0);
  assert.equal(signal.mixedFaultLabelEpisodes, 480);
  assert.equal(signal.faultLabelMetadataMismatchEpisodes, 2_930);
  assert.deepEqual(signal.faultLabelMetadataRelationCounts, {
    EXACT_SINGLE_LABEL: 1_054,
    OBSERVED_SET_CONTAINS_METADATA_LABEL: 400,
    OTHER_MISMATCH: 80,
    SIGNAL_ONLY_ZERO_METADATA_OTHER: 2_450,
  });
  assert.equal(signal.episodeBlocks, 3_986);
  assert.equal(signal.reopenedEpisodeBlocks, 2);
  assert.equal(signal.time.withinEpisodeDecreaseCount, 59_615);
  assert.equal(signal.time.withinContiguousEpisodeBlockDecreaseCount, 59_614);
  assert.equal(signal.time.withinEpisodeDuplicateCount, 0);
  assert.equal(signal.time.createdAfterUpdatedRows, 0);
  assert.equal(signal.logicalStreamSha256,
    "sha256:0a5fd8e9cdc6b500de87c27ecfa8b3a67a9e933e842f9155d9ebc83b617335e2");
});

test("episode, flow, and knowledge-graph joins retain exact missingness", () => {
  const value = artifact();
  assert.equal(value.replay.episodes.rows, 9_728);
  assert.equal(value.replay.episodes.fields, 14);
  assert.deepEqual(value.replay.episodes.counterfactualCounts,
    { 0: 8_855, 1: 291, 2: 291, 3: 291 });
  assert.deepEqual(value.replay.episodes.nullCounts, {
    cf_baseline_episode_id: 8_855, cf_fault_id: 8_855,
    cf_injection_time_s: 8_184, cf_injection_timestep: 8_184,
    counterfactual: 0, created_at: 0, episode_metadata: 0,
    fault_metadata: 0, flow_id: 0, id: 0, machine_id: 0,
    selected_cf_variant_id: 9_686, trajectory_id: 9_728, updated_at: 0,
  });
  assert.equal(value.replay.flow.rows, 9);
  assert.equal(value.replay.flow.episodeFlowReferencesMissing, 0);
  assert.equal(value.replay.flow.flowIdsNotReferencedByEpisodes, 1);
  assert.equal(value.replay.flow.flowPayloadDocumentsExecuted, 0);
  assert.deepEqual(value.replay.joins, {
    episodeMetadataRowsOutsideSelectedUr10: 5_744,
    factorywaveLiteReferencesMatched: 2_669,
    factorywaveLiteReferencesMissing: 0,
    selectedUr10Episodes: 3_984,
    selectedUr10ToEpisodeMetadataMatches: 3_984,
    selectedUr10ToEpisodeMetadataMissing: 0,
  });
  assert.deepEqual(value.replay.knowledgeGraph.entityCounts, {
    anomalies: 41, datasets: 3, events: 10, grippers: 3, machines: 4,
    root_cause_error_mapping: 36, root_causes: 34, tasks: 3,
  });
  assert.deepEqual(value.replay.knowledgeGraph.referenceViolations, {
    anomalyRanking: 0, datasets: 0, errorMappings: 4, events: 0,
    relevanceSpecs: 0, rootCauses: 5,
  });
  assert.deepEqual(value.replay.knowledgeGraph.missingTaskReferenceFaultIds,
    [32, 33, 34, 35, 36]);
  assert.deepEqual(value.replay.knowledgeGraph.mappingWithoutRootCauseFaultIds,
    [21, 24, 26, 27]);
});

test("125 Hz disjointness, outcomes, causality, and recovery remain unpromoted", () => {
  const value = artifact();
  assert.deepEqual(value.urSignalCoverage, {
    disjointnessClassification: "PUBLISHER_METADATA_CLAIM_NOT_DIRECT_BYTE_REPLAY",
    publisherClaimed10Hz125HzDisjoint: true,
    publisherClaimed10HzEpisodes: 3_984,
    publisherClaimed125HzEpisodes: 3_076,
    publisherClaimedJointDistinctUrEpisodes: 7_060,
    selected10HzBytesPresent: true,
    selected10HzEpisodesByteVerified: 3_984,
    selected10HzEpisodesJoinMetadataRows: 3_984,
    selected10HzRowsByteVerified: 590_715,
    ur125HzBytesAcquired: false,
    ur125HzEpisodeIdsDirectlyCompared: false,
    ur125HzTreeBytes: 1_704_885_150,
  });
  assert.equal(value.typedDenominators.crossTotal, null);
  assert.equal(value.semantics.faultLabelsAreTaskOutcomeLabels, false);
  assert.equal(value.semantics.terminalCorrectnessEstablished, false);
  assert.equal(value.semantics.directPhysicalCausalEffectEstablished, false);
  assert.equal(value.semantics.independentOutcomeEstablished, false);
  assert.equal(value.semantics.recoveryEstablished, false);
  assert.equal(value.semantics.completeAttemptCensusEstablished, false);
});

test("rights, privacy, and training authority fail closed", () => {
  const value = artifact();
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "CC-BY-4.0",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalConclusionEstablished: false,
    productionTrainingAuthorized: false,
    publisherUpstreamLicenseClaims: {
      aursad: "MIT", factorywave: "Apache-2.0", vorausad: "Apache-2.0",
    },
    readmeLicenseClaim: "CC-BY-4.0", rootLicenseFilePresent: false,
    scopeConflictOrAmbiguityRetained: true,
    upstreamRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.privacy, {
    directoryMode: "0700", fileMode: "0600", noPiiGuaranteed: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    rawAnswersProjected: false, rawArtifactPrivate: true,
    rawContextTimeSeriesProjected: false, rawFlowPayloadsProjected: false,
    rawQuestionsProjected: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 1, authority: 0, delegation: 0,
    directCausalEffect: 0, externalEffect: 1, independentOutcome: 0,
    network: 0, physicalObservation: 1, privacy: 0,
    publisherFaultLabel: 1, publisherOutcomeLabel: 0, recovery: 0,
    reliableOutcome: 0, training: 0,
  });
});

test("the source-bound report and receipt reproduce and stay private", () => {
  const value = artifact();
  const { artifactHash, ...body } = value;
  assert.equal(factoryBenchArtifactHash(body), artifactHash);
  assert.deepEqual(verifyFactoryBenchArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel: "STANDALONE_HASH_TYPED_SCOPE_RIGHTS_AND_SEMANTIC_BOUNDARY",
  });
  const sourceBound = verifyFactoryBenchArtifactWithSource(value, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_JSONL_PARQUET_SIGNAL_EPISODE_FLOW_KG_AND_PROVENANCE_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.receiptHash, EXPECTED_RECEIPT_HASH);
  assert.equal(receipt.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(receipt.artifactManifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(receipt.sourceRoot, EXPECTED_SOURCE_ROOT);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
});
