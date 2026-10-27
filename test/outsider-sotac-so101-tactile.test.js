import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  SOTAC_DATASET_ID,
  SOTAC_LEROBOTAC_HEAD,
  SOTAC_LEROBOTAC_TREE,
  SOTAC_PAXINI_HEAD,
  SOTAC_PAXINI_TREE,
  SOTAC_REPORT_SCHEMA,
  SOTAC_REVISION,
  SOTAC_SO101_CONSTANTS,
  buildSotacSo101TactileFromSource,
  sotacSha256,
  verifySotacSo101ArtifactDirectory,
  verifySotacSo101RunReceipt,
  verifySotacSo101SourceDirectory,
  verifySotacSo101TactileReport,
  verifySotacSo101TactileWithSource,
} from "../src/outsider-sotac-so101-tactile.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve("artifacts/outsider-sotac-so101-tactile-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT, "sotac-so101-tactile.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT_BYTES = readFileSync(path.join(ARTIFACT, "run-receipt.json"));
const RECEIPT = JSON.parse(RECEIPT_BYTES);

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return "sha256:" + createHash("sha256")
    .update(`${SOTAC_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
    .digest("hex");
}

function visit(current, result = { directories: [], files: [] }) {
  const stat = lstatSync(current);
  assert.equal(stat.isSymbolicLink(), false, current);
  if (stat.isDirectory()) {
    result.directories.push({ path: current, mode: stat.mode & 0o777 });
    for (const name of readdirSync(current).sort()) visit(path.join(current, name), result);
  } else {
    assert.equal(stat.isFile(), true, current);
    result.files.push({ path: current, mode: stat.mode & 0o777 });
  }
  return result;
}

test("SOTAC HF revision, full no-video closure and both source-code pins are exact", () => {
  assert.equal(SOTAC_DATASET_ID, "Jingyi-Z/sotac");
  assert.equal(SOTAC_REVISION, "47d46cfb82e5d327a0e0790f1414417bddbf3be5");
  assert.equal(SOTAC_LEROBOTAC_HEAD, "0484f77407ba0bce14567a24c3e94f67df31a74a");
  assert.equal(SOTAC_LEROBOTAC_TREE, "b1093b1a6d2bd3738dd2cb287c1d792db8be0dfa");
  assert.equal(SOTAC_PAXINI_HEAD, "79c82145f88e158dd7706736e8c07f14f11cbd7a");
  assert.equal(SOTAC_PAXINI_TREE, "fb45e0bbc89d1ff28ca66a336bd7558153843bce");
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.treePages, 7);
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.treeEntries, 348);
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.closureFiles, 262);
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.closureBytes, 124_527_278);
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.videoFilesExcluded, 9);
  assert.equal(SOTAC_SO101_CONSTANTS.expectedProfile.videoBytesExcluded, 909_360_298);
});

test("source verifier replays both HF brackets, GitHub trees and all 275 selected objects", () => {
  const checked = verifySotacSo101SourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:506609e5782207122fd07ddd5972eb09d2292d1530627828ecae6ff4d7c83d78");
  assert.equal(checked.manifestFileSha256,
    "sha256:e21f5d7782ac4ba9412e60ebddf7509f2a36d49d595947a3b7310dc785f2644a");
  assert.equal(checked.sourceRoot,
    "sha256:bc45cbdc7c821907a7e0101640b0f3239814dc6549438bff31e1d9a178a8f5d4");
  assert.equal(checked.treeSnapshotHash,
    "sha256:de183b08bf35d4041dbc786c8dd9b16d75c866e15ef74d752950211f5e5c4a65");
  assert.equal(checked.manifest.hfRemoteObjects.length, 262);
  assert.equal(checked.manifest.githubRemoteObjects.length, 13);
  assert.equal(checked.manifest.support.length, 22);
  assert.equal(checked.manifest.github.curationLinkBoundary
    .presentAtPinnedLerobotacHead, false);
});

test("all Parquet, raw tactile and annotation bytes rebuild the exact report", () => {
  const rebuilt = buildSotacSo101TactileFromSource(SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifySotacSo101TactileWithSource(REPORT, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
  assert.equal(REPORT.artifactHash,
    "sha256:2906bd8c6a14622db4e562612cc8426dc62d4f307a2cffd379a38fea3c1771e5");
  assert.equal(sotacSha256(REPORT_BYTES),
    "sha256:62321b68576f0dc1fa1f57b5891cf9eaa74a192aabc0c39b216fdb1bb762a001");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:0f0f826adaae3622a4a7e0f2ed84cca0c1ceaca678b679569b47aee3ea2161d7");
});

test("typed populations and tactile crosswalk remain non-additive", () => {
  const derived = REPORT.sourceReplay.derived;
  assert.equal(derived.episodes, 63);
  assert.equal(derived.frames, 25_401);
  assert.deepEqual(derived.taskBreakdown.map((entry) => [entry.episodes, entry.frames]),
    [[21, 7955], [22, 8972], [20, 8474]]);
  assert.equal(derived.rawDualFingerTimesteps, 90_110);
  assert.equal(derived.rawFingerSampleRows, 180_220);
  assert.equal(derived.rawDistributedForceScalarValues, 28_114_320);
  assert.equal(derived.rawTiming.medianEffectiveHz, 90.863659);
  assert.equal(derived.rawTiming.rawInMainWindowDualFingerTimesteps, 76_763);
  assert.equal(derived.crosswalk.sameEpisodeRawVectorMatches, 50_802);
  assert.equal(derived.crosswalk.sameEpisodeRawVectorUnmatched, 0);
  assert.equal(derived.crosswalk.latestAtOrBeforeTimestampMatches, 47_373);
  assert.equal(derived.crosswalk.boundedFortySampleWindowMatches, 50_802);
  assert.equal(derived.crosswalk.exactTimestampIdentityEstablished, false);
  assert.equal(REPORT.denominatorRegistry.populations[0].units, 63);
  assert.equal(REPORT.denominatorRegistry.populations[2].units, 90_110);
  assert.equal(REPORT.denominatorRegistry.rawFingerRowsAreAdditionalTimesteps, false);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
});

test("publisher labels, selection bias and independent-evidence boundaries are explicit", () => {
  assert.deepEqual(REPORT.population.publisherResultLabels,
    { failure: 3, partial: 3, success: 57 });
  assert.equal(REPORT.population.publisherAnnotatedWithinEpisodeAttempts, 74);
  assert.equal(REPORT.annotationEvidence.timeAlignedAtoms, 1033);
  assert.equal(REPORT.annotationEvidence.resultLabelsIndependentlyVerified, 0);
  assert.equal(REPORT.curationBoundary.releasedPopulationIsCompleteAttemptCensus, false);
  assert.equal(REPORT.curationBoundary.linkedFilesPresentAtPinnedRecordingForkHead, false);
  assert.equal(REPORT.curationBoundary.cardCurationReproducibilityClaimEstablishedByThisClosure,
    false);
  assert.equal(REPORT.curationBoundary.deletedRunCountInferred, null);
  assert.equal(REPORT.segmentCoverage.opportunityCensus.units, 0);
  assert.equal(REPORT.segmentCoverage.effect.episodesWithDirectTactileTelemetry, 63);
  assert.equal(REPORT.segmentCoverage.effect.independentWitnessEpisodes, 0);
  assert.equal(REPORT.segmentCoverage.outcome.independentOutcomeRecords, 0);
  assert.equal(REPORT.segmentCoverage.recovery.independentlyVerifiedRecoveryRecords, 0);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.privacy.publisherPrivacyGuaranteePresent, false);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized, false);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows, 0);
});

test("receipt is final and the complete artifact remains private", () => {
  const receiptCheck = verifySotacSo101RunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:07fa7ca58314afc4954a8099060043d5820aa0478d673e17204c935e45bdd63e");
  assert.equal(sotacSha256(RECEIPT_BYTES),
    "sha256:da35b00e0f82eeb1faf39edea39958ae4d7c2977b2a6ed8cd76ef410bf1f8f18");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 85);
  assert.equal(tree.files.length, 300);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const checked = verifySotacSo101ArtifactDirectory(ARTIFACT,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("rehash cannot inflate census, independence, training, exhaustion or denominators", () => {
  const census = structuredClone(REPORT);
  census.curationBoundary.releasedPopulationIsCompleteAttemptCensus = true;
  census.artifactHash = artifactDigest(census);
  assert.ok(verifySotacSo101TactileReport(census).errors.includes("CURATION_BOUNDARY"));

  const outcome = structuredClone(REPORT);
  outcome.segmentCoverage.outcome.independentOutcomeRecords = 63;
  outcome.artifactHash = artifactDigest(outcome);
  assert.ok(verifySotacSo101TactileReport(outcome).errors.includes("SEGMENT_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized = true;
  training.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows = 25_401;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifySotacSo101TactileReport(training).errors
    .includes("RIGHTS_PRIVACY_TRAINING_BOUNDARY"));

  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifySotacSo101TactileReport(scope).errors.includes("SCOPE_BOUNDARY"));

  const denominator = structuredClone(REPORT);
  denominator.denominatorRegistry.crossDomainTotal = 63 + 25_401 + 90_110;
  denominator.artifactHash = artifactDigest(denominator);
  assert.ok(verifySotacSo101TactileReport(denominator).errors
    .includes("DENOMINATOR_BOUNDARY"));
});
