import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PLUG93_RECOVERY_DATASET_ID, PLUG93_RECOVERY_DISPOSITION,
  PLUG93_RECOVERY_RANGE_PLAN, PLUG93_RECOVERY_REVISION,
  PLUG93_RECOVERY_SCOPE,
  verifyPlug93RecoveryArtifactDirectory,
} from "../src/outsider-realrobot-plug93-recovery-numeric-slice.js";

const artifact = path.resolve(
  "artifacts/outsider-realrobot-plug93-recovery-numeric-slice-20260830-v1");
const reportBytes = readFileSync(path.join(artifact, "report.json"));
const report = JSON.parse(reportBytes);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkModes(root, prefix = "") {
  const target = prefix === "" ? root : path.join(root, prefix);
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(target)) {
    walkModes(root, prefix === "" ? name : `${prefix}/${name}`);
  }
}

test("fixed source mapping closes exactly the recovery non-image group", () => {
  assert.equal(report.disposition, PLUG93_RECOVERY_DISPOSITION);
  assert.equal(report.scope.kind, PLUG93_RECOVERY_SCOPE);
  assert.equal(report.scope.datasetId, PLUG93_RECOVERY_DATASET_ID);
  assert.equal(report.scope.revision, PLUG93_RECOVERY_REVISION);
  assert.deepEqual(report.scope.publisherDeclaredRecoveryFinalEpisodeRange,
    [76, 92]);
  assert.equal(report.scope.publisherDeclaredRecoveryEpisodes, 17);
  assert.equal(report.scope.selectedRows, 30_512);
  assert.equal(report.scope.completePublisherDeclaredRecoveryGroupNonImageColumns,
    true);
  assert.equal(report.scope.cleanBaseEpisodesInventoriedButPayloadNotAcquired, 76);
  assert.equal(report.scope.fullTreeEntries, 106);
  assert.equal(report.scope.fullTreeFiles, 101);
  assert.equal(report.scope.fullTreeDirectories, 5);
  assert.equal(report.scope.fullTreeFileBytes, 82_358_405_909);
  assert.equal(report.scope.completeSupportFiles, 8);
  assert.equal(report.scope.completeSupportBytes, 602_378);
  assert.equal(report.scope.selectedPhysicalParquetFiles, 17);
  assert.equal(report.scope.selectedPhysicalWholeFileBytes, 25_577_395_023);
  assert.equal(report.scope.globalSourceUniverseExhausted, false);
});

test("34 strict ranges reconstruct every selected numeric and tactile column", () => {
  assert.equal(report.source.strict206RangeResponsesVerified, 34);
  assert.equal(report.source.rangeContentLengthAndContentRangeVerified, 34);
  assert.equal(report.source.treeLfsOidClaimsPinned, 17);
  assert.equal(report.source.lfsClaimsAreWholeFileHashesVerifiedByThisArtifact,
    false);
  assert.equal(report.replay.parquet.files, 17);
  assert.equal(report.replay.parquet.rowGroups, 17);
  assert.equal(report.replay.parquet.rows, 30_512);
  assert.equal(report.replay.parquet.leafColumnsPerFile, 12);
  assert.equal(report.replay.parquet.rangeBoundaryReplayExactFiles, 17);
  assert.equal(report.replay.parquet.footerBytes, 97_266);
  assert.equal(report.replay.parquet.fullSchemaSha256,
    "sha256:a360a3d48aa7bc02464967596a121805bce44933f2205770252906f53ee1b087");
  assert.equal(report.mechanics.byteNativeRows, 30_512);
  assert.equal(report.mechanics.stateDimensions, 11);
  assert.equal(report.mechanics.actionDimensions, 7);
  assert.deepEqual(report.mechanics.tactileShapePerFrame, [1, 10, 12, 3]);
  assert.equal(report.mechanics.nonfiniteStateValues, 0);
  assert.equal(report.mechanics.nonfiniteActionValues, 0);
  assert.equal(report.mechanics.nonfiniteTactileValues, 0);
  assert.equal(report.mechanics.semanticProfileRoot,
    "sha256:ffcdac953eb50d31615c2907d0bcfd393101901eec91d3338aeadae7713e19f0");
  assert.deepEqual(report.sidecarDrift.byteNativeEpisodeIndexRange, [76, 92]);
  assert.deepEqual(report.sidecarDrift.byteNativeGlobalIndexRange,
    [73_798, 104_310]);
  assert.equal(report.sidecarDrift.episodeTopLevelOffsetsAndFileIndicesCrosswalkExactRows,
    17);
});

