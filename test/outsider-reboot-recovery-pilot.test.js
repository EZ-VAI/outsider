import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  REBOOT_DATASET_ID,
  REBOOT_RECOVERY_PILOT_CONSTANTS,
  REBOOT_RECOVERY_PILOT_SCHEMA,
  REBOOT_REVISION,
  acquirePinnedRebootSource,
  rebootRecoveryOpaqueReference,
  rebootRecoveryProjectionForNetwork,
  selectPinnedRebootEntries,
  sha256Bytes,
  verifyRebootRecoveryPilotArtifact,
  verifyRebootRecoveryPilotArtifactWithSource,
  verifyRebootSourceDirectory,
} from "../src/outsider-reboot-recovery-pilot.js";

const ROOT = path.resolve("artifacts/outsider-reboot-recovery-pilot-20260828-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const READY = existsSync(REPORT) && existsSync(path.join(SOURCE, "acquisition-manifest.json"));

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function lfsEntry(remotePath, bytes) {
  return { type: "file", path: remotePath, size: bytes.length,
    oid: "a".repeat(40), lfs: { oid: sha256Bytes(bytes).slice(7), size: bytes.length,
      pointerSize: 130 } };
}
function gitEntry(remotePath, bytes) {
  return { type: "file", path: remotePath, size: bytes.length, oid: gitBlobOid(bytes) };
}
function fixtureRemote() {
  const bytes = new Map();
  bytes.set("README.md", Buffer.from("---\nlicense: apache-2.0\n---\n# fixture\n"));
  bytes.set("meta/info.json", Buffer.from('{"total_episodes":60}\n'));
  bytes.set("meta/phase.json", Buffer.from('{"num_episodes":60}\n'));
  bytes.set("meta/stats.json", Buffer.from("{}\n"));
  bytes.set("meta/tasks.parquet", Buffer.from("PAR1tasks"));
  bytes.set("meta/episodes/chunk-000/file-000.parquet", Buffer.from("PAR1episodes0"));
  bytes.set("meta/episodes/chunk-000/file-001.parquet", Buffer.from("PAR1episodes1"));
  for (let index = 0; index < 60; index += 1) {
    bytes.set(`data/chunk-000/file-${String(index).padStart(3, "0")}.parquet`,
      Buffer.from(`PAR1episode-${index}`));
  }
  const entries = [...bytes].map(([remotePath, value]) => remotePath.endsWith(".json")
    || remotePath === "README.md" ? gitEntry(remotePath, value) : lfsEntry(remotePath, value));
  entries.push(lfsEntry("videos/observation.images.cam_high/chunk-000/file-000.mp4",
    Buffer.from("not-fetched-video")));
  return { bytes, entries };
}
function metadata() {
  return { id: REBOOT_DATASET_ID, sha: REBOOT_REVISION, private: false, gated: false,
    disabled: false, lastModified: "2026-05-12T09:21:37.000Z",
    cardData: { license: "apache-2.0" } };
}
function jsonResponse(value, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(value));
  return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length),
    "content-type": "application/json", ...headers } });
}
function bytesResponse(bytes) {
  return new Response(bytes, { status: 200,
    headers: { "content-length": String(bytes.length) } });
}
function reseal(artifact, mutate) {
  const changed = structuredClone(artifact);
  mutate(changed);
  delete changed.artifactHash;
  const value = `${REBOOT_RECOVERY_PILOT_SCHEMA}/artifact\0${canonicalizeStrict(changed)}`;
  changed.artifactHash = `sha256:${createHash("sha256").update(value).digest("hex")}`;
  return changed;
}

test("pinned selector derives all 60 action/state episodes and excludes media", () => {
  const remote = fixtureRemote();
  const selected = selectPinnedRebootEntries(remote.entries);
  assert.equal(selected.dataEpisodeFiles, 60);
  assert.equal(selected.episodeMetadataFiles, 2);
  assert.equal(selected.selectedCount, 67);
  assert.equal(selected.excludedVideoFiles, 1);
  assert.ok(selected.selected.every((entry) => !entry.path.startsWith("videos/")));
});

