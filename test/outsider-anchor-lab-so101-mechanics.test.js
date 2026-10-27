import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ANCHOR_LAB_DATASET_ID,
  ANCHOR_LAB_MECHANICS_SCHEMA,
  ANCHOR_LAB_REVISION,
  ANCHOR_LAB_SO101_CONSTANTS,
  anchorLabDigest,
  publishAnchorLabSo101ArtifactDirectory,
  selectAnchorLabSo101Entries,
  verifyAnchorLabSo101MechanicsArtifact,
  verifyAnchorLabSo101MechanicsArtifactWithSource,
  verifyAnchorLabSo101RunReceipt,
  verifyAnchorLabSo101SourceDirectory,
} from "../src/outsider-anchor-lab-so101-mechanics.js";

const ROOT = path.resolve("artifacts/outsider-anchor-lab-so101-mechanics-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

function syntheticTree() {
  const entries = [{ type: "file", path: "README.md", size: 14_082,
    oid: "a".repeat(40) }];
  const total = 86_065_893;
  for (let index = 0; index < 50; index += 1) {
    const heldout = index < 8;
    const name = heldout ? `held-out-motion-${String(index).padStart(2, "0")}`
      : `train-motion-${String(index).padStart(2, "0")}`;
    const size = index === 49 ? total - 49 * 1_700_000 : 1_700_000;
    entries.push({ type: "file", path: `data/so101_arm_50motion/${name}.parquet`,
      size, oid: "b".repeat(40), lfs: { oid: `${index.toString(16).padStart(64, "0")}`,
        size } });
  }
  entries.push({ type: "file", path: "G1.gif", size: 99, oid: "c".repeat(40) });
  return entries;
}

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = anchorLabDigest(changed,
    `${ANCHOR_LAB_MECHANICS_SCHEMA}/artifact`);
  return changed;
}

function assertPrivateTree(root) {
  const visit = (directory) => {
    const directoryStat = lstatSync(directory);
    assert.equal(directoryStat.isSymbolicLink(), false, directory);
    assert.equal(directoryStat.isDirectory(), true, directory);
    assert.equal(directoryStat.mode & 0o777, 0o700, directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const stat = lstatSync(target);
      assert.equal(stat.isSymbolicLink(), false, target);
      if (stat.isDirectory()) visit(target);
      else {
        assert.equal(stat.isFile(), true, target);
        assert.equal(stat.mode & 0o777, 0o600, target);
      }
    }
  };
  visit(root);
}

test("selector freezes the exact 51-object, 86,079,975-byte SO-101 closure", () => {
  const selected = selectAnchorLabSo101Entries(syntheticTree());
  assert.equal(selected.sourceObjects, 51);
  assert.equal(selected.selectedBytes, 86_079_975);
  assert.equal(selected.readmeBytes, 14_082);
  assert.equal(selected.parquetFiles, 50);
  assert.equal(selected.parquetBytes, 86_065_893);
  assert.equal(selected.trainTraces, 42);
  assert.equal(selected.heldoutTraces, 8);
  assert.equal(selected.excludedRepositoryFiles, 1);
  assert.ok(selected.selected.filter((entry) => entry.path !== "README.md")
    .every((entry) => entry.remoteBinding.kind === "LFS_SHA256"));

  const missing = syntheticTree();
  missing.splice(10, 1);
  assert.throws(() => selectAnchorLabSo101Entries(missing),
    /TREE_SELECTION_COUNT_INVALID/u);
  const unsafeExtra = syntheticTree();
  unsafeExtra.push({ type: "file", path: "data/so101_arm_50motion/notes.txt",
    size: 10, oid: "d".repeat(40) });
  assert.throws(() => selectAnchorLabSo101Entries(unsafeExtra),
    /TREE_GROUP_MEMBER_UNSAFE/u);
  const unknownSplit = syntheticTree();
  unknownSplit[1].path = "data/so101_arm_50motion/motion-without-split.parquet";
  assert.throws(() => selectAnchorLabSo101Entries(unknownSplit),
    /TREE_CANONICAL_PROFILE_CHANGED/u);
});

test("actual fixed source replays every object, both API/tree brackets, and private modes", () => {
  const checked = verifyAnchorLabSo101SourceDirectory(SOURCE);
  const manifest = checked.manifest;
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_BYTE_REPLAY");
  assert.equal(manifest.datasetId, ANCHOR_LAB_DATASET_ID);
  assert.equal(manifest.pinnedRevision, ANCHOR_LAB_REVISION);
  assert.equal(manifest.treeBefore.pages, 13);
  assert.equal(manifest.treeAfter.pages, 13);
  assert.equal(manifest.treeBefore.entryCount, 648);
  assert.equal(manifest.treeAfter.entryCount, 648);
  assert.equal(manifest.treeBefore.snapshotHash,
    "sha256:d6909bc06bd91e56f4071677dac21941248a9904c9ce6ad7433e0560a294ab99");
  assert.equal(manifest.treeBefore.snapshotHash, manifest.treeAfter.snapshotHash);
  assert.equal(manifest.sourceSupportObjects.length, 28);
  assert.equal(manifest.remoteObjects.length, 51);
  assert.equal(manifest.selection.selectedBytes, 86_079_975);
  assert.equal(manifest.selection.parquetBytes, 86_065_893);
  assert.equal(manifest.manifestHash,
    "sha256:e47ef02db599d117d03af62105c8a326b7089b379839a251f7cc1a00f1ea94b6");
  assert.equal(checked.manifestFileSha256,
    "sha256:af46771a19d5424eb999de0998b2dbe06b453d24385efec24ba19d9faae4f5a0");
  assert.equal(checked.sourceRoot,
    "sha256:16ad6dfb83e4228b8f00ba55754c2370cdfa1c939561c25db6baafa9eecf4691");
  assertPrivateTree(ROOT);
});

