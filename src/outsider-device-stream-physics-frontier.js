/*
 * Stage 1.5 real-device stream / physics adapter frontier.
 *
 * This module closes a local interface gap.  It can replay immutable source
 * objects through an adapter registered in this process, or reopen the exact
 * DROID 100 pilot bytes through the existing full-source verifier.  Neither
 * path turns a local declaration into live, prospective, independently
 * adjudicated, or externally verified physics evidence.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { DROID100_RLDS_IMPLEMENTATION_HASH } from "./outsider-droid100-rlds.js";
import { verifyDroid100PilotArtifactDirectory } from
  "./outsider-droid100-pilot-artifacts.js";

export const DEVICE_STREAM_PHYSICS_SCHEMAS = Object.freeze({
  adapterDescriptor: "outsider/device-source-adapter-descriptor/v1",
  sourceManifest: "outsider/immutable-device-source-object-manifest/v1",
  platformManifest: "outsider/device-platform-parameter-manifest/v1",
  adapterOutput: "outsider/device-stream-adapter-output/v1",
  replayReceipt: "outsider/device-stream-physics-replay-receipt/v1",
  report: "outsider/device-stream-physics-frontier-report/v1",
  futureContract: "outsider/future-device-source-adapter-contract/v1",
});

export const DEVICE_SOURCE_CLASSES = Object.freeze({
  realPhysicalRetrospective: "REAL_PHYSICAL_RETROSPECTIVE",
  realPhysicalProspective: "REAL_PHYSICAL_PROSPECTIVE_DECLARATION_ONLY",
  conformanceFixture: "CONFORMANCE_FIXTURE",
});

export const DEVICE_TIMESTAMP_STATUS = Object.freeze({
  present: "SOURCE_TIMESTAMPS_PRESENT",
  absent: "SOURCE_TIMESTAMPS_ABSENT_RETROSPECTIVE_ONLY",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,191}$/;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9._:+/*^%-]{0,63}$/;
const MAX_SOURCE_OBJECTS = 4096;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const MAX_EPISODES = 100_000;
const MAX_FRAMES = 2_000_000;
const TRUSTED_REPLAY_RECEIPTS = new WeakSet();

const ADAPTER_OUTPUT_CONTRACT = Object.freeze({
  schema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
  acquisitionFields: ["mode", "liveStreamObserved", "sourceTimestampStatus"],
  episodeFields: ["episodeIdHash", "frames"],
  frameFields: ["sequence", "timestampNs", "pairId", "action", "observations",
    "physicsObservation", "sourceNativeOutcome"],
  authorityRule: "source-native outcomes are commitments, never independent consequences",
});

function digest(domain, value) {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? Buffer.from(value) : Buffer.from(typeof value === "string"
      ? value : canonicalizeStrict(value), "utf8");
  return `sha256:${createHash("sha256").update(`${domain}\0`).update(bytes).digest("hex")}`;
}

export const DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH = digest(
  "outsider/device-stream-adapter-output-contract/v1", ADAPTER_OUTPUT_CONTRACT,
);

function fail(code, detail = null) {
  throw new Error(detail == null ? `DEVICE_STREAM_PHYSICS_${code}`
    : `DEVICE_STREAM_PHYSICS_${code}:${detail}`);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function unit(value, code) {
  if (typeof value !== "string" || !UNIT.test(value)) fail(`${code}_INVALID`);
  return value;
}

function finite(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${code}_INVALID`);
  return value;
}

function positive(value, code) {
  const output = finite(value, code);
  if (output <= 0) fail(`${code}_INVALID`);
  return output;
}

function integer(value, code, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function decimal(value, code) {
  if (typeof value !== "string" || value.length > 32 || !DECIMAL.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function unique(items, key, code) {
  if (new Set(items.map((item) => item[key])).size !== items.length) fail(`${code}_DUPLICATE`);
}

function adapterFunctionSource(adapter) {
  if (typeof adapter !== "function") fail("ADAPTER_FUNCTION_REQUIRED");
  return Function.prototype.toString.call(adapter);
}

function fixedCapabilities({ liveStream = false, sourceTimestamps = true } = {}) {
  if (typeof liveStream !== "boolean" || typeof sourceTimestamps !== "boolean") {
    fail("ADAPTER_CAPABILITIES_INVALID");
  }
  return {
    replayFromImmutableObjects: true,
    liveStream,
    sourceTimestamps,
    actionObservationPairing: true,
    sensorMissingness: true,
    platformParameterChecks: true,
    crossSensorFusionChecks: true,
  };
}

function sealDescriptor(body) {
  return deepFreeze({ ...body, descriptorHash: digest(body.schema, body) });
}

/**
 * Build a descriptor whose implementation hash binds the actual JS entrypoint
 * source and whose schema hash binds the source schema supplied at registration.
 */
export function createDeviceSourceAdapterDescriptor({ adapterId, adapterVersion,
  formatFamily, adapter, sourceSchema, liveStream = false, sourceTimestamps = true }) {
  if (!plain(sourceSchema)) fail("ADAPTER_SOURCE_SCHEMA_INVALID");
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor,
    descriptorKind: "REGISTERED_IN_PROCESS_ADAPTER",
    adapterId: token(adapterId, "ADAPTER_ID"),
    adapterVersion: token(adapterVersion, "ADAPTER_VERSION"),
    formatFamily: token(formatFamily, "ADAPTER_FORMAT_FAMILY"),
    implementationHash: digest("outsider/device-adapter-entrypoint/v1",
      adapterFunctionSource(adapter)),
    sourceSchemaHash: digest("outsider/device-adapter-source-schema/v1", sourceSchema),
    outputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
    capabilities: fixedCapabilities({ liveStream, sourceTimestamps }),
    trustBoundary: {
      registrationScope: "CURRENT_PROCESS_ONLY",
      callerVerifiedBooleanAccepted: false,
      provesPhysicalTruth: false,
      provesLiveCapture: false,
    },
  };
  return sealDescriptor(body);
}

function verifyDescriptor(descriptor) {
  if (!exactKeys(descriptor, ["schema", "descriptorKind", "adapterId", "adapterVersion",
    "formatFamily", "implementationHash", "sourceSchemaHash", "outputSchemaHash",
    "capabilities", "trustBoundary", "descriptorHash"])
    || descriptor.schema !== DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor
    || !HASH.test(String(descriptor.descriptorHash ?? ""))) return false;
  const { descriptorHash, ...body } = descriptor;
  return digest(body.schema, body) === descriptorHash;
}

function normalizeSourceClass(value) {
  if (!Object.values(DEVICE_SOURCE_CLASSES).includes(value)) fail("SOURCE_CLASS_INVALID");
  return value;
}

function normalizeSourceObjectInput(value) {
  if (!exactKeys(value, ["objectId", "immutableVersion", "bytes"])) {
    fail("SOURCE_OBJECT_STRUCTURE_INVALID");
  }
  const bytes = value.bytes;
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail("SOURCE_OBJECT_BYTES_REQUIRED");
  const copied = Buffer.from(bytes);
  if (copied.length === 0 || copied.length > MAX_SOURCE_BYTES) fail("SOURCE_OBJECT_SIZE_INVALID");
  return {
    objectId: token(value.objectId, "SOURCE_OBJECT_ID"),
    immutableVersion: token(value.immutableVersion, "SOURCE_OBJECT_IMMUTABLE_VERSION"),
    byteLength: copied.length,
    sha256: digest("outsider/device-source-object-bytes/v1", copied),
  };
}