test("acquirer verifies exact remote bindings, revision before/after, modes, and never fetches video",
  async () => {
    const remote = fixtureRemote();
    const calls = [];
    const fakeFetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === `https://huggingface.co/api/datasets/${REBOOT_DATASET_ID}`) {
        return jsonResponse(metadata());
      }
      if (url.includes(`/tree/${REBOOT_REVISION}`)) return jsonResponse(remote.entries);
      const marker = `/resolve/${REBOOT_REVISION}/`;
      if (url.includes(marker)) {
        const encoded = url.split(marker)[1].split("?")[0];
        const remotePath = encoded.split("/").map(decodeURIComponent).join("/");
        const bytes = remote.bytes.get(remotePath);
        if (!bytes) return new Response("missing", { status: 404 });
        return bytesResponse(bytes);
      }
      return new Response("unexpected", { status: 500 });
    };
    const parent = mkdtempSync(path.join(tmpdir(), "outsider-reboot-acquire-test-"));
    const output = path.join(parent, "source");
    try {
      const acquired = await acquirePinnedRebootSource(output,
        { fetchImpl: fakeFetch, requireCanonicalProfile: false });
      assert.equal(acquired.manifest.revisionStableDuringAcquisition, true);
      assert.equal(acquired.manifest.selection.selectedCount, 67);
      assert.equal(acquired.manifest.selection.videoOrMediaFetched, false);
      assert.equal(calls.filter((url) => url ===
        `https://huggingface.co/api/datasets/${REBOOT_DATASET_ID}`).length, 2);
      assert.ok(calls.every((url) => !url.includes("/videos/")));
      assert.equal(statSync(path.join(output, "README.md")).mode & 0o777, 0o600);
      assert.equal(verifyRebootSourceDirectory(output, { requireCanonicalProfile: false }).ok, true);
      const corrupted = Buffer.from(remote.bytes.get("data/chunk-000/file-000.parquet"));
      corrupted[0] ^= 1;
      const corruptedPath = path.join(output, "data/chunk-000/file-000.parquet");
      writeFileSync(corruptedPath, corrupted, { mode: 0o600 });
      chmodSync(corruptedPath, 0o600);
      assert.throws(() => verifyRebootSourceDirectory(output, { requireCanonicalProfile: false }),
        /SOURCE_OBJECT_HASH_MISMATCH|SOURCE_LFS_REPLAY_FAILED/u);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

test("actual pinned source performs full byte replay and contains no media", { skip: !READY }, () => {
  const checked = verifyRebootSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.manifest.pinnedRevision, REBOOT_REVISION);
  assert.equal(checked.manifest.treePagesFetched, 2);
  assert.equal(checked.manifest.treeEntryCount, 100);
  assert.equal(checked.manifest.selection.selectedCount, 67);
  assert.equal(checked.manifest.selection.selectedBytes, 4_025_396);
  assert.equal(checked.manifest.selection.dataEpisodeFiles, 60);
  assert.equal(checked.manifest.selection.excludedVideoFiles, 18);
  assert.equal(checked.manifest.selection.videoOrMediaFetched, false);
  assert.ok(checked.manifest.remoteObjects.every((entry) => !entry.path.startsWith("videos/")));
  assert.equal(checked.manifest.manifestHash,
    "sha256:d82c74b5ea2b19dcc06a9309c42e4bdb2d149bce4015c45ceefcfccb09ae4373");
});

