import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DROID100_MAX_BYTES,
  DROID100_SHARD_COUNT,
  DROID100_SOURCE_PREFIX,
  buildDroid100AcquisitionManifest,
  createDroid100ImportPlan,
  normalizeDroid100EpisodeFact,
  verifyDroid100AcquisitionManifest,
} from "../src/outsider-droid100-adapter.js";

const md5 = (index) => Buffer.alloc(16, index).toString("base64");
const crc = (index) => Buffer.alloc(4, index).toString("base64");

function object(name, index, size = 1000 + index) {
  return {
    url: `${DROID100_SOURCE_PREFIX}${name}`,
    metadata: {
      bucket: "gresearch",
      name: `robotics/droid_100/1.0.0/${name}`,
      generation: String(1000000000000 + index),
      size: String(size),
      md5Hash: md5(index),
      crc32c: crc(index),
    },
  };
}

function completeObjects() {
  const objects = [object("dataset_info.json", 40), object("features.json", 41)];
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    objects.push(object(
      `r2d2_faceblur-train.tfrecord-${String(index).padStart(5, "0")}-of-00031`, index,
    ));
  }
  return objects;
}

test("DROID 100 object list becomes a deterministic 31-shard Merkle manifest", () => {
  const objects = completeObjects();
  const first = buildDroid100AcquisitionManifest(JSON.stringify(objects));
  const second = buildDroid100AcquisitionManifest({ items: [...objects].reverse() });
  assert.deepEqual(second, first);
  assert.equal(first.dataset.sourcePrefix, DROID100_SOURCE_PREFIX);
  assert.equal(first.dataset.expectedShardCount, 31);
  assert.equal(first.objects.length, 33);
  assert.match(first.integrity.merkleRoot, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.manifestHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(verifyDroid100AcquisitionManifest(first), {
    ok: true,
    manifestHash: first.manifestHash,
    merkleRoot: first.integrity.merkleRoot,
  });
  assert.equal(first.license.status, "DECLARED_BY_OFFICIAL_PAPER_NOT_GCS_OBJECT_METADATA");
  assert.equal(first.license.identifier, "CC-BY-4.0");
  assert.equal(first.license.objectMetadataVerified, false);
  assert.match(first.license.attributionNotice.noticeHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.authority.admission, "QUARANTINE_ONLY");
});

test("DROID 100 manifest fails closed on a missing numbered shard", () => {
  const objects = completeObjects().filter((entry) => !entry.url.includes("00017-of-00031"));
  assert.throws(() => buildDroid100AcquisitionManifest(objects), /DROID100_SHARD_MISSING:00017/);
});

test("DROID 100 manifest fails closed on a duplicate object", () => {
  const objects = completeObjects();
  objects[3] = structuredClone(objects[2]);
  assert.throws(() => buildDroid100AcquisitionManifest(objects), /DROID100_DUPLICATE_OBJECT/);
});

test("DROID 100 manifest fails closed when the corpus exceeds 3 GiB", () => {
  const objects = completeObjects();
  const each = Math.floor(DROID100_MAX_BYTES / objects.length) + 1;
  for (const entry of objects) entry.metadata.size = String(each);
  assert.throws(() => buildDroid100AcquisitionManifest(objects), /DROID100_CORPUS_OVERSIZE/);
});

test("DROID 100 manifest rejects wrong names, prefixes, and malformed checksums", () => {
  const wrongName = completeObjects();
  wrongName[2].url = `${DROID100_SOURCE_PREFIX}r2d2_faceblur-train.tfrecord-00000-of-00032`;
  wrongName[2].metadata.name = "robotics/droid_100/1.0.0/r2d2_faceblur-train.tfrecord-00000-of-00032";
  assert.throws(() => buildDroid100AcquisitionManifest(wrongName), /DROID100_OBJECT_NAME_UNEXPECTED/);

  const wrongPrefix = completeObjects();
  wrongPrefix[2].url = wrongPrefix[2].url.replace("gresearch", "attacker");
  wrongPrefix[2].metadata.bucket = "attacker";
  assert.throws(() => buildDroid100AcquisitionManifest(wrongPrefix), /DROID100_SOURCE_PREFIX_MISMATCH/);

  const badMd5 = completeObjects();
  badMd5[2].metadata.md5Hash = Buffer.alloc(15).toString("base64");
  assert.throws(() => buildDroid100AcquisitionManifest(badMd5), /DROID100_MD5_INVALID/);

  const badCrc = completeObjects();
  badCrc[2].metadata.crc32c = "not-base64";
  assert.throws(() => buildDroid100AcquisitionManifest(badCrc), /DROID100_CRC32C_INVALID/);
});

test("DROID 100 manifest detects post-build checksum and generation tamper", () => {
  const manifest = buildDroid100AcquisitionManifest(completeObjects());
  const checksumTamper = structuredClone(manifest);
  checksumTamper.objects[0].md5Base64 = Buffer.alloc(16, 99).toString("base64");
  assert.equal(verifyDroid100AcquisitionManifest(checksumTamper).ok, false);

  const generationTamper = structuredClone(manifest);
  generationTamper.objects[0].generation = "9999999999999";
  assert.equal(verifyDroid100AcquisitionManifest(generationTamper).ok, false);
});

test("import plan pins each shard and names the separate privacy-safe extractor", () => {
  const manifest = buildDroid100AcquisitionManifest(completeObjects());
  const plan = createDroid100ImportPlan(manifest);
  assert.equal(plan.shards.length, 31);
  assert.equal(plan.extractor.implementationBundled, true);
  assert.equal(plan.extractor.stepOutputSchema, "outsider/curate-episode-input/v1");
  assert.equal(plan.admission, "QUARANTINE_ONLY");
  assert.equal(plan.automaticLearningPromotion, false);
  assert.match(plan.planHash, /^sha256:[a-f0-9]{64}$/);
});

test("normalized episode fact hashes and discards private extractor metadata", () => {
  const manifest = buildDroid100AcquisitionManifest(completeObjects());
  const shard = manifest.objects.find((entry) => entry.role === "TFRECORD_SHARD");
  const secretKey = "/Users/alice/private/droid/collector-jane/episode-7";
  const instruction = "pick up the private red mug near Alice";
  const fact = normalizeDroid100EpisodeFact({
    manifestHash: manifest.manifestHash,
    sourceObjectLeafHash: shard.leafHash,
    episodeKey: secretKey,
    episodeOrdinal: 7,
    stepCount: 83,
    durationMs: 9200,
    success: true,
    terminated: true,
    truncated: false,
    actionDimensions: 7,
    proprioceptionDimensions: 14,
    cameraStreamCount: 3,
    languageInstruction: instruction,
  }, { manifest });
  const serialized = JSON.stringify(fact);
  assert.doesNotMatch(serialized, /Users\/alice|collector-jane|private red mug|Alice/);
  assert.equal(fact.privacy.rawImagesIncluded, false);
  assert.equal(fact.privacy.sourcePathIncluded, false);
  assert.equal(fact.privacy.collectorIdentityIncluded, false);
  assert.equal(fact.admissibility.causalEvidence, false);
  assert.match(fact.episode.keyHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(fact.observations.instructionHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(fact.factHash, /^sha256:[a-f0-9]{64}$/);
});

test("normalized episode fact rejects unknown raw, path, collector, and media fields", () => {
  const manifest = buildDroid100AcquisitionManifest(completeObjects());
  const shard = manifest.objects.find((entry) => entry.role === "TFRECORD_SHARD");
  const base = {
    manifestHash: manifest.manifestHash,
    sourceObjectLeafHash: shard.leafHash,
    episodeKey: "episode-1",
    episodeOrdinal: 1,
    stepCount: 2,
    durationMs: 10,
  };
  for (const [field, value] of [
    ["raw", Buffer.from("frame")],
    ["image", "base64-data"],
    ["sourcePath", "/tmp/private"],
    ["collector", "person@example.com"],
    ["absoluteTimestamp", "2026-08-19T00:00:00Z"],
    ["trajectory", [1, 2, 3]],
  ]) {
    assert.throws(
      () => normalizeDroid100EpisodeFact({ ...base, [field]: value }, { manifest }),
      new RegExp(`DROID100_EPISODE_FIELD_FORBIDDEN:${field}`),
    );
  }
});

test("normalized episode facts must bind to a verified manifest and one of its shards", () => {
  const manifest = buildDroid100AcquisitionManifest(completeObjects());
  const shard = manifest.objects.find((entry) => entry.role === "TFRECORD_SHARD");
  const input = {
    manifestHash: manifest.manifestHash,
    sourceObjectLeafHash: shard.leafHash,
    episodeKey: "episode-1",
    episodeOrdinal: 1,
    stepCount: 2,
    durationMs: 10,
  };
  assert.throws(() => normalizeDroid100EpisodeFact(input), /EPISODE_MANIFEST_UNVERIFIED/);
  assert.throws(
    () => normalizeDroid100EpisodeFact({ ...input, sourceObjectLeafHash: `sha256:${"c".repeat(64)}` }, { manifest }),
    /EPISODE_SOURCE_SHARD_UNBOUND/,
  );
});

test("offline inspector emits a verified import plan without downloading corpus bytes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-droid100-"));
  const objectList = path.join(directory, "objects.json");
  writeFileSync(objectList, JSON.stringify(completeObjects()));
  const result = spawnSync(process.execPath, [
    "scripts/stage15-droid100-inspect.mjs", "--object-list", objectList, "--plan",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.schema, "outsider/droid100-import-plan/v1");
  assert.equal(plan.shards.length, 31);
  assert.equal(plan.extractor.implementationBundled, true);
});

test("real pilot requires a new output directory before touching corpus bytes", () => {
  const missing = spawnSync(process.execPath, [
    "scripts/stage15-droid100-real-pilot.mjs",
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /DROID100_OUTPUT_DIR_REQUIRED/);

  const existing = mkdtempSync(path.join(tmpdir(), "outsider-droid100-pilot-existing-"));
  const refused = spawnSync(process.execPath, [
    "scripts/stage15-droid100-real-pilot.mjs", "--output-dir", existing,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /DROID100_OUTPUT_DIR_EXISTS/);
});
