import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DROID100_SHARD_COUNT, DROID100_SOURCE_PREFIX, buildDroid100AcquisitionManifest,
} from "../src/outsider-droid100-adapter.js";
import {
  buildCurateCheckpoint, clearCurateEpisode, normalizeCurateEpisode,
} from "../src/outsider-curate-core.js";
import {
  droid100PilotArtifactSetHash, droid100PilotReportHash,
  verifyDroid100PilotArtifactDirectory,
} from "../src/outsider-droid100-pilot-artifacts.js";

const hash = (character) => `sha256:${character.repeat(64)}`;
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function object(name, index) {
  return {
    uri: `${DROID100_SOURCE_PREFIX}${name}`,
    generation: String(10_000 + index),
    size: String(1_000 + index),
    md5Hash: Buffer.alloc(16, index).toString("base64"),
    crc32c: Buffer.alloc(4, index).toString("base64"),
  };
}

function manifestFixture() {
  const objects = [object("dataset_info.json", 40), object("features.json", 41)];
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    objects.push(object(
      `r2d2_faceblur-train.tfrecord-${String(index).padStart(5, "0")}-of-00031`, index,
    ));
  }
  return buildDroid100AcquisitionManifest(objects);
}

function makeOutput() {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-droid100-pilot-artifacts-"));
  const output = path.join(parent, "pilot");
  mkdirSync(output);
  const manifest = manifestFixture();
  const episode = normalizeCurateEpisode({
    schema: "outsider/curate-episode-input/v1",
    source: {
      datasetId: "r2d2_faceblur",
      datasetVersion: "1.0.0",
      datasetManifestHash: manifest.manifestHash,
      sourceObjectHash: hash("1"),
      licenseId: "CC-BY-4.0",
      attributionHash: hash("2"),
    },
    instrument: {
      extractorId: "outsider-droid100-rlds",
      extractorVersion: "1.0.0",
      extractorImplementationHash: hash("3"),
      featureSchemaHash: hash("4"),
    },
    episodeIdHash: hash("5"),
    platformClass: "robot-manipulator",
    steps: [0, 1].map((index) => ({
      index,
      tOffsetMs: null,
      boundary: {
        isFirst: index === 0,
        isLast: index === 1,
        isTerminal: index === 1,
      },
      observation: {
        commitment: index === 0 ? hash("6") : hash("b"),
        features: { joint_0: index + 1 },
        images: [],
      },
      action: { kind: "robot-action", features: { action_0: index + 0.5 } },
      outcome: { kind: "recorded-outcome", features: { reward: index } },
    })),
  });
  const episodes = [episode];
  const clearances = [clearCurateEpisode(episode, { history: [] })];
  const checkpoint = buildCurateCheckpoint(clearances, {
    checkpointId: "droid100-first-shard-real-pilot",
  });
  const sourceArtifacts = {
    "manifest.json": serialize(manifest),
    "episodes.json": serialize(episodes),
    "clearances.json": serialize(clearances),
    "checkpoint.json": serialize(checkpoint),
  };
  const artifactContentHashes = Object.fromEntries(Object.entries(sourceArtifacts)
    .map(([name, body]) => [name, digest(body)]));
  const artifactSetHash = droid100PilotArtifactSetHash(artifactContentHashes);
  const firstShard = manifest.objects.find((item) => item.role === "TFRECORD_SHARD"
    && item.shardIndex === 0);
  const clearance = clearances[0];
  const body = {
    schema: "outsider/droid100-real-pilot-report/v1",
    source: {
      manifestHash: manifest.manifestHash,
      merkleRoot: manifest.integrity.merkleRoot,
      shardSha256: episode.source.sourceObjectHash,
      shardMd5Base64: firstShard.md5Base64,
      shardCrc32cBase64: firstShard.crc32cBase64,
      datasetInfoValidationHash: hash("7"),
      featureSchemaValidationHash: hash("8"),
      datasetInfoSha256: hash("9"),
      featuresSha256: hash("a"),
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
      instrument: episode.instrument,
    },
    decoded: {
      episodeCount: 1,
      totalSteps: 2,
      totalImageCommitments: 0,
      summaries: [{
        episodeOrdinal: 0,
        steps: 2,
        imageCommitments: 0,
        observationFeatureCount: 1,
        actionFeatureCount: 1,
        outcomeFeatureCount: 1,
        episodeHash: episode.episodeHash,
        clearanceHash: clearance.clearanceHash,
        disposition: clearance.disposition,
        causalExperienceUnits: clearance.causal.causalExperienceUnits,
      }],
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
    artifactSetHash,
  };
  const report = {
    ...body,
    reportHash: droid100PilotReportHash(body),
  };
  for (const [name, serialized] of Object.entries({
    ...sourceArtifacts, "report.json": serialize(report),
  })) writeFileSync(path.join(output, name), serialized);
  return output;
}

test("pilot verifier replays the five-file artifact graph without granting authority", () => {
  const output = makeOutput();
  const checked = verifyDroid100PilotArtifactDirectory(output);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "ARTIFACT_GRAPH_ONLY");
  assert.equal(checked.recordsVerified, true);
  assert.equal(checked.causalExperienceUnits, 0);
  assert.equal(checked.automaticTraining, false);
  assert.equal(Object.isFrozen(checked.artifacts), true);
  assert.equal(Object.isFrozen(checked.artifacts.episodes[0]), true);
});

test("verified artifact snapshot cannot be changed by a same-size post-verification swap", () => {
  const output = makeOutput();
  const checked = verifyDroid100PilotArtifactDirectory(output);
  assert.equal(checked.ok, true, checked.error);
  const verifiedEpisodeHash = checked.artifacts.episodes[0].episodeHash;
  const episodesPath = path.join(output, "episodes.json");
  const original = readFileSync(episodesPath, "utf8");
  const swapped = original.replace("robot-manipulator", "robot-manipulatoq");
  assert.equal(Buffer.byteLength(swapped), Buffer.byteLength(original));
  writeFileSync(episodesPath, swapped);
  assert.equal(checked.artifacts.episodes[0].episodeHash, verifiedEpisodeHash);
  assert.equal(checked.artifacts.episodes[0].platformClass, "robot-manipulator");
  assert.match(verifyDroid100PilotArtifactDirectory(output).error,
    /ARTIFACT_CONTENT_HASH_MISMATCH|CURATE_EPISODE/);
});

test("pilot verifier refuses content tamper, extra files, and partial source sets", () => {
  const tampered = makeOutput();
  const episodesPath = path.join(tampered, "episodes.json");
  const episodes = JSON.parse(readFileSync(episodesPath, "utf8"));
  episodes[0].platformClass = "tampered-platform";
  writeFileSync(episodesPath, serialize(episodes));
  assert.match(verifyDroid100PilotArtifactDirectory(tampered).error,
    /ARTIFACT_CONTENT_HASH_MISMATCH/);

  const extra = makeOutput();
  writeFileSync(path.join(extra, "raw-image.jpg"), "forbidden");
  assert.match(verifyDroid100PilotArtifactDirectory(extra).error,
    /OUTPUT_FILE_SET_INVALID/);

  const partial = makeOutput();
  assert.match(verifyDroid100PilotArtifactDirectory(partial, {
    source: { shardBytes: Buffer.alloc(1) },
  }).error, /SOURCE_SET_INCOMPLETE/);
});