test("publisher recovery lineage and training mask stay distinct from outcomes", () => {
  assert.deepEqual(report.lineage.publisherModeCounts,
    { full_success_rollout: 1, recovery: 16 });
  assert.deepEqual(report.lineage.publisherActionSourceCounts,
    { boundary: 120, manual: 3_613, policy: 26_779 });
  assert.equal(report.lineage.publisherActionSourceRows, 30_512);
  assert.equal(report.lineage.publisherCutIntervals, 34);
  assert.equal(report.lineage.publisherEpisodesWithCutIntervals, 16);
  assert.equal(report.lineage.publisherRecoverySourceRevision,
    "dfd27a1703f1e93c923066c61c5595d67bbb8650");
  assert.equal(report.lineage.publisherRecoverySourceRule, null);
  assert.equal(report.lineage.perRowActionSourceFieldPresent, false);
  assert.equal(report.lineage.sourceFilenameSuccessTokenRows, 1);
  assert.equal(report.lineage.sourceFilenameSuccessTokenPromotedToOutcome, false);
  assert.equal(report.trainingMask.publisherNativeSelectedRecoveryValidSamples,
    23_919);
  assert.equal(report.trainingMask.publisherNativeSelectedRecoveryInvalidSamples,
    6_593);
  assert.deepEqual(report.trainingMask.invalidReasonFirstMatch, {
    action_touches_rejected_interval: 5_760,
    insufficient_real_action_steps: 833,
  });
  assert.equal(report.trainingMask.publisherPipelineEligibilityIsLegalTrainingAuthorization,
    false);
  assert.equal(report.trainingMask.authorizedTrainingRows, 0);
});

test("image, outcome, recovery-effect, privacy, rights, and authority fail closed", () => {
  assert.equal(report.modalityBoundary.selectedNonImageTopLevelColumns.length, 8);
  assert.deepEqual(report.modalityBoundary.excludedImageTopLevelColumns,
    ["observation.images.camera1", "observation.images.camera2"]);
  assert.equal(report.modalityBoundary.excludedImageLeafColumnChunks, 68);
  assert.equal(report.modalityBoundary.excludedImageChunkBytes, 25_519_306_752);
  assert.equal(report.modalityBoundary.rawVisualBytesAcquired, 0);
  assert.equal(report.modalityBoundary.imagePathColumnBytesAcquired, 0);
  assert.equal(report.modalityBoundary.completeSelectedNonImageColumns, true);
  assert.equal(report.modalityBoundary.completeWholeParquetFiles, false);
  assert.equal(report.outcome.publisherNativeOutcomeFieldRows, 0);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.completeCollectionAttemptCensusRows, 0);
  assert.equal(report.recovery.byteNativePerRowRecoveryLabelRows, 0);
  assert.equal(report.recovery.pairedFailureToRecoveryRows, 0);
  assert.equal(report.recovery.causalRecoveryEffectRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.publisherRecoveryLineageIsCausalRecoveryEvidence,
    false);
  assert.equal(report.privacy.metadataAbsoluteLocalPathOccurrences, 3);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.rights.datasetApiLicenseClaim, null);
  assert.equal(report.rights.datasetCardLicenseClaim, null);
  assert.equal(report.rights.fixedTreeLicenseFiles, 0);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.deepEqual(report.boundary, {
    authorityRows: 0, authorizedTrainingRows: 0,
    autonomousActionAuthorized: false, ceuRows: 0,
    completeAttemptCensusRows: 0, independentEffectRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0, networkAdmissionRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
  });
});

test("range inventory, hashes, source brackets, and page drift are explicit", () => {
  const source = path.join(artifact, "source");
  const manifest = JSON.parse(readFileSync(path.join(source,
    "source-manifest.json"), "utf8"));
  const acquisition = JSON.parse(readFileSync(path.join(source,
    "range-acquisition.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 50);
  assert.equal(manifest.selectedRangeObjects, 34);
  assert.equal(manifest.selectedRangeBytes, 58_088_271);
  assert.equal(manifest.wholeFileSha256Verified, 0);
  assert.equal(manifest.recordRawBeforeAfterExact, true);
  assert.equal(manifest.treePage1RawBeforeAfterExact, true);
  assert.equal(manifest.treePage2RawBeforeAfterExact, false);
  assert.equal(report.source.treePage2RawDriftReason,
    "mutable_security_scan_status_only");
  assert.equal(acquisition.records.length, 34);
  assert.equal(acquisition.records.reduce((sum, row) => sum + row.bytes, 0),
    58_088_271);
  for (const row of acquisition.records) {
    assert.equal(row.status, 206);
    assert.equal(row.contentLength, row.bytes);
    assert.equal(row.contentRange,
      `bytes ${row.start}-${row.endInclusive}/${row.fileBytes}`);
    assert.match(row.sha256, /^sha256:[a-f0-9]{64}$/u);
  }
  assert.equal(PLUG93_RECOVERY_RANGE_PLAN.files.length, 17);
  assert.equal(PLUG93_RECOVERY_RANGE_PLAN.selectedRangeBytes, 58_088_271);
  assert.equal(PLUG93_RECOVERY_RANGE_PLAN.excludedImageChunkBytes,
    25_519_306_752);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyPlug93RecoveryArtifactDirectory(artifact, {
    pythonExecutable: "/opt/anaconda3/bin/python",
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:21003908b3797019d1d489367c98eedfadd1bc68f9d970e14b2725032f610333");
  assert.equal(checked.receipt.receiptHash,
    "sha256:cac70d64b9ba0215bb8401e0b9180c90a66f62a39fd149ad50feabf617d9d0e7");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-realrobot-plug93-recovery-numeric-slice.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
