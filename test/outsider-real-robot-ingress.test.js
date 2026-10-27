import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  BRIDGEDATA_V2_DATASET,
  BRIDGEDATA_V2_OFFICIAL_PIN,
  REAL_ROBOT_SCHEMAS,
  createRealRobotObservationProjection,
  hashRealRobotValue,
  verifyRealRobotObservationProjection,
} from "../src/outsider-real-robot-ingress.js";

const REVISION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function jpeg(width, height, marker = 0) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, marker, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11,
    0xff, 0xd9,
  ]);
}

function featureSchema() {
  const scalar = (dtype) => ({ tensor: { shape: {}, dtype, encoding: "none" } });
  const image = () => ({ image: { shape: { dimensions: ["256", "256", "3"] },
    dtype: "uint8", encodingFormat: "jpeg" } });
  const steps = {
    action: { tensor: { shape: { dimensions: ["7"] }, dtype: "float32",
      encoding: "none" }, description: "Robot action, consists of [7x values]." },
    discount: scalar("float32"),
    is_first: scalar("bool"),
    is_last: scalar("bool"),
    is_terminal: scalar("bool"),
    language_embedding: { tensor: { shape: { dimensions: ["512"] },
      dtype: "float32", encoding: "none" } },
    language_instruction: { text: {} },
    observation: { featuresDict: { features: {
      image_0: image(), image_1: image(), image_2: image(), image_3: image(),
      state: { tensor: { shape: { dimensions: ["7"] }, dtype: "float32",
        encoding: "none" }, description: "Robot state, consists of [7x values]." },
    } } },
    reward: scalar("float32"),
  };
  const metadata = { episode_id: {}, file_path: {}, has_image_0: {},
    has_image_1: {}, has_image_2: {}, has_image_3: {}, has_language: {} };
  return { pythonClassName: "FeaturesDict", featuresDict: { features: {
    steps: { sequence: { feature: { featuresDict: { features: steps } } } },
    episode_metadata: { featuresDict: { features: metadata } },
  } } };
}

