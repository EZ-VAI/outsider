#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { buildDroid100AcquisitionManifest } from "../src/outsider-droid100-adapter.js";
import {
  droid100PilotArtifactSetHash, droid100PilotReportHash,
  verifyDroid100PilotArtifactDirectory,
} from "../src/outsider-droid100-pilot-artifacts.js";
import {
  buildCurateCheckpoint,
  clearCurateEpisode,
  verifyCurateCheckpoint,
  verifyCurateClearance,
} from "../src/outsider-curate-core.js";
import {
  DROID100_FIRST_SHARD_PIN,
  decodeDroid100FirstShard,
  normalizeDroid100RldsEpisode,
  validateDroid100DatasetInfo,
  validateDroid100FeaturesSchema,
  verifyDroid100ManifestObjectBytes,
} from "../src/outsider-droid100-rlds.js";

const DEFAULT_ROOT = "artifacts/curate-droid100-20260819/source";

function parseArgs(argv) {
  const output = {
    objectList: `${DEFAULT_ROOT}/gcs-objects.json`,
    datasetInfo: `${DEFAULT_ROOT}/dataset_info.json`,
    features: `${DEFAULT_ROOT}/features.json`,
    shard: `${DEFAULT_ROOT}/${DROID100_FIRST_SHARD_PIN.name}`,
    licenseId: "CC-BY-4.0",
    outputDir: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (["--object-list", "--dataset-info", "--features", "--shard", "--license-id",
      "--output-dir"].includes(name)) {
      if (!argv[index + 1]) throw new Error(`DROID100_ARGUMENT_VALUE_REQUIRED:${name}`);
      const key = name === "--object-list" ? "objectList"
        : name === "--dataset-info" ? "datasetInfo"
          : name === "--features" ? "features"
            : name === "--license-id" ? "licenseId"
              : name === "--output-dir" ? "outputDir" : "shard";
      output[key] = argv[++index];
    } else throw new Error(`DROID100_ARGUMENT_UNKNOWN:${name}`);
  }
  if (!output.outputDir) throw new Error("DROID100_OUTPUT_DIR_REQUIRED");
  return output;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contentHash(serialized) {
  return `sha256:${createHash("sha256").update(serialized).digest("hex")}`;
}

function pathPresent(target) {
  try { lstatSync(target); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function atomicArtifactDirectory(outputDir, artifacts) {
  const target = path.resolve(outputDir);
  if (pathPresent(target)) throw new Error("DROID100_OUTPUT_DIR_EXISTS");
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}`);
  if (pathPresent(temporary)) throw new Error("DROID100_OUTPUT_TEMP_EXISTS");
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [name, serialized] of Object.entries(artifacts)) {
      writeFileSync(path.join(temporary, name), serialized, { mode: 0o600, flag: "wx" });
    }
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (pathPresent(path.resolve(args.outputDir))) throw new Error("DROID100_OUTPUT_DIR_EXISTS");
  if (![args.objectList, args.datasetInfo, args.features, args.shard].every(existsSync)) {
    throw new Error("DROID100_REAL_PILOT_SOURCE_MISSING");
  }
  const currentBytes = statSync(args.shard).size;
  if (currentBytes < DROID100_FIRST_SHARD_PIN.sizeBytes) {
    throw new Error(`DROID100_REAL_PILOT_SHARD_INCOMPLETE:${currentBytes}/${DROID100_FIRST_SHARD_PIN.sizeBytes}`);
  }
  if (currentBytes > DROID100_FIRST_SHARD_PIN.sizeBytes) {
    throw new Error(`DROID100_REAL_PILOT_SHARD_SIZE_MISMATCH:${currentBytes}/${DROID100_FIRST_SHARD_PIN.sizeBytes}`);
  }
  const objectListBytes = readFileSync(args.objectList);
  const manifest = buildDroid100AcquisitionManifest(objectListBytes);
  const datasetInfoBytes = readFileSync(args.datasetInfo);
  const featureBytes = readFileSync(args.features);
  const datasetInfoObject = verifyDroid100ManifestObjectBytes(datasetInfoBytes, {
    manifest, role: "DATASET_INFO",
  });
  const featureObject = verifyDroid100ManifestObjectBytes(featureBytes, {
    manifest, role: "FEATURES",
  });
  const datasetInfo = validateDroid100DatasetInfo(datasetInfoBytes, { manifest });
  const featureSchema = validateDroid100FeaturesSchema(featureBytes);
  const shardBytes = readFileSync(args.shard);
  const { verifiedShard, frames } = decodeDroid100FirstShard(shardBytes);
  if (frames.length !== 2) throw new Error(`DROID100_REAL_PILOT_EPISODE_COUNT:${frames.length}`);
  const episodes = frames.map((frame, episodeOrdinal) => normalizeDroid100RldsEpisode(frame, {
    manifest, verifiedShard, episodeOrdinal, licenseId: args.licenseId,
  }));
  if (episodes.some((episode) => canonicalizeStrict(episode.instrument)
    !== canonicalizeStrict(episodes[0].instrument))
    || episodes[0].instrument.featureSchemaHash !== featureSchema.validationHash) {
    throw new Error("DROID100_REAL_PILOT_INSTRUMENT_MISMATCH");
  }
  const clearances = [];
  for (const episode of episodes) {
    const clearance = clearCurateEpisode(episode, { history: episodes.slice(0, clearances.length) });
    const verified = verifyCurateClearance(clearance, {
      episode, history: episodes.slice(0, clearances.length),
    });
    if (!verified.ok) throw new Error(`DROID100_REAL_PILOT_CLEARANCE_INVALID:${verified.error}`);
    clearances.push(clearance);
  }
  const checkpoint = buildCurateCheckpoint(clearances, {
    checkpointId: "droid100-first-shard-real-pilot",
  });
  const checkpointCheck = verifyCurateCheckpoint(checkpoint, { clearances });
  if (!checkpointCheck.ok) throw new Error(`DROID100_REAL_PILOT_CHECKPOINT_INVALID:${checkpointCheck.error}`);
  const pilotInstrumentHash = `sha256:${createHash("sha256").update(
    `outsider/curate-instrument/v1\0${canonicalizeStrict(episodes[0].instrument)}`,
  ).digest("hex")}`;
  if (checkpoint.instrumentHash !== pilotInstrumentHash) {
    throw new Error("DROID100_REAL_PILOT_CHECKPOINT_INSTRUMENT_MISMATCH");
  }
  const summaries = episodes.map((episode, index) => ({
    episodeOrdinal: index,
    steps: episode.steps.length,
    imageCommitments: episode.steps.reduce((sum, step) => sum + step.observation.images.length, 0),
    observationFeatureCount: Object.keys(episode.steps[0].observation.features).length,
    actionFeatureCount: Object.keys(episode.steps[0].action.features).length,
    outcomeFeatureCount: Object.keys(episode.steps[0].outcome.features).length,
    episodeHash: episode.episodeHash,
    clearanceHash: clearances[index].clearanceHash,
    disposition: clearances[index].disposition,
    causalExperienceUnits: clearances[index].causal.causalExperienceUnits,
  }));
  const sourceArtifacts = {
    "manifest.json": serialize(manifest),
    "episodes.json": serialize(episodes),
    "clearances.json": serialize(clearances),
    "checkpoint.json": serialize(checkpoint),
  };
  const artifactContentHashes = Object.fromEntries(Object.entries(sourceArtifacts)
    .map(([name, serialized]) => [name, contentHash(serialized)]));
  const artifactSetHash = droid100PilotArtifactSetHash(artifactContentHashes);
  const body = {
    schema: "outsider/droid100-real-pilot-report/v1",
    source: {
      manifestHash: manifest.manifestHash,
      merkleRoot: manifest.integrity.merkleRoot,
      shardSha256: verifiedShard.sha256,
      shardMd5Base64: verifiedShard.md5Base64,
      shardCrc32cBase64: verifiedShard.crc32cBase64,
      datasetInfoValidationHash: datasetInfo.validationHash,
      featureSchemaValidationHash: featureSchema.validationHash,
      datasetInfoSha256: datasetInfoObject.sha256,
      featuresSha256: featureObject.sha256,
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
      verified: checkpointCheck.ok,
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
    artifactSetHash,
  };
  const report = { ...body, reportHash: droid100PilotReportHash(body) };
  const reportSerialized = serialize(report);
  const reportFileContentHash = contentHash(reportSerialized);
  const outputDir = atomicArtifactDirectory(args.outputDir, {
    ...sourceArtifacts,
    "report.json": reportSerialized,
  });
  const outputVerification = verifyDroid100PilotArtifactDirectory(outputDir, { source: {
    objectListBytes,
    datasetInfoBytes,
    featureBytes,
    shardBytes,
  } });
  if (!outputVerification.ok
    || outputVerification.verificationLevel !== "FULL_SOURCE_REPRODUCED") {
    throw new Error(`DROID100_REAL_PILOT_OUTPUT_VERIFY_FAILED:${outputVerification.error ?? "LEVEL"}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputDir,
    report: path.join(outputDir, "report.json"),
    reportHash: report.reportHash,
    reportFileContentHash,
    artifactSetHash,
    checkpointHash: checkpoint.checkpointHash,
    instrumentHash: checkpoint.instrumentHash,
    episodeCount: episodes.length,
    totalSteps: body.decoded.totalSteps,
    totalImageCommitments: body.decoded.totalImageCommitments,
    causalExperienceUnits: 0,
    automaticTraining: false,
    verificationLevel: outputVerification.verificationLevel,
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
