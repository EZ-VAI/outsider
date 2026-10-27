import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_EVIDENCE_WAVE5_SCHEMAS,
  ROBUST_ROS_WAVE5_PIN,
  TRACE_COMMONS_WAVE5_PIN,
  verifyPublicEvidenceWave5Manifest,
  verifyPublicEvidenceWave5Record,
  verifyPublicEvidenceWave5RecordSet,
  verifyPublicEvidenceWave5Result,
  verifyPublicEvidenceWave5Summary,
  verifyPublicEvidenceWave5Source,
  verifyPublicEvidenceWave5Verification,
} from "../src/outsider-public-evidence-wave5.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = path.join(ROOT, "artifacts/public-evidence-wave5-20260821/source");
const TRACE = path.join(SOURCE, "trace-commons");
const ROBUST = path.join(SOURCE, "robust-ros");
const REAL_SOURCE = existsSync(TRACE) && existsSync(ROBUST);

function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}
function reseal(value, hashField, domain) {
  const body = structuredClone(value);
  delete body[hashField];
  return { ...body, [hashField]: digest(body, domain) };
}

test("Wave5 pins outcome-blind, bounded organic-agent and industrial-robot selections", () => {
  assert.equal(TRACE_COMMONS_WAVE5_PIN.revision,
    "112ebd4d03ce852b00e935d523107c3d0c9a65bf");
  assert.equal(TRACE_COMMONS_WAVE5_PIN.selectedSessions, 3);
  assert.deepEqual(TRACE_COMMONS_WAVE5_PIN.selectedHarnesses,
    ["claude_code", "cursor", "opencode"]);
  assert.equal(ROBUST_ROS_WAVE5_PIN.revision,
    "521fe75319c256995fae6f5a4b756f0bfa4bf65e");
  assert.equal(ROBUST_ROS_WAVE5_PIN.candidateBugFiles, 47);
  assert.equal(ROBUST_ROS_WAVE5_PIN.notABugMarkers, 1);
  assert.equal(ROBUST_ROS_WAVE5_PIN.admittedBugRecords, 46);
  assert.match(TRACE_COMMONS_WAVE5_PIN.selectionRule, /per nonempty harness/);
  assert.match(ROBUST_ROS_WAVE5_PIN.selectionRule, /all \.bug records/);
});

