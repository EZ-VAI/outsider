import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRmpdRobotMotionSampleFromSource,
  rmpdSha256,
  verifyRmpdArtifactDirectory,
  verifyRmpdRobotMotionSample,
} from "../src/outsider-rmpd-robot-motion-sample.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT,
  "artifacts/outsider-rmpd-robot-motion-sample-20260829-v1");

test("RMPD full publisher sample replays six mechanical trajectories", () => {
  const verified = verifyRmpdArtifactDirectory(ARTIFACT);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.sampleTrajectories, 6);
  assert.equal(verified.measuredPoseRows, 12_816);
  assert.equal(verified.completeEpisodeIntersection, 0);

  const report = buildRmpdRobotMotionSampleFromSource(path.join(ARTIFACT, "source"));
  assert.equal(report.declaredScope.sampleTrajectoryUniverseComplete, true);
  assert.equal(report.declaredScope.fullDatabaseDumpAcquired, false);
  assert.equal(report.denominatorRegistry.crossPopulationTotal, null);
  assert.equal(report.sourceReplay.replay.primitiveSegmentCount, 18);
  assert.deepEqual(report.sourceReplay.replay.movementCounts,
    { circular: 3, cll: 1, lcl: 2, linear: 15, lll: 3 });
  assert.equal(report.mechanicalEvidence.instrumentDistinctCommandMeasuredPathsPresent, true);
  assert.equal(report.mechanicalEvidence.instrumentOperationalIndependenceExternallyAudited,
    false);
  assert.equal(report.mechanicalEvidence.taskOutcomeEstablished, false);
  assert.equal(report.mechanicalEvidence.recoveryEstablished, false);
  assert.equal(report.boundary.authorizedTrainingRows, 0);
  assert.equal(report.boundary.networkAdmission, false);
  assert.equal(report.boundary.delegationAuthority, false);
});

test("RMPD receipt binds report bytes and self-resealed promotions fail", () => {
  const reportBytes = readFileSync(path.join(ARTIFACT, "report.json"));
  const report = JSON.parse(reportBytes);
  assert.match(rmpdSha256(reportBytes), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(verifyRmpdRobotMotionSample(report, path.join(ARTIFACT, "source")).ok, true);

  const promoted = structuredClone(report);
  promoted.boundary.authorizedTrainingRows = 6;
  promoted.artifactHash = rmpdSha256(Buffer.from(JSON.stringify(promoted)));
  assert.equal(verifyRmpdRobotMotionSample(promoted, path.join(ARTIFACT, "source")).ok, false);
});