test("all 50 Parquet traces fully rederive exact schema, rows, fields and monotonicity", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  const standalone = verifyAnchorLabSo101MechanicsArtifact(report);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.sourceAuthenticated, false);
  assert.equal(report.artifactHash,
    "sha256:7f96e1b1cf5ac7940df8baf803dceaa307ec6b199b123d6ce211ec0785c22ed5");
  assert.equal(receipt.receiptHash,
    "sha256:fe755ca5dfcf4e3a49dd6bb9a62385e831c73c93180ea90d9e9da2a7c911ca6c");
  assert.equal(receipt.reportFileSha256,
    "sha256:3e74a4c0413c6f78622e462232af820b34a74dd277ef0faf53ff3ecf32d8c05c");
  assert.equal(report.denominator.class, "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE");
  assert.equal(report.denominator.units, 50);
  assert.equal(report.denominator.trainFilenameSplitTraces, 42);
  assert.equal(report.denominator.heldoutFilenameSplitTraces, 8);
  assert.equal(report.replay.rowsParsed, 80_846_242);
  assert.equal(report.replay.schema.aggregateFieldSet.length, 48);
  assert.equal(Object.values(report.replay.schema.aggregateFieldCounts)
    .reduce((sum, count) => sum + count, 0), 80_846_242);
  assert.equal(report.replay.schema.filesMatchingPublisherCardOrder, 50);
  // Publisher says `string`; physical Arrow storage is `large_string` in all 50 files.
  assert.equal(report.replay.schema.filesMatchingPublisherCardTypes, 0);
  assert.ok(report.replay.traces.every((trace) =>
    trace.schemaTypes.experiment === "large_string"
      && trace.schemaTypes.field === "large_string"
      && trace.schemaTypes.time_ns === "int64"
      && trace.schemaTypes.time_utc === "timestamp[ns, tz=UTC]"
      && trace.schemaTypes.value === "double"));
  assert.equal(report.replay.time.filesTimeNsNondecreasing, 50);
  assert.equal(report.replay.time.filesTimeUtcNondecreasing, 50);
  assert.equal(report.replay.time.timeNsDecreaseCount, 0);
  assert.equal(report.replay.time.timeUtcDecreaseCount, 0);
  assert.equal(report.replay.time.timeNsUtcMismatchCount, 0);
  assert.deepEqual(report.replay.quality.nullCounts,
    { experiment: 0, field: 0, time_ns: 0, time_utc: 0, value: 0 });
  assert.equal(report.replay.quality.nonFiniteValueCount, 0);
  assert.deepEqual(report.replay.motionFamilies.observedFilenameSignals, {
    BACKLASH_DETECTION: 1,
    FREQUENCY_SWEEP: 1,
    MULTISINE: 1,
    PICK_PLACE: 1,
    SINGLE_JOINT: 4,
    WORKSPACE_SWEEP: 2,
  });
  assert.equal(report.replay.motionFamilies.tracesWithoutDeclaredFilenameSignal, 40);
  assert.equal(report.replay.schema.units, "UNKNOWN_NO_FIELD_DICTIONARY");
  assert.equal(report.knowledgeBoundary.unknownsMustNotBeGuessed, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  const full = verifyAnchorLabSo101MechanicsArtifactWithSource(report, SOURCE,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.equal(full.ok, true);
  assert.equal(full.verificationLevel, "FULL_SOURCE_REDERIVED");
  assert.equal(full.verifiedTraceCount, 50);
  assert.equal(full.verifiedRowCount, 80_846_242);
  assert.equal(verifyAnchorLabSo101RunReceipt(receipt, report, reportBytes).ok, true);
});

test("self-resealing cannot create episode truth, training, economics or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.denominator.units = 51; },
    (copy) => { copy.observation.semanticTaskOutcomeEstablished = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.modelTrainingAuthorizedByArtifact = true; },
    (copy) => { copy.network.networkAdmissionRows = 1; },
    (copy) => { copy.economics.CEU = 1; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyAnchorLabSo101MechanicsArtifact(reseal(report, mutate)).ok, false);
  }
  const fakeRoot = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyAnchorLabSo101MechanicsArtifact(fakeRoot).ok, true);
  const sourceRejected = verifyAnchorLabSo101MechanicsArtifactWithSource(fakeRoot, SOURCE,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.equal(sourceRejected.ok, false);
  assert.match(sourceRejected.error, /FULL_REPLAY_SOURCE_IDENTITY_MISMATCH/u);
});

test("publication atomically refuses an existing target and moves receipt last", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-anchor-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  try {
    assert.throws(() => publishAnchorLabSo101ArtifactDirectory(staging, occupied),
      /PUBLISH_TARGET_CLAIM_FAILED/u);
    assert.deepEqual(readdirSync(staging).sort(),
      ["report.json", "run-receipt.json", "source"]);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test("constants keep parser and denominator profiles explicit", () => {
  assert.deepEqual(ANCHOR_LAB_SO101_CONSTANTS.expectedProfile, {
    sourceObjects: 51,
    readmeBytes: 14_082,
    parquetFiles: 50,
    parquetBytes: 86_065_893,
    sourceBytes: 86_079_975,
    trainTraces: 42,
    heldoutTraces: 8,
  });
  assert.equal(ANCHOR_LAB_SO101_CONSTANTS.pyarrowExtractorSha256,
    "sha256:7983cd62a8f1f43da32022fe45a503abde5f394f91f4894a8160f29d59fe0d2b");
});