test("Wave5 full source replay preserves reality while withholding unsupported authority",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
      robustRosDirectory: ROBUST });
    assert.equal(verifyPublicEvidenceWave5Manifest(result.manifest).ok, true);
    assert.equal(result.records.every((record) =>
      verifyPublicEvidenceWave5Record(record).ok), true);
    assert.equal(verifyPublicEvidenceWave5RecordSet(result.recordSet,
      { manifest: result.manifest, records: result.records }).ok, true);
    assert.equal(verifyPublicEvidenceWave5Summary(result.summary,
      { manifest: result.manifest, recordSet: result.recordSet,
        records: result.records }).ok, true);
    assert.equal(verifyPublicEvidenceWave5Verification(result.verification,
      { manifest: result.manifest, recordSet: result.recordSet, summary: result.summary,
        records: result.records }).ok, true);
    assert.equal(result.records.length, 49);
    assert.equal(result.recordSet.uniqueIdentities, 49);
    assert.equal(result.summary.counts.organicAgentSessions, 3);
    assert.equal(result.summary.counts.robustRobotSoftwareBugs, 46);
    assert.deepEqual(result.summary.counts.harnesses,
      { claude_code: 1, cursor: 1, opencode: 1 });
    assert.deepEqual(result.summary.counts.robustSystems,
      { motoman: 21, universal_robot: 25 });
    assert.deepEqual(result.summary.counts.robustPhases,
      { build: 17, runtime: 16, startup: 13 });
    assert.equal(result.summary.counts.agentSourceEvents, 116);
    assert.equal(result.summary.counts.agentToolCalls, 61);
    assert.equal(result.summary.counts.agentToolResultsPreserved, 27);
    assert.equal(result.summary.counts.agentSourceNativeToolErrors, 6);
    assert.equal(result.summary.counts.agentWriteLikeToolCalls, 8);
    assert.equal(result.summary.counts.agentHumanFollowupPrompts, 4);
    assert.equal(result.summary.counts.robustWithIssueReference, 34);
    assert.equal(result.summary.counts.robustWithFixCommit, 45);
    assert.equal(result.summary.counts.robustPublisherPhysicalMarkers, 12);
    assert.equal(result.summary.counts.causalExperienceUnits, 0);
    assert.equal(result.summary.counts.independentOutcomeUnits, 0);
    assert.equal(result.summary.counts.economicLossRows, 0);
    assert.equal(result.summary.counts.pricingEligibleRows, 0);
    assert.equal(result.summary.counts.productionModelEligibleRows, 0);
    assert.equal(result.summary.interpretation.sourceRecordsAreEmpirical, true);
    assert.equal(result.summary.interpretation.shadowResearchIsPermittedUseNotRealityClass,
      true);
    assert.equal(result.summary.interpretation.failureRateEstimable, false);
    assert.equal(result.summary.interpretation.physicalRobotExecutionEstablishedByBugMetadata,
      false);
    assert.equal(result.verification.sourceArtifactsReverified, true);
    assert.equal(result.verification.selectedSourceObjectsReverified, 57);
    assert.equal(result.verification.selectedSourceBytesReverified, 576_071);
    assert.equal(result.verification.sourceNativeRowsReparsed, 49);
    assert.equal(result.verification.rawTextPersistedInProjection, false);
    assert.equal(result.manifest.manifestHash,
      "sha256:358724f389a6746e599deec9705c376aa946e228e77a7777fc91ebf30d82dcce");
    assert.equal(result.recordSet.recordSetHash,
      "sha256:c9ac0aebbf70429db0d4a07c94c3b7dd1833faa2a7df72470e6fb08c3a9c4939");
    assert.equal(result.summary.summaryHash,
      "sha256:c6f40d7d9433c656dc9b9e4cb15fc4b420fbfdd1043cf9356223b32dc43b9b2c");
  });

test("Wave5 keeps the four axes independent for agent and robot-software records",
  { skip: !REAL_SOURCE }, () => {
    const { records } = verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
      robustRosDirectory: ROBUST });
    const agent = records.find((record) =>
      record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE");
    const robot = records.find((record) =>
      record.recordType === "ORGANIC_ROBOT_SOFTWARE_BUG_FIX_TAXONOMY");
    assert.equal(agent.axes.environmentReality.class, "REAL_SOFTWARE");
    assert.equal(agent.axes.environmentReality.empiricalStatus, "EMPIRICAL_RECORDED");
    assert.equal(agent.axes.evidenceAuthority.contributorReviewedBeforeSubmission, true);
    assert.equal(agent.axes.evidenceAuthority.outcomeIndependentlyAdjudicated, false);
    assert.equal(agent.axes.rights.compilationLicenseId, "CC-BY-4.0");
    assert.equal(agent.axes.rights.embeddedMaterialLicensesUniformlyVerified, false);
    assert.deepEqual(agent.axes.permittedUse.outsiderUses,
      ["DESCRIPTIVE", "SHADOW_RESEARCH"]);
    assert.equal(agent.axes.permittedUse.automaticTraining, false);
    assert.equal(robot.axes.environmentReality.class, "REAL_SOFTWARE");
    assert.equal(robot.axes.environmentReality.physicalRobotContext, true);
    assert.equal(robot.axes.environmentReality.physicalExecutionStreamAcquired, false);
    assert.equal(robot.axes.evidenceAuthority.manuallyCuratedTaxonomyPublisherDeclared, true);
    assert.equal(robot.axes.rights.rootLicenseOrCopyingFileDetectedAtPinnedTree, false);
    assert.equal(robot.axes.rights.licenseId, "NO_ROOT_LICENSE_DETECTED");
    assert.deepEqual(robot.axes.permittedUse.outsiderUses,
      ["DESCRIPTIVE_SOURCE_REPLAY"]);
    assert.equal(robot.useBoundary.permits.CEU, false);
    assert.equal(robot.useBoundary.permits.PRICE, false);
  });