function fixture() {
  const page = [
    "<html><body>",
    "<li>4 trajectories<ul><li>3 teleoperated demonstrations</li>",
    "<li>1 rollouts from a scripted pick-and-place policy</li></ul></li>",
    "<li>2 environments</li><li>1 skills</li>",
    "All the data was collected on a WidowX 250 6DOF robot arm.",
    "The control frequency is 5 Hz and the average trajectory length is 38 timesteps.",
    "For sensing, we use an RGBD camera. The images are saved at a 2x1 resolution.",
    "All data is provided under the Creative Commons Attribution 4.0 International License",
    "</body></html>",
  ].join("\n");
  const index = [
    "raw/lab/trajectory-0/images0/im_0.jpg,raw/lab/trajectory-0/images0/im_2.jpg,move object",
    "raw/lab/trajectory-1/images0/im_0.jpg,raw/lab/trajectory-1/images0/im_3.jpg,move other object",
    "",
  ].join("\n");
  const datasetInfo = {
    citation: "TODO(example_dataset): citation",
    description: "TODO(example_dataset): description",
    fileFormat: "tfrecord",
    moduleName: "bridge_dataset.bridge_dataset_dataset_builder",
    name: "bridge_dataset",
    releaseNotes: { "1.0.0": "Initial release." },
    splits: [
      { filepathTemplate: "x", name: "train", numBytes: "1000",
        shardLengths: ["1", "2"] },
      { filepathTemplate: "x", name: "val", numBytes: "200",
        shardLengths: ["1"] },
    ],
    version: "1.0.0",
  };
  const stats = {
    action: { mean: Array(7).fill(0), std: Array(7).fill(1),
      max: Array(7).fill(2), min: Array(7).fill(-2) },
    proprio: { mean: Array(7).fill(0), std: Array(7).fill(1),
      max: Array(7).fill(2), min: Array(7).fill(-2) },
  };
  const input = {
    projectPageBytes: Buffer.from(page),
    trajectoryIndexBytes: Buffer.from(index),
    datasetInfoBytes: Buffer.from(JSON.stringify(datasetInfo)),
    featuresBytes: Buffer.from(JSON.stringify(featureSchema())),
    actionProprioStatsBytes: Buffer.from(JSON.stringify(stats)),
    codeReadmeBytes: Buffer.from(["# Jax BC/RL Implementations for BridgeData V2",
      "https://rail-berkeley.github.io/bridgedata/",
      "The raw dataset (comprised of JPEGs, PNGs, and pkl files)",
      "trajectories are structured using the [RLDS]", ""].join("\n")),
    codeLicenseBytes: Buffer.from(["MIT License", "",
      "Copyright (c) 2023 Robotic AI & Learning Lab Berkeley", ""].join("\n")),
    sampleInitialBytes: jpeg(2, 1, 1),
    sampleFinalBytes: jpeg(2, 1, 2),
  };
  const fileInputs = {
    projectPage: input.projectPageBytes,
    trajectoryIndex: input.trajectoryIndexBytes,
    datasetInfo: input.datasetInfoBytes,
    features: input.featuresBytes,
    actionProprioStats: input.actionProprioStatsBytes,
    codeReadme: input.codeReadmeBytes,
    codeLicense: input.codeLicenseBytes,
    sampleInitial: input.sampleInitialBytes,
    sampleFinal: input.sampleFinalBytes,
  };
  const roles = {
    projectPage: "PUBLISHER_DATASET_DESCRIPTION_AND_DATA_LICENSE",
    trajectoryIndex: "PUBLISHER_TRAJECTORY_BROWSER_INDEX",
    datasetInfo: "TFDS_1_0_0_DATASET_INFO",
    features: "TFDS_1_0_0_FEATURE_SCHEMA",
    actionProprioStats: "ACTION_PROPRIO_AGGREGATE_STATISTICS_OPAQUE_VARIANT",
    codeReadme: "PINNED_CODE_README_DATA_LINKAGE",
    codeLicense: "PINNED_CODE_LICENSE",
    sampleInitial: "DETERMINISTIC_TRAJECTORY_INITIAL_CAMERA_FRAME",
    sampleFinal: "DETERMINISTIC_TRAJECTORY_FINAL_CAMERA_FRAME",
  };
  const sourceRootUrl = "https://fixture.invalid/";
  const files = Object.fromEntries(Object.entries(fileInputs).map(([key, bytes]) =>
    [key, { role: roles[key],
      url: key === "sampleInitial"
        ? `${sourceRootUrl}raw/lab/trajectory-0/images0/im_0.jpg`
        : key === "sampleFinal"
          ? `${sourceRootUrl}raw/lab/trajectory-0/images0/im_2.jpg`
          : `${sourceRootUrl}${key}`,
      sha256: hashRealRobotValue(bytes), bytes: bytes.length,
      pathDisclosure: key.startsWith("sample")
        ? "RAW_TRAJECTORY_PATH_REDACTED_FROM_PROJECTION"
        : key === "trajectoryIndex" ? "PUBLIC_INDEX_URL_RAW_ROWS_REDACTED"
          : "PUBLIC_NON_TRAJECTORY_URL" } ]));
  const pinBody = {
    schema: REAL_ROBOT_SCHEMAS.sourcePin,
    scope: "TEST_FIXTURE_ONLY",
    datasetId: "fixture/real-robot",
    repositoryUrl: "https://fixture.invalid/repository",
    repositoryRevision: REVISION,
    repositoryRevisionUrl: `https://fixture.invalid/commit/${REVISION}`,
    datasetVersion: "1.0.0",
    sourceRootUrl,
    files,
    dataLicenseSpdx: "CC-BY-4.0",
    codeLicenseSpdx: "MIT",
    licenseScope: "PINNED_PROJECT_PAGE_DATA_DECLARATION_AND_PINNED_INGESTED_BYTES",
    expectedCoverage: {
      projectPageTrajectories: 4, projectPageTeleoperated: 3,
      projectPageScripted: 1, projectPageEnvironments: 2,
      projectPageSkills: 1, tfdsTrainExamples: 3, tfdsValExamples: 1,
      tfdsTotalExamples: 4, tfdsTrainBytes: 1000, tfdsValBytes: 200,
      tfdsTrainShards: 2, tfdsValShards: 1, trajectoryIndexRows: 2,
      uniqueTrajectoryPathPairs: 2, sampleOrdinal: 0, imageWidth: 2,
      imageHeight: 1, actionDimension: 7, proprioDimension: 7,
    },
  };
  const trustedPin = { ...pinBody, pinHash: hashRealRobotValue(pinBody) };
  const source = { datasetId: trustedPin.datasetId,
    repositoryRevision: trustedPin.repositoryRevision,
    datasetVersion: trustedPin.datasetVersion };
  return { input, trustedPin, source, page, index };
}

