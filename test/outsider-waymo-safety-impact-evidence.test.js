import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA,
  WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822,
  waymoSafetyImpactExpectedAcquisitionManifest,
  buildWaymoSafetyImpactEvidenceFromBytes,
  buildWaymoSafetyImpactEvidenceFromSourceDirectory,
  verifyWaymoSafetyImpactEvidence,
  verifyWaymoSafetyImpactEvidenceWithSource,
} from "../src/outsider-waymo-safety-impact-evidence.js";

const SOURCE = path.resolve("artifacts/waymo-safety-impact-evidence-20260822/source-v1");
const ARTIFACT = path.resolve("artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json");
const READY = existsSync(SOURCE);

function officialBytes() {
  return Object.fromEntries(WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files
    .map((file) => [file.name, readFileSync(path.join(SOURCE, file.name))]));
}

function reseal(artifact) {
  const { artifactHash: _old, ...body } = artifact;
  return { ...body, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict({ domain: WAYMO_SAFETY_IMPACT_EVIDENCE_SCHEMA, value: body }))
    .digest("hex")}` };
}

function replaceNth(text, needle, replacement, occurrence) {
  let cursor = 0;
  for (let count = 1; count <= occurrence; count += 1) {
    const found = text.indexOf(needle, cursor);
    if (found < 0) throw new Error(`TEST_NEEDLE_NOT_FOUND:${occurrence}`);
    if (count === occurrence) return `${text.slice(0, found)}${replacement}${text.slice(found + needle.length)}`;
    cursor = found + needle.length;
  }
  throw new Error("TEST_REPLACE_UNREACHABLE");
}

function assertAllNumbersFinite(value) {
  if (typeof value === "number") assert.equal(Number.isFinite(value), true);
  else if (Array.isArray(value)) value.forEach(assertAllNumbersFinite);
  else if (value && typeof value === "object") Object.values(value).forEach(assertAllNumbersFinite);
}

test("Waymo frozen profile pins page, four CSVs, and release notes", () => {
  const source = WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822;
  assert.equal(source.files.length, 6);
  assert.equal(new Set(source.files.map((file) => file.name)).size, 6);
  assert.equal(source.files.reduce((total, file) => total + file.bytes, 0), 3_309_107);
  assert.ok(source.files.every((file) => /^sha256:[a-f0-9]{64}$/u.test(file.sha256)
    && file.url.startsWith("https://")));
  const manifest = waymoSafetyImpactExpectedAcquisitionManifest();
  assert.equal(manifest.transportAttested, false);
  assert.equal(manifest.objects.length, 6);
});

test("official exposure preserves displayed resolution, overlap, and independent-audit boundaries",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    assert.equal(artifact.exposure.csvRows, 11);
    assert.equal(artifact.exposure.displayedRoundedTotalRiderOnlyMiles, "220613000");
    assert.equal(artifact.exposure.displayedTotalRiderOnlyMilesMillions, 220.613);
    assert.equal(artifact.exposure.displayedExposureIsExactUnroundedMiles, false);
    assert.equal(artifact.exposure.displayedLeafPointTotalReconciled, true);
    assert.equal(artifact.exposure.overlappingCompositeRowsNotDoubleCounted, true);
    assert.equal(artifact.exposure.publisherMeasuredMilesIndependentlyAudited, false);
    const total = artifact.exposure.byPublishedGeography
      .find((row) => row.geography === "All Locations (mileage blended)");
    assert.equal(total.displayResolutionMiles, "1000");
    assert.equal(total.displayedValueMayBeRounded, true);
    assert.equal(artifact.benchmarkComparisons.qualityChecks
      .allLocationAllCrashDisplayedPointRateDifferenceRows, 16);
    assert.equal(artifact.benchmarkComparisons.qualityChecks
      .allLocationAllCrashImpliedExposureWithinHalfDisplayUnitRows, 16);
    assert.equal(artifact.benchmarkComparisons.qualityChecks
      .nearestRoundingSensitivityIsDiagnosticNotPublisherMethodClaim, true);
  });

test("CSV2 keeps duplicate SGO semantics quarantined and commits minimized row semantics",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    const outcomes = artifact.outcomes;
    assert.equal(outcomes.rows, 1_664);
    assert.equal(outcomes.sgoLinkedRows, 1_662);
    assert.equal(outcomes.unlinkedPreSgoOrUnavailableRows, 2);
    assert.equal(outcomes.uniqueSgoReportIds, 1_659);
    assert.equal(outcomes.duplicateSgoReportIds, 3);
    assert.equal(outcomes.duplicateSgoIdVersionPairs, 3);
    assert.deepEqual(outcomes.duplicatePairQuarantine, {
      pairs: 3, rows: 6, extraRowsBeyondOnePerPair: 3,
      pairsWithOutcomeFlagConflicts: 2,
      pairsWithSuppressedLocationTextConflicts: 1,
      pairsWithSuppressedIncidentDateConflicts: 0,
      pairsWithSuppressedZipCodeConflicts: 0,
      rawIdentifiersPersisted: false,
      countedAsIndependentCrashUnits: false,
      automaticallyDeduplicatedOrAdjudicated: false,
    });
    assert.equal(outcomes.rowMembershipOutcomeTrueCounts["Is Any Fatal Injury"], 2);
    assert.equal(outcomes.rowMembershipOutcomeTrueCounts["Is Any Vehicle Airbag Deployment"], 69);
    assert.equal(outcomes.rowMembershipOutcomeTrueCounts["Is Any-Injury-Reported"], 157);
    assert.equal(outcomes.rowMembershipOutcomeTrueCounts["Is Police-Reported"], 351);
    assert.equal(outcomes.independentCrashOutcomeCountsAfterDuplicateResolution, null);
    assert.match(outcomes.minimizedRowSemanticCommitmentHash, /^sha256:[a-f0-9]{64}$/u);
    assert.ok(outcomes.minimizedRowSemanticCommitmentCovers.includes("ALL_EIGHT_OUTCOME_FLAGS"));
    assert.equal(JSON.stringify(outcomes).includes("30270-"), false);
    const quality = artifact.quality;
    assert.equal(quality.publisherCsvReferencesNhtsaSgoReportIds, true);
    assert.equal(quality.matchedNhtsaSgoReportsIndependentlyReplayed, false);
  });

test("minimized semantic commitment changes when a caller alters an outcome flag", { skip: !READY }, () => {
  const official = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
  const files = officialBytes();
  const name = "waymo-csv2-sgo-crashes-20260624.csv";
  const text = files[name].toString("utf8");
  const needle = "V2V Backing,TRUE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,3/30/26";
  const replacement = "V2V Backing,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,FALSE,3/30/26";
  assert.equal(text.split(needle).length - 1, 1);
  files[name] = Buffer.from(text.replace(needle, replacement));
  const altered = buildWaymoSafetyImpactEvidenceFromBytes(files);
  assert.notEqual(altered.outcomes.minimizedRowSemanticCommitmentHash,
    official.outcomes.minimizedRowSemanticCommitmentHash);
});

test("CSV3 publisher NaN is explicit null-category evidence, never a JS non-finite number",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    const nonfinite = artifact.benchmarkComparisons.publishedNonfiniteNumericTokens;
    assert.equal(nonfinite["Waymo Percent Reduction CI Upper"], 82);
    assert.equal(nonfinite["Waymo Rate Ratio CI Upper"], 82);
    assert.equal(Object.values(nonfinite).reduce((total, count) => total + count, 0), 164);
    assert.equal(artifact.quality.publishedLiteralNonfiniteTokens, 164);
    assert.equal(artifact.benchmarkComparisons.numericMissingness["Waymo Percent Reduction CI Upper"], 82);
    assert.equal(artifact.benchmarkComparisons.blankNumericMissingness["Waymo Percent Reduction CI Upper"], 0);
    assertAllNumbersFinite(artifact);
    assert.equal(JSON.stringify(artifact).includes(':"NaN"'), false);
  });

test("Waymo CI and benchmark CI ordering are independently evaluated", { skip: !READY }, () => {
  const files = officialBytes();
  const name = "waymo-csv3-benchmark-comparisons-20260624.csv";
  const text = files[name].toString("utf8");
  assert.equal(text.split("1.4743859876196106").length - 1, 1);
  files[name] = Buffer.from(text.replace("1.4743859876196106", "1.0"));
  const artifact = buildWaymoSafetyImpactEvidenceFromBytes(files);
  assert.equal(artifact.benchmarkComparisons.qualityChecks.waymoCiOrderViolations, 0);
  assert.equal(artifact.benchmarkComparisons.qualityChecks.benchmarkCiOrderViolations, 1);
  assert.equal(artifact.quality.waymoCiOrderViolations, 0);
  assert.equal(artifact.quality.benchmarkCiOrderViolations, 1);
});

test("unknown non-finite spellings are rejected instead of silently normalized", { skip: !READY }, () => {
  const files = officialBytes();
  const name = "waymo-csv3-benchmark-comparisons-20260624.csv";
  files[name] = Buffer.from(files[name].toString("utf8").replace("NaN", "Infinity"));
  assert.throws(() => buildWaymoSafetyImpactEvidenceFromBytes(files), /NUMBER_INVALID:"Infinity"/u);
});

test("CSV4 retains duplicate keys and conflicting benchmark counts without deduplication or aggregation",
  { skip: !READY }, () => {
    const dynamic = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE).dynamicBenchmarkInputs;
    assert.equal(dynamic.rows, 17_176);
    assert.equal(dynamic.distinctS2Cells, 2_079);
    assert.equal(dynamic.distinctCompositeKeys, 16_632);
    assert.equal(dynamic.duplicateCompositeKeys, 544);
    assert.equal(dynamic.duplicateCompositeRows, 544);
    assert.equal(dynamic.benchmarkCrashCountConflictKeys, 489);
    assert.equal(dynamic.benchmarkCrashCountVariantExcess, 489);
    assert.equal(dynamic.duplicateKeysWithoutBenchmarkCrashCountConflict, 55);
    assert.equal(dynamic.maximumBenchmarkCrashCountVariantsPerKey, 2);
    assert.equal(dynamic.exposureValueConflictCellKeys, 0);
    assert.equal(dynamic.duplicateRowsRetainedWithoutDeduplication, true);
    assert.equal(dynamic.benchmarkCrashCountsAggregatedAcrossDuplicateKeys, false);
  });

test("same-key different-benchmark caller fixture increases CSV4 conflict count", { skip: !READY }, () => {
  const files = officialBytes();
  const name = "waymo-csv4-dynamic-benchmark-20260624.csv";
  const text = files[name].toString("utf8");
  const needle = "Georgia,DeKalb,9868795481302237184,fatal,0,7508365.8411416449,4204.3695015012718";
  const replacement = "Georgia,DeKalb,9868795481302237184,fatal,1,7508365.8411416449,4204.3695015012718";
  assert.equal(text.split(needle).length - 1, 2);
  files[name] = Buffer.from(replaceNth(text, needle, replacement, 2));
  const dynamic = buildWaymoSafetyImpactEvidenceFromBytes(files).dynamicBenchmarkInputs;
  assert.equal(dynamic.duplicateCompositeKeys, 544);
  assert.equal(dynamic.duplicateCompositeRows, 544);
  assert.equal(dynamic.benchmarkCrashCountConflictKeys, 490);
  assert.equal(dynamic.duplicateKeysWithoutBenchmarkCrashCountConflict, 54);
  assert.equal(dynamic.benchmarkCrashCountsAggregatedAcrossDuplicateKeys, false);
});

test("retrospective calendar split and outcome rows remain bounded reference, not prospective truth",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    assert.deepEqual(artifact.outcomes.temporalSplitCandidate, {
      kind: "RETROSPECTIVE_CALENDAR_HOLDOUT_CANDIDATE_NOT_PROSPECTIVE",
      referenceThrough: "2025-12", holdoutFrom: "2026-01", holdoutThrough: "2026-03",
      referenceRows: 1_390, holdoutRows: 274, outsideOrInvalidRows: 0,
      splitDeclaredBeforeThisArtifactButAfterOutcomesOccurred: true,
    });
    assert.equal(artifact.calibrationReference.targetTransfer, false);
    assert.equal(artifact.calibrationReference.actualOutsiderModelCalibrated, false);
    assert.equal(artifact.calibrationReference.statisticalCapabilityImprovementEstablished, false);
    assert.equal(artifact.trainingCandidate.candidateRows, 0);
    assert.equal(artifact.trainingCandidate.automaticTraining, false);
    assert.equal(artifact.modelEntrance.targetHoldoutEligible, false);
  });

test("generic exact bytes cannot self-attest source reality or enter training", { skip: !READY }, () => {
  const artifact = buildWaymoSafetyImpactEvidenceFromBytes(officialBytes());
  assert.equal(artifact.source.callerBytesMatchedFrozenPins, true);
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.source.sourceReality, "UNATTESTED_FIXTURE_BYTES");
  assert.equal(artifact.calibrationReference.decision, "REJECT_UNATTESTED_FIXTURE");
  assert.equal(artifact.calibrationReference.exposureDisplayedPointMiles, null);
  assert.equal(artifact.trainingCandidate.candidateRows, 0);
  assert.equal(artifact.modelEntrance.TRAIN, false);
});

test("standalone fixed projection rejects resealed authority or inference escalation",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    const checked = verifyWaymoSafetyImpactEvidence(artifact);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel,
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION");
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.calibrationEstablished, false);
    const attacks = [
      reseal({ ...artifact, readyToPrice: true }),
      reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } }),
      reseal({ ...artifact, authority: { ...artifact.authority, UNDERWRITE: true } }),
      reseal({ ...artifact, modelEntrance: { ...artifact.modelEntrance, GUARANTEE: true } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        independentAdjudicationEstablished: true } }),
      reseal({ ...artifact, source: { ...artifact.source,
        files: artifact.source.files.slice(1) } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        requiredBeforeTargetUse: artifact.calibrationReference.requiredBeforeTargetUse.slice(1) } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        requiredBeforeTargetUse: ["NO_MORE_EVIDENCE_REQUIRED",
          ...artifact.calibrationReference.requiredBeforeTargetUse.slice(1)] } }),
      reseal({ ...artifact, modelEntrance: { ...artifact.modelEntrance,
        frequencyModelEligible: true } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        statisticalCapabilityImprovementEstablished: true } }),
      reseal({ ...artifact, trainingCandidate: { ...artifact.trainingCandidate, candidateRows: 1 } }),
      reseal({ ...artifact, quality: { ...artifact.quality,
        independentCrashFactAdjudicationEstablished: true } }),
      reseal({ ...artifact, dynamicBenchmarkInputs: { ...artifact.dynamicBenchmarkInputs,
        benchmarkCrashCountsAggregatedAcrossDuplicateKeys: true } }),
    ];
    assert.ok(attacks.every((attack) => !verifyWaymoSafetyImpactEvidence(attack).ok));
  });

test("canonical Waymo artifact performs full exact source replay", {
  skip: !(READY && existsSync(ARTIFACT)),
}, () => {
  const serialized = readFileSync(ARTIFACT);
  const artifact = JSON.parse(serialized.toString("utf8"));
  const checked = verifyWaymoSafetyImpactEvidenceWithSource(artifact, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REPLAY");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.candidateArtifactExactlyRebuilt, true);
  assert.equal(checked.realPublishedOperationalExperienceAdmissionEstablished, true);
  assert.equal(checked.independentOutcomeTruthEstablished, false);
  assert.equal(checked.underlyingWorldTruthEstablished, false);
  assert.equal(Object.hasOwn(checked, "sourceTruthEstablished"), false);
  assert.equal(checked.calibrationEstablished, false);
  assert.equal(artifact.artifactHash,
    "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a");
  assert.equal(`sha256:${createHash("sha256").update(serialized).digest("hex")}`,
    "sha256:5bbb3c40d373551b5f3eeccc1521bd06c62ec0b46a23c8e0de7dda09313169bd");
});

test("resealed derivation mismatch fails full replay while source profile still reproduces",
  { skip: !READY }, () => {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE);
    const changed = reseal({ ...artifact, release: { ...artifact.release,
      livingDatasetSubjectToRevision: false } });
    assert.equal(verifyWaymoSafetyImpactEvidence(changed).ok, false);
    const checked = verifyWaymoSafetyImpactEvidenceWithSource(changed, SOURCE);
    assert.equal(checked.ok, false);
    assert.equal(checked.sourceProfileReproduced, true);
    assert.equal(checked.candidateArtifactExactlyRebuilt, false);
  });

test("Waymo builders reject non-frozen clocks and CLIs expose structure and replay", {
  skip: !(READY && existsSync(ARTIFACT)),
}, () => {
  assert.throws(() => buildWaymoSafetyImpactEvidenceFromSourceDirectory(SOURCE,
    { generatedAt: "2000-01-01T00:00:00.000Z" }), /NOT_FROZEN_SNAPSHOT/u);
  const standalone = spawnSync(process.execPath, ["scripts/waymo-safety-impact-evidence.mjs",
    "verify", "--artifact", ARTIFACT], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(standalone.status, 0, standalone.stderr);
  assert.equal(JSON.parse(standalone.stdout).verificationLevel,
    "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION");
  const replay = spawnSync(process.execPath, ["scripts/waymo-safety-impact-evidence.mjs",
    "verify-source", "--artifact", ARTIFACT, "--source", SOURCE],
  { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).verificationLevel, "FULL_SOURCE_REPLAY");
});

test("Waymo acquisition CLI imports only exact pinned captures", { skip: !READY }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-waymo-acquire-"));
  try {
    const out = path.join(directory, "source");
    const acquired = spawnSync(process.execPath,
      ["scripts/acquire-waymo-safety-impact-evidence.mjs", "--import-dir", SOURCE,
        "--out-dir", out], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(acquired.status, 0, acquired.stderr);
    const receipt = JSON.parse(acquired.stdout);
    assert.equal(receipt.sourceCount, 6);
    assert.equal(receipt.sourceBytes, 3_309_107);
    assert.equal(receipt.acquisitionManifestSha256,
      "sha256:2652bed0585dffb0d3f6b63b7970d83d8b2b4384b5f3fbb74a12cf3a76fc26d2");
    assert.equal(buildWaymoSafetyImpactEvidenceFromSourceDirectory(out)
      .source.profileMatchedAtBuild, true);
    unlinkSync(path.join(out, "acquisition.json"));
    symlinkSync(path.join(SOURCE, "acquisition.json"), path.join(out, "acquisition.json"));
    assert.throws(() => buildWaymoSafetyImpactEvidenceFromSourceDirectory(out),
      /ACQUISITION_MANIFEST_UNSAFE/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
