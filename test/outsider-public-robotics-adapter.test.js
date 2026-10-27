import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  BOTFAILS_REVISION, UR5FAIL_REVISION,
  buildBotFailsPilotManifest, buildPublicRoboticsSummary, buildUr5FailExecutionManifest,
  convertBotFailsPilot, convertUr5FailExecution, parseBotFailsFrameLabels,
  verifyPublicRoboticsManifest, verifyPublicRoboticsRecord,
  verifyPublicRoboticsRecordAgainstSource, verifyPublicRoboticsRecordSetAgainstSource,
  verifyPublicRoboticsSourceDirectory,
} from "../src/outsider-public-robotics-adapter.js";

const SOURCE = fileURLToPath(new URL(
  "../artifacts/curate-public-robotics-20260820/source/", import.meta.url,
));
const BOT_SOURCE = `${SOURCE}botfails`;
const UR5_SOURCE = `${SOURCE}ur5fail-execution`;
const REAL_SOURCE_AVAILABLE = existsSync(BOT_SOURCE) && existsSync(UR5_SOURCE);

function reseal(record) {
  const { recordHash: ignored, ...body } = record;
  return { ...body, recordHash: `sha256:${createHash("sha256")
    .update(`outsider/public-robotics-record/v1\0${canonicalizeStrict(body)}`).digest("hex")}` };
}

test("frozen public robotics manifests are deterministic and require no HF token", () => {
  const bot = buildBotFailsPilotManifest();
  const ur5 = buildUr5FailExecutionManifest();
  assert.equal(bot.dataset.revision, BOTFAILS_REVISION);
  assert.equal(ur5.dataset.revision, UR5FAIL_REVISION);
  assert.equal(bot.dataset.requiresToken, false);
  assert.equal(ur5.dataset.requiresToken, false);
  assert.equal(bot.dataset.licenseId, "Apache-2.0");
  assert.equal(ur5.dataset.licenseId, "Apache-2.0");
  assert.equal(bot.objects.length, 43);
  assert.equal(ur5.objects.length, 4);
  assert.deepEqual(bot.repositoryProvenance.treeLocalPaths,
    ["hf-tree-label-task.json", "hf-tree-normal-task.json", "hf-tree-test-task.json"]);
  assert.deepEqual(ur5.repositoryProvenance.treeLocalPaths, ["hf-tree-root.json"]);
  assert.equal(verifyPublicRoboticsManifest(bot).ok, true);
  assert.equal(verifyPublicRoboticsManifest(ur5).ok, true);

  const tampered = structuredClone(bot);
  tampered.selection.anomalyEpisodes = 11;
  assert.equal(verifyPublicRoboticsManifest(tampered).ok, false);
});

test("BotFails CSV parser preserves manual frame labels without inventing outcomes", () => {
  const parsed = parseBotFailsFrameLabels(Buffer.from("0\n0\n1\n1\n0\n1\n"), 6);
  assert.deepEqual({
    frameCount: parsed.frameCount,
    negativeCount: parsed.negativeCount,
    positiveCount: parsed.positiveCount,
    firstPositiveIndex: parsed.firstPositiveIndex,
    positiveRuns: parsed.positiveRuns,
  }, { frameCount: 6, negativeCount: 3, positiveCount: 3,
    firstPositiveIndex: 2, positiveRuns: 2 });
  assert.match(parsed.sequenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => parseBotFailsFrameLabels(Buffer.from("0\n2\n")),
    /BOTFAILS_LABEL_VALUE_INVALID/);
});

