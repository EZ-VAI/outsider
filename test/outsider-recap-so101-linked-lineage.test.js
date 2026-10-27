import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  RECAP_AUTHOR, RECAP_DECLARED_QUERY, RECAP_PROFILE, RECAP_REPOSITORIES,
  acquirePinnedRecapSource, buildRecapLinkedLineageFromSource,
  recapArtifactHash, recapSha256, verifyRecapLinkedLineageArtifact,
  verifyRecapSourceDirectory,
} from "../src/outsider-recap-so101-linked-lineage.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-recap-so101-linked-lineage-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "recap-so101-linked-lineage.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:7640130c17e1f4bcbad4f0373e8ff0439f11a92fe51a34ce3aeb203cf2a44f15";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:3670ddbdd87201fd44beceb497bef7b13f2fcda57aae74347488012c805425e0";
const EXPECTED_SOURCE_ROOT =
  "sha256:1835fc7eb370664e1bc4c80a5339793ba06c39b1844956cd1396a5f0114c3df8";
const EXPECTED_MANIFEST_HASH =
  "sha256:903d5740d32d72774365c9facb1318e0f76a38dce23fb35462f42e27f901158d";

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

test("RECAP freezes the declared 13-repository author/search scope and pins", () => {
  assert.equal(RECAP_AUTHOR, "apaszynska");
  assert.equal(RECAP_DECLARED_QUERY,
    "https://huggingface.co/api/datasets?author=apaszynska&search=recap&limit=100&full=true");
  assert.equal(RECAP_REPOSITORIES.length, 13);
  assert.equal(new Set(RECAP_REPOSITORIES.map((entry) => entry.id)).size, 13);
  assert.equal(RECAP_REPOSITORIES.every((entry) => /^[a-f0-9]{40}$/u.test(entry.revision)),
    true);
  assert.equal(RECAP_REPOSITORIES.reduce((sum, entry) =>
    sum + entry.selectedPaths.length, 0), 38);
  assert.equal(RECAP_REPOSITORIES.reduce((sum, entry) =>
    sum + entry.selectedBytes, 0), 9_221_802);
  assert.deepEqual(RECAP_PROFILE, {
    declaredRepositories: 13,
    zeroEpisodeRepositories: 8,
    selectedObjects: 38,
    selectedBytes: 9_221_802,
    primaryRolloutEpisodes: 20,
    primaryRolloutFrames: 8_927,
    mergedEpisodes: 321,
    mergedFrames: 97_457,
    mergedTeleopPrefixEpisodes: 301,
    mergedTeleopPrefixFrames: 88_530,
    legacyMetadataEpisodes: 320,
    legacyMetadataFrames: 96_162,
    legacyMissingEpisodeIndex: 122,
    legacyMissingFrames: 1_295,
    supportEpisodes: 20,
    supportFrames: 8_803,
    stateDimensions: 12,
    actionDimensions: 12,
    fps: 15,
  });
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "recap-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedRecapSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /RECAP_SO101_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("source binds before/after query, all pinned records/trees and 38 objects", () => {
  const verified = verifyRecapSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_13_REPOSITORY_DECLARED_SCOPE_AND_PRIMARY_NO_VIDEO_BYTES");
  const manifest = verified.manifest;
  assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.apiSnapshots.length, 54);
  assert.equal(manifest.apiSnapshots.filter((entry) => entry.phase === "before").length,
    27);
  assert.equal(manifest.apiSnapshots.filter((entry) => entry.phase === "after").length,
    27);
  assert.equal(manifest.remoteObjects.length, 38);
  assert.equal(manifest.remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0),
    9_221_802);
  assert.equal(manifest.remoteObjects.some((entry) => entry.path.endsWith(".mp4")),
    false);
  assert.deepEqual(manifest.closure, {
    declaredRepositories: 13,
    selectedObjects: 38,
    selectedBytes: 9_221_802,
    videosSelected: 0,
    completePrimaryRolloutNoVideo: true,
    completePrimaryMergedNoVideo: true,
    declaredScopeGlobalExhaustion: false,
  });
});

test("primary rollout maps exactly into merged episodes 301 through 320", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.replay.primaryRollout.signalSummary.frameCross, {
    failureIntervention: 968,
    failureNoIntervention: 4_136,
    successIntervention: 1_373,
    successNoIntervention: 2_450,
  });
  assert.deepEqual(value.replay.primaryRollout.signalSummary.episodeCross, {
    failureIntervention: 4,
    failureNoIntervention: 9,
    successIntervention: 7,
    successNoIntervention: 0,
  });
  assert.equal(value.replay.primaryRollout.signalSummary.interventionFrames, 2_341);
  assert.equal(value.replay.primaryRollout.signalSummary.interventionSegments, 26);
  assert.equal(value.replay.primaryRollout.signalSummary.episodes.length, 20);
  assert.deepEqual(value.replay.lineage, {
    sourceEpisodes: 20,
    sourceFrames: 8_927,
    targetEpisodeStart: 301,
    targetEpisodeEndInclusive: 320,
    targetFrameStart: 88_530,
    targetFrameEndExclusive: 97_457,
    episodeIndexOffset: 301,
    globalIndexOffset: 88_530,
    fieldExactMatchCounts: {
      action: 8_927,
      "observation.state": 8_927,
      timestamp: 8_927,
      frame_index: 8_927,
      task_index: 8_927,
      is_intervention: 8_927,
      episode_success: 8_927,
    },
    allSevenFieldsExact: true,
    episodeLengthsExact: true,
  });
  assert.deepEqual(value.replay.mergedH264.teleopPrefix, {
    episodes: 301, frames: 88_530,
    allPublisherSuccess: true, allIntervention: true,
  });
  assert.equal(value.replay.mergedH264.signalSummary.interventionFrames, 90_871);
  assert.equal(value.replay.mergedH264.signalSummary.successfulEpisodes, 308);
  assert.equal(value.replay.mergedH264.signalSummary.failedEpisodes, 13);
});