test("operator/session connected component collapse forces formal abstention",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    const checked = verifyRebootRecoveryPilotArtifact(artifact);
    assert.equal(checked.ok, true);
    assert.equal(artifact.artifactHash,
      "sha256:9b03a089ad5d9dbb4d661b9cabbcc2fcd3634de96ec1aad71b23797dbee6af4f");
    assert.equal(artifact.episodeProjection.projectionHash,
      "sha256:075e11edb53a2867585b26fc4d1f915320322aa8e1cce8b5e8ec4276f0f2e695");
    assert.equal(artifact.quality.projectedEpisodes, 60);
    assert.equal(artifact.quality.framesObserved, 53_886);
    assert.equal(artifact.quality.validFailureWindows, 57);
    assert.equal(artifact.quality.invalidFailureWindows, 3);
    assert.equal(artifact.quality.sourceOriginPhaseValuesOutsideOneBasedFive, 2);
    assert.equal(artifact.quality.invalidPhaseBoundarySequences, 1);
    assert.equal(artifact.quality.frameDurationConventionMismatches, 6);
    assert.equal(artifact.training.correlationGroups.operatorGroupCount, 2);
    assert.equal(artifact.training.correlationGroups.sessionGroupCount, 2);
    assert.equal(artifact.training.correlationGroups.connectedComponentCount, 1);
    assert.equal(artifact.training.correlationGroups.rawGroupValuesProjected, false);
    assert.equal(artifact.training.split.unit, "OPERATOR_SESSION_CONNECTED_COMPONENT");
    assert.equal(artifact.training.split.feasible, false);
    assert.equal(artifact.training.split.trainEpisodes, 0);
    assert.equal(artifact.training.split.holdoutEpisodes, 0);
    assert.equal(artifact.training.baseline.metrics, null);
    assert.equal(artifact.training.candidate.model, null);
    assert.equal(artifact.training.candidate.metrics, null);
    const exploratory = artifact.training.exploratoryEpisodeOnlyDiagnostic;
    assert.equal(exploratory.split.trainEpisodes, 45);
    assert.equal(exploratory.split.holdoutEpisodes, 12);
    assert.equal(exploratory.split.episodeIdOverlapCount, 0);
    assert.equal(exploratory.split.operatorGroupOverlapCount, 1);
    assert.equal(exploratory.split.sessionGroupOverlapCount, 1);
    assert.equal(exploratory.split.connectedComponentOverlapCount, 1);
    assert.equal(exploratory.baseline.metrics.auroc, 0.5);
    assert.equal(exploratory.candidate.metrics.auroc, 0.577271744502);
    assert.equal(exploratory.baseline.metrics.averagePrecision, 0.211111111111);
    assert.equal(exploratory.candidate.metrics.averagePrecision, 0.224873458899);
    assert.equal(exploratory.promotionEligible, false);
    assert.equal(artifact.training.decision, "KEEP_BASELINE_GROUP_DISJOINT_SPLIT_IMPOSSIBLE");
    assert.equal(artifact.training.promoted, false);
    assert.equal(artifact.training.automaticTraining, false);
    assert.equal(artifact.training.autoDispatch, false);
  });

test("episode projection omits identities, sessions, free text and target leakage", { skip: !READY }, () => {
  const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
  const serializedEpisodes = canonicalizeStrict(artifact.episodeProjection.episodes);
  const serializedArtifact = canonicalizeStrict(artifact);
  for (const forbidden of ["op-00", "op-01", "2026-04-15", "language_description",
    "task_description", "Pick the 16mm cylinder", "recover by realignment"]) {
    assert.equal(serializedEpisodes.includes(forbidden), false, forbidden);
  }
  for (const rawValue of ["op-00", "op-01", "2026-04-15", "Pick the 16mm cylinder",
    "recover by realignment"]) assert.equal(serializedArtifact.includes(rawValue), false, rawValue);
  assert.deepEqual(artifact.training.featureNames,
    [...REBOOT_RECOVERY_PILOT_CONSTANTS.featureNames]);
  for (const forbidden of ["episode_index", "frame_index", "timestamp", "task_index",
    "phase_boundaries", "failure labels", "operator_id", "collection_session",
    "language_description", "task_description", "images", "video"]) {
    assert.ok(artifact.training.excludedFromFeatures.includes(forbidden), forbidden);
  }
  assert.equal(artifact.quality.videoObserved, false);
  assert.equal(artifact.dataset.mediaFetched, false);
});

