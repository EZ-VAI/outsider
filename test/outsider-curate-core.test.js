import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  createCurateInclusionProof,
  CURATE_REFUSALS,
  CURATE_SCHEMAS,
  evaluateCurateFitToLearn,
  normalizeCurateEpisode,
  registerCurateCorpusFact,
  verifyCurateCheckpoint,
  verifyCurateClearance,
  verifyCurateCorpusFactClearance,
  verifyCurateEpisode,
  verifyCurateFitToLearnDecision,
  verifyCurateInclusionProof,
} from "../src/outsider-curate-core.js";

const H = (character) => `sha256:${character.repeat(64)}`;
const digest = (value) => `sha256:${createHash("sha256")
  .update(canonicalizeStrict(value)).digest("hex")}`;

function inputEpisode({
  id = "1", object = "2", values = [1, 2], times = [0, 10],
  commitments = [H("3"), H("4")], platformClass = null,
} = {}) {
  return {
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "droid-100",
      datasetVersion: "2026.08",
      datasetManifestHash: H("a"),
      sourceObjectHash: H(object),
      licenseId: "CC-BY-4.0",
      attributionHash: H("b"),
    },
    instrument: {
      extractorId: "test-curate-adapter",
      extractorVersion: "1.0.0",
      extractorImplementationHash: H("e"),
      featureSchemaHash: H("f"),
    },
    episodeIdHash: H(id),
    platformClass,
    steps: values.map((value, index) => ({
      index,
      tOffsetMs: times[index] ?? null,
      boundary: { isFirst: index === 0, isLast: index === values.length - 1,
        isTerminal: index === values.length - 1 },
      observation: {
        commitment: commitments[index] ?? H(String((index + 5) % 10)),
        features: { "joint.position.0": value, "gripper.width": value / 10 },
        images: [],
      },
      action: { kind: "joint-delta", features: { "joint.0": value / 100 } },
      outcome: index === values.length - 1
        ? { kind: "episode-marker", features: { terminal: 1 } } : null,
    })),
  };
}

test("normalizes only strict privacy-safe numeric episode projections", () => {
  const episode = normalizeCurateEpisode(inputEpisode());
  assert.equal(verifyCurateEpisode(episode).ok, true);
  assert.equal(episode.provenance.class, "historical-public-dataset");
  assert.equal(episode.provenance.verification, "declared-unverified");
  assert.equal(episode.privacy.rawContentIncluded, false);
  assert.equal(episode.useBoundary.authority, "none");
  assert.deepEqual(episode.useBoundary.permits,
    { PRICE: false, GUARANTEE: false, SETTLE: false });
  assert.equal(episode.useBoundary.establishesLossOrLiability, false);
  assert.equal(Object.isFrozen(episode.steps[0].observation.features), true);

  const again = normalizeCurateEpisode(inputEpisode());
  assert.equal(again.episodeHash, episode.episodeHash);
  assert.equal(JSON.stringify(again), JSON.stringify(episode));
});

test("refuses unknown/raw fields, non-finite features and structural boundary violations", () => {
  const raw = inputEpisode();
  raw.steps[0].observation.raw = "image bytes";
  assert.throws(() => normalizeCurateEpisode(raw), /CURATE_OBSERVATION_SHAPE_INVALID/);

  const nonFinite = inputEpisode();
  nonFinite.steps[0].observation.features["joint.position.0"] = Number.NaN;
  assert.throws(() => normalizeCurateEpisode(nonFinite), /CURATE_OBSERVATION_FEATURE_NON_FINITE/);

  const tooLarge = inputEpisode();
  tooLarge.steps[0].action.features["joint.0"] = 1_000_000_000_001;
  assert.throws(() => normalizeCurateEpisode(tooLarge), /CURATE_ACTION_FEATURE_OUT_OF_BOUNDS/);

  const wrongIndex = inputEpisode();
  wrongIndex.steps[1].index = 4;
  assert.throws(() => normalizeCurateEpisode(wrongIndex), /CURATE_STEP_INDEX_NOT_CONTIGUOUS/);

  const wrongBoundary = inputEpisode();
  wrongBoundary.steps[0].boundary.isFirst = false;
  assert.throws(() => normalizeCurateEpisode(wrongBoundary),
    /CURATE_STEP_BOUNDARY_INCONSISTENT/);

  const tooLate = inputEpisode();
  tooLate.steps[1].tOffsetMs = 86_400_001;
  assert.throws(() => normalizeCurateEpisode(tooLate), /CURATE_STEP_TIME_OUT_OF_BOUNDS/);

  const oneStep = inputEpisode({ values: [1], times: [0], commitments: [H("3")] });
  assert.throws(() => normalizeCurateEpisode(oneStep),
    /CURATE_EPISODE_STEP_COUNT_OUT_OF_BOUNDS/);

  const emptyMeasurement = inputEpisode();
  emptyMeasurement.steps[0].observation.features = {};
  emptyMeasurement.steps[0].observation.images = [];
  assert.throws(() => normalizeCurateEpisode(emptyMeasurement),
    /CURATE_OBSERVATION_MEASUREMENT_EMPTY/);
});

