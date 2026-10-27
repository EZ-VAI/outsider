import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCasSchedulePReserveCalibration,
  CAS_SCHEDULE_P_FROZEN_FILES,
  CAS_SCHEDULE_P_SOURCE_PAGE,
  verifyCasSchedulePReserveCalibration,
  verifyCasSchedulePReserveCalibrationWithSource,
} from "../src/outsider-cas-schedule-p-reserve-calibration.js";

const PAGE = Buffer.from([
  "Loss Reserving Data Pulled from NAIC Schedule P",
  "S&amp;P Global Market Intelligence",
  "lower triangles",
  "CumPaidLoss_",
  "PostedReserve2007",
].join("\n"));

function csv(groupCode = 100, mutate = () => {}) {
  const rows = [["GRCODE", "GRNAME", "AccidentYear", "DevelopmentYear",
    "DevelopmentLag", "IncurredLosses", "CumPaidLoss", "BulkLoss",
    "EarnedPremDIR", "EarnedPremCeded", "EarnedPremNet", "Single",
    "PostedReserves2007"].join(",")];
  for (let accidentYear = 1998; accidentYear <= 2007; accidentYear += 1) {
    for (let developmentLag = 1; developmentLag <= 10; developmentLag += 1) {
      const offset = accidentYear - 1998;
      const values = {
        groupCode: String(groupCode),
        groupName: `Fixture Group ${groupCode}`,
        accidentYear: String(accidentYear),
        developmentYear: String(accidentYear + developmentLag - 1),
        developmentLag: String(developmentLag),
        incurred: String(200 + offset * 5 + developmentLag * 5),
        paid: String(100 + offset * 5 + developmentLag * 10),
        bulk: String(100 - developmentLag),
        direct: String(1_100 + offset * 10),
        ceded: "100",
        net: String(1_000 + offset * 10),
        single: "0",
        posted: "123.456",
      };
      mutate(values, { accidentYear, developmentLag });
      rows.push(Object.values(values).join(","));
    }
  }
  return Buffer.from(`${rows.join("\r\n")}\r\n`);
}

function fixture(mutate = () => {}) {
  return Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((spec, index) => [
    spec.fileName,
    csv(100 + index, (values, axes) => mutate(values, axes, spec)),
  ]));
}

function build(files = fixture()) {
  return buildCasSchedulePReserveCalibration(files, PAGE, {
    generatedAt: "2026-08-21T07:54:00.000Z",
  });
}

