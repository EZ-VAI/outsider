import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  DEVICE_SOURCE_CLASSES,
  DEVICE_STREAM_PHYSICS_SCHEMAS,
  DEVICE_TIMESTAMP_STATUS,
  DeviceStreamAdapterRegistry,
  buildDeviceStreamPhysicsFrontierReport,
  createDevicePlatformParameterManifest,
  createDeviceSourceAdapterDescriptor,
  createImmutableDeviceSourceManifest,
  futureDeviceAdapterContract,
  replayDroid100RetrospectiveDeviceEvidence,
  replayFutureDeviceFormat,
  verifyDevicePlatformParameterManifest,
} from "../src/outsider-device-stream-physics-frontier.js";
import { createReadinessGapLedger } from "../src/outsider-readiness-gap-ledger.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function platform(overrides = {}) {
  const input = {
    platformId: "fixture-arm",
    platformClass: "robot-manipulator",
    manifestVersion: "1.0.0",
    coordinateFrames: [
      { frameId: "base", parentFrameId: null, translationUnit: "m", rotationUnit: "rad",
        transformHash: H("base-transform") },
      { frameId: "camera", parentFrameId: "base", translationUnit: "m", rotationUnit: "rad",
        transformHash: H("camera-transform") },
    ],
    joints: [
      { jointId: "joint-a", coordinateFrameId: "base", positionUnit: "rad",
        velocityUnit: "rad/s", effortUnit: "N*m", lowerPosition: -2,
        upperPosition: 2, maximumVelocity: 4 },
      { jointId: "joint-b", coordinateFrameId: "base", positionUnit: "rad",
        velocityUnit: "rad/s", effortUnit: "N*m", lowerPosition: -3,
        upperPosition: 3, maximumVelocity: 5 },
    ],
    workspace: { coordinateFrameId: "base", linearUnit: "m", bounds: {
      x: { minimum: -1, maximum: 1 }, y: { minimum: -1, maximum: 1 },
      z: { minimum: 0, maximum: 2 },
    } },
    control: { rateHz: 10, expectedPeriodNs: "100000000", periodToleranceNs: "1000000" },
    sensors: [
      { sensorId: "camera-rgb", sourceChannel: "CAMERA_RGB", modality: "RGB_IMAGE",
        coordinateFrameId: "camera", measurementUnit: "pixel", required: true,
        nominalRateHz: 10, maxSkewNs: "2000000", calibrationHash: H("camera-calibration") },
      { sensorId: "joint-state", sourceChannel: "JOINT_STATE", modality: "JOINT_STATE",
        coordinateFrameId: "base", measurementUnit: "rad", required: true,
        nominalRateHz: 10, maxSkewNs: "5000000", calibrationHash: H("joint-calibration") },
    ],
    fusion: { referenceSensorId: "joint-state", maxInterSensorSkewNs: "2000000",
      maxActionObservationSkewNs: "2000000" },
    parameterAuthority: { class: "LOCAL_CONFORMANCE_DECLARATION",
      sourceCommitmentHashes: [H("fixture-parameter-source")],
      physicsTruthExternallyVerified: false },
  };
  return createDevicePlatformParameterManifest({ ...input, ...overrides });
}

