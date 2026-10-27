import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildStage0SourceTemporalAuditManifest,
  STAGE0_SOURCE_TEMPORAL_AUDIT_PATH,
  verifyStage0SourceTemporalAuditManifest,
} from "../src/outsider-stage0-source-temporal-audit.js";

const manifestPath = path.resolve(STAGE0_SOURCE_TEMPORAL_AUDIT_PATH);
const HAS_MANIFEST = existsSync(manifestPath);
const supersessionMarkerPath = path.resolve(
  "artifacts/stage0-source-temporal-audit-20260828/final-v1/superseded-by.json");
const CURRENT_SEMANTIC_TOKEN = /(?:^|[^A-Z0-9])CURRENT(?:[^A-Z0-9]|$)/u;

function stringValues(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((child) => stringValues(child, result));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((child) => stringValues(child, result));
  }
  return result;
}

test("source-replayed matrix quarantines exactly seven receipts and routes nine", async () => {
  const createdAt = new Date(Date.now() - 1_000).toISOString();
  const manifest = await buildStage0SourceTemporalAuditManifest({ createdAt });
  assert.equal(manifest.status, "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE");
  assert.equal(manifest.sourceReplay.sourceArtifactsReverifiedInThisBuild, true);
  assert.equal(manifest.sourceReplay.exactReceiptArtifactsRebuiltFromFrozenSources, true);
  assert.equal(manifest.sourceReplay.replayedReceiptCount, 16);
  assert.equal(manifest.counts.temporalQuarantineReceiptCount, 7);
  assert.equal(manifest.counts.temporallyOrderedCurrentReceiptCount, 9);
  const quarantined = manifest.receipts.filter((receipt) =>
    receipt.temporalAuthenticityEstablished === false);
  assert.deepEqual(quarantined.map((receipt) => receipt.receiptId).sort(), [
    "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
    "CDI_NCIGF_REAL_RATE_GUARANTY",
    "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
    "CROSS_STAGE_SIX_LANE_PROGRESS",
    "INSTITUTIONAL_CAPITAL_CLAIMS",
    "REMEDY_PAYMENT_RECOVERY",
    "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
  ]);
  assert.equal(quarantined.every((receipt) =>
    receipt.temporalStatus
      === "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED"
      && receipt.artifactPathRole === "QUARANTINED_REFERENCE_GAP_EVIDENCE_ONLY"
      && receipt.sourceBytesReplayed === true
      && receipt.currentRoutingEligible === false
      && receipt.currentCoverage === false
      && receipt.currentTruth === false
      && receipt.closureCredit === false
      && receipt.causalExperienceUnits === 0
      && receipt.trainingAdmission === false
      && receipt.pricingAdmission === false
      && receipt.operationalAuthorityGranted === false), true);
  for (const receipt of quarantined) {
    assert.equal(receipt.currentTruthMeaning,
      "TEMPORAL_AUTHENTICITY_UNESTABLISHED_QUARANTINED_REFERENCE_ONLY");
    assert.deepEqual(stringValues(receipt).filter((value) =>
      CURRENT_SEMANTIC_TOKEN.test(value)), [],
    `${receipt.receiptId} must not carry a CURRENT semantic token in any string value`);
  }
  const temporallyOrdered = manifest.receipts.filter((receipt) =>
    receipt.temporalAuthenticityEstablished === true);
  assert.equal(temporallyOrdered.length, 9);
  assert.equal(temporallyOrdered.every((receipt) =>
    receipt.currentTruthMeaning
      === "CURRENT_RECEIPT_BYTES_AND_TEMPORAL_ORDER_ONLY_NOT_UNDERLYING_WORLD_TRUTH"),
  true);
  assert.equal(manifest.receipts.every((receipt) =>
    receipt.directoryNameIsSelectionAuthority === false
      && receipt.sourceTruthEstablished === false
      && receipt.underlyingWorldTruthEstablished === false
      && receipt.closureCredit === false), true);
  assert.equal(manifest.boundary.productionTraining, false);
  assert.equal(manifest.boundary.pricing, false);
  assert.equal(manifest.boundary.fundsMovement, false);
  assert.equal(manifest.boundary.remoteOrPhysicalAction, false);
  assert.equal(manifest.boundary.operationalAuthorityGranted, false);
});

test("caller cannot predate reality with a future audit time", async () => {
  await assert.rejects(buildStage0SourceTemporalAuditManifest({
    createdAt: "2099-01-01T00:00:00.000Z",
  }), /CREATED_AT_IN_FUTURE/u);
});

test("audit time cannot precede the newest observed artifact or source metadata", async () => {
  await assert.rejects(buildStage0SourceTemporalAuditManifest({
    createdAt: "2026-08-28T07:28:47.000Z",
  }), /CREATED_AT_PRECEDES_OBSERVED_FILE_MTIME/u);
});

test("on-disk temporal audit is exact, source replayed, private, and not future-dated", {
  skip: !HAS_MANIFEST,
}, async () => {
  const checked = await verifyStage0SourceTemporalAuditManifest(
    STAGE0_SOURCE_TEMPORAL_AUDIT_PATH);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.temporalQuarantineReceiptCount, 7);
  assert.equal(checked.currentCoverageReceiptCount, 9);
  assert.equal(checked.pathNamingSelectionAuthority, false);
  assert.equal(checked.operationalAuthorityGranted, false);
  const artifact = JSON.parse(readFileSync(manifestPath, "utf8"));
  const stat = statSync(manifestPath);
  assert.equal(Date.parse(artifact.createdAt) <= stat.mtimeMs, true);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(manifestPath)).mode & 0o777, 0o700);
});

test("final-v1 bytes are preserved and exactly superseded by final-v2", () => {
  const previousPath = path.resolve(
    "artifacts/stage0-source-temporal-audit-20260828/final-v1/manifest.json");
  const previous = readFileSync(previousPath);
  const marker = JSON.parse(readFileSync(supersessionMarkerPath, "utf8"));
  assert.equal(previous.length, 50353);
  assert.equal(marker.schema, "outsider/local-artifact-supersession-pointer/v1");
  assert.equal(marker.status,
    "SUPERSEDED_CONTRADICTORY_CURRENT_SEMANTIC_TOKEN_DO_NOT_USE_AS_CANONICAL");
  assert.equal(marker.superseded.fileSha256,
    "sha256:538c6c70fdefd7375456c41fbc4d733d9d57e0ae95a212c000469599861397ab");
  assert.equal(marker.superseded.artifactHash,
    "sha256:e986c0ca2f32773c4ebca763c00f88fb1565603526ea52d3873417801e39f517");
  assert.equal(marker.canonical.path, "../final-v2/manifest.json");
  assert.equal(marker.canonical.fileSha256,
    "sha256:7a67d1474f67a8fe3c668f78d89096ccd69215aa89e7b782519737353585a44c");
  assert.equal(marker.canonical.artifactHash,
    "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453");
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(marker.sourceArtifactsReverifiedByThisMarker, false);
  assert.equal(statSync(previousPath).mode & 0o777, 0o600);
  assert.equal(statSync(supersessionMarkerPath).mode & 0o777, 0o600);
});
