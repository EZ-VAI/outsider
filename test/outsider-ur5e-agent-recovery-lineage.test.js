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
  UR5E_AGENT_AUTHOR, UR5E_AGENT_DECLARED_QUERY, UR5E_AGENT_PROFILE,
  UR5E_AGENT_REPOSITORIES, acquirePinnedUr5eAgentLineageSource,
  buildUr5eAgentLineageFromSource, ur5eAgentArtifactHash,
  verifyUr5eAgentLineageArtifact, verifyUr5eAgentLineageSourceDirectory,
} from "../src/outsider-ur5e-agent-recovery-lineage.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-ur5e-agent-recovery-lineage-20260829-v2");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "ur5e-agent-recovery-lineage.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:f0c009e3dad73b73eec291e5a27c284391ec3c9cba08ef7187efe5f1bb183206";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:d1720514cc28490c90e031e7037dbd97bd1a35692903b4a5bcbad842b071a851";
const EXPECTED_SOURCE_ROOT =
  "sha256:22ce4414bf0316a2fd670fc850033e097c64861d59e852ddc5e92bda882edd74";
const EXPECTED_MANIFEST_HASH =
  "sha256:21c084baa69d8d55622c9f15c2875334d267cadfb3b616bb16637d0e1c3ba450";

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

test("the complete twelve-repository UR5e family and exact revisions are frozen", () => {
  assert.equal(UR5E_AGENT_AUTHOR, "yoonjung0705");
  assert.equal(UR5E_AGENT_DECLARED_QUERY,
    "https://huggingface.co/api/datasets?author=yoonjung0705"
    + "&search=aic_sfp2nic_agent_expert_trajectory_sample&limit=100&full=true");
  assert.equal(UR5E_AGENT_REPOSITORIES.length, 12);
  assert.equal(new Set(UR5E_AGENT_REPOSITORIES.map((entry) => entry.id)).size, 12);
  assert.equal(UR5E_AGENT_REPOSITORIES.every((entry) =>
    /^[a-f0-9]{40}$/u.test(entry.revision)), true);
  assert.deepEqual(UR5E_AGENT_REPOSITORIES.map((entry) => entry.frames),
    [613, 1_463, 430, 1_960, 778, 479, 763, 424, 644, 1_482, 637, 799]);
  assert.deepEqual(UR5E_AGENT_PROFILE, {
    repositories: 12, episodes: 12, frames: 10_472, fps: 20,
    robotType: "ur5e_aic", videosPerRepository: 3, videos: 36,
    expectedDataParquets: 12, expectedEpisodeParquets: 12,
    expectedTaskParquets: 12, parquetFilesReplayed: 36,
  });
});

test("the acquirer refuses an existing source before any network request", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "ur5e-agent-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedUr5eAgentLineageSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /UR5E_AGENT_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("record and complete recursive trees bind before and after all no-video bytes", () => {
  const verified = verifyUr5eAgentLineageSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_12_REPOSITORY_COMPLETE_NO_VIDEO_AND_VIDEO_INVENTORY");
  const manifest = verified.manifest;
  assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.apiSnapshots.length, 50);
  assert.equal(manifest.apiSnapshots.filter((entry) => entry.phase === "before").length,
    25);
  assert.equal(manifest.apiSnapshots.filter((entry) => entry.phase === "after").length,
    25);
  assert.equal(manifest.remoteObjects.length, 74);
  assert.equal(manifest.remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0),
    2_781_751);
  assert.equal(manifest.remoteObjects.some((entry) => entry.path.endsWith(".mp4")),
    false);
  assert.deepEqual({ ...manifest.closure, videos: undefined }, {
    completeNoVideoClosure: true,
    declaredFamilyScopeCompleteAtCutoff: true,
    globalSourceExhaustion: false,
    licenseFilesPresent: 0,
    noVideoBytes: 2_781_751,
    noVideoObjects: 74,
    recursiveTreeBytes: 107_647_009,
    recursiveTreeEntries: 254,
    recursiveTreeFiles: 110,
    recursiveTreePagesPerRepositoryPerPhase: 1,
    recursiveTreesCapturedBeforeAndAfter: true,
    reportObjects: 2,
    repositories: 12,
    repositoryCardLicenseClaimsPresent: 0,
    selectionReportObjects: 1,
    stallReportObjects: 1,
    videoBytesInventoried: 104_865_258,
    videoObjectsAcquired: 0,
    videos: undefined,
    videosInventoried: 36,
  });
  assert.equal(manifest.closure.videos.length, 36);
  assert.equal(manifest.closure.videos.every((entry) =>
    entry.path.endsWith(".mp4") && /^sha256:[a-f0-9]{64}$/u.test(entry.lfsSha256)),
  true);
  assert.equal(manifest.remoteObjects.some((entry) =>
    entry.path === "selection_report.csv"), true);
  assert.equal(manifest.remoteObjects.some((entry) =>
    entry.path === "stall_compaction_report.json"), true);
});