test("real 20-episode BotFails slice verifies and remains teleop descriptive evidence",
  { skip: !REAL_SOURCE_AVAILABLE }, () => {
    const output = convertBotFailsPilot(BOT_SOURCE);
    assert.equal(output.records.length, 20);
    assert.equal(output.summary.counts.byCollectionMode.TELEOPERATION, 20);
    assert.equal(output.summary.counts.byTruthValue.NOMINAL_TRAIN_DEMONSTRATION, 10);
    assert.equal(output.summary.counts.byTruthValue.ANOMALY_LABEL_PRESENT, 10);
    assert.equal(output.summary.manualLabelCoverage, 10);
    assert.equal(output.summary.sourceLabelObservations.frameSequences.sequences, 10);
    assert.equal(output.summary.sourceLabelObservations.frameSequences.unlabeledDeclaredFrames, 1);
    assert.equal(output.summary.sourceLabelObservations.frameSequences.positiveFrameLabels > 0, true);
    assert.equal(output.summary.detectorEvaluation.performed, false);
    assert.equal(output.summary.evidenceBoundary.causalExperienceUnits, 0);
    assert.equal(output.summary.evidenceBoundary.lossEvidenceUnits, 0);
    assert.equal(output.summary.evidenceBoundary.pricingEligible, false);
    const sourceCheck = verifyPublicRoboticsSourceDirectory(output.manifest, BOT_SOURCE);
    assert.equal(sourceCheck.ok, true);
    assert.equal(sourceCheck.repositoryProvenanceVerified, true);
    assert.equal(sourceCheck.derivedDataset.revision, BOTFAILS_REVISION);
    assert.equal(sourceCheck.derivedDataset.licenseId, "Apache-2.0");
    assert.equal(sourceCheck.derivedDataset.selectedObjectsBoundToPinnedTree, 38);
    assert.equal(sourceCheck.derivedDataset.derivation,
      "EXACT_PINNED_HF_API_METADATA_README_AND_TREE_OBJECT_BINDING");
    assert.equal(output.records.every((record) => {
      const checked = verifyPublicRoboticsRecord(record);
      return checked.ok && checked.verificationLevel === "SELF_CHECK_ONLY"
        && checked.truthVerified === false;
    }), true);
    const full = verifyPublicRoboticsRecordSetAgainstSource(output.records,
      { manifest: output.manifest, sourceDir: BOT_SOURCE });
    assert.equal(full.ok, true);
    assert.equal(full.verificationLevel, "FULL_SOURCE_REDERIVED");
    assert.equal(full.truthVerified, true);
    assert.equal(output.records.every((record) => record.detectorOutputs === null), true);
    assert.equal(output.records.every((record) => record.evidenceBoundary.pricingEligible
      === false), true);
    assert.equal(output.records.filter((record) => record.truth.manual).length, 10);
  });