test("license mismatch and zero-authority North Star boundary are fail-closed", { skip: !READY }, () => {
  const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
  assert.equal(artifact.rights.hfDatasetCardClaim, "Apache-2.0");
  assert.equal(artifact.rights.officialProjectPageClaim, "CC-BY-4.0");
  assert.equal(artifact.rights.mismatchResolution, "UNRESOLVED");
  assert.equal(artifact.rights.productionTrainingRightFinallyAdjudicated, false);
  assert.ok(Object.values(artifact.authority).every((value) => value === false || value === 0));
  assert.equal(artifact.controlPlaneProjection.authorityDelta, 0);
  assert.equal(artifact.controlPlaneProjection.delegationRadiusDelta, 0);
  assert.equal(artifact.controlPlaneProjection.dispatched, false);
  assert.equal(artifact.controlPlaneProjection.executable, false);
  assert.equal(artifact.controlPlaneProjection.actionReady, false);
  assert.throws(() => rebootRecoveryProjectionForNetwork(artifact),
    /FULL_SOURCE_REPLAY_REQUIRED/u);
  const opaque = rebootRecoveryOpaqueReference(artifact);
  assert.equal(opaque.verificationLevel,
    "SELF_SEALED_OPAQUE_REFERENCE_NO_SOURCE_AUTHENTICATION");
  assert.equal(Object.hasOwn(opaque, "sourceRoot"), false);
  assert.equal(Object.hasOwn(opaque, "verifiedEpisodeCount"), false);
  const network = rebootRecoveryProjectionForNetwork(artifact, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(network.status, "QUARANTINED_REVIEW_ONLY");
  assert.equal(network.sourceReplayVerificationLevel, "FULL_SOURCE_REPLAY");
  assert.equal(network.countsSourceVerified, true);
  assert.equal(network.verifiedEpisodeCount, 60);
  assert.equal(network.authorityDelta, 0);
  assert.equal(network.executable, false);
});

test("resealing cannot promote robot action, CEU, rights, or outcome truth", { skip: !READY }, () => {
  const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
  const mutations = [
    (copy) => { copy.authority.ACT = true; },
    (copy) => { copy.authority.SET_CEU = true; },
    (copy) => { copy.authority.ESTABLISH_OUTCOME_TRUTH = true; },
    (copy) => { copy.rights.productionTrainingRightFinallyAdjudicated = true; },
    (copy) => { copy.controlPlaneProjection.authorityDelta = 1; },
    (copy) => { copy.controlPlaneProjection.dispatched = true; },
  ];
  assert.ok(mutations.every((mutation) =>
    verifyRebootRecoveryPilotArtifact(reseal(artifact, mutation)).ok === false));
});

test("self-resealed source root and count cannot enter the verified network projection",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
    const changed = reseal(artifact, (copy) => {
      copy.source.sourceRoot = `sha256:${"0".repeat(64)}`;
      copy.quality.projectedEpisodes = 999;
    });
    // Standalone checking authenticates only the self-sealed projection.  It
    // therefore cannot be used as a source/count attestation.
    assert.equal(verifyRebootRecoveryPilotArtifact(changed).ok, true);
    const opaque = rebootRecoveryOpaqueReference(changed);
    assert.equal(Object.hasOwn(opaque, "sourceRoot"), false);
    assert.equal(Object.hasOwn(opaque, "verifiedEpisodeCount"), false);
    assert.equal(opaque.sourceRootVerified, false);
    assert.equal(opaque.episodeCountsVerified, false);
    assert.throws(() => rebootRecoveryProjectionForNetwork(changed, SOURCE,
      { pythonExecutable: ".venv/bin/python" }), /FULL_SOURCE_REPLAY_FAILED/u);
  });

test("actual report exactly rebuilds from all pinned source bytes", { skip: !READY }, () => {
  const artifact = JSON.parse(readFileSync(REPORT, "utf8"));
  const replay = verifyRebootRecoveryPilotArtifactWithSource(artifact, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_SOURCE_REPLAY");
  assert.equal(replay.sourceArtifactsReverified, true);
  assert.equal(replay.candidateArtifactExactlyRebuilt, true);
  assert.equal(replay.authorityEstablished, false);
  assert.equal(replay.outcomeTruthEstablished, false);
  const changed = reseal(artifact,
    (copy) => { copy.training.exploratoryEpisodeOnlyDiagnostic.candidate.metrics.auroc = 0.99; });
  const rejected = verifyRebootRecoveryPilotArtifactWithSource(changed, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(rejected.ok, false);
});
