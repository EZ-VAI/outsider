import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, cpSync, lstatSync, mkdtempSync, openSync, closeSync, readFileSync,
  readdirSync, rmSync, writeSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AGENTCHORD_COMMIT,
  AGENTCHORD_REAL_REARRANGEMENT_CONSTANTS,
  AGENTCHORD_REPORT_SCHEMA,
  AGENTCHORD_REPOSITORY,
  AGENTCHORD_TREE,
  agentChordSha256,
  buildAgentChordRealRearrangementReportFromSource,
  parseAgentChordMp4,
  verifyAgentChordRealRearrangementArtifact,
  verifyAgentChordRealRearrangementReceipt,
  verifyAgentChordRealRearrangementReport,
  verifyAgentChordRealRearrangementSource,
  verifyAgentChordRealRearrangementWithSource,
} from "../src/outsider-agentchord-real-rearrangement-recovery.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agentchord-real-rearrangement-recovery-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT,
  "agentchord-real-rearrangement-recovery.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT_BYTES = readFileSync(path.join(ARTIFACT, "run-receipt.json"));
const RECEIPT = JSON.parse(RECEIPT_BYTES);

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return `sha256:${createHash("sha256")
    .update(`${AGENTCHORD_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
    .digest("hex")}`;
}

function visit(current, output = { files: [], directories: [] }) {
  const info = lstatSync(current);
  assert.equal(info.isSymbolicLink(), false, current);
  if (info.isDirectory()) {
    output.directories.push({ path: current, mode: info.mode & 0o777 });
    for (const name of readdirSync(current).sort()) visit(path.join(current, name), output);
  } else {
    assert.equal(info.isFile(), true, current);
    output.files.push({ path: current, mode: info.mode & 0o777 });
  }
  return output;
}

function makePrivate(current) {
  const info = lstatSync(current);
  chmodSync(current, info.isDirectory() ? 0o700 : 0o600);
  if (info.isDirectory()) {
    for (const name of readdirSync(current)) makePrivate(path.join(current, name));
  }
}

test("official commit, full tree and complete source-native task group are pinned", () => {
  assert.equal(AGENTCHORD_REPOSITORY, "EDEM-AI/AgentChord");
  assert.equal(AGENTCHORD_COMMIT, "74fe7dd756964b737952d26e9e65d4d5e2e29ec3");
  assert.equal(AGENTCHORD_TREE, "8ff72fbe3bc18044ce4f88678b453257f109892e");
  assert.deepEqual(AGENTCHORD_REAL_REARRANGEMENT_CONSTANTS.repository, {
    entries: 869, files: 676, directories: 193, bytes: 132_232_145,
    selectedFiles: 7, selectedBytes: 4_780_314,
    groupVideos: 4, groupVideoBytes: 4_702_943,
  });
  const checked = verifyAgentChordRealRearrangementSource(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:df80f4d2dc03cc841c2c1ed68f23c485f3ed0cde02bdbfb42c165ce2adf51865");
  assert.equal(checked.manifestFileSha256,
    "sha256:2274c308f1147a9fdad3af86d4ecfb6d2a82e183daa6ef753b8599f4b62d6b11");
  assert.equal(checked.sourceRoot,
    "sha256:d5dc329095c5b69df6f6b1ca051c1217187d1eaed2bd026bc4141e08d9c2734e");
  assert.equal(checked.manifest.treeProjectionHash,
    "sha256:fbc8ba39b836b541c1b5e97deb71e4d1650e10d2612d46eb4dee3ae86ca11627");
  assert.equal(checked.manifest.selection.completePrefixAtPinnedTree, true);
  assert.equal(checked.manifest.repository.signatureVerified, false);
});

test("all selected bytes and MP4 structures exactly rebuild the report", () => {
  const rebuilt = buildAgentChordRealRearrangementReportFromSource(SOURCE);
  assert.deepEqual(rebuilt, REPORT);
  const replay = verifyAgentChordRealRearrangementWithSource(REPORT, SOURCE);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  assert.equal(REPORT.artifactHash,
    "sha256:8fe935e2b7afc0b71718a9ce1bc3a9ea5e3076d0ba4ffad3af2b90f97c0ae2b7");
  assert.equal(agentChordSha256(REPORT_BYTES),
    "sha256:65c02339faea42e68a1671e8e285e545a12740f4881b8838b30749723813c47c");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:08dd54f3c261ca6ed4cc329463eeedb9b91334a02ad197cb64854fbda2195b2f");
});

test("four presentation videos have exact AVC timing without becoming physical durations", () => {
  assert.deepEqual(REPORT.selectedGroup.visualRollouts.map((item) => ({
    role: item.role, bytes: item.bytes, samples: item.tracks[0].samples,
    ticks: item.tracks[0].durationTicks, sync: item.tracks[0].syncSamples,
    width: item.tracks[0].width, height: item.tracks[0].height,
    codec: item.tracks[0].codec,
  })), [
    { role: "PUBLISHER_LABELED_CLEAN_REFERENCE", bytes: 993_934,
      samples: 412, ticks: 210_944, sync: 2, width: 674, height: 404, codec: "avc1" },
    { role: "PUBLISHER_LABELED_PREGRASP_REDIRECTION", bytes: 1_175_433,
      samples: 466, ticks: 238_592, sync: 2, width: 674, height: 404, codec: "avc1" },
    { role: "PUBLISHER_LABELED_MULTI_FAILURE_RETRY", bytes: 1_357_147,
      samples: 599, ticks: 306_688, sync: 3, width: 674, height: 404, codec: "avc1" },
    { role: "PUBLISHER_LABELED_SINGLE_FAILURE_RETRY", bytes: 1_176_429,
      samples: 514, ticks: 263_168, sync: 3, width: 674, height: 404, codec: "avc1" },
  ]);
  assert.equal(REPORT.selectedGroup.presentationSpeedPublisherClaim, "3x");
  assert.equal(REPORT.selectedGroup.physicalWallClockDurationsRecoverableFromPresentationVideos,
    false);
  assert.equal(REPORT.selectedGroup.compressedPixelsDecoded, false);
  const corrupted = Buffer.from(readFileSync(path.join(SOURCE, "objects",
    AGENTCHORD_REAL_REARRANGEMENT_CONSTANTS.selected[3].path)));
  corrupted[4] = 0;
  assert.throws(() => parseAgentChordMp4(corrupted, "corrupted"), /AGENTCHORD_MP4/u);
});

test("rollout subsets, retry words and source-native claims remain non-additive", () => {
  assert.deepEqual(REPORT.denominatorRegistry.populations.map((item) => item.units),
    [4, 1, 3, 2]);
  assert.equal(REPORT.denominatorRegistry.crossPopulationTotal, null);
  assert.equal(REPORT.denominatorRegistry.eventCountFromWordOneOrMultiple, null);
  assert.equal(REPORT.denominatorRegistry.completeAttemptCensusEstablished, false);
  assert.equal(REPORT.segmentCoverageAttribution.outcome.independentRecords, 0);
  assert.equal(REPORT.segmentCoverageAttribution.recovery.independentRecords, 0);
  assert.equal(REPORT.segmentCoverageAttribution.recovery.publisherRetryMorphologyVideos, 2);
  assert.equal(REPORT.segmentCoverageAttribution.action.records, 0);
});

test("terminal dispositions preserve fixed-scope coverage without global exhaustion", () => {
  const ledger = REPORT.terminalDispositionLedger;
  assert.deepEqual(ledger.fixedQueries, ["robot manipulation failure recovery",
    "Franka failure recovery", "UR5 recovery", "robot intervention recovery"]);
  assert.deepEqual(ledger.githubFixedQueryCounts, [7, 0, 3, 3]);
  assert.equal(ledger.githubUniqueHits, 12);
  assert.deepEqual(ledger.huggingFaceDirectApiHits, [0, 0, 0, 0]);
  assert.deepEqual(ledger.zenodoQuotedPhraseHits, [0, 0, 0, 0]);
  assert.equal(ledger.exactGitHubHitUniverseTerminallyDisposed, true);
  assert.equal(ledger.zenodoUnquotedTokenExpansionIsNotClaimedExhaustive, true);
  assert.equal(ledger.globalInternetExhaustionClaimed, false);
  assert.equal(ledger.dispositions.length, 23);
});

test("rights, privacy, authority, receipt ordering and private modes remain HOLD", () => {
  assert.equal(REPORT.rightsPrivacyAndUse.use.disposition, "QUARANTINE_EVAL");
  assert.equal(REPORT.rightsPrivacyAndUse.use.modelTrainingAuthorized, false);
  assert.equal(REPORT.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  assert.equal(REPORT.rightsPrivacyAndUse.privacy.manualPrivacyReviewComplete, false);
  assert.equal(REPORT.rightsPrivacyAndUse.rights.legalConclusion, false);
  assert.equal(REPORT.authorityAndEconomicsBoundary.actionAuthorityDelta, 0);
  assert.equal(REPORT.authorityAndEconomicsBoundary.networkContributionRecords, 0);
  assert.equal(REPORT.authorityAndEconomicsBoundary.CEURecords, 0);
  const receipt = verifyAgentChordRealRearrangementReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receipt.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:362f5e3dc0e8efa2ee28ba943aebbfc3f64d06ed5e5a228a160f3c926481953a");
  assert.equal(agentChordSha256(RECEIPT_BYTES),
    "sha256:989ffdc008e6944d2a20123a000ac9b69c298d54a783a8a5997f65b5a4976926");
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.every((item) => item.mode === 0o700), true);
  assert.equal(tree.files.every((item) => item.mode === 0o600), true);
  const artifact = verifyAgentChordRealRearrangementArtifact(ARTIFACT);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
});

test("source mutation and self-resealed semantic inflation fail closed", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "agentchord-source-tamper-"));
  const copied = path.join(temporary, "source");
  cpSync(SOURCE, copied, { recursive: true });
  makePrivate(copied);
  const video = path.join(copied, "objects/docs/static/demos/rearrangement/clean.mp4");
  const descriptor = openSync(video, "r+");
  try { writeSync(descriptor, Buffer.from([0]), 0, 1, 4); }
  finally { closeSync(descriptor); }
  assert.throws(() => verifyAgentChordRealRearrangementSource(copied), /AGENTCHORD_/u);
  rmSync(temporary, { recursive: true, force: true });

  const denominator = structuredClone(REPORT);
  denominator.denominatorRegistry.crossPopulationTotal = 10;
  denominator.artifactHash = artifactDigest(denominator);
  assert.ok(verifyAgentChordRealRearrangementReport(denominator).errors
    .includes("DENOMINATOR_BOUNDARY"));

  const outcome = structuredClone(REPORT);
  outcome.segmentCoverageAttribution.outcome.independentRecords = 1;
  outcome.artifactHash = artifactDigest(outcome);
  assert.ok(verifyAgentChordRealRearrangementReport(outcome).errors
    .includes("SEGMENT_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.rightsPrivacyAndUse.use.modelTrainingAuthorized = true;
  training.rightsPrivacyAndUse.use.authorizedTrainingRows = 4;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifyAgentChordRealRearrangementReport(training).errors
    .includes("RIGHTS_PRIVACY_USE_BOUNDARY"));

  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifyAgentChordRealRearrangementReport(scope).errors
    .includes("SCOPE_REPLAY_BOUNDARY"));

  const authority = structuredClone(REPORT);
  authority.authorityAndEconomicsBoundary.publicDeploymentReady = true;
  authority.artifactHash = artifactDigest(authority);
  assert.ok(verifyAgentChordRealRearrangementReport(authority).errors
    .includes("AUTHORITY_ECONOMICS_BOUNDARY"));
});