test("Wave5 object verifiers are explicitly structure-only, never source replay proof",
  { skip: !REAL_SOURCE }, () => {
    const result = verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
      robustRosDirectory: ROBUST });
    const checks = [
      verifyPublicEvidenceWave5Manifest(result.manifest),
      verifyPublicEvidenceWave5Record(result.records[0]),
      verifyPublicEvidenceWave5RecordSet(result.recordSet,
        { manifest: result.manifest, records: result.records }),
      verifyPublicEvidenceWave5Summary(result.summary, { manifest: result.manifest,
        recordSet: result.recordSet, records: result.records }),
      verifyPublicEvidenceWave5Verification(result.verification,
        { manifest: result.manifest, recordSet: result.recordSet, summary: result.summary,
          records: result.records }),
      verifyPublicEvidenceWave5Result(result),
    ];
    for (const check of checks) {
      assert.deepEqual(check, { ok: true, verificationLevel: "STRUCTURE_ONLY",
        sourceArtifactsReverified: false });
    }
    assert.equal(result.verification.sourceArtifactsReverified, true);
  });

test("Wave5 semantic verifier rejects re-sealed authority, reality and rights promotion",
  { skip: !REAL_SOURCE }, () => {
    const { records } = verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
      robustRosDirectory: ROBUST });
    const agent = records.find((record) =>
      record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE");
    const robot = records.find((record) =>
      record.recordType === "ORGANIC_ROBOT_SOFTWARE_BUG_FIX_TAXONOMY");
    const cases = [
      [agent, (value) => { value.useBoundary.permits.MODEL = true; }],
      [agent, (value) => { value.useBoundary.automaticTraining = true; }],
      [agent, (value) => { value.observations.terminalRecoveryEstablished = true; }],
      [agent, (value) => {
        value.axes.evidenceAuthority.outcomeIndependentlyAdjudicated = true;
      }],
      [agent, (value) => {
        value.axes.rights.embeddedMaterialLicensesUniformlyVerified = true;
      }],
      [robot, (value) => { value.observations.physicalExecutionObservedByOutsider = true; }],
      [robot, (value) => { value.observations.independentConsequenceAdjudication = true; }],
      [robot, (value) => {
        value.axes.rights.rootLicenseOrCopyingFileDetectedAtPinnedTree = true;
      }],
      [robot, (value) => { value.axes.environmentReality.class = "REAL_PHYSICAL"; }],
      [robot, (value) => { value.observations.unreviewedAuthority = true; }],
    ];
    for (const [original, mutate] of cases) {
      const changed = structuredClone(original);
      mutate(changed);
      const sealed = reseal(changed, "recordHash",
        "outsider/public-evidence-wave5/record/v1");
      assert.equal(verifyPublicEvidenceWave5Record(sealed).ok, false);
    }
  });

