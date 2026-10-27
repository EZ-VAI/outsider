import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  RRC2020_JOB_ID, RRC2020_PROFILE, acquirePinnedRrc2020JobSource,
  rrc2020ArtifactHash, verifyRrc2020JobArtifact,
  verifyRrc2020JobArtifactWithSource, verifyRrc2020JobSourceDirectory,
} from "../src/outsider-rrc2020-job-19422.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-rrc2020-job-19422-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "rrc2020-job-19422.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:cd3116de82aff5021f89ffb77a542ccba370640bd43a7b8aef5a5069504a027e";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:82a699221cff5348701f2cc15304384debab955714b314a52ddc0541bde4587a";
const EXPECTED_SOURCE_ROOT =
  "sha256:601e65ab6f63616ffce1a8340398c775517a281941badf99ef76af2106d957f6";
const EXPECTED_MANIFEST_HASH =
  "sha256:3bc9024c1c014e9bb716e30fe96759ae5d8ce1299b71bcc55d9e4d74f8b4ddfe";
const EXPECTED_INDEX_HASH =
  "sha256:deb7e9f9f2e26b3c2e3c6478cd5122e5cb9287b287c0e4783465b5780aa837af";
const EXPECTED_ZARR_HASH =
  "sha256:305cfd39a4411f352c305f838b25d27b13e58579be5c4935e0dbc487b996d6e1";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function artifact() {
  assert.equal(existsSync(REPORT_PATH), true);
  return readJson(REPORT_PATH);
}

function walk(root) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      assert.equal(entry.isSymbolicLink(), false, child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push(child);
      else assert.fail(`special file refused: ${child}`);
    }
  }
  return { files, directories };
}