/** Build a byte-derived immutable object manifest; no caller checksum is trusted. */
export function createImmutableDeviceSourceManifest({ sourceId, sourceClass,
  formatFamily, objects }) {
  if (!Array.isArray(objects) || objects.length === 0 || objects.length > MAX_SOURCE_OBJECTS) {
    fail("SOURCE_OBJECTS_INVALID");
  }
  const normalized = objects.map(normalizeSourceObjectInput)
    .sort((left, right) => left.objectId.localeCompare(right.objectId));
  unique(normalized, "objectId", "SOURCE_OBJECT_ID");
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.sourceManifest,
    sourceId: token(sourceId, "SOURCE_ID"),
    sourceClass: normalizeSourceClass(sourceClass),
    formatFamily: token(formatFamily, "SOURCE_FORMAT_FAMILY"),
    objects: normalized,
    integrity: {
      objectCount: normalized.length,
      totalBytes: normalized.reduce((sum, object) => sum + object.byteLength, 0),
      completenessRule: "EXACT_OBJECT_ID_VERSION_LENGTH_AND_DOMAIN_SEPARATED_SHA256",
      immutableSnapshot: true,
    },
  };
  return deepFreeze({ ...body, sourceManifestHash: digest(body.schema, body) });
}

function verifySourceManifest(manifest) {
  try {
    if (!exactKeys(manifest, ["schema", "sourceId", "sourceClass", "formatFamily", "objects",
      "integrity", "sourceManifestHash"]) || !Array.isArray(manifest.objects)) return false;
    const shadowObjects = manifest.objects.map((object) => {
      if (!exactKeys(object, ["objectId", "immutableVersion", "byteLength", "sha256"])) {
        fail("SOURCE_MANIFEST_OBJECT_INVALID");
      }
      return { objectId: token(object.objectId, "SOURCE_OBJECT_ID"),
        immutableVersion: token(object.immutableVersion, "SOURCE_OBJECT_IMMUTABLE_VERSION"),
        byteLength: integer(object.byteLength, "SOURCE_OBJECT_BYTE_LENGTH", { minimum: 1,
          maximum: MAX_SOURCE_BYTES }), sha256: hash(object.sha256, "SOURCE_OBJECT_SHA256") };
    }).sort((left, right) => left.objectId.localeCompare(right.objectId));
    unique(shadowObjects, "objectId", "SOURCE_OBJECT_ID");
    if (!same(shadowObjects, manifest.objects)) return false;
    if (!exactKeys(manifest.integrity, ["objectCount", "totalBytes", "completenessRule",
      "immutableSnapshot"]) || manifest.integrity.objectCount !== shadowObjects.length
      || manifest.integrity.totalBytes !== shadowObjects.reduce((sum, item) => sum + item.byteLength, 0)
      || manifest.integrity.completenessRule
        !== "EXACT_OBJECT_ID_VERSION_LENGTH_AND_DOMAIN_SEPARATED_SHA256"
      || manifest.integrity.immutableSnapshot !== true) return false;
    const { sourceManifestHash, ...body } = manifest;
    normalizeSourceClass(body.sourceClass);
    token(body.sourceId, "SOURCE_ID");
    token(body.formatFamily, "SOURCE_FORMAT_FAMILY");
    return body.schema === DEVICE_STREAM_PHYSICS_SCHEMAS.sourceManifest
      && digest(body.schema, body) === sourceManifestHash;
  } catch { return false; }
}

function verifyExactSourceObjects(manifest, objects) {
  if (!verifySourceManifest(manifest)) fail("SOURCE_MANIFEST_INVALID");
  const rebuilt = createImmutableDeviceSourceManifest({
    sourceId: manifest.sourceId, sourceClass: manifest.sourceClass,
    formatFamily: manifest.formatFamily, objects,
  });
  if (!same(rebuilt, manifest)) fail("FULL_SOURCE_OBJECT_REPLAY_MISMATCH");
}

function normalizeCoordinateFrames(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 256) {
    fail("PLATFORM_COORDINATE_FRAMES_INVALID");
  }
  const output = values.map((value) => {
    if (!exactKeys(value, ["frameId", "parentFrameId", "translationUnit", "rotationUnit",
      "transformHash"])) fail("PLATFORM_COORDINATE_FRAME_STRUCTURE_INVALID");
    return { frameId: token(value.frameId, "PLATFORM_COORDINATE_FRAME_ID"),
      parentFrameId: value.parentFrameId === null ? null
        : token(value.parentFrameId, "PLATFORM_PARENT_COORDINATE_FRAME_ID"),
      translationUnit: unit(value.translationUnit, "PLATFORM_TRANSLATION_UNIT"),
      rotationUnit: unit(value.rotationUnit, "PLATFORM_ROTATION_UNIT"),
      transformHash: hash(value.transformHash, "PLATFORM_TRANSFORM_HASH") };
  }).sort((left, right) => left.frameId.localeCompare(right.frameId));
  unique(output, "frameId", "PLATFORM_COORDINATE_FRAME_ID");
  const ids = new Set(output.map((item) => item.frameId));
  if (!output.some((item) => item.parentFrameId === null)) fail("PLATFORM_ROOT_FRAME_MISSING");
  for (const item of output) {
    if (item.parentFrameId === item.frameId || item.parentFrameId !== null
      && !ids.has(item.parentFrameId)) fail("PLATFORM_COORDINATE_FRAME_PARENT_INVALID", item.frameId);
    const visited = new Set([item.frameId]);
    let cursor = item;
    while (cursor.parentFrameId !== null) {
      if (visited.has(cursor.parentFrameId)) fail("PLATFORM_COORDINATE_FRAME_CYCLE", item.frameId);
      visited.add(cursor.parentFrameId);
      cursor = output.find((entry) => entry.frameId === cursor.parentFrameId);
    }
  }
  return output;
}