test("all 36 Parquets and both publisher reports replay without executing payloads", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.allParquetFilesRead, true);
  assert.equal(value.replay.parquetFilesRead, 36);
  assert.equal(value.replay.episodes, 12);
  assert.equal(value.replay.frames, 10_472);
  assert.equal(value.replay.fps, 20);
  assert.equal(value.replay.robotType, "ur5e_aic");
  assert.deepEqual(value.replay.taskCounts, { "Insert cable into target port": 12 });
  assert.deepEqual(value.replay.repositories.map((entry) => entry.episodeIndices),
    Array.from({ length: 12 }, () => [0]));
  assert.equal(value.replay.repositories.every((entry) =>
    entry.action.dimensions === 6 && entry.state.dimensions === 32), true);
  assert.deepEqual(value.replay.repositories.map((entry) =>
    entry.dataSchema.map((field) => field.name).sort()),
  Array.from({ length: 12 }, () => [
    "action", "episode_index", "frame_index", "index", "observation.state",
    "task_index", "timestamp",
  ]));
  assert.deepEqual(value.replay.repositories.map((entry) =>
    entry.telemetryLogicalHash), [
    "sha256:d163ea4e5c0aaaaf6b3d1313433499b41c4e1d79df1c2edffae5a9173c1b09e5",
    "sha256:18f1ca3990e8707e8110be61f360e3bcf3781537d7fb6bf5b171cd5ef0203774",
    "sha256:ebd19d3b1b4463f6627c8edda62ecfe40830ba38fa68dec0372d47a106bb6c70",
    "sha256:325adb431827a75663e51b95235278e317cc669744ef6c874cd6f74ee3a42ac9",
    "sha256:f9044b126a4d716d311e664c83299936666abbfdffd57d7ba9333c38f8c29815",
    "sha256:10b75ecb62a0daa449016d1cff631ce6f0278ca0ca3199289b840fe087b18a05",
    "sha256:91b431da46e4c9a5842083d39982ae9ea815564fd28fdd133b1b6b4994a9c665",
    "sha256:9395a335e96b52651e303cb55c6b89be588addfbd9f93f125612bbc68047588e",
    "sha256:23cc3741cdff676cd2e77888164d337e3e1e51f61c9fb0c9cd067f3be7d6c98a",
    "sha256:e31f3f6db54fa9928ade49dc8ee27ebd6bd2100b40f7a8c5b0a019c712393728",
    "sha256:a424a250adb9d9daec762d1c07a3009653cd9b7f756f09580f2cb69515f0f95b",
    "sha256:b10e487af4c54a1fa8a9d1dc7621611696863b0f026c4cf2f216a7127ff6d1e6",
  ]);
  const selection = value.replay.reportFiles.find((entry) =>
    entry.path === "selection_report.csv");
  assert.deepEqual(selection.statusCounts, { OK: 1 });
  assert.deepEqual(selection.selectedCounts, { True: 1 });
  assert.deepEqual(selection.totalScoreValues, [96.58628324412308]);
  assert.deepEqual(selection.absolutePathFields, ["dataset_root", "score_csv"]);
  assert.equal(selection.logicalContentHash,
    "sha256:2545c82d9dbf7a37119b3cfc0d6350724164fe2997416c5fd9e055d51870150f");
  const stall = value.replay.reportFiles.find((entry) =>
    entry.path === "stall_compaction_report.json");
  assert.deepEqual(stall.stallCompaction, {
    actions: "recomputed_from_consecutive_tcp_state_pose_delta",
    cadenceWindowsRemoved: 13, inputFrames: 1_209, outputFrames: 778,
    removedFrames: 431, schemaVersion: "aic_lerobot_stall_compaction/v1",
    trimmedVideos: 0,
    videoNote: "video sidecars copied unchanged; use state/action only or trim videos separately",
  });
  assert.equal(stall.logicalContentHash,
    "sha256:80d345e610b60064905583c1ee60688026471a0bf0970683d8af0c993610038c");
});