function build(value = fixture()) {
  return createRealRobotObservationProjection({ ...value.input,
    source: value.source, trustedPin: value.trustedPin });
}

test("quarantines real-robot fixtures and preserves zero target authority", () => {
  const projection = build();
  assert.equal(projection.evidentiaryWeight.observationRealityClass,
    "TEST_FIXTURE_ONLY");
  assert.equal(projection.evidentiaryWeight.ownOutsiderOutcome, false);
  assert.equal(projection.evidentiaryWeight.ownOutsiderOutcomeWeight, 0);
  assert.equal(projection.evidentiaryWeight.targetPriorEstablished, false);
  assert.equal(projection.evidentiaryWeight.targetPriorWeight, 0);
  assert.equal(projection.evidentiaryWeight.pricingAuthorityWeight, 0);
  assert.equal(projection.authority.targetPricingEstablished, false);
  assert.equal(projection.authority.executionAuthorityEstablished, false);
  assert.equal(projection.outcome.outsiderOutcomeDenominatorContribution, 0);
});

test("replays every source byte and rejects verification without source", () => {
  const value = fixture();
  const projection = build(value);
  assert.deepEqual(verifyRealRobotObservationProjection(projection, {
    ...value.input, trustedPin: value.trustedPin }), {
    ok: true, projectionHash: projection.projectionHash, sourceBytesReplayed: true,
    observationRealityClass: "TEST_FIXTURE_ONLY", ownOutsiderOutcome: false,
    targetPriorEstablished: false, pricingAuthorityEstablished: false,
  });
  assert.equal(verifyRealRobotObservationProjection(projection).error,
    "REAL_ROBOT_SOURCE_BYTES_REQUIRED");
});

test("keeps publisher, TFDS and browser-index denominators separate", () => {
  const projection = build();
  assert.equal(projection.coverage.publisherPage.claimedTrajectories, 4);
  assert.equal(projection.coverage.tfdsMetadata.totalExamples, 4);
  assert.equal(projection.coverage.publicTrajectoryBrowserIndex.rows, 2);
  assert.equal(projection.coverage.publicTrajectoryBrowserIndex
    .completeDatasetIndexEstablished, false);
  assert.equal(projection.coverage.denominatorReconciliation
    .globallyCompleteTrajectoryCensusEstablished, false);
  assert.equal(projection.coverage.replayedObservationSubset
    .completeActionTrajectories, 0);
});