test("image observations retain commitments and dimensions but cannot carry bytes", () => {
  const input = inputEpisode();
  input.steps[0].observation.images = [
    { commitment: H("d"), width: 320, height: 180, format: "jpeg" },
    { commitment: H("e"), width: 320, height: 180, format: "jpeg" },
  ];
  const episode = normalizeCurateEpisode(input);
  assert.deepEqual(episode.steps[0].observation.images, input.steps[0].observation.images);
  const clearance = clearCurateEpisode(episode);
  assert.equal(clearance.structure.imageCommitmentCount, 2);

  const raw = inputEpisode();
  raw.steps[0].observation.images = [{ commitment: H("d"), width: 1, height: 1,
    format: "jpeg", bytes: "not-allowed" }];
  assert.throws(() => normalizeCurateEpisode(raw), /CURATE_OBSERVATION_IMAGE_SHAPE_INVALID/);
});

test("historical public episodes deterministically remain observation with zero CEU", () => {
  const episode = normalizeCurateEpisode(inputEpisode());
  const decision = evaluateCurateFitToLearn(episode);
  const repeated = evaluateCurateFitToLearn(episode);
  assert.equal(decision.decisionHash, repeated.decisionHash);
  assert.equal(decision.admitted, false);
  assert.equal(decision.causalExperienceUnits, 0);
  assert.equal(decision.refusalCode, CURATE_REFUSALS.noProspectiveCausalDesign);
  assert.equal(verifyCurateFitToLearnDecision(decision).ok, true);
  assert.equal(decision.useBoundary.automaticTraining, false);

  const clearance = clearCurateEpisode(episode);
  assert.equal(verifyCurateClearance(clearance, { episode, history: [] }).ok, true);
  assert.equal(clearance.disposition, "QUARANTINED");
  assert.equal(clearance.causal.causalClass, "observation");
  assert.equal(clearance.causal.causalExperienceUnits, 0);
  assert.equal(clearance.causal.fitToLearnRefusalCode,
    CURATE_REFUSALS.noProspectiveCausalDesign);
  assert.equal(clearance.drift.precisionRecallClaimed, false);
  assert.equal(clearance.useBoundary.establishesLossOrLiability, false);
  assert.deepEqual(clearance.useBoundary.permits,
    { PRICE: false, GUARANTEE: false, SETTLE: false });
});