test("real UR5-Fail execution metadata converts all 140 autonomous policy rows",
  { skip: !REAL_SOURCE_AVAILABLE }, () => {
    const output = convertUr5FailExecution(UR5_SOURCE);
    assert.equal(output.records.length, 140);
    assert.equal(output.summary.counts.byCollectionMode.AUTONOMOUS_POLICY_EXECUTION, 140);
    assert.equal(output.summary.counts.byTruthValue.SUBTASK_FAILURE, 71);
    assert.equal(output.summary.counts.byTruthValue.SUBTASK_SUCCESS, 69);
    assert.equal(output.summary.manualLabelCoverage, 140);
    assert.equal(output.summary.sourceLabelObservations.subtasks.sourceLabelFailures, 71);
    assert.equal(output.summary.sourceLabelObservations.subtasks.sourceLabelSuccesses, 69);
    assert.equal(output.summary.sourceLabelObservations.subtasks.descriptiveSuccessFraction,
      69 / 140);
    assert.equal(output.summary.counts.uniqueEpisodeRoots < 140, true);
    assert.equal(output.summary.independence.rowCountIsIndependentTrialCount, false);
    assert.equal(output.summary.evidenceBoundary.pricingEligible, false);
    const sourceCheck = verifyPublicRoboticsSourceDirectory(output.manifest, UR5_SOURCE);
    assert.equal(sourceCheck.ok, true);
    assert.equal(sourceCheck.repositoryProvenanceVerified, true);
    assert.equal(sourceCheck.derivedDataset.revision, UR5FAIL_REVISION);
    assert.equal(sourceCheck.derivedDataset.licenseId, "Apache-2.0");
    assert.equal(sourceCheck.derivedDataset.selectedObjectsBoundToPinnedTree, 1);
    assert.equal(output.records.every((record) => verifyPublicRoboticsRecord(record).ok), true);
    assert.equal(output.records.every((record) => record.truth.provenance
      === "MANUAL_SUBTASK_SUCCESS_LABEL"), true);
    const serialized = JSON.stringify(output.records[0]);
    assert.equal(serialized.includes("task_instruction"), false);
    assert.equal(serialized.includes("failure_reason"), false);

    const tampered = structuredClone(output.records[0]);
    tampered.evidenceBoundary.causalExperienceUnits = 1;
    assert.equal(verifyPublicRoboticsRecord(tampered).ok, false);

    const full = verifyPublicRoboticsRecordSetAgainstSource(output.records,
      { manifest: output.manifest, sourceDir: UR5_SOURCE });
    assert.equal(full.ok, true);
    assert.equal(full.recordsVerified, 140);
    assert.equal(full.truthVerified, true);

    const collectionTamper = structuredClone(output.records[0]);
    collectionTamper.collection.executionMode = "TELEOPERATION";
    const resealedCollectionTamper = reseal(collectionTamper);
    assert.equal(verifyPublicRoboticsRecord(resealedCollectionTamper).ok, false);
    assert.equal(verifyPublicRoboticsRecordAgainstSource(resealedCollectionTamper,
      { manifest: output.manifest, sourceDir: UR5_SOURCE }).ok, false);

    const truthTamper = structuredClone(output.records[0]);
    const flipped = truthTamper.truth.executionReward === 1 ? 0 : 1;
    truthTamper.truth.executionReward = flipped;
    truthTamper.truth.reward = flipped;
    truthTamper.truth.value = flipped === 1 ? "SUBTASK_SUCCESS" : "SUBTASK_FAILURE";
    const resealedTruthTamper = reseal(truthTamper);
    const selfOnly = verifyPublicRoboticsRecord(resealedTruthTamper);
    assert.equal(selfOnly.ok, true);
    assert.equal(selfOnly.truthVerified, false);
    assert.equal(verifyPublicRoboticsRecordAgainstSource(resealedTruthTamper,
      { manifest: output.manifest, sourceDir: UR5_SOURCE }).ok, false);

    const repeated = buildPublicRoboticsSummary(
      output.manifest, Array.from({ length: 100 }, () => output.records[0]),
    );
    assert.equal(repeated.inputAccounting.candidateRecords, 100);
    assert.equal(repeated.inputAccounting.exactDuplicatesCollapsed, 99);
    assert.equal(repeated.counts.records, 1);

    const conflicting = structuredClone(output.records[0]);
    conflicting.commitments.imageReferenceCount -= 1;
    const resealedConflict = reseal(conflicting);
    assert.equal(verifyPublicRoboticsRecord(resealedConflict).ok, true);
    assert.throws(() => buildPublicRoboticsSummary(
      output.manifest, [output.records[0], resealedConflict],
    ), /PUBLIC_ROBOTICS_RECORD_ID_CONFLICT/);
  });

test("full-source verification rejects altered authoritative repository support bytes",
  { skip: !REAL_SOURCE_AVAILABLE }, () => {
    const temporary = mkdtempSync(path.join(os.tmpdir(), "outsider-robot-provenance-"));
    try {
      const botCopy = path.join(temporary, "botfails");
      cpSync(BOT_SOURCE, botCopy, { recursive: true });
      const metadataPath = path.join(botCopy, "hf-repo-metadata.json");
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      metadata.sha = "0".repeat(40);
      writeFileSync(metadataPath, JSON.stringify(metadata));
      const checked = verifyPublicRoboticsSourceDirectory(buildBotFailsPilotManifest(), botCopy);
      assert.equal(checked.ok, false);
      assert.match(checked.error, /PUBLIC_ROBOTICS_SOURCE_(SIZE|HASH)_MISMATCH/);

      const ur5Copy = path.join(temporary, "ur5fail");
      cpSync(UR5_SOURCE, ur5Copy, { recursive: true });
      const readmePath = path.join(ur5Copy, "README.md");
      writeFileSync(readmePath, readFileSync(readmePath, "utf8")
        .replace("license: apache-2.0", "license: mit       "));
      const licenseChecked = verifyPublicRoboticsSourceDirectory(
        buildUr5FailExecutionManifest(), ur5Copy,
      );
      assert.equal(licenseChecked.ok, false);
      assert.match(licenseChecked.error, /PUBLIC_ROBOTICS_SOURCE_HASH_MISMATCH/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