test("projection is privacy-minimal despite path, language and image inputs", () => {
  const value = fixture();
  const projection = build(value);
  const encoded = canonicalizeStrict(projection);
  assert.doesNotMatch(encoded, /raw\/lab\/trajectory/u);
  assert.doesNotMatch(encoded, /move object/u);
  assert.doesNotMatch(encoded, /\/private\/tmp|\/Users\//u);
  assert.equal(projection.privacy.rawImagesRetainedInProjection, false);
  assert.equal(projection.privacy.rawPixelsRetainedInProjection, false);
  assert.equal(projection.privacy.rawTrajectoryPathsRetained, false);
  assert.equal(projection.privacy.rawLanguageAnnotationsRetained, false);
});

test("closed projection schema and replay defeat ordinary and recomputed tamper", () => {
  const value = fixture();
  const projection = build(value);
  const injected = structuredClone(projection);
  injected.surprise = true;
  assert.equal(verifyRealRobotObservationProjection(injected, {
    ...value.input, trustedPin: value.trustedPin }).error,
  "REAL_ROBOT_PROJECTION_SHAPE_INVALID");

  const promoted = structuredClone(projection);
  promoted.evidentiaryWeight.targetPriorEstablished = true;
  promoted.evidentiaryWeight.targetPriorWeight = 1;
  const { projectionHash: _old, ...body } = promoted;
  promoted.projectionHash = hashRealRobotValue(body);
  assert.equal(verifyRealRobotObservationProjection(promoted, {
    ...value.input, trustedPin: value.trustedPin }).error,
  "REAL_ROBOT_PROJECTION_REPLAY_INVALID");
});

test("source tamper, duplicate trajectory and bad statistics fail closed", () => {
  const sourceTamper = fixture();
  sourceTamper.input.sampleFinalBytes = Buffer.from(sourceTamper.input.sampleFinalBytes);
  sourceTamper.input.sampleFinalBytes[8] ^= 1;
  assert.throws(() => build(sourceTamper), /SAMPLEFINAL_PROVENANCE_INVALID/u);

  const duplicate = fixture();
  duplicate.input.trajectoryIndexBytes = Buffer.from([
    "raw/lab/trajectory-0/images0/im_0.jpg,raw/lab/trajectory-0/images0/im_2.jpg,a",
    "raw/lab/trajectory-0/images0/im_0.jpg,raw/lab/trajectory-0/images0/im_2.jpg,b",
    "",
  ].join("\n"));
  duplicate.trustedPin.files.trajectoryIndex.sha256 =
    hashRealRobotValue(duplicate.input.trajectoryIndexBytes);
  duplicate.trustedPin.files.trajectoryIndex.bytes =
    duplicate.input.trajectoryIndexBytes.length;
  const { pinHash: _duplicateHash, ...duplicateBody } = duplicate.trustedPin;
  duplicate.trustedPin.pinHash = hashRealRobotValue(duplicateBody);
  assert.throws(() => build(duplicate), /TRAJECTORY_INDEX_DUPLICATE/u);

  const badStats = fixture();
  const stats = JSON.parse(badStats.input.actionProprioStatsBytes);
  stats.action.std[0] = -1;
  badStats.input.actionProprioStatsBytes = Buffer.from(JSON.stringify(stats));
  badStats.trustedPin.files.actionProprioStats.sha256 =
    hashRealRobotValue(badStats.input.actionProprioStatsBytes);
  badStats.trustedPin.files.actionProprioStats.bytes =
    badStats.input.actionProprioStatsBytes.length;
  const { pinHash: _statsHash, ...statsBody } = badStats.trustedPin;
  badStats.trustedPin.pinHash = hashRealRobotValue(statsBody);
  assert.throws(() => build(badStats), /STATS_ORDER_INVALID/u);
});

test("custom pins cannot inherit official BridgeData authority", () => {
  const value = fixture();
  value.trustedPin.datasetId = BRIDGEDATA_V2_DATASET;
  value.source.datasetId = BRIDGEDATA_V2_DATASET;
  const { pinHash: _old, ...body } = value.trustedPin;
  value.trustedPin.pinHash = hashRealRobotValue(body);
  assert.throws(() => build(value), /CUSTOM_PIN_SCOPE_INVALID/u);
});

test("official pin is immutable, content-addressed and license-scoped", () => {
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.repositoryRevision,
    "bc60a35b701a12021c8c95e9d8601274d3acd928");
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.pinHash,
    "sha256:a531bbf4edba07973181658cabe27c414e1edbdb4fb3396fea4eb0fd6ff6c3ba");
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.dataLicenseSpdx, "CC-BY-4.0");
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.codeLicenseSpdx, "MIT");
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.files.sampleInitial.bytes, 120_503);
  assert.equal(BRIDGEDATA_V2_OFFICIAL_PIN.files.sampleFinal.bytes, 120_524);
});

const officialRoot = process.env.OUTSIDER_REAL_ROBOT_OFFICIAL_SOURCE;
const OFFICIAL_STATS_FILE =
  "action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json";

