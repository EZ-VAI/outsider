import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "../src/canonical-historical-replay.js";
import {
  ARMNETBENCH_SO101_DATASET_ID,
  ARMNETBENCH_SO101_OUTCOME_SCHEMA,
  ARMNETBENCH_SO101_PROFILE,
  ARMNETBENCH_SO101_REVISION,
  acquirePinnedArmnetBenchSo101Source,
  verifyArmnetBenchSo101OutcomeArtifact,
  verifyArmnetBenchSo101OutcomeArtifactWithSource,
  verifyArmnetBenchSo101SourceDirectory,
} from "../src/outsider-armnetbench-so101-outcome.js";

const ROOT = path.resolve("artifacts/outsider-armnetbench-so101-outcome-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "armnetbench-so101-outcome.json");
const ARTIFACT_MANIFEST = path.join(ROOT, "artifact-manifest.json");
const READY = existsSync(REPORT) && existsSync(ARTIFACT_MANIFEST)
  && existsSync(path.join(SOURCE, "acquisition-manifest.json"));
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:ff0e96d70e8aecab3e9a6499f48bbab0db64f0768ec882f9cb50cf3eed15b594";
const EXPECTED_SOURCE_ROOT =
  "sha256:4e9e37cb909456d898a6fdfe137680ba39e55a4b70ca07f29be4e483c41e04c7";
const EXPECTED_ARTIFACT_HASH =
  "sha256:b07b10a3f0181e3d02b0ae0cc00ad1330ebd0888b5f438a259acf5ca6ef23f0b";
const EXPECTED_ARTIFACT_MANIFEST_HASH =
  "sha256:cf97ca40ad40d65d8bf6ad869cceea6bc6eef63f7a93d13126f015dc944abba9";

function reseal(artifact, mutate) {
  const changed = structuredClone(artifact);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = `sha256:${createHash("sha256")
    .update(`${ARMNETBENCH_SO101_OUTCOME_SCHEMA}/artifact\0${canonicalizeStrict(changed)}`)
    .digest("hex")}`;
  return changed;
}

function inspectPrivateTree(root) {
  const stat = lstatSync(root);
  assert.equal(stat.isSymbolicLink(), false, root);
  assert.equal(stat.isDirectory(), true, root);
  assert.equal(stat.mode & 0o777, 0o700, root);
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    assert.equal(entry.isSymbolicLink(), false, child);
    if (entry.isDirectory()) files.push(...inspectPrivateTree(child));
    else {
      assert.equal(entry.isFile(), true, child);
      assert.equal(lstatSync(child).mode & 0o777, 0o600, child);
      files.push(child);
    }
  }
  return files;
}

test("frozen ArmnetBench SO-101 no-video closure is exact", () => {
  assert.equal(ARMNETBENCH_SO101_DATASET_ID,
    "armnet/armnetbench_v01_lerobot_so101");
  assert.equal(ARMNETBENCH_SO101_REVISION,
    "2e5e89aee0e7f081078d9d6ab3b279fc4b83ea84");
  assert.deepEqual(ARMNETBENCH_SO101_PROFILE, {
    selectedObjects: 125,
    selectedBytes: 57_660_573,
    dataFiles: 120,
    dataBytes: 53_757_034,
    metadataFiles: 4,
    metadataBytes: 3_890_685,
    readmeFiles: 1,
    readmeBytes: 12_854,
    episodes: 2_499,
    frames: 1_127_881,
    outcomes: { successful: 915, failure: 1_532, suboptimal: 52 },
    tasks: 8,
    evaluationPolicyFamilies: 7,
    stateDimensions: 6,
    actionDimensions: 6,
  });
});