test("the selected official run and HTTP profiles are fixed", () => {
  assert.equal(RRC2020_JOB_ID, 19422);
  assert.deepEqual(RRC2020_PROFILE, {
    pageBytes: 25_684, indexBytes: 1_695_744,
    indexPages: 414, indexPageSize: 4096,
    jobs: 10_278, phase2Jobs: 2_856, phase3Jobs: 7_422,
    queryHelperBytes: 7_467,
    queryHelperSha256:
      "sha256:7978bef3ad8ec46d648c27c7eecce8eb33b48ff3732518321d702fca0b011e64",
    zarrZipBytes: 299_208_343,
    zarrEtag: "\"61456ede-11d58e97\"",
    zarrLastModified: "Sat, 18 Sep 2021 04:45:18 GMT",
    indexEtag: "\"61444c79-19e000\"",
    indexLastModified: "Fri, 17 Sep 2021 08:06:17 GMT",
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "rrc2020-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedRrc2020JobSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /RRC2020_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("page and index brackets bind every strict Range to the complete run", () => {
  const checked = verifyRrc2020JobSourceDirectory(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "OFFICIAL_PAGE_INDEX_AND_COMPLETE_RANGE_BOUND_JOB_19422_BYTES");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 15);
  assert.equal(checked.manifest.records.pageBefore.sha256,
    "sha256:77cbd25138411e658043d81ad26575be19e7035e5ddb0b4394e5e9858b5c68e2");
  assert.equal(checked.manifest.records.pageBefore.sha256,
    checked.manifest.records.pageAfter.sha256);
  assert.equal(checked.manifest.records.indexBefore.sha256, EXPECTED_INDEX_HASH);
  assert.equal(checked.manifest.records.indexAfter.sha256, EXPECTED_INDEX_HASH);
  assert.equal(checked.manifest.records.zarr.sha256, EXPECTED_ZARR_HASH);
  assert.equal(checked.manifest.records.zarr.bytes, 299_208_343);
  assert.equal(checked.manifest.records.zarr.chunks, 571);
  assert.equal(checked.manifest.records.zarr.chunkBytes, 524_288);
  assert.equal(checked.manifest.records.zarr.rangeLogHash,
    "sha256:531393eb9de397cc49a6e2ecd7bb05876db320c9968323cd674940294ebc5848");
  assert.equal(checked.manifest.closure.randomTruncation, false);
  assert.equal(checked.manifest.closure.globallyExhaustive, false);
  assert.equal(checked.manifest.closure.completeSourceNativeRun, true);
});

test("the complete SQLite index and exact job row replay", () => {
  const value = artifact();
  assert.equal(value.index.integrity, "ok");
  assert.equal(value.index.pageCount, 414);
  assert.equal(value.index.pageSize, 4096);
  assert.equal(value.index.jobs, 10_278);
  assert.deepEqual(value.index.phaseCounts, { 2: 2_856, 3: 7_422 });
  assert.deepEqual(value.index.tables, ["info", "jobs"]);
  assert.equal(value.index.columns.length, 18);
  assert.equal(value.index.columns.every((column) => column.missing === 0), true);
  assert.deepEqual(value.index.info, [
    { creation_date: "2021-06-10", id: 1, version: "1.0.0" },
  ]);
  assert.deepEqual(value.index.selectedJob, {
    baseline_reward: -3107.8041166994676,
    challenge_phase: 3, cumulative_reward: -1091.5548254253654,
    difficulty_level: 1,
    furthest_from_start: 0.023629004248953204,
    furthest_from_start_10: 0.022207190231872828,
    furthest_from_start_30: 0.020944673351092576,
    id: 1282, initial_distance_to_goal: 0.018260457584789974,
    job_id: 19422, max_height: 0.013585801236331463,
    max_height_10: 0.012588215991854668,
    max_height_30: 0.012109590694308281,
    min_distance_to_goal: 0.00014997284597208468,
    min_distance_to_goal_10: 0.0003387242957974778,
    min_distance_to_goal_30: 0.0004642820349372652,
    robot_name: "roboch3", start_time: "2020-12-08 19:11:00.000000",
  });
});

test("every ZIP member and Zarr metadata, array, and chunk replays", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.replay.zip, {
    centralEntriesValidated: 64, compressedMemberBytes: 299_200_145,
    crcMembersValidated: 64, encryptedMembers: 0, entries: 64,
    localHeadersValidated: 64, uncompressedMemberBytes: 299_200_145,
    unsafePaths: 0,
  });
  assert.deepEqual({ ...value.replay.zarr, arrayReports: undefined }, {
    allExpectedChunksPresent: true, arrayReports: undefined,
    arrays: 28, chunkEntries: 28, decodedChunkBytes: 373_202_016,
    format: 2, groups: 7, infCount: 0, logicalValues: 283_174_302,
    metadataDocuments: 36, nanCount: 2_160_000, unknownMembers: 0,
  });
  assert.equal(value.replay.zarr.arrayReports.length, 28);
  assert.equal(value.replay.zarr.arrayReports.every((array) =>
    array.chunkEntries === 1 && /^sha256:[a-f0-9]{64}$/u
      .test(array.decodedValueHash)), true);
  assert.equal(value.replay.zarr.arrayReports.find((array) =>
    array.name === "images")?.decodedValueHash,
  "sha256:8611d42574c9377e92344a0cc3f817ee5a2ee6a8eb99e40a5c816fe20902394a");
});

test("actions, observations, cameras, missingness, and alignment stay source-native", () => {
  const value = artifact();
  const arrays = Object.fromEntries(value.replay.zarr.arrayReports.map((array) =>
    [array.name, array]));
  assert.deepEqual(arrays["observation/position"].shape, [120_000, 9]);
  assert.deepEqual(arrays["desired_action/torque"].shape, [120_000, 9]);
  assert.deepEqual(arrays["applied_action/torque"].shape, [120_000, 9]);
  assert.deepEqual(arrays.images.shape, [1_236, 3, 270, 270]);
  assert.deepEqual(arrays["object_pose/position"].shape, [1_236, 3]);
  assert.deepEqual(arrays["filtered_object_pose/orientation"].shape, [1_236, 4]);
  assert.equal(arrays["desired_action/position_kp"].nanCount, 1_080_000);
  assert.equal(arrays["desired_action/position_kd"].nanCount, 1_080_000);
  assert.equal(value.replay.zarr.arrayReports.filter((array) =>
    array.nanCount > 0).length, 2);
  assert.deepEqual(value.replay.sequences, {
    cameraFrames: 1_236, imageTimestampValues: 1_236,
    imageTimestampsFinite: true, robotSteps: 120_000,
    robotToCameraMapInRange: true, robotToCameraMapRows: 120_000,
    timeIndexStrictlyIncreasing: true, timestampsFinite: true,
    timestampsMonotonic: true,
  });
  assert.deepEqual(value.replay.safety, {
    cameraPixelsProjectedInReport: false, picklePayloadsExecuted: 0,
    publisherQueryHelperExecuted: 0, sourceExecutableMembers: [],
    sourcePayloadsExecuted: 0,
  });
});