function fixtureAdapter({ objects, sourceManifest, platformManifest }) {
  const specification = JSON.parse(objects[0].bytes.toString("utf8"));
  const timestamps = specification.timestamps ?? ["1000000000", "1100000000", "1200000000"];
  const sequences = specification.sequences ?? [0, 1, 2];
  const episodes = [{ episodeIdHash: H("fixture-episode"), frames: timestamps.map((timestampNs, index) => {
    const pairId = H(`pair-${index}`);
    const baseObservationTimestamp = specification.sensorSkew && index === 1
      ? String(BigInt(timestampNs) + 6_000_000n) : timestampNs;
    const physics = { jointPositions: [
      { jointId: "joint-a", value: specification.boundsViolation && index === 1
        ? 9 : 0.1 + index * 0.1 },
      { jointId: "joint-b", value: -0.1 - index * 0.1 },
    ], workspacePosition: { coordinateFrameId: "base", x: 0.1, y: 0.2, z: 0.5 } };
    const observations = platformManifest.sensors.map((sensor, sensorIndex) => {
      const missing = specification.missingCamera === true && index === 1
        && sensor.sourceChannel === "CAMERA_RGB";
      const observationTimestamp = specification.fusionSkew && index === 1
        ? String(BigInt(timestampNs) + (sensorIndex === 0 ? 1_500_000n : -1_500_000n))
        : baseObservationTimestamp;
      return { sensorId: sensor.sensorId, modality: sensor.modality,
        frameId: specification.duplicateFrame && index === 1
          ? `frame-0-${sensorIndex}` : `frame-${index}-${sensorIndex}`,
        pairId: specification.badPair && sensorIndex === 0 ? H("attacker-pair") : pairId,
        timestampNs: missing ? null : observationTimestamp,
        payloadHash: missing ? null : H(`payload-${index}-${sensorIndex}`), missing,
        missingReason: missing ? "CAMERA_FRAME_ABSENT_IN_SOURCE" : null };
    });
    const frame = { sequence: sequences[index], timestampNs, pairId,
      action: { pairId, timestampNs, commandHash: H(`command-${index}`),
        coordinateFrameId: "base", physicsTarget: physics },
      observations, physicsObservation: physics,
      sourceNativeOutcome: specification.consequence
        ? { commitmentHash: H(`outcome-${index}`), semantics: "INDEPENDENT_CONSEQUENCE" }
        : null };
    return frame;
  }) }];
  const output = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
    sourceManifestHash: sourceManifest.sourceManifestHash,
    adapterDescriptorHash: specification.adapterDescriptorHashOverride
      ?? specification.expectedDescriptorHash,
    platformParameterManifestHash: platformManifest.platformParameterManifestHash,
    acquisition: { mode: "RETROSPECTIVE_OBJECT_REPLAY", liveStreamObserved: false,
      sourceTimestampStatus: DEVICE_TIMESTAMP_STATUS.present }, episodes,
  };
  if (specification.callerVerified) output.verified = true;
  return output;
}

const FIXTURE_SCHEMA = Object.freeze({
  type: "object",
  properties: { timestamps: { type: "array", items: { type: "decimal-string" } } },
});

function registeredFixture(specification = {}) {
  const descriptor = createDeviceSourceAdapterDescriptor({
    adapterId: "fixture-json-adapter", adapterVersion: "1.0.0", formatFamily: "FIXTURE_JSON",
    adapter: fixtureAdapter, sourceSchema: FIXTURE_SCHEMA,
  });
  const value = { ...specification, expectedDescriptorHash: descriptor.descriptorHash };
  const sourceObjects = [{ objectId: "capture.json", immutableVersion: "generation-1",
    bytes: Buffer.from(JSON.stringify(value)) }];
  const sourceManifest = createImmutableDeviceSourceManifest({ sourceId: "fixture-capture",
    sourceClass: DEVICE_SOURCE_CLASSES.conformanceFixture, formatFamily: "FIXTURE_JSON",
    objects: sourceObjects });
  const registry = new DeviceStreamAdapterRegistry();
  registry.register({ descriptor, adapter: fixtureAdapter, sourceSchema: FIXTURE_SCHEMA });
  return { descriptor, sourceObjects, sourceManifest, registry, platformManifest: platform() };
}

function droidPlatform() {
  return createDevicePlatformParameterManifest({
    platformId: "droid100-retrospective-analysis-platform",
    platformClass: "robot-manipulator",
    manifestVersion: "local-conformance-1.0.0",
    coordinateFrames: [
      { frameId: "robot-base", parentFrameId: null, translationUnit: "m", rotationUnit: "rad",
        transformHash: H("droid-base-local-declaration") },
      { frameId: "exterior-1", parentFrameId: "robot-base", translationUnit: "m",
        rotationUnit: "rad", transformHash: H("droid-exterior-1-local-declaration") },
      { frameId: "exterior-2", parentFrameId: "robot-base", translationUnit: "m",
        rotationUnit: "rad", transformHash: H("droid-exterior-2-local-declaration") },
      { frameId: "wrist", parentFrameId: "robot-base", translationUnit: "m",
        rotationUnit: "rad", transformHash: H("droid-wrist-local-declaration") },
    ],
    joints: Array.from({ length: 7 }, (_, index) => ({ jointId: `droid-joint-${index}`,
      coordinateFrameId: "robot-base", positionUnit: "rad", velocityUnit: "rad/s",
      effortUnit: "N*m", lowerPosition: -7, upperPosition: 7, maximumVelocity: 20 })),
    workspace: { coordinateFrameId: "robot-base", linearUnit: "m", bounds: {
      x: { minimum: -2, maximum: 2 }, y: { minimum: -2, maximum: 2 },
      z: { minimum: -2, maximum: 2 },
    } },
    control: { rateHz: 15, expectedPeriodNs: "66666667", periodToleranceNs: "1000000" },
    sensors: [
      ["droid-proprioception", "DROID_PROPRIOCEPTION", "PROPRIOCEPTION", "robot-base", "rad"],
      ["droid-exterior-1", "DROID_EXTERIOR_IMAGE_1_LEFT", "RGB_IMAGE", "exterior-1", "pixel"],
      ["droid-exterior-2", "DROID_EXTERIOR_IMAGE_2_LEFT", "RGB_IMAGE", "exterior-2", "pixel"],
      ["droid-wrist", "DROID_WRIST_IMAGE_LEFT", "RGB_IMAGE", "wrist", "pixel"],
    ].map(([sensorId, sourceChannel, modality, coordinateFrameId, measurementUnit]) => ({
      sensorId, sourceChannel, modality, coordinateFrameId, measurementUnit, required: true,
      nominalRateHz: 15, maxSkewNs: "5000000", calibrationHash: H(`${sensorId}-local-calibration`),
    })),
    fusion: { referenceSensorId: "droid-proprioception", maxInterSensorSkewNs: "5000000",
      maxActionObservationSkewNs: "5000000" },
    parameterAuthority: { class: "RETROSPECTIVE_LOCAL_ANALYSIS_DECLARATION",
      sourceCommitmentHashes: [H("droid-platform-parameter-local-declaration")],
      physicsTruthExternallyVerified: false },
  });
}