function normalizeJoints(values, frameIds) {
  if (!Array.isArray(values) || values.length > 256) fail("PLATFORM_JOINTS_INVALID");
  const output = values.map((value) => {
    if (!exactKeys(value, ["jointId", "coordinateFrameId", "positionUnit", "velocityUnit",
      "effortUnit", "lowerPosition", "upperPosition", "maximumVelocity"])) {
      fail("PLATFORM_JOINT_STRUCTURE_INVALID");
    }
    const lower = finite(value.lowerPosition, "PLATFORM_JOINT_LOWER_LIMIT");
    const upper = finite(value.upperPosition, "PLATFORM_JOINT_UPPER_LIMIT");
    if (lower >= upper) fail("PLATFORM_JOINT_LIMITS_INVALID", value.jointId);
    const coordinateFrameId = token(value.coordinateFrameId, "PLATFORM_JOINT_FRAME_ID");
    if (!frameIds.has(coordinateFrameId)) fail("PLATFORM_JOINT_FRAME_UNBOUND", coordinateFrameId);
    return { jointId: token(value.jointId, "PLATFORM_JOINT_ID"), coordinateFrameId,
      positionUnit: unit(value.positionUnit, "PLATFORM_JOINT_POSITION_UNIT"),
      velocityUnit: unit(value.velocityUnit, "PLATFORM_JOINT_VELOCITY_UNIT"),
      effortUnit: unit(value.effortUnit, "PLATFORM_JOINT_EFFORT_UNIT"),
      lowerPosition: lower, upperPosition: upper,
      maximumVelocity: positive(value.maximumVelocity, "PLATFORM_JOINT_MAXIMUM_VELOCITY") };
  }).sort((left, right) => left.jointId.localeCompare(right.jointId));
  unique(output, "jointId", "PLATFORM_JOINT_ID");
  return output;
}

function normalizeWorkspace(value, frameIds) {
  if (!exactKeys(value, ["coordinateFrameId", "linearUnit", "bounds"])) {
    fail("PLATFORM_WORKSPACE_STRUCTURE_INVALID");
  }
  const coordinateFrameId = token(value.coordinateFrameId, "PLATFORM_WORKSPACE_FRAME_ID");
  if (!frameIds.has(coordinateFrameId)) fail("PLATFORM_WORKSPACE_FRAME_UNBOUND");
  if (!exactKeys(value.bounds, ["x", "y", "z"])) fail("PLATFORM_WORKSPACE_BOUNDS_INVALID");
  const bounds = Object.fromEntries(["x", "y", "z"].map((axis) => {
    const bound = value.bounds[axis];
    if (!exactKeys(bound, ["minimum", "maximum"])) fail("PLATFORM_WORKSPACE_BOUND_INVALID", axis);
    const minimum = finite(bound.minimum, "PLATFORM_WORKSPACE_MINIMUM");
    const maximum = finite(bound.maximum, "PLATFORM_WORKSPACE_MAXIMUM");
    if (minimum >= maximum) fail("PLATFORM_WORKSPACE_LIMITS_INVALID", axis);
    return [axis, { minimum, maximum }];
  }));
  return { coordinateFrameId, linearUnit: unit(value.linearUnit, "PLATFORM_WORKSPACE_UNIT"),
    bounds };
}

function normalizeControl(value) {
  if (!exactKeys(value, ["rateHz", "expectedPeriodNs", "periodToleranceNs"])) {
    fail("PLATFORM_CONTROL_STRUCTURE_INVALID");
  }
  const rateHz = positive(value.rateHz, "PLATFORM_CONTROL_RATE");
  const expectedPeriodNs = decimal(value.expectedPeriodNs, "PLATFORM_EXPECTED_PERIOD_NS");
  const periodToleranceNs = decimal(value.periodToleranceNs, "PLATFORM_PERIOD_TOLERANCE_NS");
  const calculated = Math.round(1_000_000_000 / rateHz);
  if (BigInt(expectedPeriodNs) !== BigInt(calculated)) fail("PLATFORM_CONTROL_PERIOD_RATE_MISMATCH");
  if (BigInt(periodToleranceNs) >= BigInt(expectedPeriodNs)) {
    fail("PLATFORM_CONTROL_TOLERANCE_INVALID");
  }
  return { rateHz, expectedPeriodNs, periodToleranceNs };
}

function normalizeSensors(values, frameIds) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 512) {
    fail("PLATFORM_SENSORS_INVALID");
  }
  const output = values.map((value) => {
    if (!exactKeys(value, ["sensorId", "sourceChannel", "modality", "coordinateFrameId",
      "measurementUnit", "required", "nominalRateHz", "maxSkewNs", "calibrationHash"])) {
      fail("PLATFORM_SENSOR_STRUCTURE_INVALID");
    }
    const coordinateFrameId = token(value.coordinateFrameId, "PLATFORM_SENSOR_FRAME_ID");
    if (!frameIds.has(coordinateFrameId)) fail("PLATFORM_SENSOR_FRAME_UNBOUND", coordinateFrameId);
    if (typeof value.required !== "boolean") fail("PLATFORM_SENSOR_REQUIRED_INVALID");
    return { sensorId: token(value.sensorId, "PLATFORM_SENSOR_ID"),
      sourceChannel: token(value.sourceChannel, "PLATFORM_SENSOR_SOURCE_CHANNEL"),
      modality: token(value.modality, "PLATFORM_SENSOR_MODALITY"), coordinateFrameId,
      measurementUnit: unit(value.measurementUnit, "PLATFORM_SENSOR_MEASUREMENT_UNIT"),
      required: value.required, nominalRateHz: positive(value.nominalRateHz,
        "PLATFORM_SENSOR_NOMINAL_RATE"),
      maxSkewNs: decimal(value.maxSkewNs, "PLATFORM_SENSOR_MAX_SKEW_NS"),
      calibrationHash: hash(value.calibrationHash, "PLATFORM_SENSOR_CALIBRATION_HASH") };
  }).sort((left, right) => left.sensorId.localeCompare(right.sensorId));
  unique(output, "sensorId", "PLATFORM_SENSOR_ID");
  unique(output, "sourceChannel", "PLATFORM_SENSOR_SOURCE_CHANNEL");
  return output;
}

function normalizeFusion(value, sensorIds) {
  if (!exactKeys(value, ["referenceSensorId", "maxInterSensorSkewNs",
    "maxActionObservationSkewNs"])) fail("PLATFORM_FUSION_STRUCTURE_INVALID");
  const referenceSensorId = token(value.referenceSensorId, "PLATFORM_FUSION_REFERENCE_SENSOR");
  if (!sensorIds.has(referenceSensorId)) fail("PLATFORM_FUSION_REFERENCE_UNBOUND");
  return { referenceSensorId,
    maxInterSensorSkewNs: decimal(value.maxInterSensorSkewNs,
      "PLATFORM_FUSION_MAX_INTER_SENSOR_SKEW_NS"),
    maxActionObservationSkewNs: decimal(value.maxActionObservationSkewNs,
      "PLATFORM_FUSION_MAX_ACTION_OBSERVATION_SKEW_NS") };
}

function normalizeParameterAuthority(value) {
  if (!exactKeys(value, ["class", "sourceCommitmentHashes", "physicsTruthExternallyVerified"])) {
    fail("PLATFORM_PARAMETER_AUTHORITY_STRUCTURE_INVALID");
  }
  if (!Array.isArray(value.sourceCommitmentHashes)
    || value.sourceCommitmentHashes.some((item) => !HASH.test(String(item ?? "")))) {
    fail("PLATFORM_PARAMETER_AUTHORITY_HASHES_INVALID");
  }
  const hashes = [...new Set(value.sourceCommitmentHashes)].sort();
  if (hashes.length !== value.sourceCommitmentHashes.length) {
    fail("PLATFORM_PARAMETER_AUTHORITY_HASH_DUPLICATE");
  }
  if (value.physicsTruthExternallyVerified !== false) {
    fail("EXTERNAL_PHYSICS_TRUTH_ATTESTATION_NOT_IMPLEMENTED");
  }
  return { class: token(value.class, "PLATFORM_PARAMETER_AUTHORITY_CLASS"),
    sourceCommitmentHashes: hashes, physicsTruthExternallyVerified: false };
}

