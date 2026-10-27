import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { CAS_SCHEDULE_P_FROZEN_FILES } from
  "../src/outsider-cas-schedule-p-reserve-calibration.js";
import {
  buildRealLossCalibrationShadow,
  REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY,
  REAL_LOSS_CALIBRATION_SHADOW_SCHEMA,
  REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS,
  verifyRealLossCalibrationShadow,
  verifyRealLossCalibrationShadowWithSource,
} from "../src/outsider-real-loss-calibration-shadow.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RMA_DIRECTORY = path.join(
  ROOT, "artifacts", "stage234-rma-crop-insurance-2024", "source");
const CAS_DIRECTORY = path.join(
  ROOT, "artifacts", "stage234-cas-schedule-p-2025", "source");
const SOURCE_PATHS = {
  rmaZip: path.join(RMA_DIRECTORY, "sobcov_2024.zip"),
  rmaLayout: path.join(
    RMA_DIRECTORY, "SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf"),
  casPage: path.join(CAS_DIRECTORY, "source-page.html"),
};
const OFFICIAL_SOURCES_AVAILABLE = [
  ...Object.values(SOURCE_PATHS),
  ...CAS_SCHEDULE_P_FROZEN_FILES.map(({ fileName }) => (
    path.join(CAS_DIRECTORY, fileName))),
].every(existsSync);

let cachedSources;
let cachedArtifact;

function officialSources() {
  if (!cachedSources) {
    cachedSources = {
      rmaZipBytes: readFileSync(SOURCE_PATHS.rmaZip),
      rmaRecordLayoutBytes: readFileSync(SOURCE_PATHS.rmaLayout),
      casSourceFiles: Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => (
        [source.fileName, readFileSync(path.join(CAS_DIRECTORY, source.fileName))]
      ))),
      casSourcePageBytes: readFileSync(SOURCE_PATHS.casPage),
    };
  }
  return cachedSources;
}