test("Wave5 source verifier rejects trace substitution, ROBUST substitution and extra files",
  { skip: !REAL_SOURCE }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-wave5-source-"));
    const trace = path.join(root, "trace");
    const robust = path.join(root, "robust");
    try {
      cpSync(TRACE, trace, { recursive: true });
      cpSync(ROBUST, robust, { recursive: true });
      const tracePath = path.join(trace,
        "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl");
      const traceBytes = readFileSync(tracePath);
      traceBytes[100] ^= 1;
      writeFileSync(tracePath, traceBytes);
      assert.throws(() => verifyPublicEvidenceWave5Source({
        traceCommonsDirectory: trace, robustRosDirectory: robust,
      }), /PUBLIC_EVIDENCE_WAVE5_TRACE_OBJECT_MISMATCH/);
      cpSync(path.join(TRACE,
        "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl"), tracePath);
      const bugPath = path.join(robust, "motoman/1ec8ca1/1ec8ca1.bug");
      const bugBytes = readFileSync(bugPath);
      bugBytes[100] ^= 1;
      writeFileSync(bugPath, bugBytes);
      assert.throws(() => verifyPublicEvidenceWave5Source({
        traceCommonsDirectory: trace, robustRosDirectory: robust,
      }), /PUBLIC_EVIDENCE_WAVE5_ROBUST_SELECTED_OBJECT_MISMATCH/);
      cpSync(path.join(ROBUST, "motoman/1ec8ca1/1ec8ca1.bug"), bugPath);
      writeFileSync(path.join(trace, "undeclared.txt"), "extra\n");
      assert.throws(() => verifyPublicEvidenceWave5Source({
        traceCommonsDirectory: trace, robustRosDirectory: robust,
      }), /PUBLIC_EVIDENCE_WAVE5_TRACE_FILE_SET_INVALID/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("Wave5 CLI is deterministic and its projection contains no raw prompt or bug prose",
  { skip: !REAL_SOURCE }, () => {
    const root = mkdtempSync(path.join(tmpdir(), "outsider-wave5-cli-"));
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    const cli = fileURLToPath(new URL("../scripts/stage15-public-evidence-wave5.mjs",
      import.meta.url));
    try {
      const one = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", first], { encoding: "utf8" }));
      const two = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", second], { encoding: "utf8" }));
      assert.equal(one.records, 49);
      assert.equal(one.organicAgentSessions, 3);
      assert.equal(one.robustRobotSoftwareBugs, 46);
      assert.equal(one.causalExperienceUnits, 0);
      assert.equal(one.economicLossRows, 0);
      assert.equal(one.pricingEligibleRows, 0);
      assert.equal(one.automaticTraining, false);
      const { outputDirectory: oneOutput, ...oneStable } = one;
      const { outputDirectory: twoOutput, ...twoStable } = two;
      assert.equal(oneOutput, first);
      assert.equal(twoOutput, second);
      assert.deepEqual(oneStable, twoStable);
      const names = readdirSync(first).sort();
      assert.deepEqual(names, readdirSync(second).sort());
      for (const name of names) {
        assert.deepEqual(readFileSync(path.join(first, name)), readFileSync(path.join(second, name)));
      }
      const projection = readFileSync(path.join(first, "records.jsonl"), "utf8");
      const traceRaw = readFileSync(path.join(TRACE,
        "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl"), "utf8");
      const initialPrompt = JSON.parse(traceRaw.split("\n").find((line) =>
        line.includes('"type": "user"'))).message.content[0].text;
      const bugRaw = readFileSync(path.join(ROBUST, "motoman/1ec8ca1/1ec8ca1.bug"), "utf8");
      assert.equal(projection.includes(initialPrompt), false);
      assert.equal(projection.includes("Wrong transform in MH5"), false);
      assert.equal(projection.includes(bugRaw), false);
      assert.equal(projection.includes('"automaticTraining":false'), true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

test("Wave5 artifact verifiers reject mutation even after a caller re-seals it",
  { skip: !REAL_SOURCE }, () => {
  const result = verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
    robustRosDirectory: ROBUST });
  const manifest = structuredClone(result.manifest);
  manifest.sources[0].selectedRecords = 4;
  assert.equal(verifyPublicEvidenceWave5Manifest(reseal(manifest, "manifestHash",
    "outsider/public-evidence-wave5/manifest/v1")).ok, false);
  const recordSet = structuredClone(result.recordSet);
  recordSet.records = 50;
  assert.equal(verifyPublicEvidenceWave5RecordSet(reseal(recordSet, "recordSetHash",
    "outsider/public-evidence-wave5/record-set/v1"),
    { manifest: result.manifest, records: result.records }).ok, false);
  const summary = structuredClone(result.summary);
  summary.counts.pricingEligibleRows = 1;
  assert.equal(verifyPublicEvidenceWave5Summary(reseal(summary, "summaryHash",
    "outsider/public-evidence-wave5/summary/v1"), { manifest: result.manifest,
    recordSet: result.recordSet, records: result.records }).ok, false);
  const verification = structuredClone(result.verification);
  verification.trust.independentOutcomeAdjudication = true;
  assert.equal(verifyPublicEvidenceWave5Verification(reseal(verification,
    "verificationHash", "outsider/public-evidence-wave5/verification/v1"),
  { manifest: result.manifest, recordSet: result.recordSet, summary: result.summary,
    records: result.records }).ok, false);
  assert.equal(result.records[0].schema, PUBLIC_EVIDENCE_WAVE5_SCHEMAS.record);
});
