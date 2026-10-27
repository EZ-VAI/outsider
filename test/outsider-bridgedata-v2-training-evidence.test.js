import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  BRIDGEDATA_V2_FROZEN_SOURCE_20260822,
  BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA,
  bridgedataV2ExpectedAcquisitionManifest,
  buildBridgeDataV2TrainingEvidenceFromBytes,
  buildBridgeDataV2TrainingEvidenceFromSourceDirectory,
  verifyBridgeDataV2TrainingEvidence,
  verifyBridgeDataV2TrainingEvidenceWithSource,
} from "../src/outsider-bridgedata-v2-training-evidence.js";

const SOURCE = path.resolve("artifacts/bridgedata-v2-training-evidence-20260822/source-v1");
const ARTIFACT = path.resolve("artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json");
const READY = existsSync(SOURCE);

function officialBytes() {
  return Object.fromEntries(BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files
    .map((file) => [file.name, readFileSync(path.join(SOURCE, file.name))]));
}

function reseal(artifact) {
  const { artifactHash: _old, ...body } = artifact;
  return { ...body, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict({ domain: BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA, value: body }))
    .digest("hex")}` };
}

test("BridgeData V2 frozen profile pins nine objects and one exact TFRecord range", () => {
  const source = BRIDGEDATA_V2_FROZEN_SOURCE_20260822;
  assert.equal(source.files.length, 9);
  assert.equal(new Set(source.files.map((file) => file.name)).size, 9);
  assert.equal(source.files.reduce((total, file) => total + file.bytes, 0), 3_477_496);
  assert.equal(source.parentShard.contentLength, 108_381_239);
  assert.equal(source.parentShard.capturedRange, "bytes=0-3092033");
  assert.equal(source.files.at(-1).bytes, 3_092_034);
  assert.equal(source.files.at(-1).httpRange, source.parentShard.capturedRange);
  assert.ok(source.files.every((file) => /^sha256:[a-f0-9]{64}$/u.test(file.sha256)
    && file.url.startsWith("https://")));
  const manifest = bridgedataV2ExpectedAcquisitionManifest();
  assert.equal(manifest.transportAttested, false);
  assert.equal(manifest.objects.length, 9);
  assert.equal(manifest.objects.at(-1).acquisition, "EXACT_HTTPS_RANGE_CAPTURE_IMPORT");
});

test("official BridgeData replay preserves corpus accounting and the one-record selection boundary",
  { skip: !READY }, () => {
    const artifact = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE);
    assert.equal(artifact.source.profileMatchedAtBuild, true);
    assert.equal(artifact.dataset.projectClaimedTrajectories, 60_096);
    assert.equal(artifact.dataset.tfds.totalExamples, 60_064);
    assert.equal(artifact.dataset.reconciliation.projectMinusTfdsExamples, 32);
    assert.deepEqual(artifact.dataset.tfds.splits.map((split) => (
      [split.name, split.examples, split.shards]
    )), [["train", 53_192, 1024], ["val", 6_872, 128]]);
    assert.equal(artifact.sample.capturedWholeRecords, 1);
    assert.equal(artifact.sample.knownRecordsInParentShard, 52);
    assert.equal(artifact.sample.capturedWholeShard, false);
    assert.equal(artifact.sample.capturedWholeCorpus, false);
    assert.equal(artifact.sample.capturedTrainShards, 0);
    assert.equal(artifact.sample.capturedValidationShards, 0);
    assert.equal(artifact.sample.tfrecord.payloadBytes, 3_092_018);
    assert.equal(artifact.sample.tfrecord.framedBytes, 3_092_034);
    assert.equal(artifact.sample.tfrecord.allCrc32cValid, true);
    assert.equal(artifact.sample.featureKeysExactlyMatchTfdsSchema, true);
    assert.equal(artifact.sample.tfrecord.features.length, 20);
  });

test("sample dtype, shape, encoding, finite values, boolean domain, and JPEG headers are checked",
  { skip: !READY }, () => {
    const artifact = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE);
    const checks = artifact.sample.declaredRepresentationChecks;
    assert.equal(checks.declaredFeatures, 20);
    assert.equal(checks.allKindsMatch, true);
    assert.equal(checks.allDeclaredValueCountsMatch, true);
    assert.equal(checks.allFloatValuesFinite, true);
    assert.equal(checks.allBooleanValuesInDomain, true);
    assert.equal(checks.allDeclaredJpegImagesDecodeHeaderAs256x256x3, true);
    assert.equal(checks.allDeclaredUtf8TextValuesValid, true);
    assert.equal(checks.checks.find((row) => row.key === "steps/action").expectedValueCount, 196);
    assert.equal(checks.checks.find((row) => row.key === "steps/language_embedding").expectedValueCount, 14_336);
    for (const index of [0, 1, 2, 3]) {
      const image = checks.checks.find((row) => row.key === `steps/observation/image_${index}`);
      assert.deepEqual(image.shape, [256, 256, 3]);
      assert.equal(image.observedValueCount, 28);
      assert.equal(image.imageEncodingAndDimensionsMatch, true);
    }
    assert.equal(artifact.quality.sampleDeclaredDtypeShapeEncodingMatchedTfdsRepresentation, true);
    assert.equal(artifact.quality.fullCorpusSchemaConformanceEstablished, false);
    assert.equal(artifact.quality.fullSchemaAndSemanticContractEstablished, false);
    assert.equal(artifact.stage15Evidence.languageActionObservationStructuralFieldsObserved, true);
    assert.equal(artifact.stage15Evidence.languageActionObservationSemanticContractEstablished, false);
  });

test("schema-shaped attack cannot turn key equality into dtype or semantic conformance",
  { skip: !READY }, () => {
    const files = officialBytes();
    const schema = JSON.parse(files["features.json"].toString("utf8"));
    schema.featuresDict.features.steps.sequence.feature.featuresDict.features.action.tensor.dtype = "int32";
    files["features.json"] = Buffer.from(JSON.stringify(schema));
    const artifact = buildBridgeDataV2TrainingEvidenceFromBytes(files);
    assert.equal(artifact.sample.featureKeysExactlyMatchTfdsSchema, true);
    assert.equal(artifact.sample.declaredRepresentationChecks.allKindsMatch, false);
    assert.equal(artifact.quality.sampleDeclaredDtypeShapeEncodingMatchedTfdsRepresentation, false);
    assert.equal(artifact.quality.fullSchemaAndSemanticContractEstablished, false);
    assert.equal(verifyBridgeDataV2TrainingEvidence(artifact).ok, false);
  });

test("corrupted TFRecord bytes fail CRC before acquiring candidate status", { skip: !READY }, () => {
  const files = officialBytes();
  const sample = Buffer.from(files["bridge_dataset-train-record-00000.tfrecord"]);
  sample[1000] ^= 0x01;
  files["bridge_dataset-train-record-00000.tfrecord"] = sample;
  assert.throws(() => buildBridgeDataV2TrainingEvidenceFromBytes(files), /TFRECORD_CRC32C_INVALID/u);
});

test("exact bytes through generic builder cannot self-attest reality, rights, or training admission",
  { skip: !READY }, () => {
    const artifact = buildBridgeDataV2TrainingEvidenceFromBytes(officialBytes());
    assert.equal(artifact.source.callerBytesMatchedFrozenPins, true);
    assert.equal(artifact.source.profileMatchedAtBuild, false);
    assert.equal(artifact.source.sourceReality, "UNATTESTED_FIXTURE_BYTES");
    assert.equal(artifact.rights.publishedDatasetLicense, "UNESTABLISHED_FIXTURE");
    assert.equal(artifact.stage15Evidence.actualRobotTrajectoryBytesObserved, false);
    assert.equal(artifact.trainingCandidate.candidateWholeRecords, 0);
    assert.equal(artifact.trainingCandidate.trainerRowsEnqueued, 0);
    assert.equal(artifact.modelEntrance.TRAIN, false);
  });

test("CC BY statement is preserved without promotion to final legal or production-training judgment",
  { skip: !READY }, () => {
    const artifact = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE);
    assert.equal(artifact.rights.publishedDatasetLicense, "CC_BY_4_0");
    assert.equal(artifact.rights.licenseStatementBytePinned, true);
    assert.equal(artifact.rights.attributionRequired, true);
    assert.equal(artifact.rights.indicationOfChangesRequired, true);
    assert.equal(artifact.rights.legalReviewCompleted, false);
    assert.equal(artifact.rights.recordLevelThirdPartyContentReviewCompleted, false);
    assert.equal(artifact.rights.productionTrainingRightFinallyAdjudicated, false);
    assert.equal(artifact.trainingCandidate.decision, "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW");
    assert.equal(artifact.trainingCandidate.candidateWholeRecords, 1);
    assert.equal(artifact.trainingCandidate.trainerRowsEnqueued, 0);
    assert.equal(artifact.stage15Evidence.statisticalModelCapabilityImprovementEstablished, false);
  });

test("deferred alternatives retain machine-readable quality and rights reasons", { skip: !READY }, () => {
  const deferred = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE).deferredSources;
  assert.deepEqual(deferred.map((item) => item.sourceId),
    ["OPEN_X_EMBODIMENT", "WAYMO_OPEN_DATASET", "NASA_ASRS_UAS"]);
  assert.ok(deferred.every((item) => item.reasonCodes.length >= 2));
  assert.ok(deferred.find((item) => item.sourceId === "WAYMO_OPEN_DATASET")
    .reasonCodes.includes("NON_COMMERCIAL_USE_BOUNDARY"));
  assert.ok(deferred.find((item) => item.sourceId === "NASA_ASRS_UAS")
    .reasonCodes.includes("NO_EXPOSURE_DENOMINATOR"));
});

test("standalone fixed projection rejects resealed boundary escalation",
  { skip: !READY }, () => {
    const artifact = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE);
    const checked = verifyBridgeDataV2TrainingEvidence(artifact);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel,
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION");
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.trainingAdmissionEstablished, false);
    assert.equal(checked.authorityEstablished, false);
    const attacks = [
      reseal({ ...artifact, readyToPrice: true }),
      reseal({ ...artifact, authority: { ...artifact.authority, TRAIN: true } }),
      reseal({ ...artifact, authority: { ...artifact.authority, UNDERWRITE: true } }),
      reseal({ ...artifact, modelEntrance: { ...artifact.modelEntrance, GUARANTEE: true } }),
      reseal({ ...artifact, trainingCandidate: { ...artifact.trainingCandidate,
        productionUseAuthorized: true } }),
      reseal({ ...artifact, source: { ...artifact.source,
        files: artifact.source.files.slice(1) } }),
      reseal({ ...artifact, trainingCandidate: { ...artifact.trainingCandidate,
        requiredBeforeTrainerAdmission:
          artifact.trainingCandidate.requiredBeforeTrainerAdmission.slice(1) } }),
      reseal({ ...artifact, trainingCandidate: { ...artifact.trainingCandidate,
        requiredBeforeTrainerAdmission: ["NO_MORE_EVIDENCE_REQUIRED",
          ...artifact.trainingCandidate.requiredBeforeTrainerAdmission.slice(1)] } }),
      reseal({ ...artifact, modelEntrance: { ...artifact.modelEntrance,
        targetDomainFactorAdmission: true } }),
      reseal({ ...artifact, rights: { ...artifact.rights, productionTrainingRightFinallyAdjudicated: true } }),
      reseal({ ...artifact, quality: { ...artifact.quality, fullSchemaAndSemanticContractEstablished: true } }),
      reseal({ ...artifact, stage15Evidence: { ...artifact.stage15Evidence,
        statisticalModelCapabilityImprovementEstablished: true } }),
    ];
    assert.ok(attacks.every((attack) => !verifyBridgeDataV2TrainingEvidence(attack).ok));
  });

test("canonical BridgeData artifact performs full exact source replay", {
  skip: !(READY && existsSync(ARTIFACT)),
}, () => {
  const serialized = readFileSync(ARTIFACT);
  const artifact = JSON.parse(serialized.toString("utf8"));
  const checked = verifyBridgeDataV2TrainingEvidenceWithSource(artifact, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REPLAY");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.candidateArtifactExactlyRebuilt, true);
  assert.equal(checked.realPublishedRobotExperienceAdmissionEstablished, true);
  assert.equal(checked.independentExperimentalTruthEstablished, false);
  assert.equal(checked.underlyingWorldTruthEstablished, false);
  assert.equal(Object.hasOwn(checked, "sourceTruthEstablished"), false);
  assert.equal(checked.trainingAdmissionEstablished, false);
  assert.equal(artifact.artifactHash,
    "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2");
  assert.equal(`sha256:${createHash("sha256").update(serialized).digest("hex")}`,
    "sha256:c5eaba1e0e910733ab6fad1007d90839762a6e8ae97ee68e9ddeb4266da5f25f");
});

test("fixed standalone projection and full replay both reject resealed derived changes",
  { skip: !READY }, () => {
  const artifact = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE);
  const changed = reseal({ ...artifact, dataset: { ...artifact.dataset,
    projectClaimedEnvironments: 25 } });
  assert.equal(verifyBridgeDataV2TrainingEvidence(changed).ok, false);
  const checked = verifyBridgeDataV2TrainingEvidenceWithSource(changed, SOURCE);
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceProfileReproduced, true);
  assert.equal(checked.candidateArtifactExactlyRebuilt, false);
});

test("BridgeData builders reject non-frozen clocks and CLIs expose both verification levels",
  { skip: !(READY && existsSync(ARTIFACT)) }, () => {
    assert.throws(() => buildBridgeDataV2TrainingEvidenceFromSourceDirectory(SOURCE,
      { generatedAt: "2099-01-01T00:00:00.000Z" }), /NOT_FROZEN_SNAPSHOT/u);
    const standalone = spawnSync(process.execPath, ["scripts/bridgedata-v2-training-evidence.mjs",
      "verify", "--artifact", ARTIFACT], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(standalone.status, 0, standalone.stderr);
    assert.equal(JSON.parse(standalone.stdout).verificationLevel,
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION");
    const replay = spawnSync(process.execPath, ["scripts/bridgedata-v2-training-evidence.mjs",
      "verify-source", "--artifact", ARTIFACT, "--source", SOURCE],
    { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(replay.status, 0, replay.stderr);
    assert.equal(JSON.parse(replay.stdout).verificationLevel, "FULL_SOURCE_REPLAY");
  });

test("BridgeData acquisition CLI imports only exact pinned captures", { skip: !READY }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-bridgedata-acquire-"));
  try {
    const out = path.join(directory, "source");
    const acquired = spawnSync(process.execPath,
      ["scripts/acquire-bridgedata-v2-training-evidence.mjs", "--import-dir", SOURCE,
        "--out-dir", out], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(acquired.status, 0, acquired.stderr);
    const receipt = JSON.parse(acquired.stdout);
    assert.equal(receipt.sourceCount, 9);
    assert.equal(receipt.sourceBytes, 3_477_496);
    assert.equal(receipt.acquisitionManifestSha256,
      "sha256:a8d71e781fc27120619049c19cc37fd46867aba70e097a05fb5c88a67263dc44");
    assert.equal(buildBridgeDataV2TrainingEvidenceFromSourceDirectory(out)
      .source.profileMatchedAtBuild, true);
    unlinkSync(path.join(out, "acquisition.json"));
    symlinkSync(path.join(SOURCE, "acquisition.json"), path.join(out, "acquisition.json"));
    assert.throws(() => buildBridgeDataV2TrainingEvidenceFromSourceDirectory(out),
      /ACQUISITION_MANIFEST_UNSAFE/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
