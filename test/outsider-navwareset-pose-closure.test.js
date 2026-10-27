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
  NAVWARESET_CATALOG_ID, NAVWARESET_DOI, NAVWARESET_PROFILE,
  NAVWARESET_PROJECT_REVISION, NAVWARESET_PROJECT_TREE, NAVWARESET_SCENES,
  NAVWARESET_TUTORIAL_REVISION, NAVWARESET_TUTORIAL_TREE,
  acquirePinnedNavWareSetPoseSource, navWareSetArtifactHash,
  verifyNavWareSetPoseArtifact, verifyNavWareSetPoseArtifactWithSource,
  verifyNavWareSetPoseSourceDirectory,
} from "../src/outsider-navwareset-pose-closure.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-navwareset-pose-closure-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "navwareset-pose-closure.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:0ded0b56bea8cf7cc436a74329cf64d25ef29d513fcf871620c126a678f3cce8";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:05c1526065c7b8717e821702ba31bc305cd27d45e59e5722eee7273aa0ceb02e";
const EXPECTED_SOURCE_ROOT =
  "sha256:70867068a97cf1c2ad836f4105622b8de35c5c9dd40fe6aeae721ec0d593a98a";
const EXPECTED_MANIFEST_HASH =
  "sha256:bf46fb05334cc6b7aefaf7f2755264af5b47ce08533afb9caae3edfb6449744d";

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

test("the official records, repository pins, and 43-scene profile are fixed", () => {
  assert.equal(NAVWARESET_DOI, "10.25666/DATAUBFC-2025-05-22");
  assert.equal(NAVWARESET_CATALOG_ID, 692);
  assert.equal(NAVWARESET_PROJECT_REVISION,
    "136da3fc034deb6da93b10692fc0059be9ccedcb");
  assert.equal(NAVWARESET_PROJECT_TREE,
    "3df1064fb632eb8ae15eb910460600863015e5e3");
  assert.equal(NAVWARESET_TUTORIAL_REVISION,
    "9d00becfdd5cdc3c7eb2ad0f2ddf94d102b33ea6");
  assert.equal(NAVWARESET_TUTORIAL_TREE,
    "c6369cd12b5dd0488e5a8511118d6669083c763c");
  assert.deepEqual(NAVWARESET_PROFILE, {
    catalogFiles: 185, annotatedFiles: 43, poseFiles: 43,
    groundTruthFiles: 49, robotFiles: 49, readmeFiles: 1,
    selectedPortalObjects: 44, portalReadmeId: 512,
    firstPoseId: 400, lastPoseId: 442,
    projectTreeEntries: 47, tutorialTreeEntries: 5017,
  });
  assert.equal(NAVWARESET_SCENES.length, 43);
  assert.deepEqual(NAVWARESET_SCENES.slice(-3), ["49", "51", "52"]);
});

test("the source acquirer refuses clobber before fetching", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "navwareset-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedNavWareSetPoseSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /NAVWARESET_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the 185-file catalogue brackets the exact 44-object pose selection", () => {
  const verified = verifyNavWareSetPoseSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_43_SCENE_POSE_BYTES_AND_185_FILE_INVENTORY");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.catalogue.inventory.length, 185);
  assert.deepEqual(verified.manifest.catalogue.counts, {
    annotated: 43, grs: 49, poses: 43, readme: 1, robot: 49,
  });
  assert.equal(verified.manifest.portalObjects.length, 44);
  assert.equal(verified.manifest.portalObjects.filter((row) =>
    row.category === "poses").length, 43);
  assert.equal(verified.manifest.portalObjects.every((row) =>
    row.redirectStatus === 303 && row.objectStatus === 200
      && row.contentLength === row.bytes
      && /^sha256:[a-f0-9]{64}$/u.test(row.sha256)
      && row.etag.length > 0 && row.lastModified.length > 0), true);
  assert.deepEqual(verified.before.rows, verified.after.rows);
  assert.deepEqual(verified.manifest.closure.absentPoseSceneIds,
    ["53", "54", "55", "56", "57"]);
  assert.equal(verified.manifest.closure.randomTruncation, false);
  assert.equal(verified.manifest.closure.globallyExhaustive, false);
});

test("all 43 ZIP central directories, local headers, and CRCs replay", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.replay.archives, {
    centralEntriesValidated: 129,
    compressedMemberBytes: value.replay.archives.compressedMemberBytes,
    crcMembersValidated: 129, encryptedMembers: 0, entries: 129, files: 43,
    localHeadersValidated: 129, memberDirectories: 43, memberFiles: 86,
    uncompressedMemberBytes: value.replay.archives.uncompressedMemberBytes,
    unsafePaths: 0,
  });
  assert.equal(value.replay.archives.compressedMemberBytes > 0, true);
  assert.equal(value.replay.archives.uncompressedMemberBytes
    > value.replay.archives.compressedMemberBytes, true);
  assert.equal(value.replay.scenes.length, 43);
  assert.equal(value.replay.scenes.every((scene) =>
    scene.archiveEntries === 3 && scene.centralEntriesValidated === 3
      && scene.localHeadersValidated === 3 && scene.crcMembersValidated === 3
      && scene.coordinatesProjectedInReport === false), true);
});