function reseal(artifact) {
  const copy = structuredClone(artifact);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256").update(canonicalizeStrict({
    domain: "outsider/cas-schedule-p-reserve-calibration/v1", value: copy,
  })).digest("hex")}`;
  return copy;
}

test("Schedule P-shaped caller bytes exercise math but cannot claim CAS provenance", () => {
  const files = fixture();
  const artifact = build(files);
  assert.equal(artifact.accounting.sourceFiles, 6);
  assert.equal(artifact.accounting.sourceRows, 600);
  assert.equal(artifact.accounting.upperTriangleCells, 330);
  assert.equal(artifact.accounting.lowerTriangleCells, 270);
  assert.equal(artifact.accounting.fullTenByTenGroupTriangles, 6);
  assert.equal(artifact.source.datasetId, "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE");
  assert.equal(artifact.source.sourceTrustClass,
    "CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE");
  assert.equal(artifact.source.publisher, null);
  assert.equal(artifact.source.compiler, null);
  assert.equal(artifact.source.underlyingRegulatorySource, null);
  assert.equal(artifact.source.sourceArtifactsReverified, false);
  assert.equal(artifact.source.publicDirectDownloadObserved, false);
  assert.equal(artifact.source.researchUseInvitedByPage, false);
  assert.equal(artifact.semanticBoundary.sourcePageFieldDefinitionsVerified, false);
  assert.equal(artifact.aggregateHoldoutBacktest.structuralBacktestArithmeticCompleted, true);
  assert.equal(artifact.aggregateHoldoutBacktest.empiricalBacktestCompleted, false);
  assert.equal(artifact.aggregateHoldoutBacktest.cumulativePaid.candidateCohorts, 54);
  assert.equal(artifact.aggregateHoldoutBacktest.cumulativePaid.evaluatedCohorts, 54);
  assert.equal(artifact.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE");
  assert.equal(artifact.sourceDomainCalibration.lowerTriangleOutOfTimeBacktestCompleted,
    false);
  assert.equal(artifact.outsiderModelEntrance.decision,
    "ABSTAIN_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE");

  const standalone = verifyCasSchedulePReserveCalibration(artifact);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(standalone.artifactStructureVerified, false);
  assert.equal(standalone.metricDerivationVerified, false);
  assert.equal(standalone.authorityBoundaryVerified, false);
  assert.equal(standalone.sourceArtifactsReverified, false);
  assert.equal(standalone.sourceDomainCalibrationDecision, null);
  const replay = verifyCasSchedulePReserveCalibrationWithSource(artifact, files, PAGE);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "CALLER_ASSERTED_FIXTURE_BYTES_REPLAYED");
  assert.equal(replay.inputBytesReproduced, true);
  assert.equal(replay.sourceArtifactsReverified, false);
});

test("a coherently resealed standalone envelope cannot certify Schedule P math", () => {
  const files = fixture();
  const changed = structuredClone(build(files));
  changed.byLine.B.developmentFactors.cumulativePaid[0].volumeWeightedFactor
    = "999999.00000000";
  changed.byLine.B.PRICE = true;
  changed.aggregateHoldoutBacktest.cumulativePaid.weightedAbsoluteErrorRatio
    = "0.00000000";
  const standalone = verifyCasSchedulePReserveCalibration(reseal(changed));
  assert.equal(standalone.ok, true);
  assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(standalone.artifactStructureVerified, false);
  assert.equal(standalone.metricDerivationVerified, false);
  assert.equal(standalone.authorityBoundaryVerified, false);
  assert.equal(verifyCasSchedulePReserveCalibrationWithSource(reseal(changed), files,
    PAGE).ok, false);
});

test("upper triangle fits factors and lower triangle is outcome-only", () => {
  const artifact = build();
  const line = artifact.byLine.B;
  assert.equal(line.developmentFactors.trainingCutoffCalendarYear, 2007);
  assert.equal(line.developmentFactors.lowerTriangleUsedForFactorFitting, false);
  assert.equal(line.developmentFactors.cumulativePaid.length, 9);
  assert.ok(line.developmentFactors.cumulativePaid.every((factor) => (
    factor.modelArithmeticEligible && factor.trainingPairs > 0
  )));
  assert.equal(line.holdoutBacktest.lowerTriangleUsedOnlyAsOutcome, true);
  assert.equal(line.holdoutBacktest.lag10IsUltimateEstablished, false);
  assert.equal(artifact.axes.calendarYear.equation,
    "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE");
  assert.equal(line.axes.developmentLag[1].upperTriangleCells, 10);
  assert.equal(line.axes.developmentLag[10].upperTriangleCells, 1);
  assert.equal(line.axes.developmentLag[10].lowerTriangleCells, 9);
});

test("paid, incurred, bulk/IBNR, posted reserve, recovery, and adjudication stay distinct", () => {
  const artifact = build();
  assert.equal(artifact.semanticBoundary.incurredIsCashPaid, false);
  assert.equal(artifact.semanticBoundary.bulkAndIbnrIsCaseReserve, false);
  assert.equal(artifact.semanticBoundary.paidIsRecovery, false);
  assert.equal(artifact.semanticBoundary.lowerTriangleIsIndependentClaimAdjudication,
    false);
  assert.equal(artifact.semanticBoundary.postedReserveReconciliationEligible, false);
  assert.equal(artifact.semanticBoundary.amountScaleDeclaredOnCasPage, false);
  assert.equal(artifact.semanticBoundary.outputAmountUnit, "SOURCE_AMOUNT_UNIT");
  assert.equal(artifact.correlationAndTailBoundary.lag10IsUltimateEstablished, false);
  assert.equal(artifact.correlationAndTailBoundary.tailFactorObserved, false);
  assert.equal(artifact.sourceDomainCalibration.productionReserveModelEligible, false);
});

test("negative corrections are preserved and endpoint cases quarantine from backtest", () => {
  const files = fixture((values, { accidentYear, developmentLag }, spec) => {
    if (spec.lineCode === "B" && accidentYear === 2007 && developmentLag === 10) {
      values.paid = "-5";
    }
  });
  const artifact = build(files);
  assert.equal(artifact.byLine.B.axes.developmentLag[10].negativePaidCells, 1);
  assert.equal(artifact.byLine.B.holdoutBacktest.cumulativePaid.negativeEndpointCohorts, 1);
  assert.equal(artifact.aggregateHoldoutBacktest.cumulativePaid.negativeEndpointCohorts, 1);
  assert.equal(artifact.aggregateHoldoutBacktest.cumulativePaid.evaluatedCohorts, 53);
});

test("source-aware replay catches changed outcomes and resealed authority promotion", () => {
  const files = fixture();
  const artifact = build(files);
  const changed = fixture((values, { accidentYear, developmentLag }, spec) => {
    if (spec.lineCode === "B" && accidentYear === 2007 && developmentLag === 10) {
      values.paid = String(Number(values.paid) + 1);
    }
  });
  const mismatch = verifyCasSchedulePReserveCalibrationWithSource(artifact, changed, PAGE);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.sourceArtifactsReverified, false);

  const promoted = structuredClone(artifact);
  promoted.source.officialFrozenSourceVerified = true;
  promoted.source.sourceArtifactsReverified = true;
  promoted.sourceDomainCalibration.decision
    = "ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY";
  promoted.outsiderModelEntrance.permitsPricing = true;
  const resealed = reseal(promoted);
  assert.equal(verifyCasSchedulePReserveCalibration(resealed).ok, false);
  assert.equal(verifyCasSchedulePReserveCalibrationWithSource(resealed, files, PAGE).ok,
    false);
});

test("axis errors, duplicate cells, unknown files, and unknown artifact fields fail closed", () => {
  const badAxis = fixture((values, { accidentYear, developmentLag }, spec) => {
    if (spec.lineCode === "B" && accidentYear === 1998 && developmentLag === 1) {
      values.developmentYear = "1999";
    }
  });
  assert.throws(() => build(badAxis), /TRIANGLE_AXIS_INVALID/);

  const unknown = { ...fixture(), "unknown.csv": Buffer.from("x") };
  assert.throws(() => build(unknown), /SOURCE_FILE_SET_INVALID/);

  const artifact = structuredClone(build());
  artifact.source.unexpectedAuthority = true;
  assert.equal(verifyCasSchedulePReserveCalibration(reseal(artifact)).ok, false);
});

test("frozen manifest pins the six public CAS files and acknowledgement page", () => {
  assert.equal(CAS_SCHEDULE_P_FROZEN_FILES.length, 6);
  assert.equal(new Set(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => source.lineCode)).size,
    6);
  assert.ok(CAS_SCHEDULE_P_FROZEN_FILES.every((source) => (
    /^https:\/\/www\.casact\.org\//.test(source.url)
      && /^sha256:[a-f0-9]{64}$/.test(source.hash) && source.bytes > 0
  )));
  assert.equal(CAS_SCHEDULE_P_SOURCE_PAGE.hash,
    "sha256:dbf2c60c79b9422f814b4a049ed9b427c64562b41e2bff6310a618ae9ab64e72");
  assert.equal(CAS_SCHEDULE_P_SOURCE_PAGE.bytes, 153_047);
  assert.equal(CAS_SCHEDULE_P_SOURCE_PAGE.pageRequestsResearchPublicationAcknowledgement,
    true);
});