test("official harness metrics are retained without independent-outcome promotion", () => {
  const value = artifact();
  assert.deepEqual(value.replay.attributes.metrics, {
    baseline_reward: -3107.8041166994676,
    cumulative_reward: -1091.5548254253654,
    furthest_from_start: 0.023629004248953204,
    furthest_from_start_10: 0.022207190231872828,
    furthest_from_start_30: 0.020944673351092576,
    initial_distance_to_goal: 0.018260457584789974,
    max_height: 0.013585801236331463,
    max_height_10: 0.012588215991854668,
    max_height_30: 0.012109590694308281,
    min_distance_to_goal: 0.00014997284597208468,
    min_distance_to_goal_10: 0.0003387242957974778,
    min_distance_to_goal_30: 0.0004642820349372652,
  });
  assert.equal(value.metricCrosswalk.allWithin1eMinus12, true);
  assert.equal(value.runSemantics.publisherPhysicalTriFingerRunEstablished, true);
  assert.equal(value.runSemantics.publisherEvaluatorOutcomePresent, true);
  assert.equal(value.runSemantics.independentThirdPartyOutcomePresent, false);
  assert.equal(value.runSemantics.recoveryEstablished, false);
  assert.equal(value.runSemantics.delegationPresent, false);
  assert.equal(value.runSemantics.completeAttemptCensusEstablished, false);
  assert.equal(value.outcome.binarySuccessInferred, false);
  assert.equal(value.outcome.recoveryInferred, false);
});

test("non-commercial rights and camera privacy remain fail closed", () => {
  const value = artifact();
  assert.deepEqual(value.rights, {
    commercialUseRestricted: true, evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalAuthorityEstablished: false,
    officialDatasetLicense: "CC BY-NC-SA 4.0",
    productionTrainingAuthorized: false, shareAlikeConditionPresent: true,
  });
  assert.deepEqual(value.privacy, {
    cameraPixelsProjectedInReport: false, directoryMode: "0700",
    fileMode: "0600", noPiiGuaranteed: false,
    physicalCameraFramesPresent: true, privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false, rawArtifactPrivate: true,
  });
  assert.deepEqual(value.boundary, { privacy: 0, training: 0, network: 0,
    authority: 0, CEU: 0, action: 1, delegation: 0, reliableOutcome: 1,
    independentOutcome: 0, recovery: 0, externalEffect: 1 });
});

test("the source-bound report and receipt reproduce and remain private", () => {
  const value = artifact();
  const { artifactHash, ...body } = value;
  assert.equal(rrc2020ArtifactHash(body), artifactHash);
  assert.deepEqual(verifyRrc2020JobArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_OFFICIAL_EVALUATOR_AND_INDEPENDENCE_BOUNDARY",
  });
  const sourceBound = verifyRrc2020JobArtifactWithSource(value, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_SQLITE_ZIP_ZARR_ARRAY_CHUNK_ATTRIBUTE_AND_SEQUENCE_REPLAY");
  assert.equal(sourceBound.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(sourceBound.sourceRoot, EXPECTED_SOURCE_ROOT);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  const { manifestHash, ...manifestBody } = manifest;
  assert.equal(manifestHash, `sha256:${createHash("sha256").update(Buffer.from(
    `outsider/rrc2020-job-19422-artifact-manifest/v1\0${
      canonicalizeStrict(manifestBody)}`, "utf8")).digest("hex")}`);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
  assert.equal(existsSync(`${ARTIFACT_DIRECTORY}.checkpoint`), false);
});