test("legacy metadata drift and support duplicate are classified from exact bytes", () => {
  const value = artifact();
  assert.deepEqual(value.replay.legacyMetadataDrift, {
    metadataEpisodes: 320,
    metadataFrames: 96_162,
    missingRelativeToPhysicalParquet: { episodeIndex: 122, frames: 1_295 },
    metadataLengthSequenceEqualsH264MinusInsertedEpisode: true,
  });
  assert.equal(value.exactCrosswalks.legacyAndH264DataParquetSameLfsObject, true);
  assert.deepEqual(value.exactCrosswalks.sharedDataParquet, {
    bytes: 3_435_198,
    lfsSha256: "sha256:70d0e051e0080ddfaa8abcba2f9938616c90bfdfeeaa9e9acc58affd68c254c8",
  });
  assert.equal(value.legacyMetadataConclusion.legacyMetadataMatchesPhysicalParquet,
    false);
  assert.equal(value.replay.supportDerivative.baseFrames, 8_803);
  assert.equal(value.replay.supportDerivative.basePublisherSuccessLabels, 12);
  assert.equal(value.replay.supportDerivative.basePublisherFailureLabels, 8);
  assert.equal(value.replay.supportDerivative.allSevenCoreFieldsExact, true);
  assert.deepEqual(value.replay.supportDerivative.derivedColumns,
    ["advantage", "advantage_indicator", "loss_mask"]);
  assert.equal(value.supportConclusion.derivativeContributesDistinctEpisodes, false);
  assert.equal(value.supportConclusion.derivativeRightsFailClosed, true);
  assert.equal(value.replay.zeroEpisodeRepositories.length, 8);
  assert.equal(value.exactCrosswalks
    .rolloutVideoObjectsMappedIntoLegacyMergedByLfsIdentity.length, 3);
  assert.equal(value.exactCrosswalks
    .rolloutVideoObjectsMappedIntoH264MergedByLfsIdentity, false);
});

test("outcome, recovery, rights, privacy and authority boundaries stay honest", () => {
  const value = artifact();
  assert.equal(value.outcome.episodeSuccessSource, "PUBLISHER_OPERATOR_LABEL");
  assert.equal(value.outcome.independentOutcome, 0);
  assert.equal(value.outcome.longitudinalOutcome, 0);
  assert.equal(value.outcome.interventionAutomaticallyMeansRecovery, false);
  assert.deepEqual(value.recovery, {
    explicitRetryOrRecoveryIdentifier: false,
    pairedFailureToRecoveryAttempts: false,
    collectionAttemptCensusComplete: false,
    publishedMergedEpisodeCensusCompleteWithinPinnedBytes: true,
    upstreamDiscardedAttemptsUnknown: true,
  });
  assert.equal(value.completeness.declaredAuthorSearchScopeCompleteAtCutoff, true);
  assert.equal(value.completeness.globalSourceExhaustion, false);
  assert.equal(value.completeness.videosAcquired, false);
  assert.equal(value.completeness.visualReplay, false);
  assert.deepEqual(value.rights, {
    primaryDatasetCardClaims: "Apache-2.0",
    repositoryLicenseFilesPresent: false,
    derivativeDatasetCardClaim: null,
    derivativeTrainingAllowed: false,
    productionTrainingRightFinallyAdjudicated: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote recovery, outcome, rights, scope or authority", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.outcome.interventionAutomaticallyMeansRecovery = true; },
    (value) => { value.recovery.explicitRetryOrRecoveryIdentifier = true; },
    (value) => { value.recovery.pairedFailureToRecoveryAttempts = true; },
    (value) => { value.recovery.collectionAttemptCensusComplete = true; },
    (value) => { value.completeness.globalSourceExhaustion = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.rights.derivativeTrainingAllowed = true; },
    (value) => { value.rights.productionTrainingRightFinallyAdjudicated = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.supportConclusion.derivativeContributesDistinctEpisodes = true; },
    (value) => { value.legacyMetadataConclusion.legacyMetadataMatchesPhysicalParquet = true; },
    (value) => { value.replay.lineage.allSevenFieldsExact = false; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = recapArtifactHash(body);
    assert.equal(verifyRecapLinkedLineageArtifact(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds from source and the entire closure is private and exact", () => {
  const original = artifact();
  const rebuilt = buildRecapLinkedLineageFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyRecapLinkedLineageArtifact(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, recapSha256(Buffer.from(
    `outsider/recap-so101-linked-lineage-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 95);
  assert.equal(directories.length, 54);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(/\.(?:mp4|avi|mov|mkv)$/iu.test(file), false, file);
  }
});

