import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LOCAL_ARTIFACT_DECLARATION_SCHEMA,
  buildLocalArtifactCanonicalIndex,
  verifyLocalArtifactCanonicalIndex,
} from "../scripts/local-artifact-canonical-index.mjs";
import {
  RMA_TEMPORAL_LOSS_PRICING_CANONICAL,
  RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1,
  buildRmaTemporalLossPricingSupersessionMarker,
  verifyRmaTemporalLossPricingSupersessionMarker,
} from "../src/outsider-rma-temporal-loss-pricing-benchmark.js";

const FAMILY = "rma-temporal-loss-pricing-2010-2020";
const FAMILY_ROOT = path.resolve("artifacts", FAMILY);
const MARKER = path.join(FAMILY_ROOT, "final-v1/superseded-by.json");

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("RMA temporal final-v1 marker exactly binds preserved v1 and canonical v2", () => {
  const bytes = readFileSync(MARKER);
  const marker = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(marker, buildRmaTemporalLossPricingSupersessionMarker());
  assert.equal(statSync(MARKER).mode & 0o777, 0o600);
  assert.equal(bytes.length,
    RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileBytes);
  assert.equal(sha256(bytes),
    RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileHash);
  assert.equal(marker.superseded.artifactHash,
    RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactHash);
  assert.equal(marker.superseded.fileSha256,
    RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileHash);
  assert.equal(marker.superseded.fileBytes,
    RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileBytes);
  assert.equal(marker.canonical.artifactHash,
    RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactHash);
  assert.equal(marker.canonical.fileSha256,
    RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileHash);
  assert.equal(marker.canonical.fileBytes,
    RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileBytes);
  assert.equal(marker.oldArtifactBytesPreserved, true);
  assert.equal(marker.sourceArtifactsReverifiedByThisMarker, false);
  const checked = verifyRmaTemporalLossPricingSupersessionMarker(MARKER);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.markerMode0600Verified, true);
  assert.equal(checked.sourceArtifactsReverifiedByThisMarker, false);
});

test("temporary canonical index resolves the RMA temporal v1 marker to final-v2", () => {
  const artifactsRoot = mkdtempSync(path.join(tmpdir(), "outsider-rma-index-"));
  const isolatedFamily = path.join(artifactsRoot, FAMILY);
  try {
    mkdirSync(path.join(isolatedFamily, "final-v1"), { recursive: true });
    mkdirSync(path.join(isolatedFamily, "final-v2"));
    copyFileSync(path.join(FAMILY_ROOT, "final-v1/artifact.json"),
      path.join(isolatedFamily, "final-v1/artifact.json"));
    copyFileSync(MARKER, path.join(isolatedFamily, "final-v1/superseded-by.json"));
    copyFileSync(path.join(FAMILY_ROOT, "final-v2/artifact.json"),
      path.join(isolatedFamily, "final-v2/artifact.json"));
    const declaration = {
      schema: LOCAL_ARTIFACT_DECLARATION_SCHEMA,
      indexedAt: "2026-08-22T09:27:00.000Z",
      entries: [{
        family: FAMILY,
        currentRelease: "final-v2",
        canonicalFile: "artifact.json",
        semanticHashField: "artifactHash",
      }],
      crossFamilyLineages: [],
    };
    const now = "2026-08-22T09:30:00.000Z";
    const index = buildLocalArtifactCanonicalIndex({ declaration, artifactsRoot, now });
    assert.equal(index.entries[0].currentRelease, "final-v2");
    assert.equal(index.entries[0].semanticHash,
      RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactHash);
    assert.equal(index.entries[0].supersessionChainEstablished, true);
    assert.equal(index.entries[0].supersededReleaseHistory[0].markerSchema,
      "outsider/local-artifact-supersession-pointer/v1");
    assert.equal(index.entries[0].supersededReleaseHistory[0].resolvedTargetRelease,
      "final-v2");
    assert.equal(verifyLocalArtifactCanonicalIndex({
      declaration, artifact: index, artifactsRoot, now,
    }).ok, true);
  } finally {
    rmSync(artifactsRoot, { recursive: true, force: true });
  }
});