function officialInput(root) {
  return {
    projectPageBytes: readFileSync(join(root, "project-page.html")),
    trajectoryIndexBytes: readFileSync(join(root, "traj_links.csv")),
    datasetInfoBytes: readFileSync(join(root, "dataset_info.json")),
    featuresBytes: readFileSync(join(root, "features.json")),
    actionProprioStatsBytes: readFileSync(join(root, OFFICIAL_STATS_FILE)),
    codeReadmeBytes: readFileSync(join(root, "code-readme.md")),
    codeLicenseBytes: readFileSync(join(root, "code-license.txt")),
    sampleInitialBytes: readFileSync(join(root, "trajectory-sample-initial.jpg")),
    sampleFinalBytes: readFileSync(join(root, "trajectory-sample-final.jpg")),
  };
}

test("official bytes establish high physical reality without target promotion",
  { skip: officialRoot == null }, () => {
    const input = officialInput(officialRoot);
    const projection = createRealRobotObservationProjection({ ...input,
      source: { datasetId: BRIDGEDATA_V2_DATASET,
        repositoryRevision: BRIDGEDATA_V2_OFFICIAL_PIN.repositoryRevision,
        datasetVersion: "1.0.0" } });
    assert.equal(projection.evidentiaryWeight.observationRealityClass,
      "REAL_PHYSICAL_OBSERVATION_HIGH_WEIGHT");
    assert.equal(projection.evidentiaryWeight.realRobotSensorBytesReplayed, true);
    assert.equal(projection.coverage.publisherPage.claimedTrajectories, 60_096);
    assert.equal(projection.coverage.tfdsMetadata.totalExamples, 60_064);
    assert.equal(projection.coverage.denominatorReconciliation.publisherMinusTfds, 32);
    assert.equal(projection.coverage.publicTrajectoryBrowserIndex.rows, 43_592);
    assert.equal(projection.observation.sample.dimensions.width, 640);
    assert.equal(projection.observation.sample.dimensions.height, 480);
    assert.equal(projection.observation.sample.completeTrajectoryReplayEstablished, false);
    assert.equal(projection.authority.targetPriorEstablished, false);
    assert.equal(projection.authority.pricingAuthorityEstablished, false);
    assert.equal(verifyRealRobotObservationProjection(projection, input).ok, true);
  });

test("official CLI writes a private projection and never emits raw path or language",
  { skip: officialRoot == null }, () => {
    const root = mkdtempSync(join(tmpdir(), "outsider-real-robot-cli-"));
    chmodSync(root, 0o700);
    const output = join(root, "projection.json");
    const result = spawnSync(process.execPath,
      ["tools/outsider-ingest-real-robot.mjs",
        "--project-page-input", join(officialRoot, "project-page.html"),
        "--trajectory-index-input", join(officialRoot, "traj_links.csv"),
        "--dataset-info-input", join(officialRoot, "dataset_info.json"),
        "--features-input", join(officialRoot, "features.json"),
        "--action-proprio-stats-input", join(officialRoot, OFFICIAL_STATS_FILE),
        "--code-readme-input", join(officialRoot, "code-readme.md"),
        "--code-license-input", join(officialRoot, "code-license.txt"),
        "--sample-initial-input", join(officialRoot, "trajectory-sample-initial.jpg"),
        "--sample-final-input", join(officialRoot, "trajectory-sample-final.jpg"),
        "--revision", BRIDGEDATA_V2_OFFICIAL_PIN.repositoryRevision,
        "--output", output],
      { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.observationRealityClass,
      "REAL_PHYSICAL_OBSERVATION_HIGH_WEIGHT");
    assert.equal(summary.tfdsMetadataExamples, 60_064);
    assert.equal(summary.browserIndexRows, 43_592);
    assert.equal(summary.ownOutsiderOutcome, false);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const encoded = readFileSync(output, "utf8");
    assert.doesNotMatch(encoded, /raw\/rss\/toykitchen/u);
    assert.doesNotMatch(encoded, /place the red and white mushroom/u);
    assert.doesNotMatch(encoded, /\/private\/tmp|\/Users\//u);
    assert.equal(JSON.parse(encoded).projectionHash, summary.projectionHash);

    writeFileSync(join(root, "existing.json"), "occupied", { mode: 0o600 });
    const second = spawnSync(process.execPath,
      ["tools/outsider-ingest-real-robot.mjs"], { encoding: "utf8" });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /REAL_ROBOT_CLI_ARGUMENTS_INVALID/u);
  });