test("acquirer refuses an existing target before any network request", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-armnetbench-no-clobber-"));
  let fetched = false;
  try {
    await assert.rejects(acquirePinnedArmnetBenchSo101Source(parent, {
      fetchImpl: async () => { fetched = true; throw new Error("UNREACHABLE"); },
    }), /OUTPUT_EXISTS_OR_TOO_BROAD/u);
    assert.equal(fetched, false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("actual source replays all selected bytes and both API record/tree snapshots",
  { skip: !READY }, () => {
    const checked = verifyArmnetBenchSo101SourceDirectory(SOURCE);
    assert.equal(checked.ok, true, checked.error);
    const manifest = checked.manifest;
    assert.equal(checked.objectsVerified, 125);
    assert.equal(checked.bytesObserved, 57_660_573);
    assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
    assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
    assert.equal(manifest.sourceClosure.dataFiles, 120);
    assert.equal(manifest.sourceClosure.dataBytes, 53_757_034);
    assert.equal(manifest.sourceClosure.metadataFiles, 4);
    assert.equal(manifest.sourceClosure.metadataBytes, 3_890_685);
    assert.equal(manifest.sourceClosure.readmeBytes, 12_854);
    assert.equal(manifest.sourceClosure.visualReplay, false);
    assert.equal(manifest.repositoryStableDuringAcquisition, true);
    assert.equal(manifest.treeStableDuringAcquisition, true);
    assert.equal(manifest.treeBefore.pages, manifest.treeAfter.pages);
    assert.equal(manifest.treeBefore.pages, 13);
    assert.equal(manifest.treeBefore.entries, manifest.treeAfter.entries);
    assert.equal(manifest.treeBefore.entries, 645);
    assert.equal(manifest.treeBefore.projectionHash, manifest.treeAfter.projectionHash);
    assert.equal(manifest.apiSnapshots.filter((entry) => entry.kind === "repository").length, 2);
    assert.equal(manifest.apiSnapshots.length, 28);
    assert.equal(manifest.apiSnapshots.filter((entry) => entry.kind === "tree").length,
      manifest.treeBefore.pages + manifest.treeAfter.pages);
    assert.equal(manifest.remoteObjects.every((entry) =>
      typeof entry.path === "string" && Number.isSafeInteger(entry.bytes)
      && /^sha256:[a-f0-9]{64}$/u.test(entry.contentSha256)
      && (/\.parquet$/u.test(entry.path)
        ? /^sha256:[a-f0-9]{64}$/u.test(entry.lfsSha256)
        : entry.lfsSha256 === null || /^sha256:[a-f0-9]{64}$/u.test(entry.lfsSha256))), true);
    assert.equal(manifest.remoteObjects.some((entry) => entry.path.startsWith("videos/")), false);
    assert.equal(manifest.sourceClosure.excludedVideoFiles, 506);
    assert.equal(manifest.rights.datasetCardClaim, "Apache-2.0");
    assert.equal(manifest.rights.repositoryLicenseFilePresent, false);
    assert.equal(manifest.rights.trainingAuthorizedByThisArtifact, 0);
  });

test("pyarrow replay verifies episode/frame continuity, metadata and publisher outcomes",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    const checked = verifyArmnetBenchSo101OutcomeArtifact(artifact);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(artifact.artifactHash, EXPECTED_ARTIFACT_HASH);
    assert.equal(artifact.source.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
    assert.equal(artifact.source.sourceRoot, EXPECTED_SOURCE_ROOT);
    assert.equal(artifact.replay.dataFilesReplayed, 120);
    assert.equal(artifact.replay.metadataFilesReplayed, 4);
    assert.equal(artifact.replay.episodesReplayed, 2_499);
    assert.equal(artifact.replay.framesReplayed, 1_127_881);
    assert.equal(artifact.replay.stateDimensions, 6);
    assert.equal(artifact.replay.actionDimensions, 6);
    assert.equal(artifact.replay.taskCount, 8);
    assert.equal(artifact.replay.evaluationPolicyFamilyCount, 7);
    assert.deepEqual(artifact.replay.outcomeCounts,
      { failure: 1_532, suboptimal: 52, successful: 915 });
    assert.equal(artifact.replay.doneTrueCount, 2_499);
    assert.equal(artifact.replay.rewardOneCount, 915);
    assert.equal(artifact.replay.episodeIndexContinuous, true);
    assert.equal(artifact.replay.frameIndexContinuousWithinEpisode, true);
    assert.equal(artifact.replay.globalIndexContinuous, true);
    assert.equal(artifact.replay.episodeMetadataAligned, true);
    assert.equal(artifact.replay.taskMetadataAligned, true);
    assert.equal(artifact.replay.infoMetadataAligned, true);
    assert.equal(artifact.replay.rewardDoneAlignedToPublisherOutcome, true);
    assert.equal(artifact.replay.publisherStatsFullyFrameAligned, false);
    assert.deepEqual(artifact.replay.publisherStatsStaleCountFields,
      ["episode_index", "frame_index", "index", "task_index", "timestamp"]);
    for (const field of artifact.replay.publisherStatsStaleCountFields) {
      assert.equal(artifact.replay.publisherStatsCountClaims[field], 1_147_055);
    }
  });

test("artifact states the incomplete attempt census and zero-authority boundary",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    assert.equal(artifact.dataset.visualReplay, false);
    assert.equal(artifact.outcomeProvenance.kind, "PUBLISHER_SOURCE_NATIVE");
    assert.equal(artifact.outcomeProvenance.independentOutcome, 0);
    assert.equal(artifact.outcomeProvenance.longitudinalOutcome, 0);
    assert.equal(artifact.outcomeProvenance.outcomeTruthEstablishedBeyondPublisherClaim, 0);
    assert.equal(artifact.completeness.attemptCensusComplete, false);
    assert.equal(
      artifact.completeness.publisherExcludedCorruptOrUnlabelledMultiEpisodeRecords, true);
    assert.equal(
      artifact.completeness.publisherMayTailTrimSuccessfulOrSuboptimalEpisodesAtSuccessCutoff,
      true);
    assert.equal(artifact.completeness.retainedRowsAreNotACompleteOpportunitySet, true);
    assert.equal(artifact.rights.datasetCardClaim, "Apache-2.0");
    assert.equal(artifact.rights.repositoryLicenseFilePresent, false);
    assert.equal(artifact.rights.productionTrainingRightFinallyAdjudicated, false);
    assert.deepEqual(artifact.boundary, {
      training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0, longitudinalOutcome: 0,
    });
  });

test("self-resealing cannot promote training, authority, action or outcome independence",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    const mutations = [
      (copy) => { copy.boundary.training = 1; },
      (copy) => { copy.boundary.authority = 1; },
      (copy) => { copy.boundary.action = 1; },
      (copy) => { copy.boundary.opportunity = 1; },
      (copy) => { copy.boundary.delegation = 1; },
      (copy) => { copy.outcomeProvenance.independentOutcome = 1; },
      (copy) => { copy.outcomeProvenance.longitudinalOutcome = 1; },
      (copy) => { copy.rights.productionTrainingRightFinallyAdjudicated = true; },
    ];
    assert.equal(mutations.every((mutation) =>
      verifyArmnetBenchSo101OutcomeArtifact(reseal(artifact, mutation)).ok === false), true);
  });

test("actual artifact exactly rebuilds from all 125 pinned source objects",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    const replay = verifyArmnetBenchSo101OutcomeArtifactWithSource(artifact, SOURCE,
      { pythonExecutable: ".venv/bin/python" });
    assert.equal(replay.ok, true, replay.error);
    assert.equal(replay.verificationLevel,
      "FULL_PINNED_SOURCE_BYTE_AND_PYARROW_REPLAY");
    assert.equal(replay.sourceObjectsReverified, 125);
    assert.equal(replay.sourceBytesReverified, 57_660_573);
    assert.equal(replay.episodesReplayed, 2_499);
    assert.equal(replay.framesReplayed, 1_127_881);
    assert.equal(replay.candidateArtifactExactlyRebuilt, true);
    assert.equal(replay.visualReplay, false);
    assert.equal(replay.authorityEstablished, false);
    assert.equal(replay.actionAuthorized, false);
    assert.equal(replay.independentOutcomeEstablished, false);
    assert.equal(replay.longitudinalOutcomeEstablished, false);
  });

test("all actual artifact directories are 0700 and files are 0600 with no media",
  { skip: !READY }, () => {
    const files = inspectPrivateTree(ROOT);
    const artifactManifest = JSON.parse(readFileSync(ARTIFACT_MANIFEST, "utf8"));
    assert.equal(artifactManifest.manifestHash, EXPECTED_ARTIFACT_MANIFEST_HASH);
    assert.equal(artifactManifest.reportHash, EXPECTED_ARTIFACT_HASH);
    assert.equal(artifactManifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
    assert.equal(artifactManifest.sourceRoot, EXPECTED_SOURCE_ROOT);
    assert.equal(files.length, 156);
    assert.equal(files.some((file) => /\.(?:mp4|webm|avi|mov|png|jpe?g)$/iu.test(file)), false);
    assert.equal(files.filter((file) => file.endsWith(".parquet")).length, 122);
  });