function officialArtifact() {
  if (!cachedArtifact) cachedArtifact = buildRealLossCalibrationShadow(officialSources());
  return cachedArtifact;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict({
    domain, value,
  })).digest("hex")}`;
}

function coherentlyReseal(artifact) {
  const copy = structuredClone(artifact);
  copy.diagnosticCommitmentHash = domainHash(
    "outsider/real-loss-calibration-shadow-diagnostics/v1", copy.diagnostics);
  delete copy.artifactHash;
  copy.artifactHash = domainHash(REAL_LOSS_CALIBRATION_SHADOW_SCHEMA, copy);
  return copy;
}

function decimalRatio(numerator, denominator) {
  const inputLeft = BigInt(numerator);
  const inputRight = BigInt(denominator);
  if (inputRight === 0n) return null;
  const negative = (inputLeft < 0n) !== (inputRight < 0n);
  const left = inputLeft < 0n ? -inputLeft : inputLeft;
  const right = inputRight < 0n ? -inputRight : inputRight;
  const scale = 100_000_000n;
  const rounded = (left * scale * 2n + right) / (2n * right);
  const whole = rounded / scale;
  const fraction = String(rounded % scale).padStart(8, "0");
  return `${negative && rounded !== 0n ? "-" : ""}${whole}.${fraction}`;
}

test("measurement dictionary versions every required real-insurance diagnostic", () => {
  assert.equal(REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY.version, "1.0.0");
  const ids = new Set(REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY.entries.map(
    ({ measurementId }) => measurementId));
  for (const required of [
    "RMA_PUBLISHED_SNAPSHOT_CELL_COMPLETENESS",
    "RMA_ZERO_REPORTED_LOSS_EXPOSURE_WINDOW",
    "RMA_COUNT_ANOMALY_QUARANTINE",
    "RMA_INDEMNITY_TO_PREMIUM_RATIO",
    "RMA_INDEMNITY_TO_LIABILITY_RATIO",
    "CAS_ACCIDENT_YEAR_AXIS",
    "CAS_DEVELOPMENT_LAG_AXIS",
    "CAS_CALENDAR_YEAR_AXIS",
    "CAS_CUMULATIVE_PAID_PATH",
    "CAS_INCURRED_PATH",
    "CAS_NEGATIVE_REVISION_COUNTS",
    "CAS_UPPER_TRIANGLE_FACTOR_FIT",
    "CAS_LOWER_TRIANGLE_HOLDOUT",
    "CAS_TAIL_MISSINGNESS",
    "CAS_CORRELATION_MISSINGNESS",
  ]) assert.ok(ids.has(required), required);
});

test("caller artifacts, verification results, and callbacks cannot enter construction", () => {
  const injected = {
    rmaZipBytes: Buffer.from("x"),
    rmaRecordLayoutBytes: Buffer.from("x"),
    casSourceFiles: Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => (
      [source.fileName, Buffer.from("x")]
    ))),
    casSourcePageBytes: Buffer.from("x"),
    callerVerificationResult: { sourceArtifactsReverified: true },
  };
  assert.throws(() => buildRealLossCalibrationShadow(injected),
    /REAL_LOSS_SOURCE_INPUT_SCHEMA_INVALID/);
  const callback = { ...injected };
  delete callback.callerVerificationResult;
  callback.admissionCallback = () => true;
  assert.throws(() => buildRealLossCalibrationShadow(callback),
    /REAL_LOSS_SOURCE_INPUT_SCHEMA_INVALID/);
});

test("official raw bytes rebuild both pinned lanes and preserve false authority",
  { skip: !OFFICIAL_SOURCES_AVAILABLE }, () => {
    const artifact = officialArtifact();
    assert.equal(artifact.sourceReplay.rma.upstreamArtifactHash,
      REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.artifactHash);
    assert.equal(artifact.sourceReplay.cas.upstreamArtifactHash,
      REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash);
    assert.equal(artifact.sourceReplay.rma.verificationLevel,
      "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED");
    assert.equal(artifact.sourceReplay.cas.verificationLevel,
      "FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED");
    assert.equal(artifact.diagnostics.rma.snapshotCompleteness.sourceRows, 152_383);
    assert.equal(artifact.diagnostics.rma.exposureAndZeroReportedLossWindow
      .zeroReportedLossExposureCells, 41_792);
    assert.equal(artifact.diagnostics.rma.countAnomalyQuarantine
      .policyLossCountExceedsExposureCells, 265);
    assert.equal(artifact.diagnostics.rma.countAnomalyQuarantine
      .unitLossCountExceedsExposureCells, 28);
    assert.deepEqual(artifact.diagnostics.cas.lineOrder, ["B", "D", "C", "F2", "R1", "H1"]);
    assert.equal(artifact.diagnostics.cas.aggregateAcrossLineBacktest.projected, false);
    assert.equal(artifact.diagnostics.nonPoolingPolicy.rmaAndCasAmountsPooled, false);
    assert.equal(artifact.diagnostics.nonPoolingPolicy.casLineAmountsPooled, false);
    for (const key of ["frequency", "severity", "PRICE", "GUARANTEE", "SETTLE",
      "CAPITAL", "CUSTODY", "TRAIN", "productionReady"]) {
      assert.equal(artifact.outputBoundary[key], false, key);
    }
    assert.equal(artifact.rightsBoundary.rmaModelTrainingRightsLegallyConcluded, false);
    assert.equal(artifact.rightsBoundary.casRawRedistributionRightsConcluded, false);
    assert.equal(artifact.rightsBoundary.casCommercialUseRightsConcluded, false);

    const standalone = verifyRealLossCalibrationShadow(artifact);
    assert.equal(standalone.ok, true);
    assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
    assert.equal(standalone.artifactStructureVerified, false);
    assert.equal(standalone.diagnosticDerivationVerified, false);
    assert.equal(standalone.sourceArtifactsReverified, false);
    assert.equal(standalone.productionReady, false);
  });

test("ratios, factors, axes, revisions, and line holdouts remain source-domain math",
  { skip: !OFFICIAL_SOURCES_AVAILABLE }, () => {
    const artifact = officialArtifact();
    const rma = artifact.diagnostics.rma;
    assert.equal(rma.exposureAndZeroReportedLossWindow.exposureCellShareOfSourceRows,
      decimalRatio(97_782, 152_383));
    assert.equal(rma.exposureAndZeroReportedLossWindow.zeroReportedLossExposureShare,
      decimalRatio(41_792, 97_782));
    assert.equal(rma.aggregateIndemnityRatios.historicalIndemnityToPremiumRatio,
      decimalRatio(15_163_448_979n, 15_882_764_266n));
    assert.equal(rma.aggregateIndemnityRatios.historicalIndemnityToLiabilityRatio,
      decimalRatio(15_163_448_979n, 158_673_917_761n));
    assert.equal(rma.countAnomalyQuarantine.frequencyModelQuarantined, true);

    const cas = artifact.diagnostics.cas;
    assert.equal(cas.axes.calendarYear.equation,
      "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE");
    for (const lineCode of cas.lineOrder) {
      const line = cas.byLine[lineCode];
      assert.equal(line.upperTriangleCells + line.lowerTriangleCells, line.sourceRows);
      assert.equal(line.developmentFactors.lowerTriangleUsedForFactorFitting, false);
      assert.equal(line.holdoutBacktest.lowerTriangleUsedOnlyAsOutcome, true);
      assert.ok(line.negativeRevisions.paidDecreaseCells >= 0);
      assert.ok(line.negativeRevisions.incurredDecreaseCells >= 0);
      for (const pathName of ["cumulativePaid", "incurred"]) {
        for (const factor of line.developmentFactors[pathName]) {
          assert.equal(factor.volumeWeightedFactor, decimalRatio(
            factor.numeratorSourceUnits, factor.denominatorSourceUnits));
        }
        const backtest = line.holdoutBacktest[pathName];
        assert.equal(backtest.lag10AggregateBiasRatio, decimalRatio(
          BigInt(backtest.predictedLag10SourceUnits)
            - BigInt(backtest.actualLag10SourceUnits),
          backtest.actualLag10SourceUnits));
      }
    }
    assert.equal(cas.correlationAndTailMissingness.tailFactorObserved, false);
    assert.equal(cas.correlationAndTailMissingness.crossLineIndependenceEstablished, false);
    assert.equal(cas.correlationAndTailMissingness.crossCompanyIndependenceEstablished, false);
  });

test("full verification independently replays exact RMA and CAS source bytes",
  { skip: !OFFICIAL_SOURCES_AVAILABLE }, () => {
    const verification = verifyRealLossCalibrationShadowWithSource(
      officialArtifact(), officialSources());
    assert.equal(verification.ok, true);
    assert.equal(verification.verificationLevel,
      "FULL_OFFICIAL_RMA_AND_CAS_SOURCE_REPLAYED");
    assert.equal(verification.inputBytesReproduced, true);
    assert.equal(verification.sourceArtifactsReverified, true);
    assert.equal(verification.officialFrozenSourcesVerified, true);
    assert.equal(verification.diagnosticDerivationVerified, true);
    assert.equal(verification.productionReady, false);
  });

test("hash tamper, coherent metric reseal, and authority promotion fail closed",
  { skip: !OFFICIAL_SOURCES_AVAILABLE }, () => {
    const artifact = officialArtifact();
    const directTamper = structuredClone(artifact);
    directTamper.diagnostics.rma.exposureAndZeroReportedLossWindow.exposureCells += 1;
    assert.equal(verifyRealLossCalibrationShadow(directTamper).ok, false);

    const metricTamper = structuredClone(artifact);
    metricTamper.diagnostics.rma.aggregateIndemnityRatios
      .historicalIndemnityToPremiumRatio = "0.00000001";
    const resealedMetric = coherentlyReseal(metricTamper);
    const structural = verifyRealLossCalibrationShadow(resealedMetric);
    assert.equal(structural.ok, true,
      "a coherent envelope remains explicitly untrusted without source bytes");
    assert.equal(structural.sourceArtifactsReverified, false);
    const sourceReplay = verifyRealLossCalibrationShadowWithSource(
      resealedMetric, officialSources());
    assert.equal(sourceReplay.ok, false);
    assert.equal(sourceReplay.sourceArtifactsReverified, false);

    const promoted = structuredClone(artifact);
    promoted.outputBoundary.PRICE = true;
    assert.equal(verifyRealLossCalibrationShadow(coherentlyReseal(promoted)).ok, false);

    const extraField = structuredClone(artifact);
    extraField.diagnostics.cas.byLine.B.price = "1.00";
    assert.equal(verifyRealLossCalibrationShadow(coherentlyReseal(extraField)).ok, false);
  });

test("one-byte official-source substitution cannot retain full replay",
  { skip: !OFFICIAL_SOURCES_AVAILABLE }, () => {
    const substituted = {
      ...officialSources(),
      rmaZipBytes: Buffer.from(officialSources().rmaZipBytes),
    };
    substituted.rmaZipBytes[0] ^= 0xff;
    const verification = verifyRealLossCalibrationShadowWithSource(
      officialArtifact(), substituted);
    assert.equal(verification.ok, false);
    assert.equal(verification.sourceArtifactsReverified, false);
    assert.match(verification.failures.join("\n"),
      /RMA_SOURCE_OBJECT_HASH_INVALID|RMA_FULL_OFFICIAL_SOURCE_REPLAY_REQUIRED/);
  });