test("registered in-process adapter replays exact bytes and emits a zero-authority report", () => {
  const fixture = registeredFixture();
  const receipt = fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
    platformManifest: fixture.platformManifest });
  const report = buildDeviceStreamPhysicsFrontierReport({ replayReceipt: receipt });
  assert.equal(receipt.verificationLevel, "FULL_SOURCE_REPLAYED");
  assert.equal(report.localInterface.status, "SATISFIED_INTERNAL");
  assert.equal(report.replay.summary.frameCount, 3);
  assert.equal(report.replay.summary.timing.status, "PASSED");
  assert.equal(report.replay.summary.timing.checkedTransitions, 2);
  assert.equal(report.replay.summary.missingnessLedger.every((row) => row.missingFrames === 0), true);
  assert.equal(report.evidenceBoundary.realProspectiveExecutions, 0);
  assert.equal(report.evidenceBoundary.causalExperienceUnits, 0);
  assert.equal(report.evidenceBoundary.independentOutcomes, 0);
  assert.equal(report.evidenceBoundary.physicsTruthExternallyVerified, false);
  assert.deepEqual(report.useBoundary.permits,
    { TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false, PRODUCTION: false });
});

test("platform manifest rejects missing units, coordinate frames, limits, and external truth claims", () => {
  const valid = platform();
  for (const [mutate, pattern] of [
    [(value) => { delete value.joints[0].positionUnit; }, /JOINT_STRUCTURE_INVALID/],
    [(value) => { value.sensors[0].coordinateFrameId = "missing-frame"; }, /SENSOR_FRAME_UNBOUND/],
    [(value) => { delete value.workspace.bounds.z; }, /WORKSPACE_BOUNDS_INVALID/],
    [(value) => { delete value.joints[0].upperPosition; }, /JOINT_STRUCTURE_INVALID/],
    [(value) => { delete value.sensors[0].calibrationHash; }, /SENSOR_STRUCTURE_INVALID/],
    [(value) => { value.parameterAuthority.physicsTruthExternallyVerified = true; },
      /EXTERNAL_PHYSICS_TRUTH_ATTESTATION_NOT_IMPLEMENTED/],
  ]) {
    const attacked = structuredClone(valid);
    delete attacked.schema;
    delete attacked.platformParameterManifestHash;
    mutate(attacked);
    assert.throws(() => createDevicePlatformParameterManifest({
      platformId: attacked.platformId, platformClass: attacked.platformClass,
      manifestVersion: attacked.manifestVersion, coordinateFrames: attacked.coordinateFrames,
      joints: attacked.joints, workspace: attacked.workspace, control: attacked.control,
      sensors: attacked.sensors, fusion: attacked.fusion,
      parameterAuthority: attacked.parameterAuthority,
    }), pattern);
  }
  assert.equal(verifyDevicePlatformParameterManifest(valid).ok, true);
});

