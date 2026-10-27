import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildStage05GovernedTrainingIntakeDiagnostic,
  STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL,
  STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA,
  verifyStage05GovernedTrainingIntakeAgainstSources,
  verifyStage05GovernedTrainingIntakeCanonicalStructure,
  verifyStage05GovernedTrainingIntakeStructure,
} from "../src/outsider-stage05-governed-training-intake.js";

const ARTIFACTS = path.resolve("artifacts");
const CANONICAL = path.resolve(
  STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.repositoryRelativePath);
let diagnostic;
let temporary;

function reseal(value) {
  const body = structuredClone(value);
  delete body.artifactHash;
  return { ...body, artifactHash: `sha256:${createHash("sha256")
    .update(`${STAGE05_GOVERNED_TRAINING_INTAKE_SCHEMA}\0${canonicalizeStrict(body)}`,
      "utf8").digest("hex")}` };
}

before(() => {
  diagnostic = buildStage05GovernedTrainingIntakeDiagnostic({
    artifactsRootPath: ARTIFACTS,
  });
  temporary = mkdtempSync(path.join(tmpdir(), "outsider-stage05-intake-"));
}, { timeout: 30_000 });

after(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

test("real first-party Stage 0.5 corpus has no admissible trainer rows", () => {
  assert.equal(diagnostic.sourceSet.candidatesDiscovered, 494);
  assert.equal(diagnostic.sourceSet.thirdPartyWave5RowsIncluded, 0);
  assert.equal(diagnostic.verificationAccounting.supervisedRecordHashVerified, 494);
  assert.equal(diagnostic.verificationAccounting.uniqueRecordHashes, 494);
  assert.equal(diagnostic.verificationAccounting.exactDuplicateRecordHashes, 0);
  assert.equal(diagnostic.verificationAccounting.fullStage05RunDirectoryReplayed, 494);
  assert.equal(diagnostic.verificationAccounting.sidecarBoundToReplayedRun, 494);
  assert.equal(diagnostic.verificationAccounting.currentExtractorExactRebuild, 16);
  assert.equal(diagnostic.verificationAccounting
    .currentExtractorVersionOrProjectionDrift, 478);
  assert.equal(diagnostic.verificationAccounting.canonicalObservedAt, 329);
  assert.equal(diagnostic.verificationAccounting.noncanonicalOrMissingObservedAt, 165);
  assert.equal(diagnostic.verificationAccounting.sourceReplayedSealedCausalOutcome, 375);
  assert.equal(diagnostic.admissionAccounting.explicitOwnerControlledTrainingRights, 0);
  assert.equal(diagnostic.admissionAccounting.explicitTrainingPrivacyPermission, 0);
  assert.equal(diagnostic.admissionAccounting.explicitFrozenPreActionFeatureSnapshots, 0);
  assert.equal(diagnostic.admissionAccounting.completeGovernedTrainerFeatureVectors, 0);
  assert.equal(diagnostic.admissionAccounting.allRequiredGatesSatisfiedRows, 0);
});

test("missing features and the one-component dependence failure are exact", () => {
  assert.deepEqual(diagnostic.admissionAccounting.missingFeatureCounts, {
    nSteps: 0,
    costUsd: 494,
    costVsPeer: 494,
    claimedPass: 494,
    claimedDone: 494,
    ranTestClaim: 494,
    "world.reversible": 494,
    "world.externality": 494,
  });
  assert.equal(diagnostic.admissionAccounting.completeKnownRootIdentity, 494);
  assert.deepEqual(diagnostic.dependenceAccounting.sharedRootFieldsAcrossAllVerifiedRows,
    ["authorityRefHash"]);
  assert.equal(diagnostic.dependenceAccounting.knownRootConnectedComponents, 1);
  assert.equal(diagnostic.dependenceAccounting.largestKnownRootConnectedComponentRows, 494);
  assert.equal(diagnostic.dependenceAccounting
    .strictComponentTrainCalibrationTestSplitPossible, false);
  assert.equal(diagnostic.labelAccounting.fakedSuccessTrue, 184);
  assert.equal(diagnostic.labelAccounting.fakedSuccessFalse, 310);
  assert.equal(diagnostic.labelAccounting.neededCorrectionTrue, 417);
  assert.equal(diagnostic.labelAccounting.neededCorrectionFalse, 77);
});

test("diagnostic exports hashes and aggregates, not raw private evidence", () => {
  const text = JSON.stringify(diagnostic);
  assert.equal(diagnostic.artifactLifecycle.containsRawSourceData, false);
  assert.equal(diagnostic.artifactLifecycle.containsRawPaths, false);
  assert.equal(diagnostic.artifactLifecycle.containsRawPrompts, false);
  assert.equal(diagnostic.artifactLifecycle.containsDirectIdentifiers, false);
  assert.equal(diagnostic.sourceSet.pathDisclosure,
    "AGGREGATE_HASH_COMMITMENT_ONLY");
  assert.equal(diagnostic.sourceSet.sourcePayloadDisclosure, "NONE");
  assert.doesNotMatch(text, /\/Users\//u);
  assert.doesNotMatch(text,
    /e8b8ca9e-6721-4ffc-8e7d-8bd58c06179e/u);
  assert.doesNotMatch(text, /"runId"|"prompt"|"sessionId"|"cwd"/u);
});

test("caller timestamps and coherently resealed alternate times fail closed", {
  timeout: 30_000,
}, () => {
  assert.throws(() => buildStage05GovernedTrainingIntakeDiagnostic({
    artifactsRootPath: ARTIFACTS,
    generatedAt: "2035-01-01T00:00:00.000Z",
  }), /INPUT_SCHEMA_INVALID/u);
  for (const generatedAt of [
    "2035-01-01T00:00:00.000Z",
    "2026-08-22T08:59:59.999Z",
  ]) {
    const forged = structuredClone(diagnostic);
    forged.generatedAt = generatedAt;
    const checked = verifyStage05GovernedTrainingIntakeStructure(reseal(forged));
    assert.equal(checked.ok, false);
    assert.equal(checked.admissibleRows, 0);
    assert.equal(checked.governedTrainerInvoked, false);
    assert.equal(checked.targetQuotedPrice, null);
    assert.equal(checked.pricePermission, false);
  }
});

test("no coherently resealed artifact can claim training, price, or authority", () => {
  const attacks = [
    (value) => { value.admissionAccounting.allRequiredGatesSatisfiedRows = 1; },
    (value) => {
      value.admissibilityConclusion.nontrivialAdmissibleSetExists = true;
      value.admissibilityConclusion.decision
        = "ADAPTER_REVIEW_REQUIRED_BEFORE_ANY_TRAINING";
    },
    (value) => { value.admissibilityConclusion.governedTrainerInvoked = true; },
    (value) => { value.admissibilityConclusion.preregistrationCreated = true; },
    (value) => { value.admissibilityConclusion.modelArtifact = {}; },
    (value) => { value.targetBoundary.targetQuotedPrice = "1.00"; },
    (value) => { value.targetBoundary.pricePermission = true; },
    (value) => { value.targetBoundary.responsibilityUseEligible = true; },
    (value) => { value.targetBoundary.operationalAuthorityGranted = true; },
  ];
  for (const attack of attacks) {
    const forged = structuredClone(diagnostic);
    attack(forged);
    const checked = verifyStage05GovernedTrainingIntakeStructure(reseal(forged));
    assert.equal(checked.ok, false);
    assert.equal(checked.admissibleRows, 0);
    assert.equal(checked.governedTrainerInvoked, false);
    assert.equal(checked.targetQuotedPrice, null);
    assert.equal(checked.pricePermission, false);
    assert.equal(checked.operationalAuthorityGranted, false);
  }
});

test("strong verifier reproduces the refusal from all local run sources", {
  timeout: 30_000,
}, () => {
  const checked = verifyStage05GovernedTrainingIntakeAgainstSources(diagnostic, {
    artifactsRootPath: ARTIFACTS,
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_LOCAL_STAGE05_RUN_SOURCE_REPLAY_INTAKE_REFUSAL_VERIFIED");
  assert.equal(checked.sourceRunsReplayed, true);
  assert.equal(checked.sidecarsBoundToReplayedRuns, 494);
  assert.equal(checked.currentExtractorExactRebuild, 16);
  assert.equal(checked.admissibleRows, 0);
  assert.equal(checked.rawSourceContentProjected, false);
  assert.equal(checked.rawPathsProjected, false);
  assert.equal(checked.rawPromptsProjected, false);
  assert.equal(checked.directIdentifiersProjected, false);
});

test("canonical diagnostic exact bytes are pinned", () => {
  const checked = verifyStage05GovernedTrainingIntakeCanonicalStructure(CANONICAL);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.canonicalArtifactExactBytesVerified, true);
  assert.equal(checked.artifactHash,
    STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactHash);
  assert.equal(checked.artifactFileHash,
    STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileHash);
  assert.equal(checked.artifactFileBytes,
    STAGE05_GOVERNED_TRAINING_INTAKE_CANONICAL.artifactFileBytes);
});

test("CLI writes a private no-clobber diagnostic and never trains", {
  timeout: 45_000,
}, () => {
  const output = path.join(temporary, "diagnostic.json");
  const script = path.resolve("scripts/stage05-governed-training-intake.mjs");
  const built = spawnSync(process.execPath, [
    script, "build", "--artifacts-root", ARTIFACTS, "--out", output,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const summary = JSON.parse(built.stdout);
  assert.equal(summary.candidatesDiscovered, 494);
  assert.equal(summary.sourceRunsReplayed, 494);
  assert.equal(summary.admissibleRows, 0);
  assert.equal(summary.governedTrainerInvoked, false);
  assert.equal(summary.targetQuotedPrice, null);
  assert.equal(summary.pricePermission, false);

  const second = spawnSync(process.execPath, [
    script, "build", "--artifacts-root", ARTIFACTS, "--out", output,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /EEXIST/u);

  const bytes = readFileSync(output);
  assert.equal(JSON.parse(bytes.toString("utf8"))
    .admissibilityConclusion.modelArtifact, null);
});