test("aggregate DROID facts enter corpus quarantine without becoming fake step evidence", () => {
  const body = {
    schema: "outsider/droid100-episode-fact/v1",
    adapterVersion: "1.0.0",
    source: { manifestHash: H("1"), objectLeafHash: H("2"), shardIndex: 7,
      episodeOrdinal: 19 },
    episode: { keyHash: H("3"), stepCount: 83, durationMs: 9200 },
    observations: { cameraStreamCount: 3, proprioceptionDimensions: 14,
      instructionPresent: true, instructionHash: H("4") },
    actions: { dimensions: 7 },
    outcome: { success: true, terminated: true, truncated: false },
    privacy: { rawImagesIncluded: false, rawSensorBytesIncluded: false,
      sourcePathIncluded: false, collectorIdentityIncluded: false,
      instructionTextIncluded: false, absoluteTimestampIncluded: false },
    admissibility: { stage15: "QUARANTINE_ONLY", causalEvidence: false,
      pricingEvidence: false, guaranteeEvidence: false,
      automaticLearningPromotion: false },
  };
  const fact = { ...body, factHash: digest(body) };
  const clearance = registerCurateCorpusFact(fact);
  const verified = verifyCurateCorpusFactClearance(clearance, { fact });
  assert.equal(verified.ok, true);
  assert.equal(verified.sourceFactVerified, true);
  assert.equal(clearance.evidenceClass, "aggregate-metadata-only");
  assert.equal(clearance.stepEvidenceAvailable, false);
  assert.equal(clearance.episodeClearanceEligible, false);
  assert.equal(clearance.checkpointEligible, false);
  assert.equal(clearance.causal.causalExperienceUnits, 0);
  assert.equal(clearance.causal.fitToLearnRefusalCode,
    CURATE_REFUSALS.noProspectiveCausalDesign);
  assert.ok(clearance.checks.slice(1).every((check) => check.status === "SKIPPED"));
  assert.throws(() => normalizeCurateEpisode(fact), /CURATE_EPISODE_INPUT_SHAPE_INVALID/);

  const tampered = structuredClone(fact);
  tampered.episode.stepCount += 1;
  assert.throws(() => registerCurateCorpusFact(tampered), /CURATE_CORPUS_FACT_INVALID/);
});

test("consistency reports conservative checked, alert and skipped reasons", () => {
  const episode = normalizeCurateEpisode(inputEpisode({
    times: [10, 5], commitments: [H("3"), H("3")], platformClass: "franka-panda",
  }));
  const clearance = clearCurateEpisode(episode);
  const checks = new Map(clearance.consistency.checks.map((item) => [item.check, item]));
  assert.deepEqual(checks.get("strict-structure"), {
    check: "strict-structure", status: "PASS",
    reason: "NORMALIZED_SCHEMA_AND_BOUNDS_VERIFIED",
  });
  assert.equal(checks.get("monotonic-time").status, "ALERT");
  assert.equal(checks.get("monotonic-time").reason, "TIME_REGRESSION_OBSERVED");
  assert.equal(checks.get("within-episode-duplicate").status, "ALERT");
  assert.equal(checks.get("platform-kinematics").status, "SKIPPED");
  assert.equal(checks.get("platform-kinematics").reason,
    "PLATFORM_KINEMATIC_MODEL_NOT_REGISTERED");
  assert.equal(checks.get("sensor-cross-consistency").status, "SKIPPED");
  assert.equal(checks.get("energy-balance").status, "SKIPPED");
});

test("cross-episode replay and simple drift remain unlabelled observed alerts", () => {
  const baseline = normalizeCurateEpisode(inputEpisode({
    id: "5", object: "6", values: [1, 1], commitments: [H("7"), H("8")],
  }));
  const current = normalizeCurateEpisode(inputEpisode({
    id: "9", object: "0", values: [10, 10], commitments: [H("7"), H("c")],
  }));
  const clearance = clearCurateEpisode(current, { history: [baseline] });
  const checks = new Map(clearance.consistency.checks.map((item) => [item.check, item]));
  assert.equal(checks.get("cross-episode-replay").status, "ALERT");
  assert.equal(clearance.replay.repeatedCommitmentCount, 1);
  assert.deepEqual(clearance.replay.repeatedCommitments, [H("7")]);
  assert.equal(checks.get("observation-mean-drift").status, "ALERT");
  assert.deepEqual(clearance.drift.alertFeatures,
    ["gripper.width", "joint.position.0"]);
  assert.equal(clearance.drift.interpretation, "unlabelled-observed-alert-only");
  assert.equal(clearance.drift.precisionRecallClaimed, false);
  assert.equal(clearance.disposition, "QUARANTINED");
  assert.equal(clearance.causal.causalExperienceUnits, 0);
  assert.equal(verifyCurateClearance(clearance,
    { episode: current, history: [baseline] }).derivationsVerified, true);
});

