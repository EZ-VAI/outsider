import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  buildDroid100AcquisitionManifest, verifyDroid100AcquisitionManifest,
} from "./outsider-droid100-adapter.js";
import {
  buildCurateCheckpoint, clearCurateEpisode, verifyCurateCheckpoint,
  verifyCurateClearance, verifyCurateEpisode,
} from "./outsider-curate-core.js";
import {
  decodeDroid100FirstShard, normalizeDroid100RldsEpisode,
  validateDroid100DatasetInfo, validateDroid100FeaturesSchema,
  verifyDroid100ManifestObjectBytes,
} from "./outsider-droid100-rlds.js";

const FILES = Object.freeze([
  "checkpoint.json", "clearances.json", "episodes.json", "manifest.json", "report.json",
]);
const SOURCE_ARTIFACTS = Object.freeze([
  "manifest.json", "episodes.json", "clearances.json", "checkpoint.json",
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_FILE_BYTES = Object.freeze({
  "manifest.json": 2 * 1024 * 1024,
  "episodes.json": 64 * 1024 * 1024,
  "clearances.json": 16 * 1024 * 1024,
  "checkpoint.json": 4 * 1024 * 1024,
  "report.json": 4 * 1024 * 1024,
});

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function droid100PilotReportHash(body) {
  return digestBytes(`outsider:droid100:real-pilot-report:v1\0${canonicalizeStrict(body)}`);
}

export function droid100PilotArtifactSetHash(hashes) {
  return digestBytes(`outsider:droid100:pilot-artifact-set/v1\0${canonicalizeStrict(hashes)}`);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && canonicalizeStrict(Object.keys(value).sort()) === canonicalizeStrict([...keys].sort());
}

function firstDifference(actual, expected, location = "report") {
  if (Object.is(actual, expected)) return null;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return location;
    if (actual.length !== expected.length) return `${location}.length`;
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${location}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (canonicalizeStrict(actualKeys) !== canonicalizeStrict(expectedKeys)) return `${location}.keys`;
    for (const key of actualKeys) {
      const difference = firstDifference(actual[key], expected[key], `${location}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return `${location}:${String(actual)}/${String(expected)}`;
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function stableRead(file, maximumBytes, code) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximumBytes)) {
      fail(code);
    }
    const raw = readFileSync(descriptor, "utf8");
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFileSnapshot(before, after) || Buffer.byteLength(raw) !== Number(before.size)) {
      fail("DROID100_PILOT_OUTPUT_CHANGED_DURING_READ", path.basename(file));
    }
    return raw;
  } finally { if (descriptor !== null) closeSync(descriptor); }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function readArtifactDirectory(outputDir) {
  const root = path.resolve(outputDir);
  const directory = lstatSync(root);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    fail("DROID100_PILOT_OUTPUT_DIRECTORY_INVALID");
  }
  const names = readdirSync(root).sort();
  if (canonicalizeStrict(names) !== canonicalizeStrict(FILES)) {
    fail("DROID100_PILOT_OUTPUT_FILE_SET_INVALID");
  }
  const parsed = {};
  const serialized = {};
  for (const name of FILES) {
    const file = path.join(root, name);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0
      || stat.size > MAX_FILE_BYTES[name]) fail("DROID100_PILOT_OUTPUT_FILE_INVALID", name);
    const raw = stableRead(file, MAX_FILE_BYTES[name], "DROID100_PILOT_OUTPUT_FILE_INVALID");
    let value;
    try { value = JSON.parse(raw); } catch { fail("DROID100_PILOT_OUTPUT_JSON_INVALID", name); }
    if (raw !== serialize(value)) fail("DROID100_PILOT_OUTPUT_JSON_NONCANONICAL", name);
    parsed[name] = value;
    serialized[name] = raw;
  }
  return { root, parsed, serialized };
}

function verifyEpisodeGraph(episodes, clearances, checkpoint) {
  if (!Array.isArray(episodes) || episodes.length === 0 || !Array.isArray(clearances)
    || clearances.length !== episodes.length) fail("DROID100_PILOT_EPISODE_SET_INVALID");
  const byHash = new Map();
  for (const episode of episodes) {
    const checked = verifyCurateEpisode(episode);
    if (!checked.ok || byHash.has(episode.episodeHash)) {
      fail("DROID100_PILOT_EPISODE_INVALID", checked.error ?? "DUPLICATE");
    }
    byHash.set(episode.episodeHash, episode);
  }
  const credited = new Set();
  for (const clearance of clearances) {
    if (credited.has(clearance.sourceEpisodeHash)) fail("DROID100_PILOT_CLEARANCE_DUPLICATE");
    const episode = byHash.get(clearance.sourceEpisodeHash);
    const history = Array.isArray(clearance.historyEpisodeHashes)
      ? clearance.historyEpisodeHashes.map((hash) => byHash.get(hash)) : [];
    if (!episode || history.some((item) => item === undefined)) {
      fail("DROID100_PILOT_CLEARANCE_DEPENDENCY_MISSING");
    }
    const checked = verifyCurateClearance(clearance, { episode, history });
    if (!checked.ok) fail("DROID100_PILOT_CLEARANCE_INVALID", checked.error);
    credited.add(clearance.sourceEpisodeHash);
  }
  if (credited.size !== byHash.size || [...byHash.keys()].some((hash) => !credited.has(hash))) {
    fail("DROID100_PILOT_CLEARANCE_SET_NOT_EXACT");
  }
  const checkpointCheck = verifyCurateCheckpoint(checkpoint, { clearances });
  if (!checkpointCheck.ok || checkpointCheck.recordsVerified !== true) {
    fail("DROID100_PILOT_CHECKPOINT_INVALID", checkpointCheck.error ?? "UNBOUND");
  }
  return checkpointCheck;
}

function episodeSummaries(episodes, clearances) {
  return episodes.map((episode, index) => ({
    episodeOrdinal: index,
    steps: episode.steps.length,
    imageCommitments: episode.steps.reduce(
      (sum, step) => sum + step.observation.images.length, 0,
    ),
    observationFeatureCount: Object.keys(episode.steps[0].observation.features).length,
    actionFeatureCount: Object.keys(episode.steps[0].action.features).length,
    outcomeFeatureCount: Object.keys(episode.steps[0].outcome.features).length,
    episodeHash: episode.episodeHash,
    clearanceHash: clearances[index].clearanceHash,
    disposition: clearances[index].disposition,
    causalExperienceUnits: clearances[index].causal.causalExperienceUnits,
  }));
}

function validateSourceOptions(source) {
  if (source == null) return null;
  if (!exactKeys(source, ["objectListBytes", "datasetInfoBytes", "featureBytes", "shardBytes"])) {
    fail("DROID100_PILOT_SOURCE_SET_INCOMPLETE");
  }
  const output = {};
  for (const [key, value] of Object.entries(source)) {
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
      fail("DROID100_PILOT_SOURCE_BYTES_REQUIRED", key);
    }
    output[key] = Buffer.from(value);
  }
  return output;
}

function reverifyFullSource(source, artifacts) {
  const rebuiltManifest = buildDroid100AcquisitionManifest(source.objectListBytes);
  if (canonicalizeStrict(rebuiltManifest) !== canonicalizeStrict(artifacts.manifest)) {
    fail("DROID100_PILOT_SOURCE_MANIFEST_MISMATCH");
  }
  const datasetInfoObject = verifyDroid100ManifestObjectBytes(source.datasetInfoBytes, {
    manifest: rebuiltManifest, role: "DATASET_INFO",
  });
  const featureObject = verifyDroid100ManifestObjectBytes(source.featureBytes, {
    manifest: rebuiltManifest, role: "FEATURES",
  });
  const datasetInfo = validateDroid100DatasetInfo(source.datasetInfoBytes, {
    manifest: rebuiltManifest,
  });
  const featureSchema = validateDroid100FeaturesSchema(source.featureBytes);
  const { verifiedShard, frames } = decodeDroid100FirstShard(source.shardBytes);
  if (frames.length !== artifacts.episodes.length) fail("DROID100_PILOT_SOURCE_EPISODE_COUNT_MISMATCH");
  const episodes = frames.map((frame, episodeOrdinal) => normalizeDroid100RldsEpisode(frame, {
    manifest: rebuiltManifest, verifiedShard, episodeOrdinal, licenseId: "CC-BY-4.0",
  }));
  if (canonicalizeStrict(episodes) !== canonicalizeStrict(artifacts.episodes)) {
    fail("DROID100_PILOT_SOURCE_EPISODE_PROJECTION_MISMATCH");
  }
  const clearances = episodes.map((episode, index) => clearCurateEpisode(episode, {
    history: episodes.slice(0, index),
  }));
  if (canonicalizeStrict(clearances) !== canonicalizeStrict(artifacts.clearances)) {
    fail("DROID100_PILOT_SOURCE_CLEARANCE_MISMATCH");
  }
  const checkpoint = buildCurateCheckpoint(clearances, {
    checkpointId: "droid100-first-shard-real-pilot",
  });
  if (canonicalizeStrict(checkpoint) !== canonicalizeStrict(artifacts.checkpoint)) {
    fail("DROID100_PILOT_SOURCE_CHECKPOINT_MISMATCH");
  }
  return {
    datasetInfoObject,
    featureObject,
    datasetInfo,
    featureSchema,
    verifiedShard,
  };
}

function validateReport({ manifest, episodes, clearances, checkpoint, report,
  artifactContentHashes, fullSource }) {
  if (!exactKeys(report, ["schema", "source", "decoded", "checkpoint", "privacy",
    "authority", "artifactContentHashes", "artifactSetHash", "reportHash"])
    || report.schema !== "outsider/droid100-real-pilot-report/v1") {
    fail("DROID100_PILOT_REPORT_STRUCTURE_INVALID");
  }
  const manifestCheck = verifyDroid100AcquisitionManifest(manifest);
  if (!manifestCheck.ok) fail("DROID100_PILOT_MANIFEST_INVALID", manifestCheck.error);
  const firstShard = manifest.objects.find((object) => (
    object.role === "TFRECORD_SHARD" && object.shardIndex === 0
  ));
  const instruments = episodes.map((episode) => canonicalizeStrict(episode.instrument));
  if (!firstShard || new Set(instruments).size !== 1
    || episodes.some((episode) => episode.source.datasetManifestHash !== manifest.manifestHash
      || episode.source.sourceObjectHash !== report.source?.shardSha256
      || episode.source.licenseId !== "CC-BY-4.0")) {
    fail("DROID100_PILOT_SOURCE_BINDING_INVALID");
  }
  for (const value of [report.source?.shardSha256,
    report.source?.datasetInfoValidationHash, report.source?.featureSchemaValidationHash,
    report.source?.datasetInfoSha256, report.source?.featuresSha256]) {
    if (!HASH.test(String(value ?? ""))) fail("DROID100_PILOT_REPORT_HASH_FIELD_INVALID");
  }
  if (fullSource && (report.source.datasetInfoValidationHash !== fullSource.datasetInfo.validationHash
    || report.source.featureSchemaValidationHash !== fullSource.featureSchema.validationHash
    || report.source.datasetInfoSha256 !== fullSource.datasetInfoObject.sha256
    || report.source.featuresSha256 !== fullSource.featureObject.sha256
    || report.source.shardSha256 !== fullSource.verifiedShard.sha256)) {
    fail("DROID100_PILOT_REPORT_SOURCE_VALIDATION_MISMATCH");
  }
  const summaries = episodeSummaries(episodes, clearances);
  const expectedBody = {
    schema: "outsider/droid100-real-pilot-report/v1",
    source: {
      manifestHash: manifest.manifestHash,
      merkleRoot: manifest.integrity.merkleRoot,
      shardSha256: report.source.shardSha256,
      shardMd5Base64: firstShard.md5Base64,
      shardCrc32cBase64: firstShard.crc32cBase64,
      datasetInfoValidationHash: report.source.datasetInfoValidationHash,
      featureSchemaValidationHash: report.source.featureSchemaValidationHash,
      datasetInfoSha256: report.source.datasetInfoSha256,
      featuresSha256: report.source.featuresSha256,
      license: {
        identifier: manifest.license.identifier,
        declarationStatus: manifest.license.status,
        declarationSourceUrl: manifest.license.declarationSourceUrl,
        objectMetadataVerified: manifest.license.objectMetadataVerified,
        attributionNoticeHash: manifest.license.attributionNotice.noticeHash,
      },
      transport: {
        sourceFileExactSize: true,
        sourceFileAcceptedAsObject: true,
        verifiedWholeObject: true,
        trailingTransportBytesExcluded: 0,
      },
      instrument: episodes[0].instrument,
    },
    decoded: {
      episodeCount: episodes.length,
      totalSteps: episodes.reduce((sum, episode) => sum + episode.steps.length, 0),
      totalImageCommitments: episodes.reduce((sum, episode) => sum
        + episode.steps.reduce((inner, step) => inner + step.observation.images.length, 0), 0),
      summaries,
    },
    checkpoint: {
      checkpointHash: checkpoint.checkpointHash,
      instrumentHash: checkpoint.instrumentHash,
      merkleRoot: checkpoint.merkleRoot,
      leafCount: checkpoint.treeSize,
      verified: true,
    },
    privacy: {
      rawImagesPersisted: false,
      privateEpisodePathsPersisted: false,
      languagePersisted: false,
      collectorIdentityPersisted: false,
    },
    authority: {
      authority: "none",
      automaticTraining: false,
      pricing: false,
      guarantee: false,
      settlement: false,
    },
    artifactContentHashes,
    artifactSetHash: droid100PilotArtifactSetHash(artifactContentHashes),
  };
  const { reportHash: claimedReportHash, ...claimedBody } = report;
  const difference = firstDifference(claimedBody, expectedBody);
  if (difference) fail("DROID100_PILOT_REPORT_GRAPH_MISMATCH", difference);
  if (claimedReportHash !== droid100PilotReportHash(expectedBody)) {
    fail("DROID100_PILOT_REPORT_HASH_MISMATCH");
  }
  return expectedBody;
}

/**
 * Reverify the complete five-file pilot graph. Passing all four source byte
 * inputs upgrades the check from artifact-only to exact-source reproduction.
 */
export function verifyDroid100PilotArtifactDirectory(outputDir, { source = null } = {}) {
  try {
    const loaded = readArtifactDirectory(outputDir);
    const artifacts = {
      manifest: loaded.parsed["manifest.json"],
      episodes: loaded.parsed["episodes.json"],
      clearances: loaded.parsed["clearances.json"],
      checkpoint: loaded.parsed["checkpoint.json"],
      report: loaded.parsed["report.json"],
    };
    const artifactContentHashes = Object.fromEntries(SOURCE_ARTIFACTS.map((name) => [
      name, digestBytes(loaded.serialized[name]),
    ]));
    if (canonicalizeStrict(artifacts.report.artifactContentHashes)
      !== canonicalizeStrict(artifactContentHashes)) {
      fail("DROID100_PILOT_ARTIFACT_CONTENT_HASH_MISMATCH");
    }
    const checkpointCheck = verifyEpisodeGraph(
      artifacts.episodes, artifacts.clearances, artifacts.checkpoint,
    );
    const sourceBytes = validateSourceOptions(source);
    const fullSource = sourceBytes ? reverifyFullSource(sourceBytes, artifacts) : null;
    validateReport({ ...artifacts, artifactContentHashes, fullSource });
    const verifiedArtifacts = deepFreeze(artifacts);
    return {
      ok: true,
      verificationLevel: fullSource ? "FULL_SOURCE_REPRODUCED" : "ARTIFACT_GRAPH_ONLY",
      reportHash: artifacts.report.reportHash,
      reportFileContentHash: digestBytes(loaded.serialized["report.json"]),
      artifactSetHash: artifacts.report.artifactSetHash,
      checkpointHash: artifacts.checkpoint.checkpointHash,
      instrumentHash: artifacts.checkpoint.instrumentHash,
      episodeCount: artifacts.episodes.length,
      totalSteps: artifacts.episodes.reduce((sum, episode) => sum + episode.steps.length, 0),
      causalExperienceUnits: artifacts.clearances.reduce(
        (sum, clearance) => sum + clearance.causal.causalExperienceUnits, 0,
      ),
      recordsVerified: checkpointCheck.recordsVerified === true,
      automaticTraining: false,
      artifacts: verifiedArtifacts,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