test("timestamp reversal and control-period gap fail closed", () => {
  for (const [timestamps, pattern] of [
    [["1000000000", "1100000000", "1050000000"], /TIMESTAMP_NOT_MONOTONIC/],
    [["1000000000", "1300000000", "1400000000"], /TIMESTAMP_CONTROL_GAP/],
  ]) {
    const fixture = registeredFixture({ timestamps });
    assert.throws(() => fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
      sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
      platformManifest: fixture.platformManifest }), pattern);
  }
});

test("sequence gaps, duplicate sensor frames, and broken action-observation pairs fail closed", () => {
  for (const [specification, pattern] of [
    [{ sequences: [0, 2, 3] }, /FRAME_SEQUENCE_GAP/],
    [{ duplicateFrame: true }, /SENSOR_FRAME_DUPLICATE/],
    [{ badPair: true }, /SENSOR_OBSERVATION_BINDING_INVALID/],
    [{ sensorSkew: true }, /SENSOR_TIMESTAMP_SKEW_EXCEEDED/],
    [{ fusionSkew: true }, /CROSS_SENSOR_FUSION_SKEW_EXCEEDED/],
    [{ boundsViolation: true }, /JOINT_LIMIT_EXCEEDED/],
  ]) {
    const fixture = registeredFixture(specification);
    assert.throws(() => fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
      sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
      platformManifest: fixture.platformManifest }), pattern);
  }
});

test("explicit absent sensor frames survive as a per-modality missingness ledger", () => {
  const fixture = registeredFixture({ missingCamera: true });
  const receipt = fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
    platformManifest: fixture.platformManifest });
  const report = buildDeviceStreamPhysicsFrontierReport({ replayReceipt: receipt });
  const camera = report.replay.summary.missingnessLedger.find(
    (row) => row.sensorId === "camera-rgb",
  );
  assert.equal(camera.modality, "RGB_IMAGE");
  assert.equal(camera.expectedFrames, 3);
  assert.equal(camera.observedFrames, 2);
  assert.equal(camera.missingFrames, 1);
  assert.deepEqual(camera.missingSequenceRanges[0].ranges, [{ first: 1, last: 1 }]);
});

test("immutable source object changes are detected before adapter execution", () => {
  const fixture = registeredFixture();
  const tampered = fixture.sourceObjects.map((item) => ({ ...item,
    bytes: Buffer.concat([item.bytes, Buffer.from(" ")]) }));
  assert.throws(() => fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: tampered,
    platformManifest: fixture.platformManifest }), /FULL_SOURCE_OBJECT_REPLAY_MISMATCH/);
});

test("adapter implementation/schema hash resealing cannot substitute another entrypoint", () => {
  const fixture = registeredFixture();
  function attackerAdapter() { return { verified: true }; }
  const attackerDescriptor = createDeviceSourceAdapterDescriptor({
    adapterId: fixture.descriptor.adapterId, adapterVersion: "1.0.0", formatFamily: "FIXTURE_JSON",
    adapter: attackerAdapter, sourceSchema: FIXTURE_SCHEMA,
  });
  const registry = new DeviceStreamAdapterRegistry();
  assert.throws(() => registry.register({ descriptor: attackerDescriptor,
    adapter: fixtureAdapter, sourceSchema: FIXTURE_SCHEMA }),
  /ADAPTER_DESCRIPTOR_IMPLEMENTATION_OR_SCHEMA_MISMATCH/);
});

test("caller verified booleans, cloned receipts, and sensor-hash reseals are not full-source proof", () => {
  const fixture = registeredFixture({ callerVerified: true });
  assert.throws(() => fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
    platformManifest: fixture.platformManifest }), /ADAPTER_OUTPUT_STRUCTURE_INVALID/);
  assert.throws(() => buildDeviceStreamPhysicsFrontierReport({
    replayReceipt: { verified: true, verificationLevel: "FULL_SOURCE_REPLAYED" },
  }), /FULL_SOURCE_PROVENANCE_REQUIRED/);

  const valid = registeredFixture();
  const receipt = valid.registry.replay({ adapterId: valid.descriptor.adapterId,
    sourceManifest: valid.sourceManifest, sourceObjects: valid.sourceObjects,
    platformManifest: valid.platformManifest });
  const resealedClone = structuredClone(receipt);
  resealedClone.adapterOutputHash = H("attacker-sensor-output");
  resealedClone.replayReceiptHash = H("attacker-resealed-receipt");
  assert.throws(() => buildDeviceStreamPhysicsFrontierReport({ replayReceipt: resealedClone }),
    /FULL_SOURCE_PROVENANCE_REQUIRED/);
});