/** Build a complete, unit- and coordinate-explicit local parameter manifest. */
export function createDevicePlatformParameterManifest({ platformId, platformClass,
  manifestVersion, coordinateFrames, joints, workspace, control, sensors, fusion,
  parameterAuthority }) {
  const normalizedFrames = normalizeCoordinateFrames(coordinateFrames);
  const frameIds = new Set(normalizedFrames.map((item) => item.frameId));
  const normalizedSensors = normalizeSensors(sensors, frameIds);
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest,
    platformId: token(platformId, "PLATFORM_ID"),
    platformClass: token(platformClass, "PLATFORM_CLASS"),
    manifestVersion: token(manifestVersion, "PLATFORM_MANIFEST_VERSION"),
    coordinateFrames: normalizedFrames,
    joints: normalizeJoints(joints, frameIds),
    workspace: normalizeWorkspace(workspace, frameIds),
    control: normalizeControl(control),
    sensors: normalizedSensors,
    fusion: normalizeFusion(fusion, new Set(normalizedSensors.map((item) => item.sensorId))),
    parameterAuthority: normalizeParameterAuthority(parameterAuthority),
  };
  return deepFreeze({ ...body, platformParameterManifestHash: digest(body.schema, body) });
}

export function verifyDevicePlatformParameterManifest(manifest) {
  try {
    if (!plain(manifest) || manifest.schema !== DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest) {
      return { ok: false, error: "DEVICE_STREAM_PHYSICS_PLATFORM_MANIFEST_INVALID" };
    }
    const rebuilt = createDevicePlatformParameterManifest({
      platformId: manifest.platformId, platformClass: manifest.platformClass,
      manifestVersion: manifest.manifestVersion, coordinateFrames: manifest.coordinateFrames,
      joints: manifest.joints, workspace: manifest.workspace, control: manifest.control,
      sensors: manifest.sensors, fusion: manifest.fusion,
      parameterAuthority: manifest.parameterAuthority,
    });
    if (!same(rebuilt, manifest)) fail("PLATFORM_MANIFEST_HASH_MISMATCH");
    return { ok: true, platformParameterManifestHash: rebuilt.platformParameterManifestHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function validatePhysicsSample(value, platform, code) {
  if (!exactKeys(value, ["jointPositions", "workspacePosition"]) || !Array.isArray(value.jointPositions)
    || !exactKeys(value.workspacePosition, ["coordinateFrameId", "x", "y", "z"])) {
    fail(`${code}_STRUCTURE_INVALID`);
  }
  const positions = value.jointPositions.map((item) => {
    if (!exactKeys(item, ["jointId", "value"])) fail(`${code}_JOINT_STRUCTURE_INVALID`);
    return { jointId: token(item.jointId, `${code}_JOINT_ID`),
      value: finite(item.value, `${code}_JOINT_VALUE`) };
  }).sort((left, right) => left.jointId.localeCompare(right.jointId));
  unique(positions, "jointId", `${code}_JOINT_ID`);
  if (positions.length !== platform.joints.length
    || positions.some((item, index) => item.jointId !== platform.joints[index].jointId)) {
    fail(`${code}_JOINT_SET_MISMATCH`);
  }
  positions.forEach((item, index) => {
    const limit = platform.joints[index];
    if (item.value < limit.lowerPosition || item.value > limit.upperPosition) {
      fail(`${code}_JOINT_LIMIT_EXCEEDED`, item.jointId);
    }
  });
  if (value.workspacePosition.coordinateFrameId !== platform.workspace.coordinateFrameId) {
    fail(`${code}_WORKSPACE_FRAME_MISMATCH`);
  }
  const workspacePosition = { coordinateFrameId: value.workspacePosition.coordinateFrameId };
  for (const axis of ["x", "y", "z"]) {
    const coordinate = finite(value.workspacePosition[axis], `${code}_WORKSPACE_${axis.toUpperCase()}`);
    const bound = platform.workspace.bounds[axis];
    if (coordinate < bound.minimum || coordinate > bound.maximum) {
      fail(`${code}_WORKSPACE_LIMIT_EXCEEDED`, axis);
    }
    workspacePosition[axis] = coordinate;
  }
  return { jointPositions: positions, workspacePosition };
}

function timestamp(value, status, code, { missingAllowed = false } = {}) {
  if (value === null && (status === DEVICE_TIMESTAMP_STATUS.absent || missingAllowed)) return null;
  if (status !== DEVICE_TIMESTAMP_STATUS.present) fail(`${code}_UNEXPECTED`);
  return decimal(value, code);
}

function absoluteDifference(left, right) {
  const difference = BigInt(left) - BigInt(right);
  return difference < 0n ? -difference : difference;
}

function compressSequences(values) {
  if (values.length === 0) return [];
  const output = [];
  let first = values[0];
  let last = first;
  for (const value of values.slice(1)) {
    if (value === last + 1) last = value;
    else { output.push({ first, last }); first = value; last = value; }
  }
  output.push({ first, last });
  return output;
}

function validateAdapterOutput(output, { descriptor, sourceManifest, platform }) {
  if (!exactKeys(output, ["schema", "sourceManifestHash", "adapterDescriptorHash",
    "platformParameterManifestHash", "acquisition", "episodes"])
    || output.schema !== DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput
    || output.sourceManifestHash !== sourceManifest.sourceManifestHash
    || output.adapterDescriptorHash !== descriptor.descriptorHash
    || output.platformParameterManifestHash !== platform.platformParameterManifestHash
    || !exactKeys(output.acquisition, ["mode", "liveStreamObserved", "sourceTimestampStatus"])
    || !["RETROSPECTIVE_OBJECT_REPLAY", "LIVE_CAPTURE_OBJECT_SNAPSHOT"]
      .includes(output.acquisition.mode)
    || typeof output.acquisition.liveStreamObserved !== "boolean"
    || !Object.values(DEVICE_TIMESTAMP_STATUS).includes(output.acquisition.sourceTimestampStatus)
    || !Array.isArray(output.episodes) || output.episodes.length === 0
    || output.episodes.length > MAX_EPISODES) fail("ADAPTER_OUTPUT_STRUCTURE_INVALID");
  if (output.acquisition.liveStreamObserved && !descriptor.capabilities.liveStream) {
    fail("ADAPTER_LIVE_STREAM_CAPABILITY_MISMATCH");
  }
  if (output.acquisition.mode === "LIVE_CAPTURE_OBJECT_SNAPSHOT"
    && output.acquisition.liveStreamObserved !== true) fail("NO_LIVE_STREAM");
  if (output.acquisition.sourceTimestampStatus === DEVICE_TIMESTAMP_STATUS.absent
    && output.acquisition.mode !== "RETROSPECTIVE_OBJECT_REPLAY") {
    fail("LIVE_STREAM_SOURCE_TIMESTAMPS_REQUIRED");
  }
  const sensorById = new Map(platform.sensors.map((sensor) => [sensor.sensorId, sensor]));
  const missing = new Map(platform.sensors.map((sensor) => [sensor.sensorId, []]));
  const observed = new Map(platform.sensors.map((sensor) => [sensor.sensorId, 0]));
  const frameIds = new Set();
  const pairIds = new Set();
  let totalFrames = 0;
  let outcomeRecords = 0;
  let transitionChecks = 0;
  let fusionChecks = 0;
  let actionObservationChecks = 0;
  let boundsChecks = 0;
  const normalizedEpisodes = [];
  for (const episode of output.episodes) {
    if (!exactKeys(episode, ["episodeIdHash", "frames"]) || !HASH.test(episode.episodeIdHash ?? "")
      || !Array.isArray(episode.frames) || episode.frames.length === 0) {
      fail("ADAPTER_EPISODE_STRUCTURE_INVALID");
    }
    let priorTimestamp = null;
    const normalizedFrames = [];
    for (let index = 0; index < episode.frames.length; index += 1) {
      totalFrames += 1;
      if (totalFrames > MAX_FRAMES) fail("ADAPTER_FRAME_LIMIT_EXCEEDED");
      const frame = episode.frames[index];
      if (!exactKeys(frame, ["sequence", "timestampNs", "pairId", "action", "observations",
        "physicsObservation", "sourceNativeOutcome"])) fail("ADAPTER_FRAME_STRUCTURE_INVALID");
      const sequence = integer(frame.sequence, "FRAME_SEQUENCE");
      if (sequence !== index) fail(index === 0 ? "FRAME_SEQUENCE_MUST_START_ZERO" : "FRAME_SEQUENCE_GAP");
      const frameTimestamp = timestamp(frame.timestampNs, output.acquisition.sourceTimestampStatus,
        "FRAME_TIMESTAMP_NS");
      const pairId = hash(frame.pairId, "FRAME_PAIR_ID");
      if (pairIds.has(pairId)) fail("ACTION_OBSERVATION_PAIR_DUPLICATE", pairId);
      pairIds.add(pairId);
      if (!exactKeys(frame.action, ["pairId", "timestampNs", "commandHash", "coordinateFrameId",
        "physicsTarget"]) || frame.action.pairId !== pairId
        || frame.action.coordinateFrameId !== platform.workspace.coordinateFrameId) {
        fail("FRAME_ACTION_PAIRING_INVALID");
      }
      const actionTimestamp = timestamp(frame.action.timestampNs,
        output.acquisition.sourceTimestampStatus, "ACTION_TIMESTAMP_NS");
      const action = { pairId, timestampNs: actionTimestamp,
        commandHash: hash(frame.action.commandHash, "ACTION_COMMAND_HASH"),
        coordinateFrameId: frame.action.coordinateFrameId,
        physicsTarget: validatePhysicsSample(frame.action.physicsTarget, platform,
          "ACTION_PHYSICS_TARGET") };
      boundsChecks += platform.joints.length + 3;
      const physicsObservation = validatePhysicsSample(frame.physicsObservation, platform,
        "OBSERVATION_PHYSICS");
      boundsChecks += platform.joints.length + 3;
      if (!Array.isArray(frame.observations)
        || frame.observations.length !== platform.sensors.length) {
        fail("FRAME_SENSOR_SET_MISMATCH");
      }
      const normalizedObservations = frame.observations.map((observation) => {
        if (!exactKeys(observation, ["sensorId", "modality", "frameId", "pairId",
          "timestampNs", "payloadHash", "missing", "missingReason"])) {
          fail("SENSOR_OBSERVATION_STRUCTURE_INVALID");
        }
        const sensor = sensorById.get(observation.sensorId);
        if (!sensor || observation.modality !== sensor.modality || observation.pairId !== pairId) {
          fail("SENSOR_OBSERVATION_BINDING_INVALID", observation.sensorId);
        }
        const sensorFrameId = token(observation.frameId, "SENSOR_FRAME_ID");
        if (frameIds.has(sensorFrameId)) fail("SENSOR_FRAME_DUPLICATE", sensorFrameId);
        frameIds.add(sensorFrameId);
        if (typeof observation.missing !== "boolean") fail("SENSOR_MISSING_FLAG_INVALID");
        let observationTimestamp;
        if (observation.missing) {
          if (observation.payloadHash !== null || observation.missingReason === null) {
            fail("SENSOR_MISSINGNESS_INCONSISTENT");
          }
          observationTimestamp = timestamp(observation.timestampNs,
            output.acquisition.sourceTimestampStatus, "SENSOR_TIMESTAMP_NS",
            { missingAllowed: true });
          token(observation.missingReason, "SENSOR_MISSING_REASON");
          missing.get(sensor.sensorId).push({ episodeIdHash: episode.episodeIdHash, sequence });
        } else {
          if (observation.missingReason !== null) fail("SENSOR_MISSING_REASON_UNEXPECTED");
          observationTimestamp = timestamp(observation.timestampNs,
            output.acquisition.sourceTimestampStatus, "SENSOR_TIMESTAMP_NS");
          hash(observation.payloadHash, "SENSOR_PAYLOAD_HASH");
          observed.set(sensor.sensorId, observed.get(sensor.sensorId) + 1);
        }
        return { sensorId: sensor.sensorId, modality: sensor.modality,
          frameId: sensorFrameId, pairId, timestampNs: observationTimestamp,
          payloadHash: observation.payloadHash, missing: observation.missing,
          missingReason: observation.missingReason };
      }).sort((left, right) => left.sensorId.localeCompare(right.sensorId));
      if (normalizedObservations.some((item, sensorIndex) => (
        item.sensorId !== platform.sensors[sensorIndex].sensorId
      ))) fail("FRAME_SENSOR_SET_MISMATCH");
      if (output.acquisition.sourceTimestampStatus === DEVICE_TIMESTAMP_STATUS.present) {
        if (priorTimestamp !== null) {
          if (BigInt(frameTimestamp) <= BigInt(priorTimestamp)) fail("FRAME_TIMESTAMP_NOT_MONOTONIC");
          const delta = BigInt(frameTimestamp) - BigInt(priorTimestamp);
          const expected = BigInt(platform.control.expectedPeriodNs);
          const tolerance = BigInt(platform.control.periodToleranceNs);
          if (delta < expected - tolerance || delta > expected + tolerance) {
            fail("FRAME_TIMESTAMP_CONTROL_GAP", sequence);
          }
          transitionChecks += 1;
        }
        priorTimestamp = frameTimestamp;
        const presentTimestamps = normalizedObservations.filter((item) => !item.missing)
          .map((item) => item.timestampNs);
        for (const item of normalizedObservations.filter((entry) => !entry.missing)) {
          const sensor = sensorById.get(item.sensorId);
          if (absoluteDifference(item.timestampNs, frameTimestamp) > BigInt(sensor.maxSkewNs)) {
            fail("SENSOR_TIMESTAMP_SKEW_EXCEEDED", item.sensorId);
          }
          if (absoluteDifference(item.timestampNs, actionTimestamp)
            > BigInt(platform.fusion.maxActionObservationSkewNs)) {
            fail("ACTION_OBSERVATION_SKEW_EXCEEDED", item.sensorId);
          }
          actionObservationChecks += 1;
        }
        if (presentTimestamps.length > 1) {
          const times = presentTimestamps.map(BigInt);
          const spread = times.reduce((maximum, item) => item > maximum ? item : maximum)
            - times.reduce((minimum, item) => item < minimum ? item : minimum);
          if (spread > BigInt(platform.fusion.maxInterSensorSkewNs)) {
            fail("CROSS_SENSOR_FUSION_SKEW_EXCEEDED", sequence);
          }
          fusionChecks += 1;
        }
      }
      let sourceNativeOutcome = null;
      if (frame.sourceNativeOutcome !== null) {
        if (!exactKeys(frame.sourceNativeOutcome, ["commitmentHash", "semantics"])
          || frame.sourceNativeOutcome.semantics
            !== "SOURCE_NATIVE_OUTCOME_NOT_INDEPENDENT_CONSEQUENCE") {
          fail("SOURCE_NATIVE_OUTCOME_SEMANTICS_INVALID");
        }
        sourceNativeOutcome = { commitmentHash: hash(frame.sourceNativeOutcome.commitmentHash,
          "SOURCE_NATIVE_OUTCOME_HASH"), semantics: frame.sourceNativeOutcome.semantics };
        outcomeRecords += 1;
      }
      normalizedFrames.push({ sequence, timestampNs: frameTimestamp, pairId, action,
        observations: normalizedObservations, physicsObservation, sourceNativeOutcome });
    }
    normalizedEpisodes.push({ episodeIdHash: episode.episodeIdHash, frames: normalizedFrames });
  }
  unique(normalizedEpisodes, "episodeIdHash", "ADAPTER_EPISODE_ID");
  const missingnessLedger = platform.sensors.map((sensor) => {
    const events = missing.get(sensor.sensorId);
    const byEpisode = new Map();
    for (const event of events) {
      if (!byEpisode.has(event.episodeIdHash)) byEpisode.set(event.episodeIdHash, []);
      byEpisode.get(event.episodeIdHash).push(event.sequence);
    }
    return { sensorId: sensor.sensorId, modality: sensor.modality, required: sensor.required,
      expectedFrames: totalFrames, observedFrames: observed.get(sensor.sensorId),
      missingFrames: events.length,
      missingSequenceRanges: [...byEpisode.entries()].sort(([left], [right]) => (
        left.localeCompare(right)
      )).map(([episodeIdHash, sequences]) => ({ episodeIdHash,
        ranges: compressSequences(sequences) })) };
  });
  return {
    normalizedOutput: { ...output, episodes: normalizedEpisodes },
    summary: {
      episodeCount: normalizedEpisodes.length,
      frameCount: totalFrames,
      actionObservationPairs: totalFrames,
      sourceNativeOutcomeRecords: outcomeRecords,
      missingnessLedger,
      timing: {
        sourceTimestampStatus: output.acquisition.sourceTimestampStatus,
        status: output.acquisition.sourceTimestampStatus === DEVICE_TIMESTAMP_STATUS.present
          ? "PASSED" : "NOT_CHECKABLE_SOURCE_TIMESTAMPS_ABSENT",
        monotonicSequence: true,
        monotonicTimestamps: output.acquisition.sourceTimestampStatus
          === DEVICE_TIMESTAMP_STATUS.present,
        checkedTransitions: transitionChecks,
        actionObservationSkewChecks: actionObservationChecks,
        crossSensorFusionChecks: fusionChecks,
      },
      physics: { boundsChecks, parameterManifestComplete: true,
        physicsTruthExternallyVerified: false },
    },
  };
}

function createTrustedReplayReceipt({ replayKind, verificationLevel, descriptor,
  sourceManifest, platform, adapterOutput }) {
  const checked = validateAdapterOutput(adapterOutput, { descriptor, sourceManifest, platform });
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.replayReceipt,
    replayKind,
    verificationLevel,
    adapterDescriptorHash: descriptor.descriptorHash,
    adapterImplementationHash: descriptor.implementationHash,
    adapterSchemaHash: descriptor.sourceSchemaHash,
    sourceManifestHash: sourceManifest.sourceManifestHash,
    platformParameterManifestHash: platform.platformParameterManifestHash,
    adapterOutputHash: digest("outsider/device-stream-normalized-adapter-output/v1",
      checked.normalizedOutput),
    sourceClass: sourceManifest.sourceClass,
    acquisition: checked.normalizedOutput.acquisition,
    summary: checked.summary,
    authorityBoundary: {
      fullSourceBytesReplayed: true,
      callerVerifiedBooleanAccepted: false,
      realProspectiveExecutions: 0,
      causalExperienceUnits: 0,
      independentOutcomes: 0,
      physicsTruthExternallyVerified: false,
      automaticTraining: false,
      pricingEligible: false,
      productionEligible: false,
    },
  };
  const receipt = deepFreeze({ ...body, replayReceiptHash: digest(body.schema, body) });
  TRUSTED_REPLAY_RECEIPTS.add(receipt);
  return receipt;
}

/** A registry whose replay receipts are accepted only by object identity in this process. */
export class DeviceStreamAdapterRegistry {
  #adapters = new Map();

  register({ descriptor, adapter, sourceSchema }) {
    if (!verifyDescriptor(descriptor)) fail("ADAPTER_DESCRIPTOR_INVALID");
    const expected = createDeviceSourceAdapterDescriptor({
      adapterId: descriptor.adapterId, adapterVersion: descriptor.adapterVersion,
      formatFamily: descriptor.formatFamily, adapter, sourceSchema,
      liveStream: descriptor.capabilities.liveStream,
      sourceTimestamps: descriptor.capabilities.sourceTimestamps,
    });
    if (!same(expected, descriptor)) fail("ADAPTER_DESCRIPTOR_IMPLEMENTATION_OR_SCHEMA_MISMATCH");
    if (this.#adapters.has(descriptor.adapterId)) fail("ADAPTER_ALREADY_REGISTERED");
    this.#adapters.set(descriptor.adapterId, { descriptor, adapter, sourceSchema });
    return descriptor;
  }

  replay({ adapterId, sourceManifest, sourceObjects, platformManifest }) {
    const registered = this.#adapters.get(adapterId);
    if (!registered) fail("ADAPTER_NOT_REGISTERED", String(adapterId));
    if (registered.descriptor.formatFamily !== sourceManifest?.formatFamily) {
      fail("ADAPTER_SOURCE_FORMAT_MISMATCH");
    }
    const platformCheck = verifyDevicePlatformParameterManifest(platformManifest);
    if (!platformCheck.ok) fail("PLATFORM_MANIFEST_INVALID", platformCheck.error);
    verifyExactSourceObjects(sourceManifest, sourceObjects);
    const copiedObjects = sourceObjects.map((item) => ({
      objectId: item.objectId, immutableVersion: item.immutableVersion,
      bytes: Buffer.from(item.bytes),
    }));
    const adapterOutput = registered.adapter({
      objects: copiedObjects,
      sourceManifest,
      platformManifest,
      outputContract: ADAPTER_OUTPUT_CONTRACT,
    });
    return createTrustedReplayReceipt({ replayKind: "REGISTERED_IN_PROCESS_ADAPTER",
      verificationLevel: "FULL_SOURCE_REPLAYED", descriptor: registered.descriptor,
      sourceManifest, platform: platformManifest, adapterOutput });
  }
}

function builtinDroidDescriptor(verified) {
  const episode = verified.artifacts.episodes[0];
  const pilotImplementationHash = digest("outsider/droid100-pilot-verifier-file/v1",
    readFileSync(fileURLToPath(new URL("./outsider-droid100-pilot-artifacts.js", import.meta.url))));
  const frontierImplementationHash = digest("outsider/device-stream-physics-frontier-file/v1",
    readFileSync(fileURLToPath(import.meta.url)));
  return sealDescriptor({
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor,
    descriptorKind: "BUILTIN_DROID100_FULL_SOURCE_VERIFIER",
    adapterId: "outsider-droid100-device-physics-adapter",
    adapterVersion: "1.0.0",
    formatFamily: "TFRECORD_RLDS",
    implementationHash: digest("outsider/droid100-device-adapter-closure/v1", {
      rldsImplementationHash: DROID100_RLDS_IMPLEMENTATION_HASH,
      pilotImplementationHash,
      frontierImplementationHash,
      sourceInstrumentImplementationHash: episode.instrument.extractorImplementationHash,
    }),
    sourceSchemaHash: episode.instrument.featureSchemaHash,
    outputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
    capabilities: fixedCapabilities({ liveStream: false, sourceTimestamps: false }),
    trustBoundary: { registrationScope: "BUILTIN_EXACT_DROID_SOURCE_REPLAY",
      callerVerifiedBooleanAccepted: false, provesPhysicalTruth: false,
      provesLiveCapture: false },
  });
}

function readDroidSources(sourceRoot) {
  const names = {
    objectListBytes: "gcs-objects.json",
    datasetInfoBytes: "dataset_info.json",
    featureBytes: "features.json",
    shardBytes: "r2d2_faceblur-train.tfrecord-00000-of-00031",
  };
  return Object.fromEntries(Object.entries(names).map(([key, name]) => {
    const bytes = readFileSync(path.join(path.resolve(sourceRoot), name));
    if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) fail("DROID_SOURCE_SIZE_INVALID", name);
    return [key, bytes];
  }));
}

function droidSourceManifest(sourceBytes, verified) {
  const version = verified.artifacts.manifest.manifestHash;
  const map = [
    ["gcs-objects.json", sourceBytes.objectListBytes],
    ["dataset_info.json", sourceBytes.datasetInfoBytes],
    ["features.json", sourceBytes.featureBytes],
    ["r2d2_faceblur-train.tfrecord-00000-of-00031", sourceBytes.shardBytes],
  ];
  return createImmutableDeviceSourceManifest({ sourceId: "droid100-first-shard-real-pilot",
    sourceClass: DEVICE_SOURCE_CLASSES.realPhysicalRetrospective,
    formatFamily: "TFRECORD_RLDS",
    objects: map.map(([objectId, bytes]) => ({ objectId, immutableVersion: version, bytes })) });
}

function droidPhysicsSample(features, platform, prefix) {
  const jointPositions = platform.joints.map((joint, index) => ({ jointId: joint.jointId,
    value: features[`${prefix}joint_position_${index}`] }));
  const cartesianPrefix = prefix === "commanded_" ? "commanded_cartesian_position_" : "cartesian_position_";
  return { jointPositions, workspacePosition: {
    coordinateFrameId: platform.workspace.coordinateFrameId,
    x: features[`${cartesianPrefix}0`], y: features[`${cartesianPrefix}1`],
    z: features[`${cartesianPrefix}2`],
  } };
}

function droidAdapterOutput(verified, descriptor, sourceManifest, platform) {
  const sourceChannels = new Map(platform.sensors.map((sensor) => [sensor.sourceChannel, sensor]));
  const knownChannels = ["DROID_PROPRIOCEPTION", "DROID_EXTERIOR_IMAGE_1_LEFT",
    "DROID_EXTERIOR_IMAGE_2_LEFT", "DROID_WRIST_IMAGE_LEFT"];
  if (!sourceChannels.has("DROID_PROPRIOCEPTION")) fail("DROID_PROPRIOCEPTION_SENSOR_REQUIRED");
  if (platform.joints.length !== 7 || platform.joints.some((joint, index) => (
    joint.jointId !== `droid-joint-${index}`
  ))) fail("DROID_EXACT_SEVEN_JOINT_MAPPING_REQUIRED");
  const episodes = verified.artifacts.episodes.map((episode) => {
    const timestampValues = episode.steps.map((step) => step.tOffsetMs);
    if (timestampValues.some((value) => value !== null)) {
      fail("DROID_SOURCE_TIMESTAMP_PROJECTION_UNEXPECTED");
    }
    return { episodeIdHash: episode.episodeIdHash,
      frames: episode.steps.map((step) => {
        const pairId = digest("outsider/droid100-action-observation-pair/v1",
          { episodeIdHash: episode.episodeIdHash, sequence: step.index });
        const imageByChannel = new Map([
          ["DROID_EXTERIOR_IMAGE_1_LEFT", step.observation.images[0]],
          ["DROID_EXTERIOR_IMAGE_2_LEFT", step.observation.images[1]],
          ["DROID_WRIST_IMAGE_LEFT", step.observation.images[2]],
        ]);
        const observations = platform.sensors.map((sensor) => {
          let payloadHash = null;
          if (sensor.sourceChannel === "DROID_PROPRIOCEPTION") {
            payloadHash = step.observation.commitment;
          } else if (knownChannels.includes(sensor.sourceChannel)) {
            payloadHash = imageByChannel.get(sensor.sourceChannel)?.commitment ?? null;
          }
          const missing = payloadHash === null;
          return { sensorId: sensor.sensorId, modality: sensor.modality,
            frameId: `droid-${episode.episodeIdHash.slice(-12)}-${step.index}-${sensor.sensorId}`,
            pairId, timestampNs: null, payloadHash, missing,
            missingReason: missing ? "SOURCE_CHANNEL_NOT_PRESENT" : null };
        });
        return { sequence: step.index, timestampNs: null, pairId,
          action: { pairId, timestampNs: null,
            commandHash: digest("outsider/droid100-source-action/v1", step.action),
            coordinateFrameId: platform.workspace.coordinateFrameId,
            physicsTarget: droidPhysicsSample(step.action.features, platform, "commanded_") },
          observations,
          physicsObservation: droidPhysicsSample(step.observation.features, platform, ""),
          sourceNativeOutcome: { commitmentHash: digest(
            "outsider/droid100-source-native-outcome/v1", step.outcome),
          semantics: "SOURCE_NATIVE_OUTCOME_NOT_INDEPENDENT_CONSEQUENCE" } };
      }) };
  });
  return { schema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
    sourceManifestHash: sourceManifest.sourceManifestHash,
    adapterDescriptorHash: descriptor.descriptorHash,
    platformParameterManifestHash: platform.platformParameterManifestHash,
    acquisition: { mode: "RETROSPECTIVE_OBJECT_REPLAY", liveStreamObserved: false,
      sourceTimestampStatus: DEVICE_TIMESTAMP_STATUS.absent }, episodes };
}

/**
 * Reopen all four DROID source objects through the existing verifier and adapt
 * its two decoded episodes.  A caller-supplied `{ verified: true }` object is
 * not an input to this function and cannot substitute for this replay.
 */
export function replayDroid100RetrospectiveDeviceEvidence({ artifactDirectory,
  sourceRoot, platformManifest }) {
  const platformCheck = verifyDevicePlatformParameterManifest(platformManifest);
  if (!platformCheck.ok) fail("PLATFORM_MANIFEST_INVALID", platformCheck.error);
  const sourceBytes = readDroidSources(sourceRoot);
  const verified = verifyDroid100PilotArtifactDirectory(path.resolve(artifactDirectory), {
    source: sourceBytes,
  });
  if (!verified.ok || verified.verificationLevel !== "FULL_SOURCE_REPRODUCED"
    || verified.recordsVerified !== true || verified.episodeCount !== 2
    || verified.causalExperienceUnits !== 0 || verified.automaticTraining !== false) {
    fail("DROID_FULL_SOURCE_REPLAY_FAILED", verified.error ?? verified.verificationLevel);
  }
  const sourceManifest = droidSourceManifest(sourceBytes, verified);
  const descriptor = builtinDroidDescriptor(verified);
  const output = droidAdapterOutput(verified, descriptor, sourceManifest, platformManifest);
  return createTrustedReplayReceipt({ replayKind: "DROID100_EXISTING_FULL_SOURCE_VERIFIER",
    verificationLevel: "FULL_SOURCE_REPRODUCED", descriptor, sourceManifest,
    platform: platformManifest, adapterOutput: output });
}

/** Build a zero-authority report only from an in-process trusted replay receipt. */
export function buildDeviceStreamPhysicsFrontierReport({ replayReceipt }) {
  if (!plain(replayReceipt) || !TRUSTED_REPLAY_RECEIPTS.has(replayReceipt)) {
    fail("FULL_SOURCE_PROVENANCE_REQUIRED_REGISTERED_REPLAY_OR_DROID_VERIFIER");
  }
  const droidPhysicalReplay = replayReceipt.replayKind
    === "DROID100_EXISTING_FULL_SOURCE_VERIFIER"
    && replayReceipt.sourceClass === DEVICE_SOURCE_CLASSES.realPhysicalRetrospective;
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.report,
    localInterface: {
      gapId: "S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER",
      status: "SATISFIED_INTERNAL",
      satisfiedScope: "FORMAT_NEUTRAL_CONTRACT_AND_DROID_RETROSPECTIVE_ADAPTER",
      formatNeutralAdapterContractImplemented: true,
      immutableSourceReplayImplemented: true,
      timingPairingMissingnessAndPhysicsChecksImplemented: true,
      futureFormatAdaptersIncludedInSatisfiedScope: false,
      unimplementedFutureFormatAdapters: ["MCAP", "ROSBAG2"],
    },
    replay: {
      replayReceiptHash: replayReceipt.replayReceiptHash,
      replayKind: replayReceipt.replayKind,
      verificationLevel: replayReceipt.verificationLevel,
      adapterDescriptorHash: replayReceipt.adapterDescriptorHash,
      adapterImplementationHash: replayReceipt.adapterImplementationHash,
      adapterSchemaHash: replayReceipt.adapterSchemaHash,
      sourceManifestHash: replayReceipt.sourceManifestHash,
      platformParameterManifestHash: replayReceipt.platformParameterManifestHash,
      adapterOutputHash: replayReceipt.adapterOutputHash,
      summary: replayReceipt.summary,
    },
    evidenceBoundary: {
      sourceClass: replayReceipt.sourceClass,
      empiricalReality: droidPhysicalReplay ? "REAL_PHYSICAL"
        : replayReceipt.sourceClass === DEVICE_SOURCE_CLASSES.conformanceFixture
          ? "CONFORMANCE_FIXTURE" : "SOURCE_ADAPTER_DECLARATION_NOT_EXTERNALLY_ESTABLISHED",
      temporalRelation: droidPhysicalReplay ? "RETROSPECTIVE" : "UNADJUDICATED",
      evidenceUse: "DESCRIPTIVE_ADAPTER_CONFORMANCE",
      fullSourceBytesReplayed: true,
      liveDeviceEvidenceExternallyEstablished: false,
      realProspectiveExecutions: 0,
      causalExperienceUnits: 0,
      independentOutcomes: 0,
      sourceNativeOutcomeRecords: replayReceipt.summary.sourceNativeOutcomeRecords,
      sourceNativeOutcomesAreConsequences: false,
      physicsTruthExternallyVerified: false,
    },
    useBoundary: {
      authority: "none",
      automaticTraining: false,
      trainingEligible: false,
      pricingEligible: false,
      productionEligible: false,
      permits: { TRAIN: false, PRICE: false, GUARANTEE: false, SETTLE: false,
        PRODUCTION: false },
    },
    readinessRecommendation: {
      markSatisfiedInternal: ["S15_DEVICE_STREAM_AND_PHYSICS_FRONTIER"],
      keepBlocked: [
        "S15_REAL_PROSPECTIVE_DEVICE_CONTROLS",
        "S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS",
        "S15_DEVICE_ACQUISITION_ROOT",
        "S15_OWNER_AFFECTED_PARTY_EXPERIMENT_GOVERNANCE",
      ],
    },
  };
  return deepFreeze({ ...body, reportHash: digest(body.schema, body) });
}

export function futureDeviceAdapterContract(formatFamily) {
  const normalized = String(formatFamily ?? "").toUpperCase();
  if (!new Set(["ROSBAG2", "MCAP"]).has(normalized)) fail("FUTURE_FORMAT_UNSUPPORTED");
  const body = {
    schema: DEVICE_STREAM_PHYSICS_SCHEMAS.futureContract,
    formatFamily: normalized,
    requiredInput: "IMMUTABLE_SOURCE_OBJECTS_OR_EXPLICIT_LIVE_STREAM_HANDLE",
    requiredOutputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
    registration: "REGISTER_EXACT_IMPLEMENTATION_AND_SOURCE_SCHEMA_IN_PROCESS",
    parserStatus: "PARSER_NOT_IMPLEMENTED",
    liveStreamStatus: "NO_LIVE_STREAM",
    fullSourceClaimAvailable: false,
    productionReady: false,
  };
  return deepFreeze({ ...body, contractHash: digest(body.schema, body) });
}

export function replayFutureDeviceFormat({ formatFamily, liveStream = null } = {}) {
  const contract = futureDeviceAdapterContract(formatFamily);
  if (liveStream == null) fail("NO_LIVE_STREAM", contract.formatFamily);
  fail("PARSER_NOT_IMPLEMENTED", contract.formatFamily);
}