test("every pose row, participant slot, timestamp, and occupancy point replays", () => {
  const value = artifact();
  assert.equal(value.replay.csv.files, 43);
  assert.equal(value.replay.csv.columns, 14);
  assert.deepEqual(value.replay.csv.header, [
    "timestamp", "robot_x", "robot_y", "robot_yaw_rad",
    "x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4", "x5", "y5",
  ]);
  assert.equal(value.replay.csv.robotStateDimensions, 3);
  assert.equal(value.replay.csv.participantSlotsPerRow, 5);
  assert.equal(value.replay.csv.participantPositionObservations,
    value.replay.csv.rows * 5);
  assert.equal(value.replay.csv.timestampIntegerAllRows, true);
  assert.equal(value.replay.csv.timestampStrictlyIncreasingPerScene, true);
  assert.equal(value.replay.csv.allNumericValuesFinite, true);
  assert.equal(value.replay.occupancy.files, 43);
  assert.deepEqual(value.replay.occupancy.exactKeys, ["x", "y"]);
  assert.equal(value.replay.occupancy.allCoordinatesFinite, true);
  assert.deepEqual(value.replay.typedDenominators, {
    OCCUPANCY_POINT: { count: value.replay.occupancy.points,
      unit: "occupancy x/y point" },
    PARTICIPANT_POSITION_OBSERVATION: {
      count: value.replay.csv.participantPositionObservations,
      unit: "participant x/y slot at one pose time row" },
    POSE_TIME_ROW: { count: value.replay.csv.rows, unit: "CSV time row" },
    PUBLISHED_POSE_SCENE: { count: 43, unit: "published pose scene" },
    crossTotal: null,
  });
});

test("publisher scene naming is not promoted to native outcome or scenario labels", () => {
  const value = artifact();
  assert.deepEqual(value.sceneSemantics, {
    catalogueAndReadmeSceneCountClaimsReconciled: false,
    fortySevenOrFortyEightSceneClaimPromotedToConcreteLabels: false,
    missingPoseScenesSynthesized: false,
    perSceneScenarioMappingAdmitted: false,
    perSceneSocialNonSocialMappingAdmitted: false,
    publishedPoseScenes: 43,
    publisherSaysParticipantsDoNotWalkAndOnlyRobotMovesInScenes53Through57: true,
    scenes53Through57HaveNoPublishedPoseFile: true,
    selectedPoseArchivesContainScenarioLabelField: false,
    selectedPoseArchivesContainSocialComplianceLabelField: false,
    selectedPoseSceneIds: NAVWARESET_SCENES,
  });
  assert.deepEqual(value.evidenceSemantics, {
    attemptChronologyPresent: false, delegationPresent: false,
    externalEffectReceiptPresent: false, humanComfortRatingPresent: false,
    independentOutcomePresent: false, occupancyPointsDirectlyPresent: true,
    participantSlotsPerRow: 5, recoveryPresent: false,
    robotAndParticipantPoseRowsDirectlyPresent: true,
    terminalTaskOutcomePresent: false,
  });
});

test("license-scope ambiguity and human-trajectory privacy remain fail closed", () => {
  const value = artifact();
  assert.deepEqual(value.rights, {
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalAuthorityEstablished: false,
    licenseSourcesAndScopesConflictOrRemainAmbiguous: true,
    portalLicenseBadgeClaim: "CC BY 3.0", portalReadmeLicenseClaim: "CC BY",
    privacyPublicityRightsClearedByLicense: false,
    productionTrainingAuthorized: false,
    projectRepositoryLicenseAutomaticallyAppliedToPortalData: false,
    projectRepositoryLicenseText: "CC0 1.0 Universal",
  });
  assert.deepEqual(value.privacy, {
    coordinatesProjectedInReport: false, directoryMode: "0700",
    fileMode: "0600", humanTrajectoryCoordinatesPresent: true,
    noPiiGuaranteed: false, privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false, rawArtifactPrivate: true,
  });
  assert.deepEqual(value.boundary, { privacy: 0, training: 0, network: 0,
    authority: 0, CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
    independentOutcome: 0, recovery: 0, externalEffect: 0 });
});

test("the report and source-bound verifier reproduce the fixed artifact", () => {
  const value = artifact();
  const { artifactHash, ...body } = value;
  assert.equal(navWareSetArtifactHash(body), artifactHash);
  assert.deepEqual(verifyNavWareSetPoseArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_TYPED_DENOMINATORS_AND_SAFETY_BOUNDARIES",
  });
  const sourceBound = verifyNavWareSetPoseArtifactWithSource(value,
    SOURCE_DIRECTORY, { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_43_ZIP_43_CSV_43_OCCUPANCY_AND_185_FILE_CATALOGUE_REPLAY");
  assert.equal(sourceBound.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(sourceBound.sourceRoot, EXPECTED_SOURCE_ROOT);
});

test("the receipt is last and the entire raw artifact is private", () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, `sha256:${createHash("sha256").update(Buffer.from(
      `outsider/navwareset-pose-closure-artifact-manifest/v1\0${
        canonicalizeStrict(body)}`, "utf8")).digest("hex")}`);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
  assert.equal(existsSync(`${ARTIFACT_DIRECTORY}.checkpoint`), false);
});