test("source-native reward cannot be promoted to an independent consequence", () => {
  const fixture = registeredFixture({ consequence: true });
  assert.throws(() => fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
    platformManifest: fixture.platformManifest }), /SOURCE_NATIVE_OUTCOME_SEMANTICS_INVALID/);
});

test("existing two-episode DROID source is real physical retrospective conformance, not live authority", () => {
  const receipt = replayDroid100RetrospectiveDeviceEvidence({
    artifactDirectory: "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay",
    sourceRoot: "artifacts/curate-droid100-20260819/source",
    platformManifest: droidPlatform(),
  });
  const report = buildDeviceStreamPhysicsFrontierReport({ replayReceipt: receipt });
  assert.equal(receipt.replayKind, "DROID100_EXISTING_FULL_SOURCE_VERIFIER");
  assert.equal(receipt.verificationLevel, "FULL_SOURCE_REPRODUCED");
  assert.equal(report.replay.summary.episodeCount, 2);
  assert.equal(report.replay.summary.frameCount, 404);
  assert.equal(report.replay.summary.sourceNativeOutcomeRecords, 404);
  assert.equal(report.replay.summary.timing.status,
    "NOT_CHECKABLE_SOURCE_TIMESTAMPS_ABSENT");
  assert.equal(report.evidenceBoundary.empiricalReality, "REAL_PHYSICAL");
  assert.equal(report.evidenceBoundary.temporalRelation, "RETROSPECTIVE");
  assert.equal(report.evidenceBoundary.realProspectiveExecutions, 0);
  assert.equal(report.evidenceBoundary.independentOutcomes, 0);
  assert.equal(report.evidenceBoundary.sourceNativeOutcomesAreConsequences, false);
  assert.equal(report.evidenceBoundary.physicsTruthExternallyVerified, false);
  assert.equal(report.useBoundary.automaticTraining, false);
  assert.equal(report.useBoundary.pricingEligible, false);
  assert.equal(report.useBoundary.productionEligible, false);
  assert.doesNotMatch(JSON.stringify(report), /"reward"\s*:/);
});

test("ROSBAG2 and MCAP expose future contracts without pretending a parser or live stream exists", () => {
  for (const format of ["rosbag2", "MCAP"]) {
    const contract = futureDeviceAdapterContract(format);
    assert.equal(contract.parserStatus, "PARSER_NOT_IMPLEMENTED");
    assert.equal(contract.liveStreamStatus, "NO_LIVE_STREAM");
    assert.equal(contract.fullSourceClaimAvailable, false);
    assert.throws(() => replayFutureDeviceFormat({ formatFamily: format }), /NO_LIVE_STREAM/);
    assert.throws(() => replayFutureDeviceFormat({ formatFamily: format, liveStream: {} }),
      /PARSER_NOT_IMPLEMENTED/);
  }
});

test("device readiness recommendations reference real ledger IDs and exclude future parsers", () => {
  const fixture = registeredFixture();
  const receipt = fixture.registry.replay({ adapterId: fixture.descriptor.adapterId,
    sourceManifest: fixture.sourceManifest, sourceObjects: fixture.sourceObjects,
    platformManifest: fixture.platformManifest });
  const report = buildDeviceStreamPhysicsFrontierReport({ replayReceipt: receipt });
  const readiness = createReadinessGapLedger();
  const knownIds = new Set(readiness.gaps.map((gap) => gap.gapId));
  for (const gapId of [...report.readinessRecommendation.markSatisfiedInternal,
    ...report.readinessRecommendation.keepBlocked]) assert.equal(knownIds.has(gapId), true, gapId);
  assert.equal(report.localInterface.gapId, "S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER");
  assert.equal(report.localInterface.satisfiedScope,
    "FORMAT_NEUTRAL_CONTRACT_AND_DROID_RETROSPECTIVE_ADAPTER");
  assert.equal(report.localInterface.futureFormatAdaptersIncludedInSatisfiedScope, false);
  assert.deepEqual(report.localInterface.unimplementedFutureFormatAdapters,
    ["MCAP", "ROSBAG2"]);
});

test("CLI prints the explicit future adapter contract", () => {
  const result = spawnSync(process.execPath, [
    "scripts/stage15-device-stream-physics-frontier.mjs", "--future-contract", "mcap",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const contract = JSON.parse(result.stdout);
  assert.equal(contract.formatFamily, "MCAP");
  assert.equal(contract.parserStatus, "PARSER_NOT_IMPLEMENTED");
  assert.equal(contract.liveStreamStatus, "NO_LIVE_STREAM");
});