test("publisher naming and reports cannot promote outcome, recovery or chronology", () => {
  const value = artifact();
  assert.deepEqual({
    nominal: value.publisherNamingClaims.filter((entry) => entry.nominalToken).length,
    recovery: value.publisherNamingClaims.filter((entry) => entry.recoveryToken).length,
    attempt: value.publisherNamingClaims.filter((entry) => entry.attemptToken).length,
    success: value.publisherNamingClaims.filter((entry) => entry.successToken).length,
    score: value.publisherNamingClaims.filter((entry) => entry.scoreToken).length,
  }, { nominal: 6, recovery: 8, attempt: 10, success: 1, score: 3 });
  assert.deepEqual(value.evidenceSemantics.sourceNativeOutcomeLikeFields, []);
  assert.deepEqual(value.evidenceSemantics.sourceNativeRecoveryLikeFields, []);
  assert.equal(value.evidenceSemantics.publisherSelectionReportPresent, true);
  assert.equal(value.evidenceSemantics.publisherStallCompactionReportPresent, true);
  for (const field of ["publisherNamingIsDirectOutcomeEvidence",
    "directTerminalOutcomeEstablished", "independentOutcomeEstablished",
    "recoveryEventEstablished", "failureToRecoveryPairEstablished",
    "attemptChronologyEstablished", "physicalExternalEffectEstablished",
    "externalEffectReceiptPresent", "completeUpstreamAttemptCensus"]) {
    assert.equal(value.evidenceSemantics[field], false, field);
  }
  assert.deepEqual(value.rights, {
    repositoryCardLicenseClaim: null, repositoryLicenseFilePresent: false,
    rightsDisposition: "FAIL_CLOSED",
    rightsStatus: "FAIL_CLOSED_NO_DATASET_LICENSE",
    useBoundary: "QUARANTINE_EVAL_ONLY", productionTrainingAllowed: false,
  });
  assert.deepEqual(value.privacy, {
    absoluteFilesystemPathValuesRepublishedInArtifact: false,
    absoluteFilesystemPathsPresentInRawSelectionReport: true,
    imagePixelsReplayed: false, noPiiEstablished: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    videoBytesExcluded: true,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 0, authority: 0, delegation: 0, directOutcome: 0,
    externalEffect: 0, independentOutcome: 0, network: 0, privacy: 0,
    recovery: 0, training: 0,
  });
});

test("self-resealing cannot upgrade quarantined semantics or rights", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.network = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.boundary.CEU = 1; },
    (value) => { value.evidenceSemantics.directTerminalOutcomeEstablished = true; },
    (value) => { value.evidenceSemantics.recoveryEventEstablished = true; },
    (value) => { value.evidenceSemantics.attemptChronologyEstablished = true; },
    (value) => { value.evidenceSemantics.completeUpstreamAttemptCensus = true; },
    (value) => { value.source.queryScope.globallyExhaustive = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = ur5eAgentArtifactHash(body);
    assert.equal(verifyUr5eAgentLineageArtifact(changed).ok, false);
  }
});

test("the report deterministically rebuilds and the complete artifact stays private", () => {
  const original = artifact();
  const rebuilt = buildUr5eAgentLineageFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyUr5eAgentLineageArtifact(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.verification.verificationLevel,
    "FULL_12_REPOSITORY_NO_VIDEO_BYTE_AND_PYARROW_REPLAY");
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.files.length, 127);
  assert.equal(tree.directories.every((entry) => (statSync(entry).mode & 0o077) === 0),
    true);
  assert.equal(tree.files.every((entry) => (statSync(entry).mode & 0o077) === 0), true);
});
