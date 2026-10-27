import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildRealEvidenceStageProgressFromSources,
  buildRealEvidenceStageProgressProjection,
  REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA,
  verifyRealEvidenceStageProgress,
  verifyRealEvidenceStageProgressAgainstSources,
} from "../src/outsider-real-evidence-stage-progress.js";

const ROOT = path.resolve(import.meta.dirname, "..");

function officialSources() {
  const wave5 = path.join(ROOT, "artifacts/public-evidence-wave5-20260821/source");
  const aiid = path.join(ROOT, "artifacts/reality-consequence-aiid-20260817");
  const cas = path.join(ROOT, "artifacts/stage234-cas-schedule-p-2025/source");
  return {
    wave5: {
      traceCommonsDirectory: path.join(wave5, "trace-commons"),
      robustRosDirectory: path.join(wave5, "robust-ros"),
    },
    osha: {
      archivePath: path.join(ROOT,
        "artifacts/reality-consequence-osha-20260821/January2015toNovember2025.zip"),
    },
    aiid: {
      archivePath: path.join(aiid, "backup-20260817101120.tar.bz2"),
      termsSnapshotPath: path.join(aiid, "terms-of-use-20260821.html"),
    },
    institutionalRemedies: {
      sourceDirectory: path.join(ROOT,
        "artifacts/reality-institutional-ai-remedies-20260821/source"),
    },
    rma: {
      archivePath: path.join(ROOT,
        "artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip"),
      recordLayoutPath: path.join(ROOT,
        "artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf"),
    },
    cas: {
      sourceDirectory: cas,
      sourcePagePath: path.join(cas, "source-page.html"),
    },
  };
}

const SOURCES = officialSources();
const HAS_SOURCES = [
  SOURCES.wave5.traceCommonsDirectory,
  SOURCES.wave5.robustRosDirectory,
  SOURCES.osha.archivePath,
  SOURCES.aiid.archivePath,
  SOURCES.aiid.termsSnapshotPath,
  SOURCES.institutionalRemedies.sourceDirectory,
  SOURCES.rma.archivePath,
  SOURCES.rma.recordLayoutPath,
  SOURCES.cas.sourceDirectory,
  SOURCES.cas.sourcePagePath,
].every(existsSync);

function reseal(value) {
  const copy = structuredClone(value);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256").update(
    `${REAL_EVIDENCE_STAGE_PROGRESS_SCHEMA}\0${canonicalizeStrict(copy)}`)
    .digest("hex")}`;
  return copy;
}

test("fixed projection preserves real source reality without minting authority", () => {
  const artifact = buildRealEvidenceStageProgressProjection();
  const checked = verifyRealEvidenceStageProgress(artifact);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(artifact.lanes.length, 6);
  assert.equal(artifact.ontology.privateResearchOnlySourceRealityClaimed, false);
  assert.equal(artifact.ontology.researchOrShadowMeaning,
    "PERMITTED_USE_AND_INFERENCE_BOUNDARY_NOT_SOURCE_REALITY_CLASS");
  assert.equal(artifact.quantitativeBoundary.heterogeneousLanesPooled, false);
  assert.equal(artifact.quantitativeBoundary.crossLaneDollarTotal, null);
  assert.deepEqual(artifact.stageProgress.map(({ stage }) => stage),
    ["STAGE1", "STAGE1.5", "STAGE2", "STAGE3", "STAGE4"]);
  assert.ok(artifact.stageProgress.every(({ externalReadinessGapsClosed }) => (
    externalReadinessGapsClosed === false
  )));
  for (const action of ["PRICE", "GUARANTEE", "SETTLE", "TRAIN", "CLOSE", "EXECUTE"]) {
    assert.equal(artifact.authority[action], false);
  }
  assert.equal(artifact.readiness.readyToBearResponsibility, false);
});

test("caller reseal cannot pool lanes, change a source count, or promote authority", () => {
  const original = buildRealEvidenceStageProgressProjection();
  const promoted = structuredClone(original);
  promoted.authority.PRICE = true;
  promoted.authority.TRAIN = true;
  promoted.quantitativeBoundary.heterogeneousLanesPooled = true;
  promoted.quantitativeBoundary.crossLaneRecordTotal = 330_000;
  promoted.lanes[1].observations.selectedRobotOrAgvRows = 117;
  const checked = verifyRealEvidenceStageProgress(reseal(promoted));
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.externalReadinessGapsClosed, false);
});

test("source-aware entry rejects caller results, callbacks, booleans, and unknown paths", () => {
  const forged = {
    ...SOURCES,
    callerVerificationResult: { ok: true, sourceArtifactsReverified: true },
  };
  assert.throws(() => buildRealEvidenceStageProgressFromSources({ sources: forged }),
    /SOURCE_PATH_PROFILE_INVALID/);

  const artifact = buildRealEvidenceStageProgressProjection();
  const checked = verifyRealEvidenceStageProgressAgainstSources(artifact, {
    sources: forged,
    sourceArtifactsReverified: true,
    verify() { return true; },
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceArtifactsReverified, false);
});

test("source-aware verification rejects substituted lane directories", () => {
  const artifact = buildRealEvidenceStageProgressProjection();
  const substituted = structuredClone(SOURCES);
  substituted.wave5.traceCommonsDirectory = SOURCES.wave5.robustRosDirectory;
  const checked = verifyRealEvidenceStageProgressAgainstSources(artifact, {
    sources: substituted,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.verificationLevel, "FULL_SIX_LANE_SOURCE_REPLAY_FAILED");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.fullLaneSourceReplayCompleted, false);
  assert.equal(checked.externalReadinessGapsClosed, false);
});

test("all six exact frozen source lanes rebuild and exact-compare", {
  skip: !HAS_SOURCES,
  timeout: 120_000,
}, () => {
  // The full verifier calls the source builder internally.  Starting from the
  // fixed projection avoids performing the six expensive replays twice here.
  const artifact = buildRealEvidenceStageProgressProjection();
  const standalone = verifyRealEvidenceStageProgress(artifact);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.sourceArtifactsReverified, false);

  const checked = verifyRealEvidenceStageProgressAgainstSources(artifact, {
    sources: SOURCES,
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_SIX_LANE_FROZEN_SOURCE_REPLAY");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.fullLaneSourceReplayCompleted, true);
  assert.equal(checked.replayedLanes.length, 6);
  assert.equal(checked.externalReadinessGapsClosed, false);
  assert.equal(checked.responsibilityBearingAuthorityGranted, false);
});
