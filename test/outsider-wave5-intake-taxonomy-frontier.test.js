import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  verifyPublicEvidenceWave5Record,
  verifyPublicEvidenceWave5RecordSet,
  verifyPublicEvidenceWave5Result,
  verifyPublicEvidenceWave5Source,
  verifyPublicEvidenceWave5Summary,
  verifyPublicEvidenceWave5Verification,
} from "../src/outsider-public-evidence-wave5.js";
import {
  DurableWave5IntakeRegistry,
  PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER,
  WAVE5_INTAKE_SCHEMAS,
  buildWave5IntakeSnapshot,
  buildWave5IntakeSnapshotDiff,
  verifyWave5IntakeRow,
  verifyWave5IntakeSnapshot,
  verifyWave5IntakeSnapshotDiff,
} from "../src/outsider-wave5-intake-taxonomy-frontier.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = path.join(ROOT, "artifacts/public-evidence-wave5-20260821/source");
const TRACE = path.join(SOURCE, "trace-commons");
const ROBUST = path.join(SOURCE, "robust-ros");
const REAL_SOURCE = existsSync(TRACE) && existsSync(ROBUST);
const T0 = "2026-08-21T00:00:00.000Z";
const T1 = "2026-08-21T00:00:01.000Z";

function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(typeof value === "string" ? value : canonicalizeStrict(value))
    .digest("hex")}`;
}
function reseal(value, hashField, domain) {
  const body = structuredClone(value);
  delete body[hashField];
  return { ...body, [hashField]: digest(body, domain) };
}
function sourceResult() {
  return verifyPublicEvidenceWave5Source({ traceCommonsDirectory: TRACE,
    robustRosDirectory: ROBUST, generatedAt: T0 });
}
function forgeFourLayerWave5Result(result) {
  const forged = structuredClone(result);
  const index = forged.records.findIndex((record) =>
    record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE");
  forged.records[index].observations.sourceEvents += 1;
  forged.records[index] = reseal(forged.records[index], "recordHash",
    "outsider/public-evidence-wave5/record/v1");
  forged.recordSet.recordHashes[index] = forged.records[index].recordHash;
  forged.recordSet = reseal(forged.recordSet, "recordSetHash",
    "outsider/public-evidence-wave5/record-set/v1");
  forged.summary.recordSetHash = forged.recordSet.recordSetHash;
  forged.summary.counts.agentSourceEvents += 1;
  forged.summary = reseal(forged.summary, "summaryHash",
    "outsider/public-evidence-wave5/summary/v1");
  forged.verification.recordSetHash = forged.recordSet.recordSetHash;
  forged.verification.summaryHash = forged.summary.summaryHash;
  forged.verification = reseal(forged.verification, "verificationHash",
    "outsider/public-evidence-wave5/verification/v1");
  return forged;
}
function allFiles(directory, prefix = "") {
  const output = [];
  for (const name of readdirSync(path.join(directory, prefix)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const absolute = path.join(directory, relative);
    if (statSync(absolute).isDirectory()) output.push(...allFiles(directory, relative));
    else output.push(relative);
  }
  return output;
}

test("Wave5 intake provider is coded, source-bound and has no caller authority", () => {
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.schema,
    WAVE5_INTAKE_SCHEMAS.provider);
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.derivationMode,
    "CODED_FULL_SOURCE_REPLAY");
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.buildInput,
    "SOURCE_DIRECTORY_ONLY");
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.acceptsCallerVerificationCallbacks,
    false);
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER
    .acceptsCallerMaterializedResultAsProof, false);
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.authority, "NONE");
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.futureAppendContract
    .newProviderRequiresCodedSourceVerifierAndNewProviderId, true);
  assert.equal(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.futureAppendContract
    .callerSuppliedRowsAcquireAuthority, false);
});

test("Wave5 source-aware snapshot projects only organic shape and ROS mechanism taxonomy",
  { skip: !REAL_SOURCE }, () => {
    const snapshot = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE });
    const structural = verifyWave5IntakeSnapshot(snapshot);
    assert.deepEqual(structural, { ok: true, verificationLevel: "STRUCTURE_ONLY",
      sourceArtifactsReverified: false });
    const full = verifyWave5IntakeSnapshot(snapshot, { sourceDirectory: SOURCE });
    assert.deepEqual(full, { ok: true, verificationLevel: "FULL_SOURCE_REPLAY",
      sourceArtifactsReverified: true });
    assert.equal(snapshot.rows.length, 49);
    assert.equal(snapshot.summary.organicAgentSessionShapeRows, 3);
    assert.equal(snapshot.summary.rosBugFixMechanismTaxonomyRows, 46);
    assert.equal(snapshot.summary.uniqueD1IdentityRoots, 49);
    assert.equal(snapshot.summary.conservativeD2CorrelationGroups, 3);
    assert.deepEqual(snapshot.summary.traceHarnesses,
      { claude_code: 1, cursor: 1, opencode: 1 });
    assert.deepEqual(snapshot.summary.traceToolEvidenceCoverage, {
      COMPLETE_CALL_RESULT_PAIRING: 1,
      COMPLETE_TOOL_STATE_ONLY: 1,
      TOOL_RESULTS_NOT_PRESERVED: 1,
    });
    assert.equal(snapshot.summary.traceToolCalls, 61);
    assert.equal(snapshot.summary.traceSourceNativeToolErrors, 6);
    assert.deepEqual(snapshot.summary.robustSystems,
      { motoman: 21, universal_robot: 25 });
    assert.deepEqual(snapshot.summary.robustPhases,
      { build: 17, runtime: 16, startup: 13 });
    assert.equal(snapshot.summary.robustIssueReferenceMissing, 12);
    assert.equal(snapshot.summary.robustPullRequestReferenceMissing, 5);
    assert.equal(snapshot.summary.robustFixCommitMissing, 1);
    assert.equal(snapshot.summary.sourceHumanReviewDeclaredRows, 49);
    assert.equal(snapshot.summary.outsiderProjectionReviewedRows, 0);
    assert.equal(snapshot.summary.downstreamHumanReviewRequiredRows, 49);
    assert.equal(snapshot.sourceVerification.selectedSourceObjectsReverified, 57);
    assert.equal(snapshot.sourceVerification.selectedSourceBytesReverified, 576_071);
    assert.equal(snapshot.sourceVerification.sourceNativeRowsReparsed, 49);
    assert.equal(snapshot.sourceVerification.claimVerificationMode,
      "SOURCE_DIRECTORY_REPLAY_REQUIRED");
    assert.equal(snapshot.sourceVerification.callerMaterializedResultAcceptedAsProof,
      false);
    assert.equal(snapshot.sourceVerification.structureVerifiersCanEstablishSourceReplay,
      false);
  });

test("Wave5 projection keeps selection, four axes, correlation and missingness explicit",
  { skip: !REAL_SOURCE }, () => {
    const snapshot = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE });
    const trace = snapshot.rows.filter((row) =>
      row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE");
    const robust = snapshot.rows.filter((row) =>
      row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY");
    assert.equal(new Set(trace.map((row) => row.identity.d2CorrelationRoot)).size, 1);
    assert.equal(new Set(robust.map((row) => row.identity.d2CorrelationRoot)).size, 2);
    assert.equal(snapshot.rows.every((row) => row.selection.outcomeBlind), true);
    assert.equal(snapshot.rows.every((row) => !row.identity.independentExposureUnit), true);
    assert.equal(snapshot.rows.every((row) =>
      !row.identity.sourceNativeCorrelationComplete), true);
    assert.equal(snapshot.rows.every((row) => row.humanReview.sourceReviewPresent === true
      && row.humanReview.sourceReviewEvidenceBasis === "PUBLISHER_DECLARED"
      && row.humanReview.reviewIdentityIndependentlyVerifiedPerRow === false
      && row.humanReview.outsiderProjectionReviewed === false
      && row.humanReview.downstreamHumanReviewRequired === true
      && row.humanReview.automaticDownstreamAdmission === false), true);
    assert.equal(trace.every((row) => row.reality.class === "REAL_SOFTWARE"
      && row.authority.outcomeIndependentlyAdjudicated === false
      && row.rights.embeddedMaterialLicensesUniformlyVerified === false
      && row.permittedUse.automaticTraining === false
      && row.empirical.shapeOnly === true
      && row.empirical.successClaimed === false
      && row.empirical.recoveryClaimed === false
      && row.missingness.independentOutcomeMissing === true), true);
    assert.equal(robust.every((row) => row.reality.class === "REAL_SOFTWARE"
      && row.reality.physicalExecutionStreamAcquired === false
      && row.authority.outcomeIndependentlyAdjudicated === false
      && row.rights.rootLicenseOrCopyingFileDetectedAtPinnedTree === false
      && row.permittedUse.automaticTraining === false
      && row.empirical.mechanismTaxonomyOnly === true
      && row.empirical.physicalExecutionClaimed === false
      && row.empirical.populationFrequencyClaimed === false
      && row.empirical.lossClaimed === false), true);
    assert.equal(snapshot.rows.every((row) => row.boundary.causalExperienceUnits === 0
      && row.boundary.economicLossRows === 0
      && row.boundary.populationFrequencyEligible === false
      && row.boundary.pricingEligible === false
      && Object.values(row.boundary.permits).every((value) => value === false)), true);
  });

test("Wave5 row verifier rejects re-sealed authority, rights and interpretation promotion",
  { skip: !REAL_SOURCE }, () => {
    const snapshot = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE });
    const trace = snapshot.rows.find((row) =>
      row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE");
    const robust = snapshot.rows.find((row) =>
      row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY");
    const cases = [
      [trace, (row) => { row.authority.outcomeIndependentlyAdjudicated = true; }],
      [trace, (row) => { row.rights.embeddedMaterialLicensesUniformlyVerified = true; }],
      [trace, (row) => { row.empirical.successClaimed = true; }],
      [trace, (row) => { row.empirical.recoveryClaimed = true; }],
      [trace, (row) => { row.permittedUse.automaticTraining = true; }],
      [trace, (row) => { row.humanReview.outsiderProjectionReviewed = true; }],
      [robust, (row) => { row.reality.physicalExecutionStreamAcquired = true; }],
      [robust, (row) => { row.empirical.physicalExecutionClaimed = true; }],
      [robust, (row) => { row.empirical.populationFrequencyClaimed = true; }],
      [robust, (row) => { row.empirical.lossClaimed = true; }],
      [robust, (row) => { row.rights.rootLicenseOrCopyingFileDetectedAtPinnedTree = true; }],
      [robust, (row) => { row.boundary.permits.PRICE = true; }],
      [robust, (row) => { row.unreviewedAuthority = true; }],
    ];
    for (const [original, mutate] of cases) {
      const changed = structuredClone(original);
      mutate(changed);
      const sealed = reseal(changed, "rowHash", "outsider/wave5-intake/row/v1");
      assert.equal(verifyWave5IntakeRow(sealed).ok, false);
    }
  });

test("Wave5 exact source binding rejects a semantically valid re-sealed observation",
  { skip: !REAL_SOURCE }, () => {
    const result = sourceResult();
    const snapshot = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE });
    const changed = structuredClone(snapshot);
    const index = changed.rows.findIndex((row) =>
      row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE");
    changed.rows[index].empirical.continuedAfterObservedToolError =
      !changed.rows[index].empirical.continuedAfterObservedToolError;
    changed.rows[index] = reseal(changed.rows[index], "rowHash",
      "outsider/wave5-intake/row/v1");
    const sealed = reseal(changed, "snapshotHash", "outsider/wave5-intake/snapshot/v1");
    assert.deepEqual(verifyWave5IntakeSnapshot(sealed), {
      ok: true, verificationLevel: "STRUCTURE_ONLY", sourceArtifactsReverified: false,
    });
    assert.deepEqual(verifyWave5IntakeSnapshot(sealed, { sourceDirectory: SOURCE }), {
      ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
    });
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-wave5-binding-"));
    try {
      const registry = new DurableWave5IntakeRegistry({ directory });
      assert.throws(() => registry.append(sealed, { expectedHeadSnapshotHash: null,
        sourceDirectory: SOURCE }), /WAVE5_INTAKE_APPEND_ARGUMENT_INVALID/);
      assert.throws(() => registry.append(snapshot, { expectedHeadSnapshotHash: null,
        sourceResult: result }), /WAVE5_INTAKE_APPEND_ARGUMENT_INVALID/);
      assert.throws(() => registry.append(snapshot, { expectedHeadSnapshotHash: null }),
        /WAVE5_INTAKE_APPEND_ARGUMENT_INVALID/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

test("Wave5 P1: a four-layer caller re-seal is structure-only and cannot build or append",
  { skip: !REAL_SOURCE }, () => {
    const forged = forgeFourLayerWave5Result(sourceResult());
    const recordCheck = verifyPublicEvidenceWave5Record(forged.records.find((record) =>
      record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE"));
    const setCheck = verifyPublicEvidenceWave5RecordSet(forged.recordSet,
      { manifest: forged.manifest, records: forged.records });
    const summaryCheck = verifyPublicEvidenceWave5Summary(forged.summary,
      { manifest: forged.manifest, recordSet: forged.recordSet, records: forged.records });
    const verificationCheck = verifyPublicEvidenceWave5Verification(forged.verification,
      { manifest: forged.manifest, recordSet: forged.recordSet, summary: forged.summary,
        records: forged.records });
    const resultCheck = verifyPublicEvidenceWave5Result(forged);
    for (const check of [recordCheck, setCheck, summaryCheck, verificationCheck,
      resultCheck]) {
      assert.deepEqual(check, { ok: true, verificationLevel: "STRUCTURE_ONLY",
        sourceArtifactsReverified: false });
    }
    assert.throws(() => buildWave5IntakeSnapshot(forged),
      /WAVE5_INTAKE_BUILD_ARGUMENT_INVALID/);
    assert.throws(() => buildWave5IntakeSnapshot({ ...forged,
      sourceDirectory: SOURCE }), /WAVE5_INTAKE_BUILD_ARGUMENT_INVALID/);

    const genuine = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE });
    const forgedSnapshot = structuredClone(genuine);
    const index = forgedSnapshot.rows.findIndex((row) =>
      row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE");
    forgedSnapshot.rows[index].empirical.sourceEvents += 1;
    forgedSnapshot.rows[index].source.sourceRecordSeal = forged.records.find((record) =>
      record.identity.sourceRecordHash
      === forgedSnapshot.rows[index].source.sourceRecordHash).recordHash;
    forgedSnapshot.rows[index] = reseal(forgedSnapshot.rows[index], "rowHash",
      "outsider/wave5-intake/row/v1");
    forgedSnapshot.sourceVerification.wave5RecordSetHash = forged.recordSet.recordSetHash;
    forgedSnapshot.sourceVerification.wave5SummaryHash = forged.summary.summaryHash;
    forgedSnapshot.sourceVerification.wave5VerificationHash =
      forged.verification.verificationHash;
    const sealedSnapshot = reseal(forgedSnapshot, "snapshotHash",
      "outsider/wave5-intake/snapshot/v1");
    assert.deepEqual(verifyWave5IntakeSnapshot(sealedSnapshot), {
      ok: true, verificationLevel: "STRUCTURE_ONLY", sourceArtifactsReverified: false,
    });
    assert.deepEqual(verifyWave5IntakeSnapshot(sealedSnapshot,
      { wave5Result: forged }), {
      ok: false, verificationLevel: "STRUCTURE_ONLY", sourceArtifactsReverified: false,
    });
    assert.deepEqual(verifyWave5IntakeSnapshot(sealedSnapshot,
      { sourceDirectory: SOURCE }), {
      ok: false, verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
    });
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-wave5-p1-"));
    try {
      const registry = new DurableWave5IntakeRegistry({ directory });
      assert.throws(() => registry.append(sealedSnapshot, {
        expectedHeadSnapshotHash: null, sourceDirectory: SOURCE,
      }), /WAVE5_INTAKE_APPEND_ARGUMENT_INVALID/);
      assert.throws(() => registry.append(genuine, {
        expectedHeadSnapshotHash: null, sourceDirectory: SOURCE,
        sourceResult: forged,
      }), /WAVE5_INTAKE_APPEND_ARGUMENT_INVALID/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

test("Wave5 snapshot diff and future append seam retain zero-authority boundaries",
  { skip: !REAL_SOURCE }, () => {
    const first = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE, generatedAt: T0 });
    const second = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE, generatedAt: T1,
      predecessorSnapshot: first });
    const bootstrap = buildWave5IntakeSnapshotDiff(null, first);
    const next = buildWave5IntakeSnapshotDiff(first, second);
    assert.equal(verifyWave5IntakeSnapshotDiff(bootstrap, null, first).ok, true);
    assert.equal(bootstrap.changes.counts.added, 49);
    assert.deepEqual(bootstrap.sourceChanges.map((entry) => entry.change),
      ["ADDED", "ADDED"]);
    assert.equal(bootstrap.automaticPromotion, false);
    assert.equal(verifyWave5IntakeSnapshotDiff(next, first, second).ok, true);
    assert.deepEqual(next.changes.counts,
      { added: 0, removed: 0, changed: 0, unchanged: 49 });
    assert.deepEqual(next.sourceChanges.map((entry) => entry.change),
      ["UNCHANGED", "UNCHANGED"]);
    assert.deepEqual(next.missingnessDelta, {
      economicLossMissing: 0, exposureDenominatorMissing: 0, fixCommitMissing: 0,
      independentOutcomeMissing: 0, issueReferenceMissing: 0,
      pullRequestReferenceMissing: 0, rows: 0,
    });
    assert.equal(next.boundary.causalExperienceUnits, 0);
    assert.equal(next.boundary.pricingEligible, false);
  });

test("Wave5 durable intake registry enforces source replay, predecessor and CAS",
  { skip: !REAL_SOURCE }, () => {
    const first = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE, generatedAt: T0 });
    const second = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE, generatedAt: T1,
      predecessorSnapshot: first });
    const unlinked = buildWave5IntakeSnapshot({ sourceDirectory: SOURCE, generatedAt: T1 });
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-wave5-registry-"));
    try {
      const registry = new DurableWave5IntakeRegistry({ directory,
        registryId: "wave5-test", createdAt: T0 });
      const one = registry.append(first, { expectedHeadSnapshotHash: null,
        recordedAt: T0, sourceDirectory: SOURCE });
      assert.equal(one.revision, 1);
      assert.equal(one.admissionVerificationLevel, "FULL_SOURCE_REPLAY");
      assert.equal(one.sourceArtifactsReverifiedAtAdmission, true);
      assert.equal(one.admissionClaimIsNotStandaloneProof, true);
      assert.throws(() => registry.append(second, { expectedHeadSnapshotHash: null,
        recordedAt: T1, sourceDirectory: SOURCE }), /COMPARE_AND_SWAP_HEAD_MISMATCH/);
      assert.throws(() => registry.append(unlinked, {
        expectedHeadSnapshotHash: first.snapshotHash, recordedAt: T1,
        sourceDirectory: SOURCE }), /SNAPSHOT_PREDECESSOR_MISMATCH/);
      const two = registry.append(second, {
        expectedHeadSnapshotHash: first.snapshotHash, recordedAt: T1,
        sourceDirectory: SOURCE });
      assert.equal(two.revision, 2);
      const checked = registry.verify();
      assert.equal(checked.ok, true);
      assert.equal(checked.verificationLevel, "LOCAL_CHAIN_STRUCTURE_ONLY");
      assert.equal(checked.sourceArtifactsReverified, false);
      assert.equal(checked.state.headSnapshotHash, second.snapshotHash);
      assert.equal(checked.state.rollbackResistance,
        "LOCAL_CHAIN_PLUS_CALLER_HELD_EXPECTED_HEAD");
      assert.equal(checked.state.externalCheckpointEstablished, false);
      writeFileSync(path.join(directory, "snapshots", `${"0".repeat(64)}.json`), "{}\n");
      assert.equal(registry.verify().ok, false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

test("Wave5 intake CLI is deterministic and persists no raw prompt or bug prose",
  { skip: !REAL_SOURCE }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-wave5-intake-cli-"));
    const first = path.join(directory, "first");
    const second = path.join(directory, "second");
    const cli = fileURLToPath(new URL(
      "../scripts/stage15-wave5-intake-taxonomy-frontier.mjs", import.meta.url));
    try {
      const one = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", first], { encoding: "utf8" }));
      const two = JSON.parse(execFileSync(process.execPath,
        [cli, "--source-dir", SOURCE, "--output-dir", second], { encoding: "utf8" }));
      assert.equal(one.rows, 49);
      assert.equal(one.organicAgentSessionShapeRows, 3);
      assert.equal(one.rosBugFixMechanismTaxonomyRows, 46);
      assert.equal(one.conservativeD2CorrelationGroups, 3);
      assert.equal(one.registryRevision, 1);
      assert.equal(one.causalExperienceUnits, 0);
      assert.equal(one.economicLossRows, 0);
      assert.equal(one.populationFrequencyEligibleRows, 0);
      assert.equal(one.pricingEligibleRows, 0);
      assert.equal(one.automaticTrainingRows, 0);
      const { outputDirectory: oneDirectory, ...oneStable } = one;
      const { outputDirectory: twoDirectory, ...twoStable } = two;
      assert.equal(oneDirectory, first);
      assert.equal(twoDirectory, second);
      assert.deepEqual(oneStable, twoStable);
      const files = allFiles(first);
      assert.deepEqual(files, allFiles(second));
      for (const file of files) {
        assert.deepEqual(readFileSync(path.join(first, file)),
          readFileSync(path.join(second, file)));
      }
      const projection = readFileSync(path.join(first, "projection.jsonl"), "utf8");
      const traceRaw = readFileSync(path.join(TRACE,
        "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl"), "utf8");
      const initialPrompt = JSON.parse(traceRaw.split("\n").find((line) =>
        line.includes('"type": "user"'))).message.content[0].text;
      const bugRaw = readFileSync(path.join(ROBUST,
        "motoman/1ec8ca1/1ec8ca1.bug"), "utf8");
      assert.equal(projection.includes(initialPrompt), false);
      assert.equal(projection.includes("Wrong transform in MH5"), false);
      assert.equal(projection.includes(bugRaw), false);
      assert.equal(projection.includes('"automaticTraining":false'), true);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