test("content addresses reject episode, clearance and derived-statistic tampering", () => {
  const episode = normalizeCurateEpisode(inputEpisode());
  const episodeTamper = structuredClone(episode);
  episodeTamper.steps[0].observation.features["joint.position.0"] = 999;
  assert.equal(verifyCurateEpisode(episodeTamper).ok, false);

  const clearance = clearCurateEpisode(episode);
  const clearanceTamper = structuredClone(clearance);
  clearanceTamper.causal.causalExperienceUnits = 1;
  assert.equal(verifyCurateClearance(clearanceTamper).ok, false);

  const selfAddressedLie = structuredClone(clearance);
  selfAddressedLie.drift.metrics = [{
    feature: "invented", baselineN: 1, currentN: 1, baselineMean: 0,
    currentMean: 0, absoluteMeanShift: 0, normalizedMeanShift: 0,
  }];
  assert.equal(verifyCurateClearance(selfAddressedLie,
    { episode, history: [] }).ok, false);
});

test("domain-separated Merkle checkpoints bind tree size, index and every clearance", () => {
  const clearances = ["1", "5", "9"].map((id, index) => clearCurateEpisode(
    normalizeCurateEpisode(inputEpisode({
      id, object: String(index + 2), values: [index, index + 1],
      commitments: [H(String(index + 3)), H(String(index + 6))],
    })),
  ));
  const checkpoint = buildCurateCheckpoint(clearances, { checkpointId: "droid-tiny-v1" });
  assert.equal(verifyCurateCheckpoint(checkpoint, { clearances }).recordsVerified, true);
  assert.equal(checkpoint.treeSize, 3);
  assert.equal(checkpoint.instrumentHash, clearances[0].instrumentHash);
  assert.equal(checkpoint.composition.quarantined, 3);
  assert.equal(checkpoint.causalExperienceUnits, 0);
  assert.equal(checkpoint.useBoundary.authority, "none");

  for (const clearance of clearances) {
    const proof = createCurateInclusionProof(clearances, clearance.clearanceHash, checkpoint);
    const verified = verifyCurateInclusionProof(proof, { checkpoint, clearance });
    assert.equal(verified.ok, true);
    assert.equal(verified.clearanceHash, clearance.clearanceHash);
    assert.ok(proof.leafIndex >= 0 && proof.leafIndex < checkpoint.treeSize);
  }

  const proof = createCurateInclusionProof(clearances, clearances[0].clearanceHash, checkpoint);
  const tampered = structuredClone(proof);
  tampered.treeSize = 4;
  assert.equal(verifyCurateInclusionProof(tampered, { checkpoint }).ok, false);

  const wrongCheckpoint = structuredClone(checkpoint);
  wrongCheckpoint.merkleRoot = H("f");
  assert.equal(verifyCurateCheckpoint(wrongCheckpoint).ok, false);
  assert.equal(verifyCurateInclusionProof(proof, { checkpoint: wrongCheckpoint }).ok, false);
});

test("empty checkpoints verify, while duplicate clearance credit is refused", () => {
  const empty = buildCurateCheckpoint([], { checkpointId: "empty-v1" });
  assert.equal(empty.treeSize, 0);
  assert.equal(verifyCurateCheckpoint(empty, { clearances: [] }).ok, true);

  const clearance = clearCurateEpisode(normalizeCurateEpisode(inputEpisode()));
  assert.throws(() => buildCurateCheckpoint([clearance, clearance]),
    /CURATE_CHECKPOINT_DUPLICATE_CLEARANCE/);
  const sameEpisodeDifferentPolicy = clearCurateEpisode(
    normalizeCurateEpisode(inputEpisode()), { driftThreshold: 0.6 });
  assert.notEqual(clearance.clearanceHash, sameEpisodeDifferentPolicy.clearanceHash);
  assert.throws(() => buildCurateCheckpoint([clearance, sameEpisodeDifferentPolicy]),
    /CURATE_CHECKPOINT_DUPLICATE_SOURCE_EPISODE/);

  const differentInstrumentInput = inputEpisode({ id: "5", object: "6" });
  differentInstrumentInput.instrument.extractorImplementationHash = H("0");
  const differentInstrumentEpisode = normalizeCurateEpisode(differentInstrumentInput);
  const differentInstrumentClearance = clearCurateEpisode(differentInstrumentEpisode);
  assert.throws(() => buildCurateCheckpoint([clearance, differentInstrumentClearance]),
    /CURATE_CHECKPOINT_MIXED_INSTRUMENTS/);
  assert.throws(() => clearCurateEpisode(differentInstrumentEpisode,
    { history: [normalizeCurateEpisode(inputEpisode())] }),
  /CURATE_HISTORY_INSTRUMENT_MISMATCH/);
});
